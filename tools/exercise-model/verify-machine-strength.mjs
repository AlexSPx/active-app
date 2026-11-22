import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, Box3, LoopOnce, Matrix4, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, createExerciseGroups, dumbbellGripTransform } from './clips.mjs';
import { handAlong } from './hand-frame.mjs';
import { createEntries, groupLabel } from './machine-strength.mjs';
import { createMachineStrengthFixture } from './machine-strength-fixtures.mjs';

const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
const groups = createExerciseGroups(asset);
const registered = groups.filter(([label]) => label === groupLabel);
assert.equal(registered.length, 1);
assert.deepEqual(Object.keys(registered[0][1]), Object.keys(entries));
const otherIds = new Set(groups.filter(([label]) => label !== groupLabel).flatMap(([, entries]) => Object.keys(entries)));
assert.ok(Object.keys(entries).every((id) => !otherIds.has(id)), 'duplicate family registration');

const catalog = JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url)));
const machines = new Map(catalog.filter((entry) => entry.equipment === 'MACHINE').map((entry) => [entry.id, entry.name]));
const ids = Object.keys(entries).map((id) => id.split(':').at(-1));
assert.deepEqual(ids.sort(), [
  'Ab_Crunch_Machine', 'Butterfly', 'Calf_Press', 'Calf_Press_On_The_Leg_Press_Machine', 'Dip_Machine',
  'Leg_Extensions', 'Leg_Press', 'Leverage_Chest_Press', 'Leverage_Deadlift', 'Leverage_Decline_Chest_Press',
  'Leverage_High_Row', 'Leverage_Incline_Chest_Press', 'Leverage_Iso_Row', 'Leverage_Shoulder_Press',
  'Leverage_Shrug', 'Lying_Leg_Curls', 'Lying_T-Bar_Row', 'Machine_Bench_Press', 'Machine_Bicep_Curl',
  'Machine_Preacher_Curls', 'Machine_Shoulder_Military_Press', 'Machine_Triceps_Extension',
  'Narrow_Stance_Leg_Press', 'Reverse_Hyperextension', 'Reverse_Machine_Flyes', 'Seated_Calf_Raise',
  'Seated_Leg_Curl', 'Single-Leg_Leg_Extension', 'Standing_Leg_Curl', 'Thigh_Abductor', 'Thigh_Adductor',
].sort());

const mixer = new AnimationMixer(asset.scene);
const skin = [];
asset.scene.traverse((object) => { if (object.isSkinnedMesh) skin.push(object); });
const atlas = new Set(skin.map(({ material }) => material.name));
const signatures = new Set();
const joint = (name) => asset.scene.getObjectByName(name);
const point = (name) => joint(name).getWorldPosition(new Vector3());
const kneeAngle = (side) => point('Thigh' + side).sub(point('Shin' + side))
  .angleTo(point('Foot' + side).sub(point('Shin' + side)));
const elbowAngle = (side) => point('Arm' + side).sub(point('Forearm' + side))
  .angleTo(point('Hand' + side).sub(point('Forearm' + side)));
const anklePitch = () => {
  const direction = joint('FootL').getWorldDirection(new Vector3());
  return Math.atan2(-direction.y, direction.z);
};
const checks = {
  Ab_Crunch_Machine: () => point('Head').z,
  Butterfly: () => -point('HandL').x,
  Calf_Press: anklePitch,
  Calf_Press_On_The_Leg_Press_Machine: anklePitch,
  Dip_Machine: () => elbowAngle('L'),
  Leg_Extensions: () => kneeAngle('L'),
  Leg_Press: () => kneeAngle('L'),
  Leverage_Chest_Press: () => elbowAngle('L'),
  Leverage_Deadlift: () => point('Pelvis').y,
  Leverage_Decline_Chest_Press: () => elbowAngle('L'),
  Leverage_High_Row: () => -elbowAngle('L'),
  Leverage_Incline_Chest_Press: () => elbowAngle('L'),
  Leverage_Iso_Row: () => -elbowAngle('L'),
  Leverage_Shoulder_Press: () => point('HandL').y,
  Leverage_Shrug: () => point('ArmL').y,
  Lying_Leg_Curls: () => -kneeAngle('L'),
  'Lying_T-Bar_Row': () => -elbowAngle('L'),
  Machine_Bench_Press: () => elbowAngle('L'),
  Machine_Bicep_Curl: () => -elbowAngle('L'),
  Machine_Preacher_Curls: () => -elbowAngle('L'),
  Machine_Shoulder_Military_Press: () => point('HandL').y,
  Machine_Triceps_Extension: () => elbowAngle('L'),
  Narrow_Stance_Leg_Press: () => kneeAngle('L'),
  Reverse_Hyperextension: () => point('FootL').y,
  Reverse_Machine_Flyes: () => point('HandL').x,
  Seated_Calf_Raise: () => point('FootL').y,
  Seated_Leg_Curl: () => -kneeAngle('L'),
  'Single-Leg_Leg_Extension': () => kneeAngle('R'),
  Standing_Leg_Curl: () => -kneeAngle('R'),
  Thigh_Abductor: () => point('ShinL').x,
  Thigh_Adductor: () => -point('ShinL').x,
};

