import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { attachDumbbells, createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createDumbbell } from './dumbbell.mjs';
import { createEntries, createStepPlatform, stepPlatformHeight } from './dumbbell-expansion.mjs';
import { createFlatBench } from './flat-bench.mjs';
import { createInclineBench } from './incline-bench.mjs';

const ids = [
  'Around_The_Worlds', 'Concentration_Curls', 'Dumbbell_Incline_Shoulder_Raise', 'Dumbbell_Lying_Pronation',
  'Dumbbell_Squat_To_A_Bench', 'Dumbbell_Step_Ups', 'External_Rotation', 'Incline_Inner_Biceps_Curl',
  'Lying_Dumbbell_Tricep_Extension', 'Lying_One-Arm_Lateral_Raise', 'Middle_Back_Shrug',
  'One-Arm_Incline_Lateral_Raise', 'Reverse_Flyes_With_External_Rotation', 'Seated_Bent-Over_Rear_Delt_Raise',
  'Seated_Dumbbell_Curl', 'Seated_Dumbbell_Palms-Down_Wrist_Curl', 'Seated_Dumbbell_Press',
  'Seated_Triceps_Press', 'Split_Squat_with_Dumbbells', 'Tate_Press',
];
const source = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(source.buffer, '');
const catalog = JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url)));
const { scene } = asset;
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
assert.deepEqual(Object.keys(entries).sort(), ids.map((id) => 'local:exercise:' + id).sort());
const gripTracks = createDumbbellGripTracks(scene);
const dumbbells = attachDumbbells(scene, createDumbbell);
const cradle = createDumbbell();
const mixer = new THREE.AnimationMixer(scene);
const propMixer = new THREE.AnimationMixer(cradle);
const vertices = [];
const bones = new Map();
const materials = new Set();
const point = new THREE.Vector3();
const local = new THREE.Vector3();
const vec = (...args) => new THREE.Vector3(...args);
scene.traverse((mesh) => {
  if (mesh.isBone) bones.set(mesh.name, mesh);
  if (!mesh.isSkinnedMesh) return;
  materials.add(mesh.material.name);
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  for (let i = 0; i < skinIndex.count; i++) {
    let dominant = 0;
    for (let j = 1; j < 4; j++) {
      if (skinWeight.getComponent(i, j) > skinWeight.getComponent(i, dominant)) dominant = j;
    }
    const name = mesh.skeleton.bones[skinIndex.getComponent(i, dominant)].name;
    const hand = /^(?:Hand|(?:Thumb|Index|Middle|Ring|Little)\d)([LR])$/.exec(name);
    vertices.push([mesh, i, name, hand ? 'LR'.indexOf(hand[1]) : -1]);
  }
});

function fixtures(entry) {
  const transform = entry.benchTransform;
  const fixture = entry.equipment.startsWith('incline-bench') ? createInclineBench(transform)
    : entry.equipment.startsWith('bench') ? createFlatBench()
      : entry.equipment.startsWith('step-platform') ? createStepPlatform() : null;
  if (!fixture) return [];
  fixture.position.fromArray(transform?.position ?? [0, 0, 0]);
  fixture.rotation.y = transform?.yaw ?? 0;
  fixture.updateMatrixWorld(true);
  if (entry.equipment.startsWith('bench')) {
    const pad = fixture.getObjectByName('Pad');
    pad.geometry.computeBoundingBox();
    const box = pad.geometry.boundingBox.clone().applyMatrix4(pad.matrix);
    assert.ok(Math.abs(box.max.y - .430) < 1e-6, 'flat pad height');
    return [{ name: 'Pad', box, inverse: fixture.matrixWorld.clone().invert() }];
  }
  const pads = [];
  fixture.traverse((mesh) => {
    if (!mesh.isMesh || !/pad|platform/i.test(mesh.name)) return;
    mesh.geometry.computeBoundingBox();
    pads.push({ name: mesh.name, box: mesh.geometry.boundingBox, inverse: mesh.matrixWorld.clone().invert() });
  });
  return pads;
}

