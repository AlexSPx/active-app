import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createEntries } from './barbell-expansion.mjs';
import { createBarbell } from './barbell.mjs';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createFlatBench } from './flat-bench.mjs';
import { createInclineBench } from './incline-bench.mjs';
import { handAlong } from './hand-frame.mjs';
import { createSquatRack } from './squat-rack.mjs';
import { checkBarGrip } from './verify-barbell.mjs';

const read = (path) => readFile(new URL(path, import.meta.url));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
  Uint8Array.from(await read('./anatomy.glb')).buffer, '');
const { scene } = asset;
const catalog = new Map(JSON.parse(await read('../../apps/client/lib/data/exercise-catalog.json'))
  .map((exercise) => [exercise.id, exercise]));
const prefix = 'local:exercise:';
const muscles = {
  abdominals: 'Core', biceps: 'Biceps', calves: 'Calves', chest: 'Chest',
  forearms: 'Forearms', glutes: 'Glutes', hamstrings: 'Hamstrings', lats: 'Upper back',
  'lower back': 'Upper back', 'middle back': 'Upper back', quadriceps: 'Quadriceps',
  shoulders: 'Shoulders', traps: 'Upper back', triceps: 'Triceps',
};
const expected = [
  'Barbell_Ab_Rollout_-_On_Knees', 'Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Hack_Squat',
  'Barbell_Hip_Thrust', 'Barbell_Incline_Bench_Press_-_Medium_Grip', 'Barbell_Side_Split_Squat',
  'Barbell_Walking_Lunge', 'Clean_Pull', 'Drag_Curl', 'Floor_Press', 'Front_Squat_Clean_Grip',
  'Kneeling_Squat', 'One-Arm_Side_Deadlift', 'Overhead_Squat', 'Rack_Pulls', 'Reverse_Grip_Bent-Over_Rows',
  'Seated_Barbell_Twist', 'Seated_Palms-Down_Barbell_Wrist_Curl', 'Standing_Military_Press', 'Zercher_Squats',
];
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
assert.deepEqual(Object.keys(entries).sort(), expected.map((id) => prefix + id).sort());

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const q = () => new THREE.Quaternion();
const xAxis = v(1, 0, 0);
const bone = (name) => scene.getObjectByName(name);
const point = (name) => bone(name).getWorldPosition(v());
const worldRotation = (name) => bone(name).getWorldQuaternion(q());
const bar = createBarbell();
const mixer = new THREE.AnimationMixer(scene);
const propMixer = new THREE.AnimationMixer(bar);
const barAxis = v();
const shaftRadius = .01425;
function distanceToShaft(vertex) {
  const delta = vertex.clone().sub(bar.position);
  return delta.addScaledVector(barAxis, -delta.dot(barAxis)).length();
}
const sides = ['L', 'R'];
const seats = sides.map((side, i) => ({ hand: bone('Hand' + side), ...dumbbellGripTransform(1 - 2 * i) }));
const checkGrip = checkBarGrip(scene);

const skin = new Map();
scene.traverse((object) => {
  if (!object.isSkinnedMesh) return;
  const { skinIndex, skinWeight } = object.geometry.attributes;
  for (let index = 0; index < skinIndex.count; index++) {
    let dominant = 0;
    for (let slot = 1; slot < 4; slot++) {
      if (skinWeight.getComponent(index, slot) > skinWeight.getComponent(index, dominant)) dominant = slot;
    }
    const name = object.skeleton.bones[skinIndex.getComponent(index, dominant)].name;
    if (!skin.has(name)) skin.set(name, []);
    skin.get(name).push([object, index]);
  }
});

function surface(names, value) {
  let min = Infinity;
  const vertex = v();
  for (const name of names) {
    for (const [mesh, index] of skin.get(name)) {
      mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
      min = Math.min(min, value(vertex));
    }
  }
  return min;
}

function near(actual, target, tolerance, label) {
  assert.ok(Math.abs(actual - target) < tolerance, label + ': ' + actual);
}

function angle(first, middle, last) {
  const pivot = point(middle);
  return point(first).sub(pivot).angleTo(point(last).sub(pivot));
}

function elbowAngle(side) {
  return angle('Arm' + side, 'Forearm' + side, 'Hand' + side);
}

function kneeAngle(side) {
  return angle('Thigh' + side, 'Shin' + side, 'Foot' + side);
}

