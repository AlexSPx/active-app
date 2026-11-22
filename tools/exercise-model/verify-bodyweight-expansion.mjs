import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createEntries } from './bodyweight-expansion.mjs';
import { handAlong, measurePalmContacts } from './hand-frame.mjs';
import { createFlatBench } from './flat-bench.mjs';
import { createPullUpBar } from './pull-up-bar.mjs';

const bytes = await readFile(new URL('./anatomy.glb', import.meta.url));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .parseAsync(Uint8Array.from(bytes).buffer, '');
const catalog = new Map(JSON.parse(await readFile(new URL(
  '../../apps/client/lib/data/exercise-catalog.json', import.meta.url,
))).map((entry) => [entry.id, entry]));
const { scene } = asset;
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const bone = (name) => scene.getObjectByName(name);
const point = (name) => bone(name).getWorldPosition(v());
const rotation = (name) => bone(name).getWorldQuaternion(new THREE.Quaternion());
const axis = (name, x, y, z) => v(x, y, z).applyQuaternion(rotation(name));
const meshes = [];
const bones = [];
const materials = new Set();
const slots = ['getX', 'getY', 'getZ', 'getW'];
scene.updateMatrixWorld(true);
scene.traverse((mesh) => {
  if (mesh.isBone) bones.push(mesh);
  if (!mesh.isSkinnedMesh) return;
  materials.add(mesh.material.name);
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  const names = Array.from({ length: position.count }, (_, i) => {
    const slot = slots.reduce((best, next) => skinWeight[next](i) > skinWeight[best](i) ? next : best);
    return mesh.skeleton.bones[skinIndex[slot](i)].name;
  });
  meshes.push({ mesh, names });
});

const rest = () => bones.map((joint) => [...joint.position, ...joint.quaternion]);
const original = rest();
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
assert.deepEqual(rest(), original, 'Building clips changed the source rig');

const mixer = new THREE.AnimationMixer(scene);
const palm = measurePalmContacts(scene);
const vertex = v();
let low;
let pad;
let padPenetration;
let nearest;
let sample;
let label;
const bounds = (name) => new THREE.Box3().setFromObject(name);
const pullUpBar = createPullUpBar();
const shaft = bounds(pullUpBar.getObjectByName('Shaft'));
const upright = bounds(pullUpBar.children.filter((child) => child.name === 'Upright').at(-1));
const near = (value, target, tolerance, context) =>
  assert.ok(Math.abs(value - target) < tolerance, `${label} ${context}: ${value.toFixed(4)} vs ${target.toFixed(4)}`);
const requireMotion = (value, minimum, context) =>
  assert.ok(value > minimum, `${label} ${context}: ${value.toFixed(4)} must exceed ${minimum}`);
const sole = (side, height = 0) => near(low['Foot' + side], height, .013, side + ' sole contact');
const onFloor = (joint, tolerance = .035) => near(low[joint], 0, tolerance, joint + ' floor contact');
function onPalm(side, height = 0) {
  const { heel, knuckles } = palm(side);
  near(heel, height, .014, side + ' palm heel');
  near(knuckles, height, .014, side + ' knuckles');
}

function through(start, end, test) {
  for (let i = 0; i <= 8; i++) {
    sample(THREE.MathUtils.lerp(start, end, i / 8));
    test();
  }
}

function skin(retainVertices) {
  low = {};
  nearest = {};
  padPenetration = undefined;
  for (const { mesh, names } of meshes) {
    names.forEach((name, i) => {
      mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
      if (retainVertices) (nearest[name] ??= []).push(vertex.clone());
      if (pad && vertex.x > pad.min.x + .014 && vertex.x < pad.max.x - .014
        && vertex.z > pad.min.z + .014 && vertex.z < pad.max.z - .014
        && vertex.y > pad.min.y + .008 && vertex.y < pad.max.y - .012) padPenetration = name;
      low[name] = Math.min(low[name] ?? Infinity, vertex.y);
    });
  }
}

function gap(group, other, target) {
  const first = nearest[group].filter((p) => p.distanceToSquared(target) < .027);
  const second = nearest[other].filter((p) => p.distanceToSquared(target) < .027);
  let distance = Infinity;
  for (const a of first) for (const b of second) distance = Math.min(distance, a.distanceToSquared(b));
  return Math.sqrt(distance);
}

