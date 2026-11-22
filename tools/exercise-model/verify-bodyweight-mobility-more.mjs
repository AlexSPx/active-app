import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createEntries, groupLabel } from './bodyweight-mobility-more.mjs';
import { createExerciseGroups } from './clips.mjs';
import { createFlatBench } from './flat-bench.mjs';
import { handDorsal, measurePalmContacts } from './hand-frame.mjs';

const read = (path) => readFile(new URL(path, import.meta.url));
const [bytes, rows] = await Promise.all([read('./anatomy.glb'), read('../../apps/client/lib/data/exercise-catalog.json')]);
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .parseAsync(Uint8Array.from(bytes).buffer, '');
const catalog = new Map(JSON.parse(rows).map((row) => [row.id, row]));
const { scene } = asset;
const joints = new Map();
const muscles = new Set();
const meshes = [];
const slots = ['getX', 'getY', 'getZ', 'getW'];
scene.updateMatrixWorld(true);
scene.traverse((node) => {
  if (node.isBone) joints.set(node.name, node);
  if (!node.isSkinnedMesh) return;
  muscles.add(node.material.name);
  const { position, skinIndex, skinWeight } = node.geometry.attributes;
  const names = Array.from({ length: position.count }, (_, i) => {
    const dominant = slots.reduce((a, b) => skinWeight[b](i) > skinWeight[a](i) ? b : a);
    return node.skeleton.bones[skinIndex[dominant](i)].name;
  });
  meshes.push({ node, names });
});

const rest = () => [...joints.values()].map(({ position, quaternion }) => [...position, ...quaternion]);
const original = rest();
const entries = createEntries(asset);
assert.equal(typeof groupLabel, 'string');
assert.deepEqual(rest(), original, 'Building the family changed the source rig');
const registered = createExerciseGroups(asset)
  .filter(([label]) => label !== groupLabel).flatMap(([, group]) => Object.keys(group));
const mixer = new THREE.AnimationMixer(scene);
const palms = measurePalmContacts(scene);
const point = (joint) => joints.get(joint).getWorldPosition(new THREE.Vector3());
const axis = (joint, direction) => direction.applyQuaternion(joints.get(joint).getWorldQuaternion(new THREE.Quaternion()));
const kneeAngle = (side) => {
  const knee = point('Shin' + side);
  return point('Thigh' + side).sub(knee).angleTo(point('Foot' + side).sub(knee));
};
const elbowAngle = (side) => {
  const elbow = point('Forearm' + side);
  return point('Arm' + side).sub(elbow).angleTo(point('Hand' + side).sub(elbow));
};
const vertex = new THREE.Vector3();

let id;
let action;
let bench;
let low;
let skinPoints;
let padPenetration;
function sample(time) {
  action.paused = false;
  action.enabled = true;
  mixer.setTime(time);
  scene.updateMatrixWorld(true);
}
function skin() {
  low = {};
  skinPoints = {};
  padPenetration = undefined;
  for (const { node, names } of meshes) {
    names.forEach((name, i) => {
      node.getVertexPosition(i, vertex).applyMatrix4(node.matrixWorld);
      low[name] = Math.min(low[name] ?? Infinity, vertex.y);
      if (bench && overPad(vertex) && vertex.y < bench.max.y - .024 && vertex.y > bench.min.y + .006) {
        padPenetration ??= name;
      }
      if (/^(Pelvis|Foot[LR]|Hand[LR]|(?:Thumb|Index)[123][LR])$/.test(name)) {
        (skinPoints[name] ??= []).push(vertex.clone());
      }
    });
  }
}
const near = (value, expected, tolerance, label) =>
  assert.ok(Math.abs(value - expected) <= tolerance, `${id} ${label}: ${value.toFixed(4)} vs ${expected}`);
const more = (value, minimum, label) =>
  assert.ok(value >= minimum, `${id} ${label}: ${value.toFixed(4)} < ${minimum}`);
const onFloor = (joint, tolerance = .020) => near(low[joint], 0, tolerance, joint + ' floor contact');
const handFloor = (side) => {
  const { heel, knuckles } = palms(side);
  near(heel, 0, .018, side + ' palm heel');
  near(knuckles, 0, .018, side + ' knuckles');
};
const touch = (joint, position, tolerance) =>
  near(Math.min(...skinPoints[joint].map((p) => p.distanceTo(position))), 0, tolerance, joint + ' contact gap');

function overPad(position) {
  return position.x > bench.min.x + .006 && position.x < bench.max.x - .006
    && position.z > bench.min.z + .006 && position.z < bench.max.z - .006;
}
function padContact(joint, tolerance = .017) {
  const points = skinPoints[joint].filter(overPad);
  assert.ok(points.length, id + ' ' + joint + ' outside pad');
  near(Math.min(...points.map((p) => p.y)), bench.max.y, tolerance, joint + ' pad contact');
}

