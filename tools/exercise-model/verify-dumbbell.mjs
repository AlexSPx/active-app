import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { attachDumbbells, createDumbbellGripTracks, createExerciseClips, exercises } from './clips.mjs';
import { createDumbbell } from './dumbbell.mjs';
import { createEntries } from './dumbbell-standing.mjs';

const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
  Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url))).buffer, '');
const catalog = JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url)));
const { scene } = asset;
const squat = 'local:exercise:Dumbbell_Squat';
const entries = { ...createEntries(asset, { createPowerGripTracks: createDumbbellGripTracks }),
  [squat]: { ...exercises[squat], clip: createExerciseClips(asset)[squat] } };
const props = attachDumbbells(scene, createDumbbell);
const mixer = new THREE.AnimationMixer(scene);
const digits = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
const components = ['getX', 'getY', 'getZ', 'getW'];
const bones = [];
const meshes = [];
const vertices = [];
const point = new THREE.Vector3();
const local = new THREE.Vector3();
const gripRotation = new THREE.Quaternion();
const forearmDirection = new THREE.Vector3();
const handDirection = new THREE.Vector3();
scene.updateMatrixWorld(true);
scene.traverse((object) => {
  if (object.isBone) bones.push(object);
  if (!object.isSkinnedMesh) return;
  meshes.push(object);
  const { position, skinIndex, skinWeight } = object.geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
    const dominant = components.reduce((a, b) => skinWeight[b](i) > skinWeight[a](i) ? b : a);
    const bone = object.skeleton.bones[skinIndex[dominant](i)].name;
    vertices.push({ mesh: object, i, bone, foot: point.y < .034 ? Number(point.x < 0) : -1,
      digit: digits.findIndex((name) => bone.startsWith(name)) });
  }
});

