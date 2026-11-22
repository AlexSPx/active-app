import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createExerciseGroups } from './clips.mjs';
import { measurePalmContacts } from './hand-frame.mjs';
import { createEntries } from './bodyweight-floor-extra.mjs';

const bytes = await readFile(new URL('./anatomy.glb', import.meta.url));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .parseAsync(Uint8Array.from(bytes).buffer, '');
const catalog = new Map(JSON.parse(await readFile(new URL(
  '../../apps/client/lib/data/exercise-catalog.json', import.meta.url,
))).map((entry) => [entry.id, entry]));
const { scene } = asset;
const prefix = 'local:exercise:';
const keys = [
  'Body-Up', 'Butt-Ups', 'Isometric_Wipers', 'Plyo_Push-up', 'Pushups_Close_and_Wide_Hand_Positions',
  'Groiners', 'Glute_Kickback', 'Leg_Pull-In', 'Side_Bridge', 'Oblique_Crunches_-_On_The_Floor',
];
const sides = ['L', 'R'];
const bone = (name) => scene.getObjectByName(name);
const point = (name) => bone(name).getWorldPosition(new THREE.Vector3());
const bones = [];
const meshes = [];
const materials = new Set();
const slots = ['getX', 'getY', 'getZ', 'getW'];
scene.updateMatrixWorld(true);
scene.traverse((object) => {
  if (object.isBone) bones.push(object);
  if (!object.isSkinnedMesh) return;
  materials.add(object.material.name);
  const { position, skinIndex, skinWeight } = object.geometry.attributes;
  const names = Array.from({ length: position.count }, (_, i) => {
    const slot = slots.reduce((best, next) => skinWeight[next](i) > skinWeight[best](i) ? next : best);
    return object.skeleton.bones[skinIndex[slot](i)].name;
  });
  meshes.push({ mesh: object, names });
});

const rest = () => bones.map((joint) => [...joint.position, ...joint.quaternion]);
const original = rest();
const entries = createEntries(asset);
assert.deepEqual(rest(), original, 'Creating clips must leave the source rig unchanged');
assert.deepEqual(Object.keys(entries).sort(), keys.map((key) => prefix + key).sort());
for (const [label, group] of createExerciseGroups(asset)) {
  if (label === 'Floor bodyweight extra') {
    assert.deepEqual(Object.keys(group).sort(), Object.keys(entries).sort(), label);
  } else {
    for (const id of Object.keys(group)) assert.ok(!entries[id], id + ' already registered in ' + label);
  }
}

const mixer = new THREE.AnimationMixer(scene);
const palm = measurePalmContacts(scene);
const vertex = new THREE.Vector3();

function floorHeights() {
  const low = {};
  for (const { mesh, names } of meshes) {
    names.forEach((name, i) => {
      const y = mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld).y;
      low[name] = Math.min(low[name] ?? Infinity, y);
    });
  }
  return low;
}

