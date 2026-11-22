import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const pilot = [
  'Bodyweight_Squat', 'Bodyweight_Walking_Lunge', 'Barbell_Squat', 'Dumbbell_Bench_Press',
  'Cable_Iron_Cross', 'Cat_Stretch', 'Clean_and_Jerk', 'Freehand_Jump_Squat',
  'Kipping_Muscle_Up', 'Mountain_Climbers', 'One-Arm_Kettlebell_Swings', 'Smith_Machine_Bench_Press',
];
const prefix = 'local:exercise:';
const catalog = JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url)));
const catalogIds = catalog.map(({ id }) => id);
const args = process.argv.slice(2);
const selected = args[0] === '--all' ? catalogIds : (args.length ? args : pilot).map((id) =>
  id.startsWith(prefix) ? id : prefix + id);
for (const id of selected) assert(catalogIds.includes(id), `Unknown catalog exercise: ${id}`);

const fps = 24;
const presets = [{ size: 480, crf: 26 }, { size: 360, crf: 29 }];
const output = resolve(process.env.RECORDINGS_DIR ?? fileURLToPath(new URL('./dist/recordings', import.meta.url)));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  args: ['--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 480, height: 480 }, offline: true });
  const viewerUrl = new URL('./dist/exercise-animations.html#mode=record', import.meta.url);
  await page.goto(viewerUrl.href);
  await page.waitForFunction(() => window.exerciseRecorder);
  assert.deepEqual((await page.evaluate(() => window.exerciseRecorder.ids)).sort(), [...catalogIds].sort());

  const results = [];
  for (const id of selected) {
    const { duration, stopAtFinish } = await page.evaluate((id) => window.exerciseRecorder.select(id), id);
    const frameCount = Math.ceil(duration * fps) + Number(stopAtFinish);
    const frames = await mkdtemp(join(tmpdir(), 'exercise-frames-'));
    const files = [];
    try {
      let first;
      let moved = false;
      for (let frame = 0; frame < frameCount; frame++) {
        await page.evaluate((at) => window.exerciseRecorder.render(at), frame / fps);
        const png = await page.screenshot({ path: join(frames, `${frame}.png`) });
        first ??= png;
        moved ||= !png.equals(first);
      }
      assert(moved, `No visual movement recorded for ${id}`);

      for (const { size, crf } of presets) {
        const name = `${id.slice(prefix.length)}-${size}.mp4`;
        const temporary = join(output, `.${name}.${process.pid}.mp4`);
        const file = join(output, name);
        try {
          execFileSync('ffmpeg', [
            '-v', 'error', '-y', '-framerate', String(fps), '-i', join(frames, '%d.png'),
            '-vf', `scale=${size}:${size}:flags=lanczos`, '-an', '-c:v', 'libx264', '-preset', 'slow',
            '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', temporary,
          ]);
          const { streams } = JSON.parse(execFileSync('ffprobe', [
            '-v', 'error', '-show_streams', '-of', 'json', temporary,
          ]));
          assert.equal(streams.length, 1);
          const [video] = streams;
          assert.equal(video.codec_name, 'h264');
          assert.equal(video.width, size);
          assert.equal(video.height, size);
          assert.equal(Number(video.nb_frames), frameCount);
          await rename(temporary, file);
        } finally {
          await rm(temporary, { force: true });
        }
        files.push({ name, size, crf, bytes: (await stat(file)).size });
      }
    } finally {
      await rm(frames, { recursive: true, force: true });
    }
    results.push({ id, duration, stopAtFinish, frameCount, files });
    console.log(`${id}   ${files.map(({ size, bytes }) => `${size}px ${bytes} B`).join('   ')}`);
  }
  await writeFile(join(output, 'recordings.json'), JSON.stringify({ fps, results }, null, 2) + '\n');
} finally {
  await browser.close();
}