for (const [id, entry] of Object.entries(entries)) {
  const item = catalog.find((item) => item.id === id && item.equipment === 'DUMBBELL');
  assert.equal(item?.name, entry.name);
  const materialFor = (name) => ({ traps: 'Upper back', 'lower back': 'Upper back' })[name]
    ?? name[0].toUpperCase() + name.slice(1);
  assert.deepEqual(entry.primary, item.primaryMuscles.map(materialFor));
  assert.deepEqual([...entry.supporting].sort(), item.secondaryMuscles.map(materialFor).sort());
  for (const muscle of [...entry.primary, ...entry.supporting]) {
    assert.ok(meshes.some((mesh) => mesh.material.name === muscle), muscle);
  }
  const active = entry.equipment === 'dumbbells' ? [0, 1] : [1];
  const grip = createDumbbellGripTracks(scene);
  const activeNames = new Set(active.map((index) => 'LR'[index]));
  const fingers = grip.map((track) => {
    const name = track.name.split('.')[0];
    const bone = scene.getObjectByName(name);
    const weighted = activeNames.has(name.at(-1));
    assert.equal(entry.clip.tracks.some((sample) => sample.name === track.name), weighted);
    return [bone, weighted ? gripRotation.fromArray(track.values).clone() : bone.quaternion.clone()];
  });
  const action = mixer.clipAction(entry.clip).play();
  action.paused = true;
  const start = props.map(() => new THREE.Vector3());
  const ankles = ['L', 'R'].map((side) => scene.getObjectByName('Foot' + side));
  const ankleStart = ankles.map(() => new THREE.Vector3());
  const motion = [0, 0];
  let head = Infinity;
  let closest;
  let handle = Infinity;
  let penetration = 0;
  let contact = 0;
  const hertz = 20;
  const frames = Math.round(entry.clip.duration * hertz);
  for (let frame = 0; frame <= frames; frame++) {
    action.time = frame / hertz;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    for (const bone of bones) assert.ok(bone.matrixWorld.elements.every(Number.isFinite), bone.name);
    for (const [bone, expected] of fingers) {
      assert.ok(1 - Math.abs(bone.quaternion.dot(expected)) < 1e-6, id + ' grip rotation ' + bone.name);
    }
    ankles.forEach((bone, index) => {
      bone.getWorldPosition(point);
      if (frame === 0) ankleStart[index].copy(point);
      assert.ok(point.distanceTo(ankleStart[index]) < .001, id + ' ankle drift');
    });
    const inverses = active.map((index) => props[index].matrixWorld.clone().invert());
    for (const index of active) {
      const hand = props[index].parent;
      const sign = index === 0 ? 1 : -1;
      hand.getWorldQuaternion(gripRotation);
      handDirection.set(sign * .025, -.137, .065).applyQuaternion(gripRotation);
      hand.parent.getWorldQuaternion(gripRotation);
      forearmDirection.copy(hand.position).applyQuaternion(gripRotation);
      assert.ok(handDirection.angleTo(forearmDirection) < THREE.MathUtils.degToRad(5),
        id + ' wrist alignment at ' + action.time);
      props[index].getWorldPosition(point);
      const crossBodyPeak = index === 1 ? .95 : 3.75;
      if (id.endsWith('Cross_Body_Hammer_Curl') && action.time === crossBodyPeak) {
        const oppositeShoulder = scene.getObjectByName(index === 1 ? 'ArmL' : 'ArmR').getWorldPosition(local);
        assert.ok(point.x * sign < 0 && point.distanceTo(oppositeShoulder) < .24,
          id + ' weight must cross the midline toward the opposite shoulder: ' + point.distanceTo(oppositeShoulder));
      }
      for (const mesh of props[index].children) {
        const { position } = mesh.geometry.attributes;
        for (let i = 0; i < position.count; i++) {
          local.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
          assert.ok(local.y > 0, id + ' dumbbell floor clearance');
        }
      }
      if (frame === 0) start[index].copy(point);
      motion[index] = Math.max(motion[index], point.distanceTo(start[index]));
      if (frame === frames) assert.ok(point.distanceTo(start[index]) < .0001);
    }
    const soles = [Infinity, Infinity];
    const gaps = active.map(() => Array(6).fill(Infinity));
    for (const { mesh, i, bone, foot, digit } of vertices) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      assert.ok(Number.isFinite(point.x + point.y + point.z), id);
      if (foot >= 0) soles[foot] = Math.min(soles[foot], point.y);
      inverses.forEach((inverse, index) => {
        local.copy(point).applyMatrix4(inverse);
        const axial = Math.abs(local.x);
        const radial = Math.hypot(local.y, local.z) - .055;
        // Use the enclosing cylinders for conservative clearance around the hex heads.
        const end = Math.max(.066 - axial, axial - .112);
        const clearance = Math.hypot(Math.max(0, end), Math.max(0, radial)) + Math.min(0, Math.max(end, radial));
        if (clearance < head) {
          head = clearance;
          closest = [action.time, bone];
        }
        if (axial >= .066) return;
        const gap = radial + .055 - .014;
        const sameHand = bone.endsWith('LR'[active[index]]) && (digit >= 0 || bone.startsWith('Hand'));
        if (sameHand) {
          penetration = Math.max(penetration, -gap);
          if (digit >= 0 || axial < .020) {
            const slot = digit + 1;
            gaps[index][slot] = Math.min(gaps[index][slot], Math.abs(gap));
          }
        } else handle = Math.min(handle, gap);
      });
    }
    contact = Math.max(contact, ...gaps.flat());
    assert.ok(soles.every((y) => Math.abs(y) < .012), `${id} floor ${soles}`);
    if (active.length === 2) {
      const between = props[0].getWorldPosition(point).distanceTo(props[1].getWorldPosition(local));
      assert.ok(between > .25, `${id} weight separation ${between}`);
    }
  }
  for (const index of active) assert.ok(motion[index] > .035, `${id} movement ${motion}`);
  // The calibrated hand's closest skin is about 5 mm from the enclosing cylinder.
  assert.ok(head > .0049, `${id} head clearance ${head} near ${closest}`);
  assert.ok(handle > 0, `${id} handle clearance ${handle}`);
  assert.ok(penetration < .002, `${id} handle penetration ${penetration}`);
  assert.ok(contact < .0015, `${id} palm or digit contact gap ${contact}`);
  console.log(`${entry.name} — minimum head clearance ${(head * 1000).toFixed(2)} mm`);
  action.stop();
}
