import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  args: ['--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://**/*', (route) => route.abort());
  await page.goto(new URL('./dist/exercise-animations.html', import.meta.url).href);
  await page.locator('#exercise:enabled').waitFor();
  const picker = page.locator('#exercise');
  const options = await picker.locator('option').evaluateAll((options) => options.map(({ value }) => value));
  await picker.selectOption(options[0]);
  assert.ok(await page.locator('#previous-exercise').isDisabled());
  await page.locator('#next-exercise').click();
  assert.equal(await picker.inputValue(), options[1]);
  assert.equal(await page.locator('#play').textContent(), 'Pause');
  await page.waitForFunction(() => Number(document.getElementById('timeline').value) > 0);
  assert.equal(await page.locator('#exercise-position').textContent(), `2 / ${options.length}`);
  await page.locator('#previous-exercise').click();
  assert.equal(await picker.inputValue(), options[0]);
  assert.equal(await page.locator('#play').textContent(), 'Pause');
  await picker.selectOption(options.at(-1));
  assert.ok(await page.locator('#next-exercise').isDisabled());
  await page.locator('#previous-exercise').click();
  assert.equal(await picker.inputValue(), options.at(-2));
  assert.equal(await page.locator('#play').textContent(), 'Pause');
  assert.deepEqual(errors, []);
  console.log(`Navigation and autoplay passed (${options.length} exercises, offline, 360px viewport).`);
} finally {
  await browser.close();
}