const problems = [];
function check(condition, message) {
  if (!condition) problems.push(message);
}

function verifyArmClearance(fixture, sample, duration, lever) {
  const mounts = fixture.root.children.filter(({ name }) => name === lever || name === 'Grip mount');
  const spaces = mounts.map(() => new Matrix4());
  for (const mount of mounts) mount.geometry.computeBoundingBox();
  const arms = skin.map((mesh) => {
    const { skinIndex, skinWeight } = mesh.geometry.attributes;
    const indices = [];
    for (let i = 0; i < skinIndex.count; i++) {
      let dominant = 0;
      for (let j = 1; j < 4; j++) {
        if (skinWeight.getComponent(i, j) > skinWeight.getComponent(i, dominant)) dominant = j;
      }
      const joint = mesh.skeleton.bones[skinIndex.getComponent(i, dominant)].name;
      if (/^(Arm|Forearm|Hand|Thumb|Index|Middle|Ring|Little)[1-3]?[LR]$/.test(joint)) indices.push(i);
    }
    return { mesh, indices };
  });
  const world = new Vector3();
  const local = new Vector3();
  const frames = Math.ceil(duration * 120);
  for (let frame = 0; frame <= frames; frame++) {
    const time = frame * duration / frames;
    sample(time);
    mounts.forEach((mount, i) => spaces[i].copy(mount.matrixWorld).invert());
    for (const { mesh, indices } of arms) {
      for (const index of indices) {
        mesh.getVertexPosition(index, world).applyMatrix4(mesh.matrixWorld);
        for (let i = 0; i < mounts.length; i++) {
          const mount = mounts[i];
          local.copy(world).applyMatrix4(spaces[i]);
          if (mount.geometry.boundingBox.containsPoint(local)) {
            assert.fail(`${fixture.root.name}: arm intersects ${mount.name} at ${time.toFixed(3)} s`);
          }
        }
      }
    }
  }
}

