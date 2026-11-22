import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createExerciseGroups } from './clips.mjs';
import { createEntries } from './supine-core.mjs';
import { handAlong } from './hand-frame.mjs';

const bytes = await readFile(new URL('./anatomy.glb', import.meta.url));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .parseAsync(Uint8Array.from(bytes).buffer, '');
const catalog = new Map(JSON.parse(await readFile(new URL(
  '../../apps/client/lib/data/exercise-catalog.json', import.meta.url,
))).map((entry) => [entry.id, entry]));
const { scene } = asset;
const prefix = 'local:exercise:';
const keys = [
  'Air_Bike', 'Alternate_Heel_Touchers', 'Bent-Knee_Hip_Raise', 'Bottoms_Up',
  'Cocoons', 'Scissor_Kick', 'Toe_Touchers', 'Tuck_Crunch',
];
const sides = ['L', 'R'];
const bone = (name) => scene.getObjectByName(name);
const point = (name) => bone(name).getWorldPosition(new THREE.Vector3());
const rest = () => Object.fromEntries(
  Object.values(bones).map((joint) => [joint.name, [...joint.position, ...joint.quaternion]]),
);
const bones = {};
const meshes = [];
const materials = new Set();
const axes = ['getX', 'getY', 'getZ', 'getW'];
scene.updateMatrixWorld(true);
scene.traverse((object) => {
  if (object.isBone) bones[object.name] = object;
  if (!object.isSkinnedMesh) return;
  materials.add(object.material.name);
  const { position, skinIndex, skinWeight } = object.geometry.attributes;
  const names = Array.from({ length: position.count }, (_, i) => {
    const axis = axes.reduce((best, next) => skinWeight[next](i) > skinWeight[best](i) ? next : best);
    return object.skeleton.bones[skinIndex[axis](i)].name;
  });
  meshes.push({ mesh: object, names });
});

const original = rest();
const entries = createEntries(asset);
assert.deepEqual(rest(), original, 'Authoring must leave every joint unchanged');
assert.deepEqual(Object.keys(entries).sort(), keys.map((key) => prefix + key).sort());
for (const [label, group] of createExerciseGroups(asset)) {
  if (label === 'Supine core') {
    assert.deepEqual(Object.keys(group).sort(), Object.keys(entries).sort(), label);
  } else {
    for (const id of Object.keys(group)) assert.ok(!entries[id], id + ' already registered in ' + label);
  }
}

const mixer = new THREE.AnimationMixer(scene);
const vertex = new THREE.Vector3();
const regions = (side, isHeel) => {
  const fingers = [];
  const foot = [];
  const fingertips = new RegExp('^(Index|Middle|Ring)3' + side + '$');
  for (const { mesh, names } of meshes) {
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < names.length; i++) {
      if (fingertips.test(names[i])) fingers.push([mesh, i]);
      if (names[i] !== 'Foot' + side) continue;
      const local = bone(names[i]).worldToLocal(vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
      if (isHeel ? local.z < -.025 && local.y < -.025 : local.z > .145) foot.push([mesh, i]);
    }
  }
  assert.ok(fingers.length && foot.length, side + ' contact regions exist');
  return [fingers, foot];
};
const heels = sides.map((side) => regions(side, true));
const toes = sides.map((side) => regions(side, false));
const minDistance = (regions) => {
  const [a, b] = regions.map((samples) => samples.map(([mesh, i]) =>
    mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));
  let squared = Infinity;
  for (const i of a) for (const j of b) squared = Math.min(squared, i.distanceToSquared(j));
  return Math.sqrt(squared);
};

