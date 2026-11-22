import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, LoopOnce, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createEntries } from './final-conditioning.mjs';
import { createFinalConditioningFixture } from './final-conditioning-fixtures.mjs';

const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const { scene } = asset;
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
assert.equal(Object.keys(entries).length, 38);
const mixer = new AnimationMixer(scene);
const foot = (side) => scene.getObjectByName('Foot' + side).getWorldPosition(new Vector3());
const continuous = new Set(['Sled_Overhead_Triceps_Extension', 'Linear_3-Part_Start_Technique',
  'Single-Leg_High_Box_Squat', 'Side_Hop-Sprint']);
const rotationLimit = new Map([
  ['Quick_Leap', .37], ['Single-Cone_Sprint_Drill', .45], ['Single-Leg_Hop_Progression', .45], ['Skating', .49],
]);
const planted = ['Backward_Drag', 'Sled_Drag_-_Harness', 'Prowler_Sprint', 'Sled_Push',
  'Sled_Overhead_Backward_Walk', 'Bear_Crawl_Sled_Drags', 'Single-Cone_Sprint_Drill'];

for (const [id, entry] of Object.entries(entries)) {
  const key = id.split(':').at(-1);
  const { clip, propClip, oneShot } = entry;
  for (const item of [clip, propClip].filter(Boolean)) {
    assert.ok(item.validate(), key);
    assert.equal(item.duration, clip.duration, key);
    for (const track of item.tracks) {
      assert.ok(track.values.every(Number.isFinite), key + ' ' + track.name);
      const size = track.getValueSize();
      if (!oneShot && size === 4) {
        assert.ok(new Quaternion().fromArray(track.values).angleTo(
          new Quaternion().fromArray(track.values, track.values.length - size)) < .002, key + ' loop ' + track.name);
      } else if (!oneShot) {
        assert.ok(new Vector3().fromArray(track.values).distanceTo(
          new Vector3().fromArray(track.values, track.values.length - size)) < .002, key + ' loop ' + track.name);
      }
      const limit = rotationLimit.get(key) ?? (continuous.has(key) ? .95 : Infinity);
      if (limit < Infinity && size === 4) {
        const a = new Quaternion();
        const b = new Quaternion();
        for (let i = 1; i < track.times.length; i++) {
          assert.ok(a.fromArray(track.values, (i - 1) * size).angleTo(b.fromArray(track.values, i * size)) < limit,
            `${key} ${track.name} snaps at ${track.times[i]}`);
        }
      }
    }
  }
  const fixture = createFinalConditioningFixture(entry, scene);
  assert.ok(fixture.root.children.length, key + ' equipment');
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
  action.paused = true;
  const period = Math.ceil(clip.duration * 60);
  const contactFrames = [0, 0];
  const previousArm = key === 'Linear_3-Part_Start_Technique' || key === 'Single-Leg_High_Box_Squat'
    ? new Map(['L', 'R'].flatMap((side) => ['Arm', 'Forearm', 'Hand'].map((part) =>
      [scene.getObjectByName(part + side), new Quaternion()])))
    : new Map();
  const currentArm = new Quaternion();
  let previous;
  for (let i = 0; i <= period; i++) {
    const time = i * clip.duration / period;
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    fixture.update(time);
    for (const [joint, last] of previousArm) {
      joint.getWorldQuaternion(currentArm).normalize();
      assert.ok(!i || last.angleTo(currentArm) < .45, `${key} ${joint.name} snaps at ${time}`);
      last.copy(currentArm);
    }
    if (key === 'Quick_Leap' && Math.abs(time - .92) < .01) {
      const y = (name) => scene.getObjectByName(name).getWorldPosition(new Vector3()).y;
      assert.ok(y('HandL') > y('Head') && y('HandR') > y('Head'), 'Quick Leap reaches overhead at takeoff');
    }
    if (key === 'Single-Leg_Hop_Progression' && time >= 2.17 && time <= 2.78) {
      assert.ok(Math.min(foot('L').y, foot('R').y) < .079, 'Hop progression keeps one foot planted during the turn');
    }
    if (key === 'Skating') {
      const feet = ['L', 'R'].map(foot);
      assert.ok(Math.min(...feet.map((position) => position.y)) < .177, 'Skating retains at least one support skate');
      for (const [j, position] of feet.entries()) {
        if (!previous || Math.abs(position.y - .174) > .001 || Math.abs(previous[j].y - .174) > .001) continue;
        const rotation = scene.getObjectByName(j === 0 ? 'FootL' : 'FootR').getWorldQuaternion(new Quaternion());
        const travel = position.clone().sub(previous[j]);
        assert.ok(travel.z > 0 && travel.angleTo(new Vector3(0, 0, 1).applyQuaternion(rotation)) < .20,
          `Skate rolls toward its heading at ${time}`);
      }
      previous = feet;
    }
    if (!planted.includes(key)) continue;
    const feet = ['L', 'R'].map(foot);
    const contact = key === 'Bear_Crawl_Sled_Drags' ? .188 : .074;
    feet.forEach((position, j) => {
      if (previous && Math.abs(position.y - contact) < .001 && Math.abs(previous[j].y - contact) < .001) {
        contactFrames[j]++;
        assert.ok(position.distanceTo(previous[j]) < .004, `${key} planted foot slides at ${time}`);
      }
    });
    previous = feet;
  }
  if (planted.includes(key)) assert.ok(contactFrames.every((frames) => frames > 10), key + ' both feet enter stance');
  action.stop();
}
console.log('38 conditioning clips checked for fixture playback and closed loops, with targeted limb and foot-contact regressions.');