function headDistance(p) {
  const axial = Math.abs(p.x);
  const edge = Math.max(Math.abs(p.y), Math.abs(.5 * p.y + .8660254 * p.z),
    Math.abs(-.5 * p.y + .8660254 * p.z));
  return Math.max(.066 - axial, axial - .112, edge - .055 * Math.cos(Math.PI / 6));
}

const floorFeet = ['FootL', 'FootR'];
const stationaryUpperArms = new Set(['Concentration_Curls', 'Dumbbell_Lying_Pronation', 'External_Rotation',
  'Incline_Inner_Biceps_Curl', 'Lying_Dumbbell_Tricep_Extension', 'Seated_Dumbbell_Curl',
  'Seated_Dumbbell_Palms-Down_Wrist_Curl', 'Seated_Triceps_Press', 'Tate_Press']);
const supportByExercise = {
  Around_The_Worlds: ['Pad:Pelvis', 'Pad:Chest', 'Pad:Head'],
  Concentration_Curls: ['Pad:ThighL', 'Pad:ThighR'],
  Dumbbell_Incline_Shoulder_Raise: ['Seat pad:Pelvis'],
  Dumbbell_Lying_Pronation: ['Pad:Pelvis', 'Pad:Chest', 'Pad:ForearmR'],
  External_Rotation: ['Pad:Pelvis', 'Pad:Chest', 'Pad:ArmR', 'Pad:FootR'],
  Incline_Inner_Biceps_Curl: ['Seat pad:Pelvis', 'Backrest pad:Chest', 'Backrest pad:Head'],
  Lying_Dumbbell_Tricep_Extension: ['Pad:Pelvis', 'Pad:Chest', 'Pad:Head'],
  'Lying_One-Arm_Lateral_Raise': ['Pad:Pelvis', 'Pad:Chest'],
  Middle_Back_Shrug: ['Backrest pad:Chest', 'Backrest pad:Lumbar'],
  'One-Arm_Incline_Lateral_Raise': ['Backrest pad:Pelvis', 'Backrest pad:ArmR'],
  Reverse_Flyes_With_External_Rotation: ['Backrest pad:Chest', 'Backrest pad:Lumbar'],
  'Seated_Bent-Over_Rear_Delt_Raise': ['Pad:ThighL', 'Pad:ThighR'],
  Seated_Dumbbell_Curl: ['Pad:Pelvis'],
  'Seated_Dumbbell_Palms-Down_Wrist_Curl': ['Pad:ThighL', 'Pad:ThighR'],
  Seated_Dumbbell_Press: ['Seat pad:Pelvis', 'Backrest pad:Chest'],
  Seated_Triceps_Press: ['Seat pad:Pelvis', 'Backrest pad:Chest'],
  Split_Squat_with_Dumbbells: ['Pad:FootR'],
  Tate_Press: ['Pad:Pelvis', 'Pad:Chest', 'Pad:Head'],
};
const startPosition = (name) => bones.get(name).getWorldPosition(vec());
const anatomyRegion = (name, near) => vertices.filter(([, , bone]) => bone === name)
  .map(([mesh, i]) => mesh.getVertexPosition(i, vec()).applyMatrix4(mesh.matrixWorld))
  .filter((p) => !near || p.distanceToSquared(near) < .10 ** 2);