for (const [id, entry] of Object.entries(entries)) {
  const key = id.split(':').at(-1);
  assert.equal(entry.name, machines.get(id), id);
  assert.ok(entry.primary.length && [...entry.primary, ...entry.supporting].every((name) => atlas.has(name)), id);
  assert.ok(entry.clip.validate(), id);
  assert.ok(entry.machineStrengthFixture, id);
  assert.equal(entry.phases[0][0], 0, id);
  assert.ok(entry.phases.every(([at], index, phases) =>
    at < entry.clip.duration && (!index || at > phases[index - 1][0])), id);
  assert.equal(entry.cues.length, 3, id);

  const hash = createHash('sha256');
  for (const track of entry.clip.tracks) {
    for (const time of [0, .53, 1.4, 2.36, entry.clip.duration]) {
      const values = track.createInterpolant().evaluate(time);
      assert.ok(values.every(Number.isFinite), id + ' ' + track.name);
      if (track.getValueSize() === 4) assert.ok(Math.abs(Math.hypot(...values) - 1) < .001, id);
      hash.update(Array.from(values, (value) => Math.round(value * 1000)).join(',') + '|');
    }
    const size = track.getValueSize();
    const start = track.values.slice(0, size);
    const finish = track.values.slice(-size);
    const closure = size === 4 ? 1 - Math.abs(start.reduce((dot, value, i) => dot + value * finish[i], 0))
      : Math.hypot(...start.map((value, i) => value - finish[i]));
    assert.ok(closure < .001, id + ' ' + track.name + ' loop closure');
  }
  const signature = hash.digest('hex');
  assert.ok(!signatures.has(signature), id + ' repeats an existing clip');
  signatures.add(signature);

  const fixture = createMachineStrengthFixture(entry, asset.scene);
  const action = mixer.clipAction(entry.clip).setLoop(LoopOnce, 1).play();
  action.paused = true;
  function sample(t) {
    action.time = t;
    mixer.update(0);
    asset.scene.updateMatrixWorld(true);
    fixture.update();
    fixture.root.updateMatrixWorld(true);
  }
  sample(0);
  const initial = checks[key]();
  const initialOffSide = kneeAngle('L');
  const starts = fixture.root.children.map((part) => [part.position.clone(), part.scale.y]);
  sample(1.4);
  const delta = checks[key]() - initial;
  check(delta > (key === 'Leverage_Shrug' ? .048 : .050), key + ' working movement ' + delta.toFixed(3));
  if (key === 'Single-Leg_Leg_Extension' || key === 'Standing_Leg_Curl') {
    assert.ok(Math.abs(kneeAngle('L') - initialOffSide) < .002, id + ' nonworking leg');
  }

  let apparatusTravel = 0;
  if (key === 'Calf_Press' || key === 'Calf_Press_On_The_Leg_Press_Machine') {
    assert.ok(Math.abs(kneeAngle('L') - initialOffSide) < .15, id + ' stable knee during calf press');
    assert.ok(delta > .45, id + ' ankle range');
  }

  let figureFloor = Infinity;
  let fixtureFloor = Infinity;
  for (let i = 0; i <= 18; i++) {
    sample(entry.clip.duration * i / 18);
    const figure = new Box3();
    for (const mesh of skin) figure.expandByObject(mesh, true);
    figureFloor = Math.min(figureFloor, figure.min.y);
    const frame = new Box3().setFromObject(fixture.root);
    fixtureFloor = Math.min(fixtureFloor, frame.min.y);
    assert.ok(!frame.isEmpty() && frame.max.y < 2.25, id + ' fixture extent');
    fixture.root.children.forEach((object, index) => {
      assert.ok(object.matrixWorld.elements.every(Number.isFinite), id + ' ' + object.name);
      assert.ok(object.scale.y > .003, id + ' collapsed ' + object.name);
      const [start, length] = starts[index];
      apparatusTravel = Math.max(apparatusTravel, object.position.distanceTo(start));
      if (['Press lever', 'Independent row lever', 'T-bar lever'].includes(object.name) ||
          (key === 'Butterfly' && object.name === 'Fly lever')) {
        check(Math.abs(object.scale.y - length) < .004, key + ' rigid lever at sample ' + i);
      }
      if (key === 'Lying_T-Bar_Row' && object.name === 'Leverage plates' && i === 7) {
        check(object.position.distanceTo(start) > .12, key + ' plates follow the lever');
      }
      const side = object.name.match(/^Hand grip ([LR])$/)?.[1];
      if (side) {
        const sign = side === 'L' ? 1 : -1;
        const grip = dumbbellGripTransform(sign);
        const hand = joint('Hand' + side);
        const center = hand.localToWorld(grip.position);
        assert.ok(object.position.distanceTo(center) < .0001, id + ' grip contact');
        if (key === 'Butterfly') {
          const elbow = point('Forearm' + side);
          const wristDirection = point(hand.name).sub(elbow);
          const palmDirection = handAlong(sign).applyQuaternion(hand.getWorldQuaternion(hand.quaternion.clone()));
          assert.ok(wristDirection.angleTo(palmDirection) < .18, id + ' wrist alignment');
          assert.ok(Math.abs(elbow.y - point('Arm' + side).y) < .01, id + ' level upper arm');
          assert.ok(object.position.x * sign > .035, id + ' handles stay apart');
        }
        if (key === 'Reverse_Hyperextension') {
          assert.ok(hand.position.angleTo(handAlong(sign).applyQuaternion(hand.quaternion)) < 1,
            id + ' wrist stays in line with the support grip');
        }
      }
    });
  }
  check(apparatusTravel > .035, key + ' machine movement');
  check(figureFloor > -.018, key + ' figure floor ' + figureFloor.toFixed(3));
  check(fixtureFloor > -.015, key + ' fixture floor ' + fixtureFloor.toFixed(3));
  if (key === 'Ab_Crunch_Machine' || key === 'Butterfly') {
    verifyArmClearance(fixture, sample, entry.clip.duration, key === 'Butterfly' ? 'Fly lever' : 'Crunch lever');
  }
  action.stop();
}
assert.deepEqual(problems, []);
console.log(signatures.size + ' machine strength clips passed pose and fixture checks.');
