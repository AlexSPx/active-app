import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, LoopOnce, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createExerciseGroups } from './clips.mjs';

const groupLabels = new Set(['Standing bodyweight', 'Floor bodyweight', 'Mobility', 'Bodyweight conditioning',
  'Supine core', 'Upright bodyweight', 'Floor bodyweight extra', 'Floor and core', 'Standing mobility',
  'Bodyweight movement and stretching', 'Bodyweight mobility and bench', 'Bodyweight skills and stretches',
  'Bodyweight support drills', 'Exercise ball stability and strength', 'Foam rolling, mobility and medicine ball',
  'Conditioning and agility']);
const repaired = new Set(['Leg-Up_Hamstring_Stretch', 'Cross-Body_Crunch', 'Spider_Crawl', 'Reverse_Crunch',
  'Lying_Glute', 'Lying_Hamstring', 'Rear_Leg_Raises', 'Chair_Lower_Back_Stretch', 'Torso_Rotation',
  'Medicine_Ball_Full_Twist', 'Supine_Chest_Throw', 'Oblique_Crunches', 'Isometric_Neck_Exercise_-_Front_And_Back',
  'Incline_Push-Up_Reverse_Grip']);
const planted = new Set(['Ball_Leg_Curl', 'Exercise_Ball_Pull-In', 'Push-Ups_With_Feet_On_An_Exercise_Ball',
  'Pyramid', 'Floor_Glute-Ham_Raise']);
const chairStretches = new Map([
  ['Spinal_Stretch', { limit: .19, peaks: [3.66, 7.81] }],
  ['Chair_Lower_Back_Stretch', { limit: .35, peaks: [1.12, 2.58] }],
]);
const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const groups = createExerciseGroups(asset).filter(([label]) => groupLabels.has(label));
assert.deepEqual(new Set(groups.map(([label]) => label)), groupLabels);
const entries = groups.flatMap(([, group]) => Object.entries(group));
assert.equal(entries.length, 260);
const mixer = new AnimationMixer(asset.scene);
const handSkin = { L: [], R: [] };
const meshes = [];
asset.scene.traverse((mesh) => {
  if (!mesh.isSkinnedMesh) return;
  meshes.push(mesh);
  const { skinIndex, skinWeight, position } = mesh.geometry.attributes;
  const axes = ['getX', 'getY', 'getZ', 'getW'];
  for (let i = 0; i < position.count; i++) {
    const strongest = axes.reduce((best, axis) => skinWeight[axis](i) > skinWeight[best](i) ? axis : best);
    const name = mesh.skeleton.bones[skinIndex[strongest](i)].name;
    if (/^(Hand|Thumb|Index|Middle|Ring|Little)/.test(name)) handSkin[name.at(-1)].push([mesh, i]);
  }
});
const p = new Vector3();
const a = new Quaternion();
const b = new Quaternion();
let stabilityBalls = 0;
for (const [id, entry] of entries) {
  const key = id.split(':').at(-1);
  const chair = chairStretches.get(key);
  for (const clip of [entry.clip, entry.propClip, entry.secondPropClip].filter(Boolean)) {
    assert.ok(clip.validate(), key);
    for (const track of clip.tracks) {
      assert.ok(track.values.every(Number.isFinite), key + ' finite ' + track.name);
      if ((!repaired.has(key) && !chair) || !track.name.endsWith('.quaternion')) continue;
      for (let i = 1; i < track.times.length; i++) {
        const size = track.getValueSize();
        const rotation = a.fromArray(track.values, (i - 1) * size).angleTo(b.fromArray(track.values, i * size));
        assert.ok(rotation < (chair?.limit ?? .95), `${key} ${track.name} turns ${rotation.toFixed(3)} rad at ${track.times[i]}`);
      }
    }
  }
  const staticBall = entry.fixtures?.find(({ kind }) => kind === 'ball');
  const ball = staticBall ?? (entry.animatedFixture?.kind === 'ball' ? entry.animatedFixture : undefined);
  if (!planted.has(key) && !ball && !chair) continue;
  if (ball) stabilityBalls++;
  const ballTrack = ball && !staticBall && entry.propClip.tracks[0].createInterpolant();
  const center = new Vector3();
  const action = mixer.clipAction(entry.clip).setLoop(LoopOnce, 1).play();
  action.paused = true;
  const times = chair ? [0, ...chair.peaks, entry.clip.duration] : key === 'Floor_Glute-Ham_Raise' ? [1.34, 1.5, 1.65] :
    Array.from({ length: 18 }, (_, i) => i * entry.clip.duration / 17);
  for (const time of times) {
    action.time = time;
    mixer.update(0);
    asset.scene.updateMatrixWorld(true);
    if (chair) {
      assert.equal(entry.bodyweightSupport, 'chair');
      const point = (name) => asset.scene.getObjectByName(name).getWorldPosition(new Vector3());
      for (const side of ['L', 'R']) assert.ok(Math.abs(point('Foot' + side).y - .074) < .002, `${key} feet planted`);
      const index = chair.peaks.indexOf(time);
      if (index !== -1) {
        const working = index === 0 ? 'L' : 'R';
        if (key === 'Spinal_Stretch') {
          const direction = new Vector3(0, 0, 1).applyQuaternion(asset.scene.getObjectByName('Chest').getWorldQuaternion(a));
          assert.ok(direction.y < -.50 && direction.x * (1 - 2 * index) > .40, 'Fold and rotate in each direction');
          for (const side of ['L', 'R']) assert.ok(point('Hand' + side).distanceTo(point('Head')) < .18, 'Hands stay behind the head');
        } else {
          assert.ok(point('Hand' + working).y > point('Head').y + .07, 'Reach over the head');
          assert.ok(point('Hand' + (index === 0 ? 'R' : 'L')).distanceTo(new Vector3((2 * index - 1) * .209, .477, -.035)) < .003,
            'Free hand stays at the chair');
        }
      }
    }
    if (planted.has(key)) {
      for (const [side, vertices] of Object.entries(handSkin)) {
        const low = Math.min(...vertices.map(([mesh, i]) => mesh.localToWorld(mesh.getVertexPosition(i, p)).y));
        assert.ok(low >= -.004 && low <= .012, `${key} ${side} palm clearance ${low.toFixed(3)} m at ${time}`);
      }
    }
    if (ball) {
      center.fromArray(staticBall ? staticBall.position : ballTrack.evaluate(time));
      let distanceSquared = Infinity;
      for (const mesh of meshes) {
        for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex++) {
          mesh.localToWorld(mesh.getVertexPosition(vertex, p));
          distanceSquared = Math.min(distanceSquared, p.distanceToSquared(center));
        }
      }
      const clearance = Math.sqrt(distanceSquared) - ball.size;
      assert.ok(clearance > -.080 && clearance < .065, `${key} stability ball clearance ${clearance.toFixed(3)} m at ${time}`);
    }
  }
  action.stop();
}
assert.equal(stabilityBalls, 13);
console.log('260 registered clips checked, with targeted rotation, skinned palm-contact, and stability-ball regressions.');