for (const key of keys) {
  const id = prefix + key;
  const { name, primary, supporting, framing, equipment, propClip, oneShot, clip, phases, cues } = entries[id];
  assert.equal(name, catalog.get(id)?.name, id);
  assert.equal(catalog.get(id).equipment, 'BODY_ONLY', id);
  assert.equal(framing, 'floor', id);
  for (const value of [equipment, propClip, oneShot]) assert.equal(value, undefined, id);
  assert.ok([...primary, ...supporting].every((muscle) => materials.has(muscle)), id + ' highlight materials');
  assert.ok(clip.validate(), id);
  for (const markers of [phases, cues]) {
    assert.equal(markers[0][0], 0, id);
    assert.ok(markers.every(([time, ...copy], i) => time < clip.duration
      && time > (markers[i - 1]?.[0] ?? -1) && copy.every(Boolean)), id + ' valid timed labels');
  }

  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
  action.paused = true;
  function sample(time) {
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
  }
  const transforms = clip.tracks.map(({ name }) => {
    const [joint, property] = name.split('.');
    return bone(joint)[property];
  });
  const distance = (a, b) => a.isQuaternion ? a.angleTo(b) : a.distanceTo(b);
  sample(0);
  const first = transforms.map((transform) => transform.clone());
  sample(clip.duration);
  transforms.forEach((transform, i) => assert.ok(distance(transform, first[i]) < .001, id + ' loop closes'));

  sample(0);
  const contacts = ['HandL', 'HandR', 'FootL', 'FootR', 'ShinL', 'ShinR'].map((name) => [name, point(name)]);
  const baseline = Object.fromEntries(contacts);
  const liftedWrist = (side, time) => key === 'Plyo_Push-up' && time > 1 && time < 1.26
    || key === 'Pushups_Close_and_Wide_Hand_Positions'
      && (side === 'L' ? time > 1.65 && time < 2.12 || time > 4.71 && time < 5.18
        : time > 2.12 && time < 2.59 || time > 4.24 && time < 4.71);
  const feetPlanted = ['Body-Up', 'Butt-Ups', 'Isometric_Wipers', 'Plyo_Push-up',
    'Pushups_Close_and_Wide_Hand_Positions'].includes(key);
  const lateral = key === 'Side_Bridge' || key === 'Oblique_Crunches_-_On_The_Floor';

  let lowest = Infinity;
  let motion = 0;
  let previous = first;
  const frames = Math.ceil(clip.duration * 24);
  const times = [...new Set([
    ...Array.from({ length: frames + 1 }, (_, i) => i * clip.duration / frames),
    ...phases.map(([time]) => time),
  ])].sort((a, b) => a - b);
  for (const time of times) {
    sample(time);
    const low = floorHeights();
    const floor = Math.min(...Object.values(low));
    const label = key + ' at ' + time.toFixed(3) + ' s';
    lowest = Math.min(lowest, floor);
    assert.ok(floor >= -.005, label + ' penetrates floor by ' + (-floor).toFixed(4) + ' m');

    for (const side of sides) {
      const wrist = 'Hand' + side;
      const foot = 'Foot' + side;
      const knee = 'Shin' + side;
      if (!(lateral && side === 'L') && !liftedWrist(side, time)) {
        const { heel, knuckles } = palm(side);
        assert.ok(Math.abs(heel) < .012 && Math.abs(knuckles) < .013,
          label + ' keeps heel and knuckles of ' + wrist + ' on the floor');
        if (key !== 'Pushups_Close_and_Wide_Hand_Positions') {
          assert.ok(point(wrist).distanceTo(baseline[wrist]) < .004, label + ' fixes ' + wrist);
        }
      }
      if (feetPlanted || lateral && side === 'R') {
        assert.ok(Math.abs(low[foot]) < .006, label + ' plants ' + foot);
        assert.ok(point(foot).distanceTo(baseline[foot]) < .004, label + ' fixes ' + foot);
      }
      if (key === 'Butt-Ups' || key === 'Side_Bridge' && side === 'R') {
        assert.ok(low['Forearm' + side] < .014, label + ' forearm support');
      }
      if (key === 'Glute_Kickback' && (side === 'L' ? time === 0 || time >= 2.8 : time <= 2.8)) {
        assert.ok(Math.abs(low[knee]) < .006, label + ' plants ' + knee);
        assert.ok(point(knee).distanceTo(baseline[knee]) < .003, label + ' fixes ' + knee);
      }
    }
    if (key === 'Leg_Pull-In') {
      assert.ok(low.Chest < .015 && low.Pelvis < .019, label + ' back supported');
      for (const side of sides) {
        assert.ok(Math.abs(point('Foot' + side).y - point('Shin' + side).y) < .010,
          label + ' shins parallel to floor');
      }
    }

    const stepLimit = key === 'Groiners' ? .85 : key === 'Plyo_Push-up' ? .60 : .35;
    transforms.forEach((transform, j) => {
      const step = distance(transform, previous[j]);
      assert.ok(step < stepLimit, label + ' continuous ' + clip.tracks[j].name + ' step ' + step.toFixed(3));
      motion = Math.max(motion, distance(transform, first[j]));
    });
    previous = transforms.map((transform) => transform.clone());
  }
  assert.ok(motion > .40, id + ' measurable joint motion');

  const elbow = (side) => point('Arm' + side).sub(point('Forearm' + side)).angleTo(
    point('Hand' + side).sub(point('Forearm' + side)),
  );
  const knee = (side) => point('Thigh' + side).sub(point('Shin' + side)).angleTo(
    point('Foot' + side).sub(point('Shin' + side)),
  );
  const handWidth = () => point('HandL').x - point('HandR').x;
  sample(0);
  const startHip = point('Pelvis');
  const startChest = point('Chest');
  const startElbow = elbow('L');

  switch (key) {
    case 'Body-Up': {
      const low = floorHeights();
      assert.ok(sides.every((side) => low['Forearm' + side] < .012), id + ' starts on forearms');
      sample(1.15);
      assert.ok(sides.every((side) => elbow(side) > 2.65 && elbow(side) - startElbow > .80),
        id + ' extends both elbows');
      break;
    }
    case 'Butt-Ups':
      sample(1.2);
      assert.ok(point('Pelvis').y - startHip.y > .21 && point('Chest').y - startChest.y < .10, id + ' pikes hips');
      break;
    case 'Isometric_Wipers':
      for (const [time, side, other, sign] of [[.9, 'L', 'R', 1], [2.9, 'R', 'L', -1]]) {
        sample(time);
        assert.ok((point('Chest').x - startChest.x) * sign > .19 && point('Chest').y < startChest.y - .15,
          id + ' shifts and lowers to ' + side);
        assert.ok(elbow(side) + .45 < elbow(other), id + ' bends the loaded arm');
      }
      break;
    case 'Plyo_Push-up':
      sample(.75);
      assert.ok(floorHeights().Chest < .040, id + ' reaches push-up depth');
      sample(1.13);
      assert.ok(sides.every((side) => palm(side).heel > .12 && palm(side).knuckles > .12),
        id + ' both hands airborne');
      sample(1.26);
      assert.ok(sides.every((side) => palm(side).heel < .010), id + ' both hands land');
      break;
    case 'Pushups_Close_and_Wide_Hand_Positions':
      assert.ok(handWidth() > .75, id + ' wide stance');
      sample(.85);
      assert.ok(point('Chest').y < startChest.y - .20, id + ' first push-up');
      sample(2.59);
      assert.ok(handWidth() < .30, id + ' close stance');
      sample(3.44);
      assert.ok(point('Chest').y < startChest.y - .20 && handWidth() < .30, id + ' second push-up');
      break;
    case 'Groiners': {
      assert.ok(sides.every((side) => point('Foot' + side).z < -.80), id + ' starts in a plank');
      sample(.29);
      const airborne = floorHeights();
      assert.ok(sides.every((side) => airborne['Foot' + side] > .15), id + ' jumps with both feet');
      sample(.58);
      const landed = floorHeights();
      assert.ok(sides.every((side) => Math.abs(landed['Foot' + side]) < .005
        && Math.abs(point('Foot' + side).x) > Math.abs(point('Hand' + side).x) + .15
        && Math.abs(point('Foot' + side).z - point('Hand' + side).z) < .19), id + ' lands outside both hands');
      break;
    }
    case 'Glute_Kickback':
      for (const [time, side] of [[.9, 'L'], [3.7, 'R']]) {
        sample(time);
        const hip = point('Thigh' + side);
        const shin = point('Shin' + side);
        const foot = point('Foot' + side);
        assert.ok(Math.abs(hip.y - shin.y) < .015 && hip.z - shin.z > .44, id + ' thigh extends horizontally');
        assert.ok(foot.y - shin.y > .37 && Math.abs(knee(side) - Math.PI / 2) < .04,
          id + ' kicks with a right-angle knee');
      }
      break;
    case 'Leg_Pull-In':
      assert.ok(knee('L') > 3, id + ' starts with legs long');
      sample(1.08);
      assert.ok(point('ShinL').z < -.16 && point('ShinL').y > .50 && knee('L') < 1.3,
        id + ' tucks knees toward chest');
      break;
    case 'Side_Bridge':
      sample(1.12);
      assert.ok(point('Pelvis').y - startHip.y > .12 && Math.abs(point('FootL').z - point('FootR').z) < .02,
        id + ' raises hips with stacked feet');
      break;
    case 'Oblique_Crunches_-_On_The_Floor': {
      const startHead = point('Head');
      const startLeftElbow = point('ForearmL');
      sample(1.12);
      assert.ok(point('Pelvis').distanceTo(startHip) < .002 && point('Head').y - startHead.y > .13
        && point('ForearmL').y - startLeftElbow.y > .12, id + ' curls top elbow up over stationary hips');
      break;
    }
  }
  mixer.stopAllAction();
  console.log(`${id} passed (${clip.duration.toFixed(2)} s, maximum floor penetration ${Math.max(0, -lowest * 1000).toFixed(1)} mm)`);
}

console.log(`Verified ${keys.length} Floor bodyweight extra clips`);
