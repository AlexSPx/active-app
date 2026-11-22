import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: ['--enable-unsafe-swiftshader'],
});

try {
  const errors = [];
  const demo = new URL('../../apps/client/assets/exercise-animations.html', import.meta.url);
  async function openDemo(exerciseId, reducedMotion) {
    demo.hash = new URLSearchParams({ mode: 'app', exercise: exerciseId }).toString();
    const page = await browser.newPage({
      viewport: { width: 360, height: 248 },
      reducedMotion,
    });
    if (reducedMotion === 'reduce') {
      await page.addInitScript(() => Reflect.deleteProperty(Uint8Array, 'fromBase64'));
    }
    await page.route(/^https?:/, (route) => route.abort());
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(demo.href);
    assert.equal(await page.getByRole('button').count(), 0);
    assert.equal(await page.getByRole('slider').count(), 0);
    return page;
  }

  const animatedPage = await openDemo('local:exercise:Bodyweight_Squat', 'no-preference');
  await animatedPage.locator('#status[hidden]').waitFor({ state: 'attached' });
  await animatedPage.getByRole('img', { name: 'Bodyweight Squat movement demonstration' }).waitFor();
  const stage = animatedPage.locator('#stage');
  const firstPose = await stage.screenshot();
  await animatedPage.waitForTimeout(700);
  assert(!firstPose.equals(await stage.screenshot()), 'The demo should autoplay');
  await animatedPage.close();

  const stillPage = await openDemo('local:exercise:Bent-Arm_Dumbbell_Pullover', 'reduce');
  await stillPage.locator('#status[hidden]').waitFor({ state: 'attached' });
  await stillPage.getByRole('img', { name: /Bent-Arm Dumbbell Pullover movement demonstration/i }).waitFor();
  const stillStage = stillPage.locator('#stage');
  const stillPose = await stillStage.screenshot();
  await stillPage.waitForTimeout(700);
  assert(stillPose.equals(await stillStage.screenshot()), 'Reduce Motion should show a still pose');
  await stillPage.close();

  const missingPage = await openDemo('local:exercise:unknown', 'reduce');
  await missingPage.getByText('A 3D demo is unavailable for this exercise.').waitFor();
  assert.deepEqual(errors, []);
  console.log('Offline app demo autoplays without controls and respects Reduce Motion.');
} finally {
  await browser.close();
}