function play(mixer, clip) {
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  return action.play();
}

function contacts(id, entry, sample) {
  const at = (time) => sample(time, () => ({
    bar: bar.position.clone(),
    axis: barAxis.clone(),
    rotation: bar.quaternion.clone(),
    pelvis: point('Pelvis'),
    head: worldRotation('Head'),
    chest: worldRotation('Chest'),
    elbow: point('ForearmL'),
    elbowAngle: elbowAngle('L'),
    kneeAngles: sides.map(kneeAngle),
    wrist: point('HandL'),
    foot: point('FootL'),
  }));
  const start = at(0);
  const extreme = at(entry.phases[2][0]);
  switch (id) {
    case 'Barbell_Ab_Rollout_-_On_Knees': {
      assert.ok(extreme.bar.z - start.bar.z > .70 && extreme.pelvis.y < start.pelvis.y - .23, id);
      const phase = v(0, 1, 0).applyQuaternion(extreme.rotation.clone().multiply(start.rotation.clone().invert()));
      near(phase.y, Math.cos((extreme.bar.z - start.bar.z) / .225), .001, 'rollout plate turn cosine');
      near(phase.z, Math.sin((extreme.bar.z - start.bar.z) / .225), .001, 'rollout plate turn sine');
      sample(1.63, () => assert.ok(surface(['Chest', 'Pelvis'], (p) => p.y) > .06));
      break;
    }
    case 'Barbell_Bench_Press_-_Medium_Grip':
    case 'Barbell_Incline_Bench_Press_-_Medium_Grip':
    case 'Floor_Press': {
      assert.ok(start.bar.y > extreme.bar.y + .32 && start.elbowAngle > 2.90, id);
      sample(1.95, () => {
        if (id === 'Floor_Press') near(surface(['ArmL', 'ArmR'], (p) => p.y), 0, .012, 'floor press upper-arm contact');
        else near(surface(['Chest'], distanceToShaft), shaftRadius, .011, id + ' chest touch');
      });
      break;
    }
    case 'Barbell_Hack_Squat':
      assert.ok(extreme.bar.y < start.bar.y - .30 && extreme.bar.z < -.26 && extreme.elbowAngle > 2.90, id);
      assert.ok(extreme.kneeAngles[0] < 1.85, id);
      break;
    case 'Barbell_Hip_Thrust':
      assert.ok(extreme.pelvis.y > start.pelvis.y + .24 && extreme.foot.distanceTo(start.foot) < .0001, id);
      for (const time of [0, .75, 1.33]) sample(time, () => {
        near(surface(['Pelvis'], distanceToShaft), shaftRadius, .017, 'thrust hip contact');
        const front = entry.benchTransform.position[2] + .594;
        near(surface(['Chest'], (p) => Math.abs(p.x) < .134 && p.z < front ? p.y : Infinity),
          .430, .046, 'thrust upper-back support');
      });
      break;
    case 'Barbell_Side_Split_Squat':
      assert.ok(extreme.pelvis.x > .23 && extreme.kneeAngles[1] - extreme.kneeAngles[0] > .60, id);
      break;
    case 'Barbell_Walking_Lunge': {
      const finish = at(entry.clip.duration);
      assert.ok(entry.oneShot && finish.pelvis.z - start.pelvis.z > 1.10, id);
      for (const [time, side] of [[1.07, 'R'], [2.68, 'L']]) sample(time, () => {
        assert.ok(point('Shin' + side).y < .19, id + ' rear knee');
      });
      break;
    }
    case 'Clean_Pull': {
      const mid = at(1.48);
      const tall = at(1.67);
      near(start.bar.y, .225, .001, id + ' floor start');
      assert.ok(extreme.bar.y > .45 && tall.bar.y - mid.bar.y > .20 && tall.elbowAngle > 2.90, id);
      assert.ok(tall.foot.y - mid.foot.y > .065 && tall.kneeAngles[0] > mid.kneeAngles[0], id);
      assert.ok(start.chest.angleTo(extreme.chest) < .10, 'first-pull back angle');
      break;
    }
    case 'Drag_Curl':
      assert.ok(extreme.bar.y - start.bar.y > .40 && extreme.elbow.z < start.elbow.z - .055, id);
      assert.ok(Math.abs(extreme.bar.z - start.bar.z) < .08 && extreme.chest.angleTo(start.chest) < .001, id);
      break;
    case 'Front_Squat_Clean_Grip':
      assert.ok(extreme.pelvis.y < start.pelvis.y - .43, id);
      for (const time of [0, .91, 1.75, 2.67]) sample(time, () => {
        for (const side of sides) {
          const fingerPads = ['Index', 'Middle', 'Ring'].map((digit) => digit + '3' + side);
          const contacts = fingerPads.map((digit) => surface([digit], distanceToShaft));
          assert.ok(contacts.every((distance) => Math.abs(distance - shaftRadius) < .007), id + ' fingertips over the shaft');
          const along = handAlong(side === 'L' ? 1 : -1).applyQuaternion(worldRotation('Hand' + side));
          const distal = point('Hand' + side).sub(point('Forearm' + side));
          assert.ok(along.angleTo(distal) < 1.78, id + ' clean grip wrist extension');
          assert.ok(surface(['Hand' + side, 'Thumb3' + side], distanceToShaft) > .022, id + ' unloaded palm');
          assert.ok(point('Forearm' + side).y > point('Arm' + side).y + .03, id + ' high elbows');
        }
        near(surface(['ArmL', 'ArmR', 'Chest'], distanceToShaft), shaftRadius, .012, id + ' shoulder rack');
      });
      break;
    case 'Kneeling_Squat':
      assert.ok(extreme.pelvis.y < start.pelvis.y - .29 && extreme.pelvis.z < start.pelvis.z - .35, id);
      assert.ok(extreme.foot.distanceTo(start.foot) < .004, id);
      break;
    case 'One-Arm_Side_Deadlift':
      near(start.bar.y, .225, .001, id + ' floor start');
      assert.ok(start.bar.x > .29 && Math.abs(start.axis.z) > .999 && extreme.elbowAngle > 2.90, id);
      assert.ok(extreme.bar.y > .74, id);
      break;
    case 'Overhead_Squat':
      assert.ok(extreme.bar.y < start.bar.y - .39 && extreme.elbowAngle > 2.90, id);
      assert.ok(extreme.kneeAngles[0] < 1.90 && Math.abs(extreme.bar.z - start.bar.z) < .001, id);
      break;
    case 'Rack_Pulls': {
      const { hookHeight, position, yaw } = entry.rackTransform;
      // Measure the existing fixture's local hook seat at a supported factory height.
      const fixture = createSquatRack({ hookHeight: 1 });
      const loadedBar = fixture.getObjectByName('Barbell').position.clone();
      const hooks = fixture.children.filter((child) => child.name === 'Hook bed');
      for (const hook of hooks) near(loadedBar.y - hook.position.y - .010, shaftRadius, .0001, 'shaft above rack bed');
      loadedBar.y = hookHeight;
      const pinSeat = loadedBar.applyAxisAngle(v(0, 1, 0), yaw).add(v(...position));
      assert.ok(start.bar.distanceTo(pinSeat) < .0001 && extreme.bar.y - start.bar.y > .28, id);
      sample(0, () => assert.ok(Math.abs(start.bar.y - point('ShinL').y) < .085 && start.bar.y > .40, id + ' knee height'));
      break;
    }
    case 'Reverse_Grip_Bent-Over_Rows':
      assert.ok(extreme.bar.y > start.bar.y + .33 && extreme.elbow.z < start.elbow.z - .16, id);
      assert.ok(extreme.chest.angleTo(start.chest) < .001 && start.elbowAngle > 2.90, id);
      break;
    case 'Seated_Barbell_Twist': {
      const right = at(2.44);
      assert.ok(extreme.axis.z * right.axis.z < -.20 && extreme.head.angleTo(start.head) < .001, id);
      assert.ok(right.pelvis.distanceTo(start.pelvis) < .001 && right.foot.distanceTo(start.foot) < .001, id);
      break;
    }
    case 'Seated_Palms-Down_Barbell_Wrist_Curl':
      assert.ok(extreme.bar.y > start.bar.y + .08 && extreme.wrist.distanceTo(start.wrist) < .0001, id);
      assert.ok(extreme.elbow.distanceTo(start.elbow) < .0001, id);
      sample(0, () => {
        const thigh = point('ThighL');
        const knee = point('ShinL');
        const along = extreme.elbow.clone().sub(thigh).dot(knee.clone().sub(thigh).normalize());
        assert.ok(along > .18 && along < .39 && extreme.wrist.z > knee.z, id + ' forearm over thigh');
        const contactZone = (p) => p.x > .15 && p.x < .265 && Math.abs(p.z - .78) < .022;
        const forearm = surface(['ForearmL'], (p) => contactZone(p) ? p.y : Infinity);
        const thighTop = -surface(['ThighL'], (p) => contactZone(p) ? -p.y : Infinity);
        near(forearm, thighTop, .018, id + ' forearm contact');
      });
      break;
    case 'Standing_Military_Press':
      assert.ok(start.bar.y - extreme.bar.y > .55 && start.elbowAngle > 2.90, id);
      assert.ok(extreme.pelvis.distanceTo(start.pelvis) < .001 && at(1.15).bar.z > extreme.bar.z + .12, id);
      sample(1.95, () => near(surface(['Chest'], distanceToShaft), shaftRadius, .010, id + ' collarbone touch'));
      break;
    case 'Zercher_Squats':
      assert.ok(extreme.pelvis.y < start.pelvis.y - .39 && extreme.kneeAngles[0] < 1.70, id);
      for (const time of [0, .91, 1.75, 2.67]) sample(time, () => {
        for (const side of sides) {
          near(surface(['Forearm' + side], distanceToShaft), shaftRadius, .007, id + ' elbow cradle surface');
          assert.ok(distanceToShaft(point('Forearm' + side)) < .084 && point('Hand' + side).y > bar.position.y + .13, id);
          assert.ok(surface(['Hand' + side], distanceToShaft) > .12 && elbowAngle(side) < .80, id);
        }
        assert.ok(point('HandL').distanceTo(point('HandR')) < .18, id + ' hands together');
      });
      break;
  }
}