for (const key of keys) {
  const id = prefix + key;
  const { name, primary, supporting, framing, equipment, propClip, clip, phases, cues } = entries[id];
  assert.equal(name, catalog.get(id).name, id);
  assert.equal(catalog.get(id).equipment, 'BODY_ONLY', id);
  assert.equal(framing, 'floor', id);
  assert.equal(equipment, undefined, id);
  assert.equal(propClip, undefined, id);
  assert.deepEqual(primary, ['Core'], id);
  assert.ok([...primary, ...supporting].every((muscle) => materials.has(muscle)), id);
  assert.ok(clip.validate(), id);
  for (const markers of [phases, cues]) {
    assert.equal(markers[0][0], 0, id + ' starts with a label');
    assert.ok(markers.every(([time, ...copy], i) => time < clip.duration
      && time > (markers[i - 1]?.[0] ?? -1) && copy.every(Boolean)), id + ' marker times and text');
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

  const frames = Math.ceil(clip.duration * 20);
  const times = [...new Set([
    ...Array.from({ length: frames + 1 }, (_, i) => clip.duration * i / frames),
    ...phases.map(([time]) => time),
  ])].sort((a, b) => a - b);
  let lowest = Infinity;
  let motion = 0;
  let previous = first;
  for (const time of times) {
    sample(time);
    const low = {};
    for (const { mesh, names } of meshes) {
      names.forEach((joint, i) => {
        const y = mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld).y;
        low[joint] = Math.min(low[joint] ?? Infinity, y);
      });
    }
    const floor = Math.min(...Object.values(low));
    lowest = Math.min(lowest, floor);
    assert.ok(floor > -.005, `${id} floor penetration ${floor.toFixed(3)} m at ${time.toFixed(2)} s`);
    const support = Math.min(low.Pelvis, low.Lumbar, low.Chest);
    assert.ok(support < .030, `${id} support height ${support.toFixed(3)} m at ${time.toFixed(2)} s`);
    if (key === 'Alternate_Heel_Touchers') {
      assert.ok(sides.every((side) => Math.abs(low['Foot' + side]) < .006), id + ' both feet planted');
    }
    if (key === 'Scissor_Kick' || key === 'Bent-Knee_Hip_Raise') {
      assert.ok(sides.every((side) => low['Foot' + side] > .040), id + ' both feet stay off the floor');
    }
    if (key === 'Air_Bike') {
      for (const [index, side] of sides.entries()) {
        const hand = bone('Hand' + side);
        const angle = hand.position.angleTo(handAlong(1 - index * 2).applyQuaternion(hand.quaternion));
        assert.ok(angle < .70, `${id} ${side} wrist bend ${angle} at ${time}`);
      }
    }
    transforms.forEach((transform, i) => {
      assert.ok(distance(transform, previous[i]) < .30, id + ' continuous joint ' + clip.tracks[i].name);
      motion = Math.max(motion, distance(transform, first[i]));
    });
    previous = transforms.map((transform) => transform.clone());
  }
  assert.ok(motion > .40, id + ' measurable motion');

  sample(0);
  const pelvis = point('Pelvis');
  const chest = point('Chest');
  const head = point('Head');
  const feet = sides.map((side) => point('Foot' + side));
  const hands = sides.map((side) => point('Hand' + side));
  const bend = (side) => point('Thigh' + side).sub(point('Shin' + side)).angleTo(
    point('Foot' + side).sub(point('Shin' + side)),
  );
  const firstBend = bend('L');
  if (key === 'Air_Bike') {
    for (const [time, knee, elbow] of [[.8, 'L', 'R'], [2.6, 'R', 'L']]) {
      sample(time);
      assert.ok(point('Forearm' + elbow).distanceTo(point('Shin' + knee)) < .20, id + ' opposite elbow approaches knee');
      assert.ok(bend(elbow) > 2.95 && bend(knee) < 1.1, id + ' extended and tucked legs');
    }
  }
  if (key === 'Alternate_Heel_Touchers') {
    for (const [index, time] of [[1, .8], [0, 2.9]]) {
      sample(time);
      const gap = minDistance(heels[index]);
      assert.ok(gap < .025, `${id} ${sides[index]} hand-to-heel gap ${gap.toFixed(3)} m`);
      feet.forEach((foot, i) => assert.ok(point('Foot' + sides[i]).distanceTo(foot) < .001, id + ' planted feet stay still'));
    }
  }
  if (key === 'Bent-Knee_Hip_Raise' || key === 'Bottoms_Up') {
    if (key === 'Bottoms_Up') {
      sample(.95);
      assert.ok(firstBend > 3 && bend('L') < 1.55, id + ' straight legs then tuck before extension');
      assert.ok(point('Pelvis').distanceTo(pelvis) < .001, id + ' hips stay down during tuck');
    }
    sample(key === 'Bottoms_Up' ? 1.65 : 1.2);
    assert.ok(point('Pelvis').y > pelvis.y + .065, id + ' hips rise');
    assert.ok(point('Chest').distanceTo(chest) < .001, id + ' chest stays down');
    if (key === 'Bottoms_Up') {
      assert.ok(bend('L') > 3 && point('FootL').y > 1, id + ' legs extend vertically');
    } else {
      assert.ok(Math.abs(bend('L') - firstBend) < .03, id + ' preserves knee angle');
      assert.ok(point('ShinL').z < -.25, id + ' knees curl toward chest');
    }
  }
  if (key === 'Cocoons') {
    sample(1.2);
    assert.ok(firstBend > 3 && bend('L') < 1.25, id + ' long legs fold into tuck');
    assert.ok(hands[0].z < head.z - .30 && point('HandL').z > -.10, id + ' arms sweep over head');
    assert.ok(point('Pelvis').y > pelvis.y + .01 && point('Head').y > head.y + .13, id + ' hips and shoulders curl');
  }
  if (key === 'Scissor_Kick') {
    for (const [time, high, low] of [[.55, 'L', 'R'], [1.65, 'R', 'L']]) {
      sample(time);
      assert.ok(point('Foot' + high).y - point('Foot' + low).y > .48, id + ' alternates high leg');
      hands.forEach((hand, i) => assert.ok(point('Hand' + sides[i]).distanceTo(hand) < .001, id + ' arms stay still'));
    }
  }
  if (key === 'Toe_Touchers' || key === 'Tuck_Crunch') {
    const initialGaps = key === 'Toe_Touchers' ? toes.map(minDistance) : [];
    sample(1.1);
    feet.forEach((foot, i) => assert.ok(point('Foot' + sides[i]).distanceTo(foot) < .001, id + ' legs stay still'));
    assert.ok(point('Pelvis').distanceTo(pelvis) < .001 && point('Head').y > head.y + .15, id + ' upper-body curl');
    if (key === 'Toe_Touchers') {
      toes.forEach((region, i) => {
        const gap = minDistance(region);
        assert.ok(gap < .012 && gap < initialGaps[i] - .12,
          `${id} ${sides[i]} fingertip-to-toe reach ${gap.toFixed(3)} m`);
      });
    } else {
      assert.ok(feet[0].x < 0 && feet[1].x > 0 && feet[0].y > feet[1].y + .09, id + ' ankles stay crossed');
      assert.ok(point('HandL').x < 0 && point('HandR').x > 0, id + ' arms stay crossed');
    }
  }

  action.stop();
  assert.deepEqual(rest(), original, id + ' unbind restores the rig');
  console.log(`${name}: ${clip.duration.toFixed(2)} s, ${times.length} floor samples, minimum Y ${(lowest * 1000).toFixed(1)} mm`);
}