const checks = {
  Ankle_On_The_Knee() {
    onFloor('FootL');
    onFloor('FootR');
    sample(.65);
    const bottom = point('ShinR');
    near(point('FootL').distanceTo(bottom), 0, .10, 'ankle across knee');
    sample(1.65);
    skin();
    onFloor('Head');
    onFloor('Chest');
    more(bottom.z - point('ShinR').z, .35, 'draw supporting knee in');
    more(low.FootR, .24, 'raise supporting foot');
    near(point('FootL').distanceTo(point('ShinR')), 0, .10, 'retain figure four');
  },
  Groin_and_Back_Stretch() {
    const height = point('Head').y;
    sample(1.2);
    skin();
    onFloor('FootL');
    onFloor('FootR');
    more(height - point('Head').y, .32, 'curl forward');
    more(point('ShinL').x - point('ForearmL').x, .15, 'elbow inside leg');
  },
  Iron_Crosses_stretch() {
    more(axis('Chest', new THREE.Vector3(0, 0, 1)).dot(new THREE.Vector3(0, -1, 0)), .98, 'face floor');
    for (const [side, sign, time] of [['R', -1, .86], ['L', 1, 2.50]]) {
      sample(time);
      skin();
      handFloor('L');
      handFloor('R');
      more(-sign * point('Foot' + side).x, .25, 'foot crosses behind');
      more(2.1 - kneeAngle(side), .2, 'flex sweeping knee');
    }
  },
  Knee_Across_The_Body() {
    const knee = point('ShinL');
    sample(1.2);
    skin();
    handFloor('L');
    onFloor('FootR');
    more(knee.x - point('ShinL').x, .35, 'knee crosses torso');
    more(knee.y - point('ShinL').y, .08, 'lower knee');
    touch('HandR', point('ShinL'), .087);
  },
  Looking_At_Ceiling() {
    const start = point('Pelvis');
    sample(1.2);
    skin();
    more(point('Pelvis').y - start.y, .11, 'lift pelvis');
    more(point('Pelvis').z - start.z, .20, 'advance pelvis');
    more(axis('Head', new THREE.Vector3(0, 0, 1)).y, .95, 'look up');
    for (const side of ['L', 'R']) {
      onFloor('Shin' + side, .039);
      onFloor('Foot' + side);
      touch('Hand' + side, point('Foot' + side), .092);
    }
  },
  One_Knee_To_Chest() {
    const start = point('ShinL').distanceTo(point('Chest'));
    sample(1.2);
    skin();
    onFloor('Chest');
    onFloor('Head');
    onFloor('FootR');
    more(start - point('ShinL').distanceTo(point('Chest')), .26, 'draw knee to chest');
    more(kneeAngle('R'), 2.75, 'keep other leg long');
  },
  Overhead_Stretch() {
    const start = point('HandL').y;
    sample(1.2);
    more(point('HandL').y - start, .35, 'reach upward');
    near(point('HandL').distanceTo(point('HandR')), .17, .045, 'clasp spacing');
    more(-axis('HandL', handDorsal()).y, .97, 'palm faces ceiling');
  },
  Runners_Stretch() {
    const hip = point('Pelvis').y;
    const angle = kneeAngle('L');
    for (const time of [0, .3, .6, .9, 1.2]) {
      sample(time);
      skin();
      onFloor('FootL');
      onFloor('FootR');
      handFloor('L');
      handFloor('R');
    }
    more(point('Pelvis').y - hip, .20, 'raise hips');
    more(kneeAngle('L') - angle, .30, 'lengthen lead leg');
  },
  Seated_Calf_Stretch() {
    const toes = axis('FootL', new THREE.Vector3(0, 0, 1)).y;
    sample(1.2);
    skin();
    handFloor('R');
    onFloor('FootR');
    onFloor('FootL');
    more(axis('FootL', new THREE.Vector3(0, 0, 1)).y - toes, .30, 'dorsiflex long leg');
    more(kneeAngle('L'), 2.75, 'keep stretch leg long');
  },
  Seated_Overhead_Stretch() {
    const head = point('Head').x;
    const elbow = point('ForearmL').y;
    sample(1.2);
    skin();
    handFloor('R');
    more(head - point('Head').x, .11, 'incline away');
    more(point('ForearmL').y - elbow, .045, 'raise elbow');
  },
  Shoulder_Circles() {
    const path = [0, .59, .90, 1.21, 1.8, 4.19].map((time) => {
      sample(time);
      assert.ok(point('ArmL').y - point('HandL').y > .46, id + ' arms stay down');
      return point('ArmL');
    });
    more(path[2].y - path[0].y, .049, 'shoulder elevation');
    more(path[1].z - path[3].z, .075, 'shoulder travels front to back');
    near(path[0].distanceTo(path[4]), 0, .002, 'circle returns');
    more(path[0].z - path[5].z, .032, 'reverses direction');
  },
  Shoulder_Raise() {
    const shoulder = point('ArmL');
    const head = point('Head');
    sample(1.2);
    more(point('ArmL').y - shoulder.y, .065, 'shrug up');
    near(point('ArmL').z, shoulder.z, .002, 'direct vertical shrug');
    near(point('Head').distanceTo(head), 0, .002, 'head stays still');
    more(elbowAngle('L'), 2.6, 'relaxed arms stay long');
  },
  'Side-Lying_Floor_Stretch'() {
    const wrist = point('HandR');
    sample(1.2);
    skin();
    onFloor('Pelvis', .039);
    onFloor('FootL');
    onFloor('FootR');
    more(point('HandR').z - wrist.z, .10, 'reach overhead');
    more(kneeAngle('R'), 2.65, 'top leg long');
    touch('HandL', point('HandR'), .085);
  },
  Side_Lying_Groin_Stretch() {
    const knee = point('ShinL');
    const shoulder = point('ArmL');
    sample(1.2);
    skin();
    onFloor('Pelvis', .039);
    onFloor('FootR');
    more(knee.distanceTo(shoulder) - point('ShinL').distanceTo(point('ArmL')), .17, 'top knee toward shoulder');
    touch('HandL', point('ShinL'), .085);
  },
  Split_Squats() {
    for (const time of [.47, 1.15, 1.83]) {
      sample(time);
      skin();
      more(Math.min(low.FootL, low.FootR), .09, 'both feet airborne');
    }
    for (const [time, sign] of [[.81, 1], [1.49, -1]]) {
      sample(time);
      skin();
      onFloor('FootL');
      onFloor('FootR');
      more(sign * (point('FootL').z - point('FootR').z), .55, 'switch lead');
      more(.75 - point('Pelvis').y, .043, 'absorb landing with both knees');
    }
  },
  Tricep_Side_Stretch() {
    const elbow = point('ForearmR');
    sample(1.2);
    skin();
    more(point('ForearmR').x - elbow.x, .060, 'pull elbow across body');
    more(point('HandR').x, .095, 'hand reaches opposite shoulder');
    touch('HandL', point('ForearmR'), .080);
  },
  'Upper_Back-Leg_Grab'() {
    const start = point('Chest').z;
    sample(1.2);
    skin();
    onFloor('FootL');
    onFloor('FootR');
    more(point('Chest').z - start, .12, 'chest folds toward knees');
    for (const side of ['L', 'R']) {
      const thigh = point('Thigh' + side).lerp(point('Shin' + side), .82);
      more(thigh.y - point('Hand' + side).y, .04, 'arm wraps beneath thigh');
      more(kneeAngle(side), 2.75, 'legs remain extended');
    }
  },
  Windmills() {
    more(axis('Chest', new THREE.Vector3(0, 0, 1)).y, .98, 'face ceiling');
    for (const [side, other, sign, time] of [['L', 'R', 1, 1], ['R', 'L', -1, 3]]) {
      sample(time);
      skin();
      handFloor('L');
      handFloor('R');
      onFloor('Foot' + other);
      more(-sign * point('Foot' + side).x, .46, 'long leg crosses torso');
      near(point('Foot' + side).distanceTo(point('Hand' + other)), 0, .21, 'foot approaches hand');
      for (const offset of [-.65, -.4, -.2, 0, .2, .4, .65]) {
        sample(time + offset);
        more(kneeAngle(side), 2.87, 'sweeping leg stays long');
      }
    }
  },
  'Decline_Push-Up'() {
    const start = point('Chest').y;
    for (const time of [0, .6, 1.0, 1.45, 2.3, 2.74]) {
      sample(time);
      skin();
      for (const side of ['L', 'R']) {
        handFloor(side);
        padContact('Foot' + side);
      }
      near(point('HandL').distanceTo(point('HandR')), .90, .025, 'wide hands');
    }
    sample(1.45);
    skin();
    more(start - point('Chest').y, .22, 'descend toward floor');
    near(low.Chest, 0, .056, 'chest close to floor');
  },
  'Seated_Flat_Bench_Leg_Pull-In'() {
    const knee = point('ShinL');
    const chest = point('Chest');
    for (const time of [0, .45, .85, 1.13, 2.13, 2.8, 3.53]) {
      sample(time);
      skin();
      padContact('Pelvis', .022);
      for (const side of ['L', 'R']) {
        more(low['Foot' + side], .23, 'foot stays raised');
        const edge = side === 'L' ? bench.max.x : bench.min.x;
        const grip = ['Hand', 'Thumb1', 'Thumb2', 'Thumb3', 'Index1'].flatMap((joint) => skinPoints[joint + side]);
        const gap = Math.min(...grip.filter(({ z }) => Math.abs(z - .34) < .15)
          .map(({ x, y }) => Math.hypot(x - edge, y - THREE.MathUtils.clamp(y, bench.min.y, bench.max.y))));
        near(gap, 0, .022, 'bench grip at side');
      }
    }
    sample(1.13);
    more(point('ShinL').y - knee.y, .29, 'knees rise into tuck');
    more(point('Chest').z - chest.z, .20, 'torso moves toward knees');
    more(1.5 - kneeAngle('L'), .20, 'knee bends');
  },
};

