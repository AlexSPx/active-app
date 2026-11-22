import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, dumbbellGripTransform, exercises } from './clips.mjs';
import { createEntries as createStandingBarbell } from './barbell-standing.mjs';
import { createBarbell } from './barbell.mjs';
import { createEntries } from './rack-exercises.mjs';
import { checkBarGrip } from './verify-barbell.mjs';
import { createSquatRack } from './squat-rack.mjs';

const read = (path) => readFile(new URL(path, import.meta.url));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
  Uint8Array.from(await read('./anatomy.glb')).buffer, '');
const catalog = JSON.parse(await read('../../apps/client/lib/data/exercise-catalog.json'));
const { scene } = asset;
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
assert.equal(Object.keys(entries).length, 5);
const existing = { ...exercises, ...createStandingBarbell(asset, { createDumbbellGripTracks, dumbbellGripTransform }) };
const seats = [1, -1].map((sign) => ({
  hand: scene.getObjectByName(sign === 1 ? 'HandL' : 'HandR'),
  ...dumbbellGripTransform(sign),
}));
const checkGrip = checkBarGrip(scene);
const point = new THREE.Vector3();
const axis = new THREE.Vector3();
const seatRotation = new THREE.Quaternion();
const bones = [];
const meshes = [];
scene.updateMatrixWorld(true);
scene.traverse((object) => {
  if (object.isBone) bones.push(object);
  if (!object.isSkinnedMesh) return;
  const { position, skinIndex, skinWeight } = object.geometry.attributes;
  const vertices = Array.from({ length: position.count }, (_, index) => {
    const offset = index * 4;
    let dominant = 0;
    for (let i = 1; i < 4; i++) {
      if (skinWeight.array[offset + i] > skinWeight.array[offset + dominant]) dominant = i;
    }
    const bone = object.skeleton.bones[skinIndex.array[offset + dominant]].name;
    point.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
    return {
      bone,
      sole: point.y < .012 && /Foot[LR]/.test(bone) ? (bone.endsWith('L') ? 0 : 1) : -1,
      grip: /^(Hand|Thumb|Index|Middle|Ring|Little)/.test(bone),
    };
  });
  meshes.push({ mesh: object, vertices });
});
const materials = new Set(meshes.map(({ mesh }) => mesh.material.name));

// Enclosing cylinders include the plate bevels and sleeve transitions.
const solids = [
  [0, .655, .01425], [.655, .685, .043], [.685, .745, .225],
  [.745, .781, .036], [.781, 1.100, .025],
];
const position = (name) => scene.getObjectByName(name).getWorldPosition(new THREE.Vector3());
const kneeAngle = (side) => {
  const knee = position('Shin' + side);
  return THREE.MathUtils.radToDeg(position('Thigh' + side).sub(knee)
    .angleTo(position('Foot' + side).sub(knee)));
};