function jointAngle(a, b, c) {
  const middle = point(b);
  return point(a).sub(middle).angleTo(point(c).sub(middle));
}

function benchContact(joint, pad) {
  const nearTop = nearest[joint].filter(({ x, z }) =>
    x > pad.min.x + .007 && x < pad.max.x - .007 && z > pad.min.z + .007 && z < pad.max.z - .007);
  assert.ok(nearTop.length, label + ' ' + joint + ' has no vertices over the pad');
  near(Math.min(...nearTop.map(({ y }) => y)), pad.max.y, .016, joint + ' bench contact');
}

const checks = {
  All_Fours_Quad_Stretch() {
    const hip = point('Pelvis');
    through(0, 3.8, () => { onPalm('R'); sole('R'); onFloor('ShinR', .074); });
    sample(1.15);
    requireMotion(hip.y - point('Pelvis').y, .018, 'hip lowers');
    assert.ok(jointAngle('ThighL', 'ShinL', 'FootL') < 1.3, label + ' flexed knee');
    near(gap('HandL', 'FootL', point('FootL')), 0, .039, 'hand to foot');
  },
  Alternate_Leg_Diagonal_Bound() {
    for (const [from, flight, to, front] of [[.25, .455, .66, 'L'], [.88, 1.085, 1.29, 'R']]) {
      sample(from);
      sole(front === 'L' ? 'R' : 'L');
      const takeoff = point('Pelvis');
      sample(flight);
      requireMotion(Math.min(low.FootL, low.FootR), .065, 'both feet in flight');
      sample(to);
      sole(front);
      const landing = point('Pelvis').sub(takeoff);
      requireMotion(landing.x * (front === 'L' ? 1 : -1), .42, 'diagonal lateral travel');
      requireMotion(landing.z, .42, 'forward travel');
    }
    sample(1.75);
    sole('L');
    sole('R');
  },
  Ankle_Circles() {
    for (const [side, other, start] of [['R', 'L', .5], ['L', 'R', 3]]) {
      sample(start);
      const anchor = point('Foot' + other);
      const directions = [];
      through(start, start + 1.65, () => {
        sole(other);
        near(point('Foot' + other).distanceTo(anchor), 0, .003, 'support foot drift');
        requireMotion(low['Foot' + side], .043, 'raised foot clearance');
        directions.push(axis('Foot' + side, 0, -.45, 1));
        const distance = Math.min(...nearest.HandL.map((p) => upright.distanceToPoint(p)));
        near(distance, 0, .020, 'support hand to upright');
      });
      requireMotion(Math.max(...directions.map((p) => p.x)) - Math.min(...directions.map((p) => p.x)), .24, 'ankle side-to-side');
      requireMotion(Math.max(...directions.map((p) => p.y)) - Math.min(...directions.map((p) => p.y)), .36, 'ankle top to bottom');
    }
  },
  Bench_Dips(pad) {
    const start = point('Pelvis');
    const angle = jointAngle('ArmL', 'ForearmL', 'HandL');
    through(0, 3.8, () => {
      for (const side of ['L', 'R']) { sole(side); benchContact('Hand' + side, pad); }
    });
    sample(1.15);
    requireMotion(start.y - point('Pelvis').y, .22, 'dip depth');
    requireMotion(angle - jointAngle('ArmL', 'ForearmL', 'HandL'), .55, 'elbow bend');
  },
  Carioca_Quick_Step() {
    sample(.24);
    sole('L');
    sole('R');
    requireMotion(point('FootR').x - point('FootL').x, .12, 'right foot crosses behind');
    assert.ok(point('FootR').z < point('FootL').z - .15, label + ' behind the lead foot');
    sample(.70);
    sole('L');
    requireMotion(low.FootR, .45, 'high knee clearance');
    assert.ok(axis('Head', 0, 0, 1).z > .99, label + ' keeps eyes forward');
    sample(1.75);
    sole('L');
    sole('R');
    requireMotion(point('Pelvis').x, 1, 'sideways travel');
  },
  Childs_Pose() {
    const height = point('Pelvis').y;
    through(0, 4.8, () => {
      sole('L');
      sole('R');
      for (const [side, sign] of [['L', 1], ['R', -1]]) {
        const hand = bone('Hand' + side);
        near(hand.position.angleTo(handAlong(sign).applyQuaternion(hand.quaternion)), 0, 1.5, 'wrist during reach');
      }
    });
    sample(1.6);
    requireMotion(height - point('Pelvis').y, .26, 'hips descend to heels');
    onPalm('L');
    onPalm('R');
    sample(2.45);
    onFloor('Head', .042);
    assert.ok(point('HandL').z < point('Pelvis').z + .21, label + ' arms beside feet');
  },
  Chin_To_Chest_Stretch() {
    const start = rotation('Head');
    sample(1.15);
    requireMotion(start.angleTo(rotation('Head')), .55, 'neck flexion');
    for (const side of ['L', 'R']) near(gap('Hand' + side, 'Head', point('Head').add(v(0, .09, 0))), 0, .045, 'hand supports head');
  },
  Dancers_Stretch() {
    const start = rotation('Chest');
    through(0, 3.8, () => { sole('L'); sole('R'); onPalm('R'); });
    sample(1.15);
    requireMotion(start.angleTo(rotation('Chest')), .63, 'torsional stretch');
    requireMotion(point('FootR').x - point('FootL').x, .10, 'crossed leg');
    near(gap('ForearmL', 'ShinR', point('ShinR')), 0, .080, 'arm braces bent leg');
  },
  Hanging_Pike() {
    const top = shaft.getCenter(v());
    const start = point('FootL').y;
    through(0, 3.8, () => {
      for (const [side, s] of [['L', 1], ['R', -1]]) {
        const grip = dumbbellGripTransform(s);
        const seat = bone('Hand' + side).localToWorld(grip.position);
        const handle = v(1, 0, 0).applyQuaternion(grip.quaternion).applyQuaternion(rotation('Hand' + side));
        near(Math.hypot(seat.y - top.y, seat.z - top.z), 0, .003, 'grip seat on shaft');
        near(handle.x, -1, .001, 'overhand grip aligns with shaft');
      }
    });
    sample(1.15);
    requireMotion(point('FootL').y - start, .82, 'feet rise from tuck');
    assert.ok(jointAngle('ThighL', 'ShinL', 'FootL') > 2.85, label + ' almost straight at top');
    near(point('FootL').y, top.y, .20, 'feet reach shaft height');
  },
  Hug_Knees_To_Chest() {
    const start = point('Head').distanceTo(point('ShinL'));
    sample(1.15);
    requireMotion(start - point('Head').distanceTo(point('ShinL')), .10, 'knees approach shoulders');
    onFloor('Chest');
    for (const side of ['L', 'R']) near(gap('Hand' + side, 'Thigh' + side, point('Shin' + side)), 0, .050, 'hands behind thighs');
  },
  Inchworm() {
    for (const [phase, side, joint] of [[.19, 'R', 'Hand'], [.57, 'L', 'Hand'], [2.47, 'R', 'Foot'], [2.86, 'L', 'Foot']]) {
      sample(phase);
      if (joint === 'Hand') onPalm(side);
      else sole(side);
      const moving = side === 'R' ? 'L' : 'R';
      requireMotion(low[joint + moving], .030, 'moving limb lifts');
    }
    sample(2.28);
    near(axis('Chest', 0, 1, 0).y, 0, .21, 'plank torso');
    for (const side of ['L', 'R']) {
      onPalm(side);
      sole(side);
      assert.ok(jointAngle('Arm' + side, 'Forearm' + side, 'Hand' + side) > 2.70, 'plank elbows nearly straight');
      assert.ok(jointAngle('Thigh' + side, 'Shin' + side, 'Foot' + side) > 2.95, 'plank legs nearly straight');
    }
    const wrists = ['L', 'R'].map((side) => point('Hand' + side));
    sample(4.65);
    requireMotion(point('Pelvis').z, .75, 'feet catch up');
    for (const [i, side] of ['L', 'R'].entries()) {
      sole(side);
      onPalm(side);
      near(point('Hand' + side).distanceTo(wrists[i]), 0, .005, 'hands stay planted during foot steps');
    }
  },
  'Incline_Push-Up'(pad) {
    const start = point('Chest').y;
    through(0, 3.8, () => {
      for (const side of ['L', 'R']) { sole(side); benchContact('Hand' + side, pad); }
    });
    sample(1.15);
    requireMotion(start - point('Chest').y, .14, 'chest lowers');
    assert.ok(jointAngle('ArmL', 'ForearmL', 'HandL') < 2, label + ' elbow flexes');
  },
  Kneeling_Arm_Drill() {
    const start = point('HandL');
    through(0, 3.36, () => { sole('L'); sole('R'); onFloor('ShinR', .065); });
    sample(.48);
    requireMotion(point('HandL').z - start.z, .28, 'forward arm swing');
    const long = jointAngle('ArmL', 'ForearmL', 'HandL');
    sample(2.14);
    requireMotion(long - jointAngle('ArmL', 'ForearmL', 'HandL'), .25, 'elbow closes as pace increases');
  },
  On_Your_Side_Quad_Stretch() {
    const start = point('ShinL');
    through(0, 3.8, () => {
      const hand = bone('HandL');
      near(hand.position.angleTo(handAlong(1).applyQuaternion(hand.quaternion)), 0, .65, 'wrist follows forearm');
    });
    sample(1.15);
    onFloor('ThighR', .060);
    onFloor('ShinR', .070);
    requireMotion(point('ShinL').distanceTo(start), .16, 'top knee moves back');
    near(gap('HandL', 'FootL', point('FootL')), 0, .04, 'hand holds top foot');
  },
  One_Half_Locust() {
    const chest = point('Chest');
    const foot = point('FootR');
    through(0, 3.8, () => { sole('L'); onPalm('L'); });
    sample(1.15);
    requireMotion(point('Chest').y - chest.y, .045, 'chest lifts');
    requireMotion(point('FootR').y - foot.y, .11, 'grasped foot lifts');
    near(gap('HandR', 'FootR', point('FootR')), 0, .04, 'hand retains foot');
  },
  'Push-Ups_With_Feet_Elevated'(pad) {
    const start = point('Chest').y;
    through(0, 3.8, () => {
      for (const side of ['L', 'R']) { onPalm(side); benchContact('Foot' + side, pad); }
    });
    sample(1.15);
    requireMotion(start - point('Chest').y, .14, 'chest lowers');
    onFloor('Chest', .065);
  },
  Seated_Floor_Hamstring_Stretch() {
    const start = rotation('Chest');
    through(0, 3.8, () => sole('R'));
    sample(1.15);
    requireMotion(start.angleTo(rotation('Chest')), .85, 'forward hip hinge');
    assert.ok(jointAngle('ThighR', 'ShinR', 'FootR') > 2.75, label + ' extended knee');
    near(gap('HandR', 'FootR', point('FootR')), 0, .055, 'reach to extended ankle');
  },
  Seated_Leg_Tucks(pad) {
    const start = jointAngle('ThighL', 'ShinL', 'FootL');
    through(0, 3.8, () => {
      for (const side of ['L', 'R']) {
        benchContact('Hand' + side, pad);
        requireMotion(low['Foot' + side], .15, 'hovering feet');
      }
      benchContact('Pelvis', pad);
    });
    sample(1.15);
    requireMotion(start - jointAngle('ThighL', 'ShinL', 'FootL'), 1.7, 'knee tuck');
    assert.ok(axis('Chest', 0, 1, 0).z > .24, label + ' chest inclines toward knees');
  },
  Side_Wrist_Pull() {
    const start = point('HandL');
    through(0, 3.8, () => {
      sole('L');
      sole('R');
      near(gap('HandR', 'ForearmL', point('HandL')), 0, .038, 'hand maintains wrist contact');
    });
    sample(1.15);
    requireMotion(point('HandL').y - start.y, .31, 'wrist rises toward shoulder height');
    assert.ok(jointAngle('ArmL', 'ForearmL', 'HandL') > 2.62, label + ' stretching arm straightens');
  },
  Worlds_Greatest_Stretch() {
    const knee = jointAngle('ThighL', 'ShinL', 'FootL');
    through(0, 5.85, () => { sole('L'); sole('R'); });
    sample(1.62);
    onPalm('R');
    onFloor('ForearmL', .070);
    assert.ok(point('ForearmL').x < point('FootL').x, label + ' elbow inside front foot');
    sample(3.62);
    onPalm('L');
    onPalm('R');
    requireMotion(jointAngle('ThighL', 'ShinL', 'FootL') - knee, .32, 'front leg straightens');
    assert.ok(axis('FootL', 0, 0, 1).y > .45, label + ' toes rise while heel remains grounded');
  },
};

