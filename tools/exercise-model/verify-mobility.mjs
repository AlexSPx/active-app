import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { measurePalmContacts } from './hand-frame.mjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createEntries } from './mobility-exercises.mjs';
import { exercises, createPowerGripTracks } from './clips.mjs';
import { createEntries as floorEntries } from './bodyweight-floor.mjs';
import { createEntries as standingEntries } from './bodyweight-standing.mjs';
import { createEntries as dumbbellEntries } from './dumbbell-standing.mjs';
import { createEntries as barbellEntries } from './barbell-standing.mjs';
import { createEntries as benchEntries } from './flat-bench-exercises.mjs';

const bytes = await readFile(new URL('./anatomy.glb', import.meta.url));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .parseAsync(Uint8Array.from(bytes).buffer, '');
const catalog = new Map(JSON.parse(await readFile(new URL(
  '../../apps/client/lib/data/exercise-catalog.json', import.meta.url,
))).map((entry) => [entry.id, entry]));
const { scene } = asset;
const bone = (name) => scene.getObjectByName(name);
const point = (name) => bone(name).getWorldPosition(new THREE.Vector3());
const rig = [];
const meshes = [];
scene.traverse((object) => {
  if (object.isBone) rig.push(object);
  if (!object.isSkinnedMesh) return;
  const { position, skinIndex, skinWeight } = object.geometry.attributes;
  const components = ['getX', 'getY', 'getZ', 'getW'];
  const groups = Array.from({ length: position.count }, (_, index) => {
    const dominant = components.reduce((best, axis) =>
      skinWeight[axis](index) > skinWeight[best](index) ? axis : best);
    return object.skeleton.bones[skinIndex[dominant](index)].name.replace(/^(\w+)[123]([LR])$/, 'Hand$2');
  });
  meshes.push({ mesh: object, groups });
});
assert.ok(rig.length && meshes.length, 'Expected a skinned anatomy rig');
const bindPose = rig.map((joint) => [...joint.position.toArray(), ...joint.quaternion.toArray()]);
const entries = createEntries(asset);
assert.deepEqual(rig.map((joint) => [...joint.position.toArray(), ...joint.quaternion.toArray()]), bindPose);
const existing = new Set(Object.keys(exercises));
for (const family of [floorEntries, standingEntries, dumbbellEntries, barbellEntries, benchEntries]) {
  Object.keys(family(asset, { createPowerGripTracks })).forEach((id) => existing.add(id));
}

const bothFeet = ['FootL', 'FootR'];
const bothHands = ['HandL', 'HandR'];
const tests = {
  Arm_Circles: [bothFeet, bothFeet, 'HandL', .5, .18, .24],
  Wrist_Circles: [bothFeet, [...bothFeet, 'ForearmL', 'ForearmR', ...bothHands], 'HandL', .5, .2, .8, true],
  Dynamic_Back_Stretch: [bothFeet, bothFeet, 'HandL', 7.2, .85, 1.07],
  Dynamic_Chest_Stretch: [bothFeet, bothFeet, 'HandL', 6 * .1 ** .8, .80, 1.04],
  Upward_Stretch: [bothFeet, bothFeet, 'HandL', 1.5, .33, .40],
  Standing_Pelvic_Tilt: [bothFeet, bothFeet, 'Pelvis', 1.5, .27, .36, true],
  Shoulder_Stretch: [bothFeet, bothFeet, 'HandL', 1.5, .67, .81],
  'Leg-Up_Hamstring_Stretch': [['Pelvis', 'Chest', 'Head', 'FootR', ...bothHands],
    ['Pelvis', 'Chest', 'Head', 'FootR', ...bothHands], 'FootL', 1.5, .40, .54],
  The_Straddle: [['Pelvis', ...bothFeet], bothFeet, 'Head', 1.5, .31, .49],
  Kneeling_Hip_Flexor: [['FootL', 'ShinR', 'FootR'], [...bothFeet, 'ShinR'], 'Pelvis', 1.5, .15, .20],
  Kneeling_Forearm_Stretch: [[...bothHands, 'ShinL', 'ShinR', ...bothFeet], [...bothHands, ...bothFeet],
    'Pelvis', 1.5, .115, .135],
  Hip_Circles_prone: [[...bothHands, 'ShinR', 'FootR'], [...bothHands, 'ShinR', 'FootR'],
    'ShinL', 2.25, .10, .24],
  Lower_Back_Curl: [['Pelvis', ...bothFeet], bothFeet, 'Chest', 1.35, .019, .10],
};
assert.deepEqual(Object.keys(entries).sort(), Object.keys(tests).map((key) => 'local:exercise:' + key).sort());