assert.deepEqual(Object.keys(entries), Object.keys(checks).map((key) => 'local:exercise:' + key));
const motionSignatures = new Set();
for (const [key, check] of Object.entries(checks)) {
  id = 'local:exercise:' + key;
  const { clip, name, primary, supporting, phases, cues, framing, equipment, benchTransform } = entries[id];
  assert.ok(!registered.includes(id), id + ' already registered in another group');
  assert.equal(equipment, key === 'Decline_Push-Up' || key === 'Seated_Flat_Bench_Leg_Pull-In' ? 'bench' : undefined);
  assert.equal(name, catalog.get(id).name);
  assert.ok(['standing', 'floor', 'bench'].includes(framing), id + ' supported framing');
  assert.equal(clip.name, name);
  assert.ok(clip.validate() && clip.duration > 1, id + ' valid clip');
  assert.ok(primary.length && [...primary, ...supporting].every((muscle) => muscles.has(muscle)), id + ' muscle groups');
  assert.equal(new Set([...primary, ...supporting]).size, primary.length + supporting.length);
  for (const markers of [phases, cues]) {
    assert.ok(markers.length >= 2 && markers.every(([time, ...labels], i) =>
      Number.isFinite(time) && time >= 0 && time <= clip.duration
      && (!i || time > markers[i - 1][0]) && labels.every((text) => typeof text === 'string' && text.trim())),
    id + ' ordered metadata');
  }
  assert.equal(new Set(clip.tracks.map(({ name }) => name)).size, clip.tracks.length);
  let movement = 0;
  const signature = [];
  for (const track of clip.tracks) {
    const [joint, property] = track.name.split('.');
    assert.ok(joints.has(joint) && ['quaternion', 'position'].includes(property), id + ' bindable ' + track.name);
    assert.ok(track.times.every((time, i) => Number.isFinite(time) && (!i || time > track.times[i - 1])), track.name);
    assert.ok(track.values.every(Number.isFinite), id + ' finite ' + track.name);
    assert.equal(track.times[0], 0);
    const size = track.getValueSize();
    const quaternion = property === 'quaternion';
    const readValue = quaternion
      ? (offset) => new THREE.Quaternion().fromArray(track.values, offset)
      : (offset) => new THREE.Vector3().fromArray(track.values, offset);
    const delta = quaternion ? (a, b) => a.angleTo(b) : (a, b) => a.distanceTo(b);
    const first = readValue(0);
    let previous = first;
    for (let i = 0; i < track.times.length; i++) {
      const value = readValue(size * i);
      if (quaternion) near(value.length(), 1, .00001, track.name + ' normalized rotation');
      movement = Math.max(movement, delta(first, value));
      if (i > 0) {
        near(delta(previous, value), 0, quaternion ? .45 : .12, track.name + ' adjacent key step');
        previous = value;
      }
    }
    near(delta(first, previous), 0, .001, track.name + ' loop closure');
    const interpolant = track.createInterpolant();
    signature.push([track.name, ...[0, .25, .5, .75].map((t) =>
      Array.from(interpolant.evaluate(t * clip.duration), (value) => value.toFixed(4)).join(','))]);
  }
  more(movement, .06, 'meaningful motion');
  motionSignatures.add(JSON.stringify(signature));

  bench = undefined;
  if (equipment) {
    assert.equal(equipment, 'bench');
    assert.equal(framing, 'bench');
    const prop = createFlatBench();
    prop.position.fromArray(benchTransform.position);
    prop.rotation.y = benchTransform.yaw;
    prop.updateMatrixWorld(true);
    bench = new THREE.Box3().setFromObject(prop.getObjectByName('Pad'));
  }
  action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  for (let i = 0; i <= 16; i++) {
    sample(clip.duration * i / 16);
    skin();
    more(Math.min(...Object.values(low)), -.034, 'sampled floor clearance at ' + (clip.duration * i / 16).toFixed(2));
    assert.equal(padPenetration, undefined, id + ' sampled pad penetration');
  }
  sample(0);
  skin();
  check();
  action.stop();
}
assert.equal(motionSignatures.size, 20, 'each animation has distinct tracks');
assert.deepEqual(rest(), original, 'Stopping clips did not restore the rig');
console.log('Verified 20 bodyweight mobility and bench animations.');
