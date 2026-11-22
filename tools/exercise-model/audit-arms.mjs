import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, LoopOnce, MathUtils, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createExerciseGroups } from './clips.mjs';
import { handAlong, handDorsal } from './hand-frame.mjs';

const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const groups = createExerciseGroups(asset);
const catalog = JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url)));
const entries = groups.flatMap(([, group]) => Object.entries(group));
assert.deepEqual(entries.map(([id]) => id).sort(), catalog.map(({ id }) => id).sort());

const mixer = new AnimationMixer(asset.scene);
const arms = ['L', 'R'].map((side, index) => {
  const joints = ['Arm', 'Forearm', 'Hand'].map((part) => asset.scene.getObjectByName(part + side));
  const along = handAlong(1 - 2 * index);
  const across = handDorsal().cross(along);
  return { joints, along, across, previous: joints.map(() => new Quaternion()) };
});
const actual = new Quaternion();
const wristDirection = new Vector3();
const wristAcross = new Vector3();
const projected = new Vector3();
const forearmAcross = new Vector3();

console.log('exercise,wrist_bend_deg,lateral_deviation_deg,wrist_roll_deg,arm_rotation_per_frame_deg');
for (const [id, { clip }] of entries) {
  assert.ok(clip.validate(), id);
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
  action.paused = true;
  const frames = Math.ceil(clip.duration * 60);
  let bend = 0;
  let deviation = 0;
  let roll = 0;
  let rotation = 0;
  for (let frame = 0; frame <= frames; frame++) {
    action.time = frame * clip.duration / frames;
    mixer.update(0);
    for (const { joints, along, across, previous } of arms) {
      const hand = joints[2];
      const distal = wristDirection.copy(hand.position).normalize();
      bend = Math.max(bend, distal.angleTo(projected.copy(along).applyQuaternion(hand.quaternion)));
      wristAcross.copy(across).applyQuaternion(hand.quaternion);
      deviation = Math.max(deviation, Math.asin(MathUtils.clamp(Math.abs(distal.dot(wristAcross)), 0, 1)));
      projected.copy(wristAcross).addScaledVector(distal, -distal.dot(wristAcross));
      forearmAcross.copy(across).addScaledVector(distal, -distal.dot(across));
      roll = Math.max(roll, projected.angleTo(forearmAcross));
      for (const [index, joint] of joints.entries()) {
        joint.getWorldQuaternion(actual).normalize();
        if (frame) rotation = Math.max(rotation, actual.angleTo(previous[index]));
        previous[index].copy(actual);
      }
    }
  }
  action.stop();
  mixer.uncacheClip(clip);
  console.log([id, ...[bend, deviation, roll, rotation].map((angle) => MathUtils.radToDeg(angle).toFixed(1))].join(','));
}