function closestRegions(first, second, near) {
  const target = anatomyRegion(second);
  let gap = Infinity;
  for (const p of anatomyRegion(first, near)) {
    for (const q of target) gap = Math.min(gap, p.distanceToSquared(q));
  }
  return Math.sqrt(gap);
}
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} (${actual}, expected ${expected})`);

for (const suffix of ids) {
  const id = 'local:exercise:' + suffix;
  const entry = entries[id];
  const { clip, propClip } = entry;
  const row = catalog.find((row) => row.id === id && row.equipment === 'DUMBBELL');
  assert.equal(entry.name, row?.name, id);
  const atlas = (muscle) => /^(middle|lower) back$/.test(muscle)
    ? 'Upper back' : muscle[0].toUpperCase() + muscle.slice(1);
  assert.deepEqual(entry.primary, row.primaryMuscles.map(atlas), id);
  assert.deepEqual([...entry.supporting].sort(), row.secondaryMuscles.map(atlas).sort(), id);
  assert.ok([...entry.primary, ...entry.supporting].every((name) => materials.has(name)), id);
  assert.ok(entry.phases.every(([time], i) => time >= 0 && time < clip.duration
    && (i === 0 || time > entry.phases[i - 1][0])), id);
  assert.ok(entry.cues.every(([time, title, message]) =>
    title && message && entry.phases.some(([phaseTime]) => phaseTime === time)), id);

  const special = suffix === 'Seated_Triceps_Press';
  const step = suffix === 'Dumbbell_Step_Ups';
  const split = suffix === 'Split_Squat_with_Dumbbells';
  const squat = suffix === 'Dumbbell_Squat_To_A_Bench';
  const sideLying = ['External_Rotation', 'One-Arm_Incline_Lateral_Raise'].includes(suffix);
  const drawn = special ? [cradle] : dumbbells.slice(0, entry.equipment.endsWith('dumbbells') ? 2 : 1);
  assert.equal(Boolean(propClip), special, id);
  if (special) {
    assert.equal(entry.grip, 'two-hand-head-cradle', id);
    assert.equal(entry.equipment, 'incline-bench-cradle-dumbbell', id);
    assert.equal(propClip.duration, clip.duration, id);
  }
  if (step) {
    assert.equal(entry.equipment, 'step-platform-dumbbells', id);
    assert.equal(new THREE.Box3().setFromObject(createStepPlatform()).max.y.toFixed(3), stepPlatformHeight.toFixed(3));
  }
  const digits = clip.tracks.filter((track) => /^(Thumb|Index|Middle|Ring|Little)/.test(track.name));
  assert.equal(digits.length, special ? 30 : drawn.length * 15, id);
  for (const track of digits) {
    const regular = gripTracks.find(({ name }) => name === track.name);
    assert.equal(track.values.every((value, i) => value === regular.values[i]), !special, track.name);
  }
  for (const track of [...clip.tracks, ...(propClip?.tracks ?? [])]) {
    assert.ok(track.validate() && track.values.every(Number.isFinite), track.name);
    const size = track.getValueSize();
    for (let i = 0; i < size; i++) {
      near(track.values[i], track.values[track.values.length - size + i], 1e-5, id + ' loop at ' + track.name);
    }
    if (step && /^Shin[LR]\.quaternion$/.test(track.name)) {
      const a = new THREE.Quaternion();
      const b = new THREE.Quaternion();
      for (let i = size; i < track.values.length; i += size) {
        a.fromArray(track.values, i - size).normalize();
        b.fromArray(track.values, i).normalize();
        assert.ok(a.angleTo(b) < .34, id + ' continuous shin rotation at ' + track.times[i / size]);
      }
    }
  }

  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
  action.paused = true;
  const propAction = propClip && propMixer.clipAction(propClip).setLoop(THREE.LoopOnce, 1).play();
  if (propAction) propAction.paused = true;
  const pads = fixtures(entry);
  const supportKeys = supportByExercise[suffix] ?? [];
  const sampledContacts = new Set([...supportKeys, ...(squat ? ['Pad:Pelvis'] : []),
    ...(step ? ['Step platform:FootL', 'Step platform:FootR'] : [])]);
  const propStart = [];
  const turnStart = [];
  const ankleStart = [];
  const elbowStart = [];
  const wristStart = [];
  const travel = Array(drawn.length).fill(0);
  const turns = Array(drawn.length).fill(0);
  const times = [...new Set([...Array.from({ length: 37 }, (_, i) => i / 10),
    ...entry.phases.map(([time]) => time)])].sort((a, b) => a - b);

  for (const time of times) {
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    if (propAction) {
      propAction.time = time;
      propMixer.update(0);
      cradle.updateMatrixWorld(true);
    }
    const at = `${suffix} at ${time.toFixed(2)} s`;
    assert.ok([...bones.values()].every((bone) => bone.matrixWorld.elements.every(Number.isFinite)), at);
    const anchors = drawn.map((prop) => prop.getWorldPosition(vec()));
    const separatingAxis = drawn.length === 2 ? anchors[1].clone().sub(anchors[0]).normalize() : null;
    const extents = [-Infinity, Infinity];
    for (const [i, prop] of drawn.entries()) {
      const quaternion = prop.getWorldQuaternion(new THREE.Quaternion());
      propStart[i] ??= anchors[i];
      turnStart[i] ??= quaternion;
      travel[i] = Math.max(travel[i], anchors[i].distanceTo(propStart[i]));
      turns[i] = Math.max(turns[i], quaternion.angleTo(turnStart[i]));
      for (const mesh of prop.children) {
        const { position } = mesh.geometry.attributes;
        for (let j = 0; j < position.count; j++) {
          point.fromBufferAttribute(position, j).applyMatrix4(mesh.matrixWorld);
          assert.ok(point.y > .010, at + ' dumbbell floor clearance');
          if (separatingAxis) {
            const projected = point.dot(separatingAxis);
            extents[i] = i === 0 ? Math.max(extents[i], projected) : Math.min(extents[i], projected);
          }
          for (const { name, box, inverse } of pads) {
            local.copy(point).applyMatrix4(inverse);
            assert.ok(!box.containsPoint(local) || local.y > box.max.y - .002, at + ' dumbbell intersects ' + name);
          }
        }
      }
    }
    if (separatingAxis) assert.ok(extents[1] - extents[0] > -.002, at + ' dumbbells overlap');
    for (const [i, side] of ['L', 'R'].entries()) {
      const ankle = startPosition('Foot' + side);
      const elbow = startPosition('Forearm' + side);
      const wrist = startPosition('Hand' + side);
      ankleStart[i] ??= ankle;
      elbowStart[i] ??= elbow;
      wristStart[i] ??= wrist;
      if (!step) near(ankle.distanceTo(ankleStart[i]), 0, .0005, at + ' planted ankle drift');
      if (stationaryUpperArms.has(suffix) && (i === 0 || drawn.length === 2 || special)) {
        near(elbow.distanceTo(elbowStart[i]), 0, .0005, at + ' elbow drift');
      }
      if (suffix.includes('Wrist_Curl')) near(wrist.distanceTo(wristStart[i]), 0, .0005, at + ' wrist drift');
    }

    const inverseProps = drawn.map((prop) => prop.matrixWorld.clone().invert());
    const sole = { FootL: Infinity, FootR: Infinity };
    const fixtureGaps = {};
    const thumb = [Infinity, Infinity];
    const underside = [Infinity, Infinity];
    const shaftPalm = [Infinity, Infinity];
    let floor = Infinity;
    let fixtureDepth = 0;
    let propDepth = 0;
    let deepestBone;
    for (const [mesh, i, bone, handSide] of vertices) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      floor = Math.min(floor, point.y);
      if (bone in sole) sole[bone] = Math.min(sole[bone], point.y);
      for (const { name, box, inverse } of pads) {
        local.copy(point).applyMatrix4(inverse);
        if (local.x < box.min.x + .006 || local.x > box.max.x - .006
          || local.z < box.min.z + .006 || local.z > box.max.z - .006) continue;
        const gap = local.y - box.max.y;
        const key = name + ':' + bone;
        if (sampledContacts.has(key)) fixtureGaps[key] = Math.min(fixtureGaps[key] ?? Infinity, gap);
        if (local.y >= box.min.y) fixtureDepth = Math.max(fixtureDepth, -gap);
      }
      for (const [index, inverse] of inverseProps.entries()) {
        local.copy(point).applyMatrix4(inverse);
        if (Math.abs(local.x) > .14 || Math.abs(local.y) > .08 || Math.abs(local.z) > .08) continue;
        const head = headDistance(local);
        const radial = Math.hypot(local.y, local.z);
        const shaft = Math.max(Math.abs(local.x) - .066, radial - .014);
        const depth = -Math.min(head, shaft);
        if (depth > propDepth) {
          propDepth = depth;
          deepestBone = bone;
        }
        if (special && handSide >= 0 && local.x > .047) {
          if (bone.startsWith('Thumb')) thumb[handSide] = Math.min(thumb[handSide], Math.abs(head));
          const palmSide = handSide === 0 ? 1 : -1;
          if (bone.startsWith('Hand') && local.y * palmSide > .010 && radial < .052) {
            underside[handSide] = Math.min(underside[handSide], Math.abs(local.x - .066));
          }
        } else if (!special && bone === 'Hand' + 'LR'[index] && Math.abs(local.x) < .020) {
          shaftPalm[index] = Math.min(shaftPalm[index], Math.abs(radial - .014));
        }
      }
    }
    assert.ok(floor > -.011, at + ' figure floor clearance ' + floor);
    assert.ok(fixtureDepth < .013, at + ' figure intersects fixture by ' + fixtureDepth);
    assert.ok(propDepth < .004, at + ' dumbbell intersects ' + deepestBone + ' by ' + propDepth);
    if (special) {
      thumb.forEach((gap) => near(gap, 0, .003, at + ' thumb contact with the upper head'));
      underside.forEach((gap) => near(gap, 0, .003, at + ' palm supports the upper head'));
    } else {
      drawn.forEach((_, i) => near(shaftPalm[i], 0, .002, at + ' calibrated shaft contact'));
    }
    for (const key of supportKeys) {
      near(fixtureGaps[key], 0, .021, at + ' support at ' + key);
    }
    if (!step && !sideLying) {
      for (const foot of split ? ['FootL'] : floorFeet) near(sole[foot], 0, .009, at + ' sole contact');
    }
    if (squat && time >= 1.8 && time <= 2.1) near(fixtureGaps['Pad:Pelvis'], 0, .012, at + ' bench tap');
    if (squat && time === 0) assert.ok((fixtureGaps['Pad:Pelvis'] ?? Infinity) > .15, at + ' bench clearance');
    if (step) {
      if (time <= .25 || time >= 3.35) near(sole.FootL, 0, .009, at + ' lead foot on floor');
      if (time >= 1 && time <= 2.8) near(fixtureGaps['Step platform:FootL'], 0, .006, at + ' lead foot on platform');
      if (time <= 1.18 || time >= 2.8) near(sole.FootR, 0, .009, at + ' trailing foot on floor');
      if (time >= 1.75 && time <= 2.05) near(fixtureGaps['Step platform:FootR'], 0, .006, at + ' trailing foot on platform');
      if (time === 1.75) assert.ok(startPosition('Pelvis').y > 1.16, at + ' no rise onto platform');
    }
    if (time === 0) {
      if (suffix === 'Concentration_Curls') {
        near(closestRegions('ArmL', 'ThighL', elbowStart[0]), 0, .016, at + ' upper arm brace');
      }
      if (suffix.includes('Wrist_Curl')) {
        for (const side of ['L', 'R']) near(closestRegions('Forearm' + side, 'Thigh' + side), 0, .014, at + ' forearm brace');
      }
      if (suffix === 'External_Rotation' || suffix === 'Dumbbell_Lying_Pronation') {
        near(Math.min(closestRegions('Head', 'HandR'), closestRegions('Head', 'ForearmR')), 0, .010,
          at + ' head support');
      }
    }
  }
  const minTravel = suffix === 'Dumbbell_Incline_Shoulder_Raise' ? .035
    : suffix === 'Middle_Back_Shrug' || suffix.includes('Wrist_Curl') ? .06 : .20;
  assert.ok(travel.every((distance) => distance > minTravel), suffix + ' insufficient travel ' + travel);
  if (/Rotation|Pronation|Wrist_Curl/.test(suffix)) assert.ok(turns.every((angle) => angle > .70), suffix + ' rotation');
  console.log(`${entry.name} — ${times.length} samples, ${(Math.min(...travel) * 100).toFixed(1)} cm minimum dumbbell travel`);
  action.stop();
  propAction?.stop();
}