const measurePalm = measurePalmContacts(scene);
const mixer = new THREE.AnimationMixer(scene);
const vertex = new THREE.Vector3();
const materialNames = new Set(meshes.map(({ mesh }) => mesh.material.name));
for (const [id, { name, clip, primary, supporting, framing, phases, cues }] of Object.entries(entries)) {
  const key = id.slice('local:exercise:'.length);
  const [contacts, fixed, measured, peak, min, max, angular] = tests[key];
  assert.ok(!existing.has(id), id + ' duplicates an existing clip');
  assert.equal(name, catalog.get(id)?.name, id);
  assert.ok([null, 'BODY_ONLY'].includes(catalog.get(id).equipment), id);
  assert.equal(catalog.get(id).category, 'STRETCHING', id);
  assert.equal(framing, contacts === bothFeet ? 'standing' : 'floor', id);
  assert.ok(clip.validate() && primary.length && [...primary, ...supporting].every((muscle) => materialNames.has(muscle)), id);
  for (const markers of [phases, cues]) {
    assert.ok(markers.length && markers.every(([time], i) =>
      time >= (markers[i - 1]?.[0] ?? 0) && time <= clip.duration), id + ' marker times');
  }
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
  action.paused = true;
  const pose = (time) => {
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
  };
  const snapshot = () => rig.map((joint) => [joint.position.clone(), joint.quaternion.clone()]);
  const samePose = (start, label) => rig.forEach((joint, i) => {
    assert.ok(joint.position.distanceTo(start[i][0]) < .001, name + ' ' + label);
    assert.ok(joint.quaternion.angleTo(start[i][1]) < .001, name + ' ' + label);
  });
  pose(0);
  const start = snapshot();
  const anchors = fixed.map(point);
  const jointAngle = (first, middle, last) => {
    const center = point(middle);
    return point(first).sub(center).angleTo(point(last).sub(center));
  };
  const kneeAngle = (side) => jointAngle('Thigh' + side, 'Shin' + side, 'Foot' + side);
  const startKnee = kneeAngle('L');
  const base = angular ? bone(measured).quaternion.clone() : point(measured);
  pose(peak);
  const range = angular ? base.angleTo(bone(measured).quaternion) : base.distanceTo(point(measured));
  if (key === 'Leg-Up_Hamstring_Stretch') {
    const soleDirection = new THREE.Vector3(0, -1, 0).applyQuaternion(bone('FootL').getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(kneeAngle('L') > 2.9 && kneeAngle('L') - startKnee > .3 && soleDirection.y > .85, name);
    assert.ok(point('FootL').z < point('ThighL').z - .22, name + ' reaches toward head');
  }
  if (key === 'The_Straddle') {
    assert.ok(kneeAngle('L') > 2.75 && kneeAngle('R') > 2.75, name + ' straight legs');
    assert.ok(point('FootL').x - point('FootR').x > 1, name + ' feet in a wide V');
  }
  if (key === 'Hip_Circles_prone') {
    assert.ok(kneeAngle('L') > .85 && kneeAngle('L') < 2.3, name + ' maintains a bent knee');
    assert.ok(point('ShinL').y > point('ShinR').y + .035, name + ' lifted knee');
  }
  if (key === 'Shoulder_Stretch') {
    assert.ok(point('HandL').x < -.20 && jointAngle('ArmL', 'ForearmL', 'HandL') > 2.8, name);
  }
  if (key === 'Dynamic_Back_Stretch' || key === 'Upward_Stretch') {
    assert.ok(point('HandL').y > point('Head').y + .25, name + ' reaches overhead');
    assert.ok(jointAngle('ArmL', 'ForearmL', 'HandL') > 2.65, name + ' extends elbows');
  }
  if (key === 'Kneeling_Forearm_Stretch') {
    for (const side of ['L', 'R']) {
      assert.ok(point('Middle2' + side).z < point('Hand' + side).z - .075, name + ' fingers point toward knees');
    }
  }
  pose(clip.duration);
  samePose(start, 'loop closure');
  const release = phases.find(([_, label]) => label === 'Release');
  if (release) {
    pose(peak);
    const held = snapshot();
    pose(release[0]);
    samePose(held, 'stable hold');
  }

  let minHandGap = Infinity;
  let maxHandGap = -Infinity;
  let floor = Infinity;
  let gap = -Infinity;
  let drift = 0;
  let worstFloor;
  let worstGap;
  const palmContacts = key === 'Dynamic_Chest_Stretch'
    ? Array.from({ length: 6 }, (_, i) => 6 * (i / 5) ** .8) : [];
  if (key === 'Dynamic_Back_Stretch' || key === 'Dynamic_Chest_Stretch') {
    const arms = ['ArmL', 'ForearmL', 'HandL', 'ArmR', 'ForearmR', 'HandR'].map(bone);
    let previous;
    for (let frame = 0; frame <= Math.round(clip.duration * 60); frame++) {
      const time = frame / 60;
      pose(time);
      const rotations = arms.map((joint) => joint.getWorldQuaternion(new THREE.Quaternion()));
      if (previous) rotations.forEach((rotation, i) => assert.ok(rotation.angleTo(previous[i]) < .16,
        `${name} ${arms[i].name} snaps at ${time}`));
      previous = rotations;
    }
  }
  const samples = Array.from({ length: Math.ceil(clip.duration * 12) }, (_, i) => i / 12)
    .concat([clip.duration, peak, ...phases.map(([time]) => time), ...palmContacts]);
  for (const time of samples) {
    pose(time);
    rig.forEach((joint) => {
      assert.ok(joint.matrixWorld.elements.every(Number.isFinite), name + ' finite transforms');
      assert.ok(Math.abs(joint.quaternion.length() - 1) < .001, name + ' unit quaternion');
    });
    const lows = {};
    const checkPalms = (key === 'Dynamic_Chest_Stretch'
      && palmContacts.includes(time))
      || key === 'Upward_Stretch';
    let leftInside = Infinity;
    let rightInside = -Infinity;
    for (const { mesh, groups } of meshes) {
      for (let i = 0; i < groups.length; i++) {
        mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
        assert.ok(Number.isFinite(vertex.x) && Number.isFinite(vertex.y) && Number.isFinite(vertex.z), name + ' finite skin');
        const group = groups[i];
        if (checkPalms) {
          if (group === 'HandL') leftInside = Math.min(leftInside, vertex.x);
          if (group === 'HandR') rightInside = Math.max(rightInside, vertex.x);
        }
        lows[group] = Math.min(lows[group] ?? Infinity, vertex.y);
      }
    }
    if (checkPalms) {
      const handGap = leftInside - rightInside;
      minHandGap = Math.min(minHandGap, handGap);
      maxHandGap = Math.max(maxHandGap, handGap);
    }
    for (const [group, y] of Object.entries(lows)) {
      if (y < floor) { floor = y; worstFloor = [group, time]; }
    }
    const supported = key === 'The_Straddle' && time >= 1.5 && time <= release[0]
      ? [...contacts, ...bothHands] : contacts;
    for (const side of ['L', 'R']) {
      const group = 'Hand' + side;
      const label = `${name} ${group} at ${time}`;
      if (key === 'Shoulder_Stretch') {
        const { bend, wristRoll } = measurePalm(side);
        assert.ok(bend < .24 && wristRoll < .02, label + ' relaxed wrist alignment');
      }
      if (checkPalms || key === 'Wrist_Circles') {
        const { dorsal, wristRoll } = measurePalm(side);
        const sign = side === 'L' ? 1 : -1;
        assert.ok(checkPalms ? dorsal.x * sign > .98 && wristRoll < .02
          : dorsal.y > .92 && wristRoll < .12, label + ' anatomical palm orientation');
      }
      if (key === 'The_Straddle') assert.ok(lows[group] >= -.002, label + ' hand penetrates floor');
      if (!supported.includes(group)) continue;
      const { heel, knuckles, dorsal, direction, bend, deviation, wristRoll } = measurePalm(side);
      assert.ok(lows[group] >= -.002 && heel <= .009 && knuckles <= .009,
        `${label} heel/knuckle clearance: ${lows[group]}, ${heel}, ${knuckles}`);
      assert.ok(dorsal.y > .99 && direction.z * (key === 'Kneeling_Forearm_Stretch' ? -1 : 1) > .97,
        label + ' palm down, fingers along the floor');
      assert.ok(bend < 1.65 && deviation < .55 && wristRoll < .02, label + ' wrist articulation');
    }
    for (const group of supported) {
      assert.ok(Number.isFinite(lows[group]), name + ' missing support geometry ' + group);
      if (lows[group] > gap) { gap = lows[group]; worstGap = [group, time]; }
    }
    fixed.forEach((group, i) => { drift = Math.max(drift, point(group).distanceTo(anchors[i])); });
  }
  action.stop();
  const message = `${name}: floor ${floor.toFixed(3)} ${worstFloor}, gap ${gap.toFixed(3)} ${worstGap}, drift ${drift.toFixed(3)}, range ${range.toFixed(3)}${maxHandGap === -Infinity ? '' : ', palm gap ' + minHandGap.toFixed(3) + ' to ' + maxHandGap.toFixed(3)}`;
  console.log(message);
  assert.ok(floor >= (key === 'Lower_Back_Curl' ? -.003 : -.014) && gap <= .016 && drift <= .004, message);
  assert.ok(range >= min && range <= max, `${message}, expected ${min} to ${max}`);
  if (key === 'Dynamic_Chest_Stretch' || key === 'Upward_Stretch') {
    assert.ok(minHandGap >= -.006 && maxHandGap <= .008, message + ' palms should touch');
  }
}
console.log(`Verified ${Object.keys(entries).length} catalog mobility clips against the Three.js skinned GLB.`);