for (const [key, entry] of Object.entries(entries)) {
  const id = key.slice(prefix.length);
  const source = catalog.get(key);
  assert.equal(entry.name, source.name);
  assert.equal(source.equipment, 'BARBELL');
  assert.deepEqual(entry.primary, [...new Set(source.primaryMuscles.map((muscle) => muscles[muscle]))]);
  assert.deepEqual([...entry.supporting].sort(),
    [...new Set(source.secondaryMuscles.map((muscle) => muscles[muscle]))]
      .filter((muscle) => !entry.primary.includes(muscle)).sort(), id);
  const equipment = ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Hip_Thrust',
    'Seated_Barbell_Twist', 'Seated_Palms-Down_Barbell_Wrist_Curl'].includes(id) ? 'bench-barbell'
    : id === 'Barbell_Incline_Bench_Press_-_Medium_Grip' ? 'incline-bench-barbell'
      : id === 'Rack_Pulls' ? 'rack-barbell' : 'barbell';
  assert.equal(entry.equipment, equipment, id);
  assert.equal(Boolean(entry.oneShot), id === 'Barbell_Walking_Lunge', id);
  assert.equal(entry.propClip.duration, entry.clip.duration, id);
  assert.ok(entry.phases.length >= 5 && entry.cues.length >= 3, id);
  for (const markers of [entry.phases, entry.cues]) {
    markers.forEach(([time, ...labels], i) => {
      assert.ok(time >= 0 && time <= entry.clip.duration && (!i || time > markers[i - 1][0]), id);
      assert.ok(labels.every((label) => label.trim()), id);
    });
  }
  for (const clip of [entry.clip, entry.propClip]) {
    const bindings = new Set();
    for (const track of clip.tracks) {
      assert.ok(track.validate() && track.values.every(Number.isFinite), id + ' ' + track.name);
      assert.ok(!bindings.has(track.name), id + ' duplicate track ' + track.name);
      bindings.add(track.name);
      for (let i = 1; i < track.times.length; i++) assert.ok(track.times[i] > track.times[i - 1], id);
      if (track.ValueTypeName === 'quaternion') {
        for (let i = 0; i < track.values.length; i += 4) {
          near(q().fromArray(track.values, i).length(), 1, .0001, id + ' normalized quaternion');
        }
      }
      if (!entry.oneShot) {
        const size = track.getValueSize();
        for (let i = 0; i < size; i++) near(track.values[i],
          track.values[track.values.length - size + i], .0001, id + ' loop closure');
      }
    }
  }
  const action = play(mixer, entry.clip);
  const propAction = play(propMixer, entry.propClip);
  function sample(time, check) {
    action.paused = false;
    propAction.paused = false;
    mixer.setTime(time);
    propMixer.setTime(time);
    scene.updateMatrixWorld(true);
    bar.updateMatrixWorld(true);
    barAxis.copy(xAxis).applyQuaternion(bar.quaternion);
    return check();
  }
  const gripSeats = id === 'One-Arm_Side_Deadlift' ? seats.slice(0, 1)
    : ['Front_Squat_Clean_Grip', 'Zercher_Squats'].includes(id) ? [] : seats;
  const firstBar = sample(0, () => bar.position.clone());
  const firstAxis = barAxis.clone();
  let motion = 0;
  const times = new Set([...Array.from({ length: Math.ceil(entry.clip.duration * 20) + 1 },
    (_, i) => Math.min(i / 20, entry.clip.duration)), ...entry.phases.map(([time]) => time)]);
  for (const time of times) sample(time, () => {
    const label = id + ' at ' + time.toFixed(2);
    motion = Math.max(motion, bar.position.distanceTo(firstBar) + .72 * barAxis.distanceTo(firstAxis));
    const tilt = Math.abs(barAxis.y);
    assert.ok(bar.position.y - .745 * tilt - .225 * Math.sqrt(1 - tilt ** 2) >= -.001, label + ' plate clearance');
    for (const { hand, position, quaternion } of gripSeats) {
      near(distanceToShaft(hand.localToWorld(position.clone())), 0, .001, label + ' shaft seat');
      const axis = xAxis.clone().applyQuaternion(quaternion).applyQuaternion(worldRotation(hand.name));
      near(Math.abs(axis.dot(barAxis)), 1, .0001, label + ' shaft alignment');
      if (['Barbell_Side_Split_Squat', 'Barbell_Walking_Lunge', 'Kneeling_Squat', 'Seated_Barbell_Twist'].includes(id)) {
        const side = hand.name.at(-1);
        const along = handAlong(side === 'L' ? 1 : -1).applyQuaternion(worldRotation(hand.name));
        const distal = point(hand.name).sub(point('Forearm' + side));
        assert.ok(along.angleTo(distal) < 1.14, label + ' back-rack wrist bend');
      }
    }
    for (const side of sides) {
      const foot = surface(['Foot' + side], (p) => p.y);
      assert.ok(foot > -.010, label + ' foot floor clearance ' + foot);
      if (id !== 'Barbell_Walking_Lunge') assert.ok(foot < .014, label + ' grounded foot');
    }
    if (id === 'Barbell_Ab_Rollout_-_On_Knees' || id === 'Kneeling_Squat') {
      for (const side of sides) {
        near(surface(['Shin' + side], (p) => p.y), 0, .012, label + ' knee/shin floor contact');
        assert.ok(point('Shin' + side).z - point('Foot' + side).z > .36, label + ' shins behind knees');
      }
    }
  });
  assert.ok(motion > .075, id + ' prop motion');
  for (const [time] of entry.phases) sample(time, () => {
    if (gripSeats.length) checkGrip(gripSeats, id, (p) => distanceToShaft(p) - shaftRadius);
  });
  contacts(id, entry, sample);

  if (entry.equipment === 'bench-barbell' || entry.equipment === 'incline-bench-barbell') {
    const incline = entry.equipment.startsWith('incline-');
    const fixture = incline ? createInclineBench(entry.benchTransform) : createFlatBench();
    fixture.position.fromArray(entry.benchTransform?.position ?? [0, 0, 0]);
    fixture.rotation.y = entry.benchTransform?.yaw ?? 0;
    fixture.updateMatrixWorld(true);
    const pad = fixture.getObjectByName(incline ? 'Backrest pad' : 'Pad');
    const origin = pad.localToWorld(v());
    const normal = v(0, 1, 0);
    if (incline) {
      const angle = entry.benchTransform.angle;
      normal.set(0, Math.cos(angle), -Math.sin(angle));
      origin.addScaledVector(normal, .032);
    } else {
      origin.y = .430;
    }
    if (id !== 'Barbell_Hip_Thrust') sample(0, () => {
      const groups = [id.startsWith('Seated_') ? 'Pelvis' : 'Chest'];
      near(surface(groups, (p) => p.clone().sub(origin).dot(normal)), 0, .026, id + ' pad support');
    });
  }
  action.stop();
  propAction.stop();
}

console.log('Verified 20 barbell expansion clips on anatomy.glb');