const prefix = 'local:exercise:';
const oneShots = new Set(['Alternate_Leg_Diagonal_Bound', 'Carioca_Quick_Step', 'Inchworm']);
assert.equal(Object.keys(checks).length, 20);
assert.deepEqual(Object.keys(entries).sort(), Object.keys(checks).map((key) => prefix + key).sort());
for (const [key, check] of Object.entries(checks)) {
  const id = prefix + key;
  const { name, primary, supporting, phases, cues, clip, oneShot, equipment, benchTransform, framing, propClip } = entries[id];
  assert.equal(name, catalog.get(id)?.name, id);
  assert.equal(clip.name, name, id);
  assert.equal(oneShot, oneShots.has(key) || undefined, id);
  assert.equal(equipment, ['Bench_Dips', 'Incline_Push-Up', 'Push-Ups_With_Feet_Elevated', 'Seated_Leg_Tucks'].includes(key)
    ? 'bench' : ['Ankle_Circles', 'Hanging_Pike'].includes(key) ? 'pull-up-bar' : undefined, id);
  assert.equal(framing, equipment === 'bench' ? 'bench' : key === 'Hanging_Pike' ? 'pull-up-bar'
    : ['Alternate_Leg_Diagonal_Bound', 'Ankle_Circles', 'Carioca_Quick_Step', 'Kneeling_Arm_Drill', 'Side_Wrist_Pull']
      .includes(key) ? 'standing' : 'floor', id);
  assert.equal(propClip, undefined, id);
  assert.ok(primary.length && [...primary, ...supporting].every((muscle) => materials.has(muscle)), id + ' atlas groups');
  for (const markers of [phases, cues]) {
    assert.equal(markers[0][0], 0, id);
    assert.ok(markers.every(([time, ...copy], i) =>
      time >= 0 && time < clip.duration && time > (markers[i - 1]?.[0] ?? -1) && copy.every(Boolean)), id + ' timed labels');
  }
  assert.ok(clip.validate(), id);
  const animated = clip.tracks.map(({ name, times, values }) => {
    const [joint, property] = name.split('.');
    assert.ok(times.every(Number.isFinite) && values.every(Number.isFinite), id + ' ' + name + ' finite keys');
    if (property === 'quaternion') {
      for (let i = 0; i < values.length; i += 4) {
        assert.ok(Math.abs(Math.hypot(...values.subarray(i, i + 4)) - 1) < .0002, id + ' unit ' + name);
      }
    }
    return bone(joint)[property];
  });
  pad = undefined;
  if (benchTransform) {
    const bench = createFlatBench();
    bench.position.fromArray(benchTransform.position);
    bench.rotation.y = benchTransform.yaw;
    bench.updateMatrixWorld(true);
    pad = bounds(bench.getObjectByName('Pad'));
  }
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
  action.paused = true;
  sample = (time, retainVertices = true) => {
    label = id + ' at ' + time.toFixed(3) + 's';
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    skin(retainVertices);
  };
  const distance = (a, b) => a.isQuaternion ? a.angleTo(b) : a.distanceTo(b);
  sample(0);
  const start = animated.map((value) => value.clone());
  const origin = point('Pelvis');
  let previous = start;
  let movement = 0;
  const frames = Math.ceil(clip.duration * 24);
  for (let i = 1; i <= frames; i++) {
    sample(i * clip.duration / frames, false);
    for (const [j, value] of animated.entries()) {
      movement = Math.max(movement, distance(value, start[j]));
      assert.ok(distance(value, previous[j]) < .92, label + ' abrupt ' + clip.tracks[j].name);
    }
    const floor = Math.min(...Object.values(low));
    near(Math.min(floor, 0), 0, .016, 'skinned floor clearance (' + Object.keys(low).find((joint) => low[joint] === floor) + ')');
    assert.equal(padPenetration, undefined, label + ' bench pad intersection');
    previous = animated.map((value) => value.clone());
  }
  requireMotion(movement, .18, 'visible motion');
  if (oneShot) requireMotion(point('Pelvis').distanceTo(origin), .73, 'finish away from starting position');
  else animated.forEach((value, j) => near(distance(value, start[j]), 0, .001, 'loop closes ' + clip.tracks[j].name));
  sample(0);
  check(pad);
  action.stop();
  console.log('PASS ' + name);
}
