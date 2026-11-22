import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const catalog = JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url)));
const viewerUrl = new URL(process.env.VIEWER_URL ?? './dist/exercise-animations.html', import.meta.url);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  args: ['--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/^https?:/, (route) =>
    new URL(route.request().url()).origin === viewerUrl.origin ? route.continue() : route.abort());
  await page.goto(viewerUrl.href);
  await page.locator('#exercise:enabled').waitFor();
  const picker = page.locator('#exercise');
  const options = await picker.locator('option').evaluateAll((options) => options.map(({ value }) => value));
  assert.deepEqual([...options].sort(), catalog.map(({ id }) => id).sort());
  await picker.selectOption(options[0]);
  assert.ok(await page.locator('#previous-exercise').isDisabled());
  await page.locator('#next-exercise').click();
  assert.equal(await picker.inputValue(), options[1]);
  assert.equal(await page.locator('#play').textContent(), 'Pause');
  await page.waitForFunction(() => Number(document.getElementById('timeline').value) > 0);
  assert.equal(await page.locator('#exercise-position').textContent(), `2 / ${options.length}`);
  const timeline = page.locator('#timeline');
  await timeline.fill('1');
  assert.equal(await timeline.inputValue(), '1');
  assert.equal(await page.locator('#play').textContent(), 'Play');
  const sideView = page.locator('[data-view="side"]');
  await sideView.click();
  assert.equal(await sideView.getAttribute('aria-pressed'), 'true');
  assert.ok(await page.locator('#legend button').count());
  assert.ok(await page.locator('#cues li').count());
  await page.locator('#previous-exercise').click();
  assert.equal(await picker.inputValue(), options[0]);
  assert.equal(await page.locator('#play').textContent(), 'Pause');
  await picker.selectOption(options.at(-1));
  assert.ok(await page.locator('#next-exercise').isDisabled());
  await page.locator('#previous-exercise').click();
  assert.equal(await picker.inputValue(), options.at(-2));
  assert.equal(await page.locator('#play').textContent(), 'Pause');
  assert.deepEqual(errors, []);
  console.log(`Navigation, playback, scrubbing, and camera controls passed (${options.length} exercises, 360px viewport).`);
} finally {
  await browser.close();
}