for (const [id, entry] of Object.entries(entries)) {
  assert.ok(!Object.hasOwn(existing, id), id + ' already animated');
  assert.equal(catalog.find((item) => item.id === id && item.equipment === 'BARBELL')?.name, entry.name);
  assert.equal(entry.equipment, 'rack-barbell');
  assert.equal(entry.framing, 'standing');
  const duration = entry.clip.duration;
  assert.equal(duration, entry.propClip.duration);
  for (const muscle of [...entry.primary, ...entry.supporting]) assert.ok(materials.has(muscle), muscle);

  const { position: rackPosition, yaw = 0, hookHeight } = entry.rackTransform;
  const rack = createSquatRack({ hookHeight });
  rack.position.fromArray(rackPosition);
  rack.rotation.y = yaw;
  rack.updateMatrixWorld(true);
  rack.getObjectByName('Barbell').removeFromParent();
  const bar = createBarbell();
  const radius = bar.getObjectByName('Shaft').geometry.parameters.radiusTop;
  const shaftGap = (point) => Math.hypot(point.y - bar.position.y, point.z - bar.position.z) - radius;
  const rackBounds = rack.children.map((mesh) => new THREE.Box3().setFromObject(mesh));
  const barBounds = new THREE.Box3();
  const center = new THREE.Vector3();
  const mixer = new THREE.AnimationMixer(scene);
  const propMixer = new THREE.AnimationMixer(bar);
  const figure = mixer.clipAction(entry.clip).setLoop(THREE.LoopOnce).play();
  const prop = propMixer.clipAction(entry.propClip).setLoop(THREE.LoopOnce).play();
  figure.paused = prop.paused = true;
  const frameCount = Math.round(duration * 23);
  const bottom = entry.phases[2][0];
  const [setupTime, setupCue] = entry.cues[0];
  const [finishTime, finishCue] = entry.cues.at(-1);
  assert.equal(setupTime, entry.phases[0][0]);
  assert.equal(finishTime, entry.phases.at(-1)[0]);
  assert.match(setupCue, /working stance/i);
  assert.match(finishCue, /working stance/i);
  let start;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let clearance = Infinity;
  let maxSoleError = 0;
  let maxFootDrift = 0;
  const footStart = [];
  let maxSeatError = 0;
  let maxHandDepth = 0;
  let maxGripGap = 0;
  let wristAngle = 0;
  let minKnee = Infinity;
  let maxKnee = -Infinity;
  let bottomThighDrop;
  let bottomTorsoLean;

  // Include the exact bottom and off-key samples to exercise interpolation.
  for (const time of [...Array.from({ length: frameCount + 1 }, (_, i) => i * duration / frameCount), bottom, finishTime]) {
    figure.time = prop.time = time;
    mixer.update(0);
    propMixer.update(0);
    scene.updateMatrixWorld(true);
    bar.updateMatrixWorld(true);
    bar.getWorldPosition(center);
    assert.ok(center.y > .225 && center.z > .145 + .025, id + ' bar on open side');
    assert.ok(axis.set(1, 0, 0).applyQuaternion(bar.getWorldQuaternion(seatRotation)).x > .999999);
    barBounds.setFromObject(bar);
    for (const bounds of rackBounds) assert.ok(!bounds.intersectsBox(barBounds), id + ' bar/rack collision');

    minHeight = Math.min(minHeight, center.y);
    maxHeight = Math.max(maxHeight, center.y);
    if (time === 0) start = [center.clone(), ...bones.map((bone) => bone.matrixWorld.clone())];
    if (time === finishTime) {
      assert.ok(start[0].distanceTo(center) < .0001, id + ' finish cue shows the working stance');
      bones.forEach((bone, i) => assert.ok(bone.matrixWorld.elements.every((value, j) =>
        Math.abs(value - start[i + 1].elements[j]) < .0001), id + ' finish cue figure pose'));
    }
    if (time === duration) {
      assert.ok(start[0].distanceTo(center) < 1e-6, id + ' bar loop');
      bones.forEach((bone, i) => assert.deepEqual(bone.matrixWorld.elements, start[i + 1].elements, id + ' figure loop'));
    }
    for (const [index, side] of ['L', 'R'].entries()) {
      const foot = scene.getObjectByName('Foot' + side);
      if (time === 0) footStart.push(foot.matrixWorld.clone());
      const previous = footStart[index].elements;
      maxFootDrift = Math.max(maxFootDrift, ...foot.matrixWorld.elements.map((value, i) => Math.abs(value - previous[i])));
    }
    const knees = ['L', 'R'].map(kneeAngle);
    minKnee = Math.min(minKnee, ...knees);
    maxKnee = Math.max(maxKnee, ...knees);
    if (time === bottom) {
      bottomThighDrop = position('ShinL').y - position('ThighL').y;
      bottomTorsoLean = THREE.MathUtils.radToDeg(position('Chest').sub(position('Pelvis')).angleTo(axis.set(0, 1, 0)));
    }

    for (const seat of seats) {
      point.copy(seat.position).applyMatrix4(seat.hand.matrixWorld).sub(center);
      maxSeatError = Math.max(maxSeatError, Math.hypot(point.y, point.z));
      assert.ok(Math.abs(Math.abs(point.x) - .310) < .0001, id + ' shaft grip width');
      seat.hand.getWorldQuaternion(seatRotation).multiply(seat.quaternion);
      assert.ok(Math.abs(axis.set(1, 0, 0).applyQuaternion(seatRotation).x) > .999999, id + ' shaft alignment');
    }
    if (time === 0 || time === bottom) wristAngle = Math.max(wristAngle, ...checkGrip(seats, id + ' at ' + time, shaftGap));
    const soleExtents = [[Infinity, -Infinity], [Infinity, -Infinity]];
    const soleHeights = [Infinity, Infinity];
    const gripGaps = [[Infinity, Infinity, Infinity], [Infinity, Infinity, Infinity]];
    let backContact = Infinity;
    for (const { mesh, vertices } of meshes) {
      for (let i = 0; i < vertices.length; i++) {
        const { bone, sole, grip } = vertices[i];
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
        assert.ok(point.y > -.003, id + ' body/floor collision');
        if (sole >= 0) {
          soleHeights[sole] = Math.min(soleHeights[sole], point.y);
          const extent = soleExtents[sole];
          extent[0] = Math.min(extent[0], point.z);
          extent[1] = Math.max(extent[1], point.z);
        }
        // The rack frame has no solids in front of its runners. The middle
        // corridor is also clear, apart from the rear crossbar behind z = .04.
        if (point.z < .66 && (point.z < .04 || Math.abs(point.x) > .565)) {
          assert.ok(!rackBounds.some((bounds) => bounds.containsPoint(point)), id + ' body/rack collision');
        }
        point.sub(center);
        const axial = Math.abs(point.x);
        if (axial > 1.125) continue;
        const radial = Math.hypot(point.y, point.z);
        if (grip && axial < .60) {
          const side = bone.endsWith('L') ? 0 : 1;
          const slot = bone.startsWith('Hand') ? 0 : bone.startsWith('Thumb') ? 1 : 2;
          gripGaps[side][slot] = Math.min(gripGaps[side][slot], Math.abs(radial - .01425));
          maxHandDepth = Math.max(maxHandDepth, .01425 - radial);
          continue;
        }
        if (radial > .30) continue;
        for (const [from, to, radius] of solids) {
          const end = Math.max(from - axial, axial - to);
          const rim = radial - radius;
          const gap = Math.hypot(Math.max(0, end), Math.max(0, rim)) + Math.min(0, Math.max(end, rim));
          clearance = Math.min(clearance, gap);
          if (radius === .01425 && bone === 'Chest' && mesh.material.name === 'Upper back') {
            backContact = Math.min(backContact, gap);
          }
        }
      }
    }
    maxSoleError = Math.max(maxSoleError, ...soleHeights.map(Math.abs));
    for (const [toe, heel] of soleExtents) {
      assert.ok(toe + .008 < center.z && center.z < heel - .008, id + ' bar over planted foot');
    }
    assert.ok(backContact >= 0 && backContact < .003, id + ' shaft/upper-back contact');
    maxGripGap = Math.max(maxGripGap, ...gripGaps.flat());
  }

  assert.ok(maxHeight - minHeight > .24, id + ' working range');
  assert.ok(clearance > 0, id + ' bar/body clearance ' + clearance);
  assert.ok(maxSoleError < .003 && maxFootDrift < .001, id + ' planted soles ' + maxSoleError);
  assert.ok(wristAngle < .46, id + ' wrist angle ' + wristAngle);
  assert.ok(maxSeatError < .0001 && maxHandDepth < .003 && maxGripGap < .002, id + ' skinned grip');
  if (id.endsWith(':Barbell_Squat')) assert.ok(minKnee > 75 && minKnee < 90, id + ' standard squat depth');
  if (id.endsWith(':Barbell_Full_Squat')) assert.ok(minKnee < 45 && bottomThighDrop > .12, id + ' full squat depth');
  if (id.endsWith(':Wide_Stance_Barbell_Squat')) {
    assert.ok(position('FootL').distanceTo(position('FootR')) > .55 && bottomThighDrop > .025, id + ' wide squat stance and depth');
  }
  if (id.endsWith(':Speed_Squats')) {
    assert.ok(entry.phases[3][0] - bottom < (bottom - entry.phases[1][0]) / 2 && bottomThighDrop > .05, id + ' speed squat depth and drive');
  }
  if (id.endsWith(':Good_Morning')) {
    assert.ok(maxKnee - minKnee < 1 && bottomTorsoLean > 69, id + ' hip hinge with fixed knee bend');
  }
  console.log(entry.name, {
    minHeight, maxHeight, clearance, maxSoleError, maxFootDrift, maxSeatError, maxHandDepth, maxGripGap, wristAngle,
    minKnee, maxKnee, bottomThighDrop, bottomTorsoLean,
  });
  figure.stop();
  prop.stop();
}
