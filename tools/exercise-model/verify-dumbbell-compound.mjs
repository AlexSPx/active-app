import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { attachDumbbells, createDumbbellGripTracks } from './clips.mjs';
import { createDumbbell } from './dumbbell.mjs';
import { createEntries } from './dumbbell-compound.mjs';

const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
  Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url))).buffer, '');
const catalog = JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url)));
const { scene } = asset;
const entries = createEntries(asset, { createPowerGripTracks: createDumbbellGripTracks });
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

const ankles = ['L', 'R'].map((side) => scene.getObjectByName('Foot' + side));
const toeOffsets = ankles.map((ankle) => {
  const inverse = ankle.matrixWorld.clone().invert();
  const toe = new THREE.Vector3(0, 0, -Infinity);
  for (const { mesh, i, bone } of vertices) {
    if (bone !== ankle.name) continue;
    point.fromBufferAttribute(mesh.geometry.attributes.position, i)
      .applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
    if (point.z > toe.z) toe.copy(point);
  }
  return toe;
});

for (const [id, entry] of Object.entries(entries)) {
  const item = catalog.find((item) => item.id === id && item.equipment === 'DUMBBELL' && item.mechanic === 'COMPOUND');
  assert.equal(item?.name, entry.name);
  const materialFor = (name) => ({ abdominals: 'Core', 'middle back': 'Upper back', lats: 'Upper back', traps: 'Upper back', 'lower back': 'Upper back' })[name]
    ?? name[0].toUpperCase() + name.slice(1);
  assert.deepEqual(entry.primary, item.primaryMuscles.map(materialFor));
  assert.deepEqual(entry.supporting, item.secondaryMuscles.map(materialFor));
  for (const muscle of [...entry.primary, ...entry.supporting]) {
    assert.ok(meshes.some((mesh) => mesh.material.name === muscle), muscle);
  }
  const active = entry.equipment === 'dumbbells' ? [0, 1] : [0];
  const grip = createDumbbellGripTracks(scene);
  const activeNames = new Set(active.map((index) => 'LR'[index]));
  const fingers = grip.map((track) => {
    const name = track.name.split('.')[0];
    const bone = scene.getObjectByName(name);
    const weighted = activeNames.has(name.at(-1));
    assert.equal(entry.clip.tracks.some((sample) => sample.name === track.name), weighted);
    return [bone, weighted ? gripRotation.fromArray(track.values).clone() : bone.quaternion.clone()];
  });
  const previous = new THREE.Quaternion();
  const current = new THREE.Quaternion();
  for (const track of entry.clip.tracks) {
    if (!track.name.endsWith('.quaternion')) continue;
    previous.fromArray(track.values);
    for (let frame = 1; frame < track.times.length; frame++) {
      current.fromArray(track.values, frame * 4);
      assert.ok(previous.angleTo(current) < Math.PI / 12, id + ' sudden rotation at ' + track.name);
      previous.copy(current);
    }
  }
  const action = mixer.clipAction(entry.clip).play();
  action.paused = true;
  const start = props.map(() => new THREE.Vector3());
  const ankleStart = ankles.map(() => new THREE.Vector3());
  const motion = [0, 0];
  const lunge = id.includes('Lunge');
  const floor = entry.framing === 'floor';
  const contactStart = ankles.map(() => new THREE.Vector3());
  const stepTravel = [0, 0];
  const propHeight = [Infinity, Infinity];
  let bodyFloor = Infinity;
  let head = Infinity;
  let closest;
  let otherAnatomy = Infinity;
  const initial = [];
  let handle = Infinity;
  let penetration = 0;
  let contact = 0;
  const hertz = 20;
  const frames = Math.round(entry.clip.duration * hertz);
  for (let frame = 0; frame <= frames; frame++) {
    action.time = Math.min(frame / hertz, entry.clip.duration);
    const half = Number(lunge && frame >= 3.6 * hertz);
    const time = lunge ? (frame % (3.6 * hertz)) / hertz : action.time;
    const swing = lunge && ((time > .15 && time < .75) || (time > 2.65 && time < 3.25));
    const staggered = lunge && time >= .75 && time <= 2.65;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    for (const [index, bone] of bones.entries()) {
      const { elements } = bone.matrixWorld;
      assert.ok(elements.every(Number.isFinite), bone.name);
      if (frame === 0) initial.push([...elements]);
      if (frame === frames) {
        assert.ok(elements.every((value, i) => Math.abs(value - initial[index][i]) < .0001),
          id + ' loop discontinuity at ' + bone.name);
      }
    }
    for (const [bone, expected] of fingers) {
      assert.ok(1 - Math.abs(bone.quaternion.dot(expected)) < 1e-6, id + ' grip rotation ' + bone.name);
    }
    ankles.forEach((bone, index) => {
      bone.getWorldPosition(point);
      if (frame === 0) ankleStart[index].copy(point);
      if (!lunge) assert.ok(point.distanceTo(ankleStart[index]) < .001, id + ' ankle drift');
      if (!lunge) return;
      stepTravel[index] = Math.max(stepTravel[index], Math.abs(point.z - ankleStart[index].z));
      point.copy(toeOffsets[index]).applyMatrix4(bone.matrixWorld);
      if (time === .75 || frame === 0) contactStart[index].copy(point);
      if (staggered) {
        assert.ok(Math.abs(point.z - contactStart[index].z) < .002, id + ' foot contact drift');
      } else if (index !== half && !swing) {
        assert.ok(point.distanceTo(toeOffsets[index].clone().add(ankleStart[index])) < .002, id + ' support foot drift');
      } else if (index !== half) {
        assert.ok(Math.abs(point.z - (toeOffsets[index].z + ankleStart[index].z)) < .002, id + ' support foot slide');
      }
      if (frame === frames) {
        assert.ok(point.distanceTo(toeOffsets[index].clone().add(ankleStart[index])) < .002, id + ' foot reset');
      }
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

      if (/Upright_Row$|:See-Saw_Press_/.test(id)) {
        const upperArm = hand.parent.parent;
        hand.parent.getWorldPosition(point).sub(upperArm.getWorldPosition(local)).normalize();
        upperArm.getWorldQuaternion(gripRotation);
        const bend = forearmDirection.clone().addScaledVector(point, -forearmDirection.dot(point));
        const front = local.set(0, 0, 1).applyQuaternion(gripRotation);
        assert.ok(bend.normalize().dot(front) > .95, id + ' elbow flexion direction at ' + action.time);
      }
      props[index].getWorldPosition(point);
      for (const mesh of props[index].children) {
        const { position } = mesh.geometry.attributes;
        for (let i = 0; i < position.count; i++) {
          local.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
          propHeight[index] = Math.min(propHeight[index], local.y);
        }
      }
      if (frame === 0) start[index].copy(point);
      motion[index] = Math.max(motion[index], point.distanceTo(start[index]));
      if (frame === frames) assert.ok(point.distanceTo(start[index]) < .0001);
    }
    const soles = [Infinity, Infinity];
    const supports = new Map(['Pelvis', 'Chest', 'Head', 'ArmL', 'ArmR'].map((name) => [name, Infinity]));
    const gaps = active.map(() => Array(6).fill(Infinity));
    for (const { mesh, i, bone, foot, digit } of vertices) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      assert.ok(Number.isFinite(point.x + point.y + point.z), id);
      bodyFloor = Math.min(bodyFloor, point.y);
      if (foot >= 0) soles[foot] = Math.min(soles[foot], point.y);
      if (floor && supports.has(bone)) supports.set(bone, Math.min(supports.get(bone), point.y));
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
        const sameHand = bone.endsWith('LR'[active[index]]) && (digit >= 0 || bone.startsWith('Hand'));
        if (!sameHand) otherAnatomy = Math.min(otherAnatomy, clearance);
        if (axial >= .066) return;
        const gap = radial + .055 - .014;
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
    assert.ok(soles.every((y, i) => y > -.012 && ((swing && i === half) || y < .012)), `${id} floor ${soles}`);
    if (floor) {
      for (const name of ['Pelvis', 'Chest', 'Head']) {
        assert.ok(Math.abs(supports.get(name)) < .012, id + ' missing floor support at ' + name);
      }
      if (time >= 1.4 && time <= 1.9) {
        for (const name of ['ArmL', 'ArmR']) {
          assert.ok(Math.abs(supports.get(name)) < .012, id + ' upper arm did not reach floor');
        }
      }
    }
    if (active.length === 2) {
      const between = props[0].getWorldPosition(point).distanceTo(props[1].getWorldPosition(local));
      assert.ok(between > .25, `${id} weight separation ${between}`);
    }
  }
  assert.ok(bodyFloor > -.012, `${id} deepest floor intersection ${bodyFloor}`);
  if (lunge) assert.ok(stepTravel.every((distance) => distance > .49), id + ' insufficient step length');
  for (const index of active) {
    assert.ok(motion[index] > .22, `${id} movement ${motion}`);
    assert.ok(propHeight[index] > .10, `${id} dumbbell floor clearance ${propHeight[index]}`);
  }
  // The calibrated hand's closest skin is about 5 mm from the enclosing cylinder.
  assert.ok(head > .0049, `${id} head clearance ${head} near ${closest}`);
  assert.ok(handle > 0, `${id} handle clearance ${handle}`);
  assert.ok(penetration < .002, `${id} handle penetration ${penetration}`);
  assert.ok(contact < .0015, `${id} palm or digit contact gap ${contact}`);
  console.log(`${entry.name} — head clearance ${(head * 1000).toFixed(2)} mm, `
    + `excluding gripping hand ${(otherAnatomy * 1000).toFixed(2)} mm, `
    + `floor clearance ${(Math.min(...propHeight) * 1000).toFixed(1)} mm, `
    + `travel ${(Math.min(...active.map((index) => motion[index])) * 100).toFixed(1)} cm per weight or more`);
  action.stop();
}
