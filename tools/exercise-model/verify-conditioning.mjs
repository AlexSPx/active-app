import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { handAlong, handDorsal, measurePalmContacts } from './hand-frame.mjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createEntries } from './bodyweight-conditioning.mjs';
import { createExerciseClips } from './clips.mjs';
import { createEntries as createFloor } from './bodyweight-floor.mjs';
import { createEntries as createStanding } from './bodyweight-standing.mjs';
import { createEntries as createMobility } from './mobility-exercises.mjs';

const bytes = await readFile(new URL('./anatomy.glb', import.meta.url));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .parseAsync(Uint8Array.from(bytes).buffer, '');
const catalog = new Map(JSON.parse(await readFile(
  new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url),
)).map(({ id, name }) => [id, name]));
const { scene } = asset;
const point = (name) => scene.getObjectByName(name).getWorldPosition(new THREE.Vector3());
const startPelvis = point('Pelvis');
const entries = createEntries(asset);
assert.deepEqual(point('Pelvis'), startPelvis, 'Authoring must leave the runtime rig at rest');

const meshes = [];
const rigidToes = {};
const shoulderContact = { ArmL: [], ArmR: [], HandL: [], HandR: [] };
const materialNames = new Set();
scene.traverse((mesh) => {
  if (!mesh.isSkinnedMesh) return;
  materialNames.add(mesh.material.name);
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  const indices = ['getX', 'getY', 'getZ', 'getW'];
  const groups = Array.from({ length: position.count }, (_, i) => {
    const dominant = indices.reduce((best, axis) => skinWeight[axis](i) > skinWeight[best](i) ? axis : best);
    const name = mesh.skeleton.bones[skinIndex[dominant](i)].name;
    const group = /[123][LR]$/.test(name) ? 'Hand' + name.at(-1) : name;
    if (shoulderContact[group] && skinWeight[dominant](i) > .55 && !name.startsWith('Thumb')) {
      const joint = scene.getObjectByName(group);
      const local = joint.worldToLocal(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
      const palmDistance = local.dot(handAlong(group.endsWith('L') ? 1 : -1));
      const nearShoulder = group.startsWith('Arm') && local.length() < .105;
      const onPalm = group.startsWith('Hand') && palmDistance > .035 && palmDistance < .14 && local.dot(handDorsal()) < -.005;
      if (nearShoulder || onPalm) {
        shoulderContact[group].push([mesh, i]);
      }
    }
    return group;
  });
  for (const side of ['L', 'R']) {
    const name = 'Foot' + side;
    const joint = scene.getObjectByName(name);
    const index = mesh.skeleton.bones.indexOf(joint);
    for (let i = 0; i < position.count; i++) {
      if (skinIndex.getX(i) !== index || skinWeight.getX(i) <= .999) continue;
      const local = joint.worldToLocal(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
      if (!rigidToes[name] || local.z > rigidToes[name].z) rigidToes[name] = local;
    }
  }
  meshes.push({ mesh, groups });
});

const prefix = 'local:exercise:';
const travel = {
  Frog_Hops: { delta: [0, 0, .96], launch: .65, land: 1.15 },
  Side_Standing_Long_Jump: { delta: [-1.16, 0, 0], launch: .72, land: 1.22 },
};
assert.deepEqual(Object.keys(entries).sort(), [
  'Frog_Hops', 'Frog_Sit-Ups', 'Jackknife_Sit-Up', 'Mountain_Climbers', 'Push_Up_to_Side_Plank',
  'Side_Standing_Long_Jump', 'Spider_Crawl',
].map((key) => prefix + key).sort());
for (const family of [createExerciseClips, createFloor, createStanding, createMobility]) {
  for (const id of Object.keys(family(asset))) assert.ok(!entries[id], id + ' already exists');
}

const hands = ['HandL', 'HandR'];
const feet = ['FootL', 'FootR'];
const pointDistance = (a, b) => point(a).distanceTo(point(b));
const measurePalm = measurePalmContacts(scene);
const mixer = new THREE.AnimationMixer(scene);
const vertex = new THREE.Vector3();
for (const [id, { name, primary, supporting, framing, clip, phases, cues }] of Object.entries(entries)) {
  const key = id.slice(prefix.length);
  const jump = travel[key];
  assert.equal(name, catalog.get(id), id);
  assert.equal(framing, jump ? 'standing' : 'floor', id);
  assert.ok(clip.validate(), id);
  assert.ok([...primary, ...supporting].every((muscle) => materialNames.has(muscle)), id);
  for (const markers of [phases, cues]) {
    assert.ok(markers.length && markers.every(([time], i) =>
      time >= (markers[i - 1]?.[0] ?? 0) && time <= clip.duration), id + ' marker times');
  }
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
  action.paused = true;
  function sample(time) {
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    const lows = {};
    let leftInside = Infinity;
    let rightInside = -Infinity;
    for (const { mesh, groups } of meshes) {
      for (let i = 0; i < groups.length; i++) {
        mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
        const y = vertex.y;
        const group = groups[i];
        lows[group] = Math.min(lows[group] ?? Infinity, y);
        if (group === 'FootL') leftInside = Math.min(leftInside, vertex.x);
        if (group === 'FootR') rightInside = Math.max(rightInside, vertex.x);
      }
    }
    const toePoint = Object.fromEntries(feet.map((foot) =>
      [foot, scene.getObjectByName(foot).localToWorld(rigidToes[foot].clone())]));
    return { lows, soleGap: leftInside - rightInside, toePoint };
  }
  const joints = clip.tracks.map((track) => {
    const [joint, property] = track.name.split('.');
    return scene.getObjectByName(joint)[property];
  });
  const distance = (a, b) => a.isQuaternion ? a.angleTo(b) : a.distanceTo(b);
  const firstSample = sample(0);
  const start = joints.map((transform) => transform.clone());
  const anchors = Object.fromEntries([...hands, ...feet, 'Head', 'Chest', 'Pelvis', 'ShinL', 'ShinR']
    .map((joint) => [joint, point(joint)]));
  const palmAnchors = Object.fromEntries(['L', 'R'].map((side) => [side, measurePalm(side).rotation]));
  sample(clip.duration);
  for (const [i, transform] of joints.entries()) {
    if (jump && transform.isVector3) {
      assert.ok(transform.clone().sub(start[i]).distanceTo(new THREE.Vector3(...jump.delta)) < .001, id + ' travel');
    } else {
      assert.ok(distance(transform, start[i]) < .001, id + ' endpoint pose');
    }
  }

  if (['Push_Up_to_Side_Plank', 'Jackknife_Sit-Up', 'Side_Standing_Long_Jump'].includes(key)) {
    const names = ['ForearmL', 'ForearmR', ...hands];
    if (key !== 'Push_Up_to_Side_Plank') names.push('ArmL', 'ArmR');
    const armJoints = names.map((joint) => scene.getObjectByName(joint));
    let previous;
    for (let frame = 0; frame <= Math.floor(clip.duration * 60); frame++) {
      action.time = frame / 60;
      mixer.update(0);
      scene.updateMatrixWorld(true);
      const rotations = armJoints.map((joint) => joint.getWorldQuaternion(new THREE.Quaternion()));
      if (previous) rotations.forEach((rotation, i) => assert.ok(rotation.angleTo(previous[i]) < .27,
        `${name} ${armJoints[i].name} snaps at ${action.time}`));
      previous = rotations;
    }
  }

  const n = Math.ceil(clip.duration * 30);
  const times = new Set([...Array.from({ length: n + 1 }, (_, i) => clip.duration * i / n),
    ...phases.map(([at]) => at)]);
  let minFloor = Infinity;
  let motion = 0;
  for (const time of times) {
    const { lows, soleGap, toePoint } = sample(time);
    const at = (marker) => Math.abs(time - marker) < .0001;
    for (const [i, transform] of joints.entries()) {
      assert.ok(transform.toArray().every(Number.isFinite), id + ' finite transforms');
      motion = Math.max(motion, distance(transform, start[i]));
    }
    minFloor = Math.min(minFloor, ...Object.values(lows));
    assert.ok(minFloor >= -.009, `${name} mesh clearance at ${time}: ${minFloor}`);
    const contact = (group) => assert.ok(lows[group] <= .012, `${name} ${group} contact at ${time}: ${lows[group]}`);
    const fixed = (group) => {
      contact(group);
      assert.ok(point(group).distanceTo(anchors[group]) < .003, `${name} ${group} moved at ${time}`);
    };

    const twoPalms = key === 'Mountain_Climbers' || key === 'Spider_Crawl'
      || (key === 'Push_Up_to_Side_Plank' && (time <= 1.5 || (time >= 3.2 && time <= 4.7) || at(6.4)));
    const supportSides = twoPalms || (key === 'Jackknife_Sit-Up' && (at(0) || at(clip.duration)))
      ? ['L', 'R']
      : key === 'Push_Up_to_Side_Plank' ? [time < 3.2 ? 'L' : 'R'] : [];
    for (const side of supportSides) {
      const { heel, knuckles, dorsal, direction, bend, deviation, wristRoll, rotation } = measurePalm(side);
      const label = `${name} Hand${side} at ${time}`;
      assert.ok(lows['Hand' + side] >= -.002 && heel <= .009 && knuckles <= .009,
        `${label} heel/knuckle clearance: ${lows['Hand' + side]}, ${heel}, ${knuckles}`);
      assert.ok(dorsal.y > .99 && direction.z * (key === 'Jackknife_Sit-Up' ? -1 : 1) > .97,
        label + ' palm down, fingers along the floor');
      assert.ok(bend < 1.65 && deviation < .55 && wristRoll < .02, label + ' wrist articulation');
      assert.ok(rotation.angleTo(palmAnchors[side]) < .01, label + ' planted palm twists');
    }
    if (key === 'Push_Up_to_Side_Plank' && !twoPalms) {
      const free = time < 3.2 ? 'R' : 'L';
      const { bend, deviation, wristRoll } = measurePalm(free);
      assert.ok(lows['Hand' + free] >= -.002, `${name} free hand penetrates at ${time}`);
      assert.ok(bend < 1.3 && deviation < .45 && wristRoll < .02,
        `${name} free wrist articulation at ${time}: ${bend}, ${deviation}, ${wristRoll}`);
    }

    if (key === 'Mountain_Climbers' || key === 'Spider_Crawl') {
      hands.forEach(fixed);
      if (key === 'Spider_Crawl') {
        const base = at(0) || at(2) || at(4);
        if (base) feet.forEach(fixed);
        else fixed(time < 2 ? 'FootR' : 'FootL');
        if (at(0)) {
          const elbow = point('ForearmL');
          const angle = point('ArmL').sub(elbow).angleTo(point('HandL').sub(elbow));
          assert.ok(angle > 1.3 && angle < 2.15, `Spider Crawl low-plank elbow angle: ${angle}`);
        }
        if (at(1) || at(3)) {
          const side = at(1) ? 'L' : 'R';
          const knee = point('Shin' + side);
          const elbow = point('Forearm' + side);
          assert.ok(Math.abs(knee.x) > Math.abs(elbow.x) && knee.distanceTo(elbow) < .30);
        }
      } else if (time <= .15 || (time >= .35 && time <= .50) || at(.70)) {
        const left = time <= .15 || at(.70);
        contact(left ? 'FootR' : 'FootL');
        const knee = point(left ? 'ShinL' : 'ShinR');
        assert.ok(Math.abs(knee.z - anchors.Pelvis.z) < .15 && knee.y < anchors.Pelvis.y - .27);
      }
    }

    if (key === 'Push_Up_to_Side_Plank') {
      const axes = ['L', 'R'].map((side) => {
        const hip = point('Thigh' + side);
        const knee = point('Shin' + side);
        const ankle = point('Foot' + side);
        assert.ok(knee.clone().sub(hip).angleTo(ankle.clone().sub(knee)) < .45,
          `${name} knee folds at ${time}: ${side}`);
        return ankle.sub(hip);
      });
      if (time <= 1.5 || (time >= 3.2 && time <= 4.7) || at(6.4)) {
        [...hands, ...feet].forEach(fixed);
      } else {
        const left = time < 3.2;
        const side = left ? 'L' : 'R';
        fixed('Hand' + side);
        contact('Foot' + side);
        const baseToe = firstSample.toePoint['Foot' + side];
        const drift = toePoint['Foot' + side].clone().setY(0).distanceTo(baseToe.clone().setY(0));
        assert.ok(drift < .008, `Side plank supporting toe slides at ${time}: ${drift}`);
        if (at(2.4) || at(5.6)) {
          const free = left ? 'R' : 'L';
          const stack = point('Foot' + free).sub(point('Foot' + side));
          assert.ok(stack.y > .06 && stack.length() < .085 && Math.abs(stack.x) < .015,
            `${name} upper ankle must stack above the supporting ankle`);
          assert.ok(axes[0].angleTo(axes[1]) < .18, `${name} legs must align at ${time}`);
          assert.ok(point('Hand' + free).y - point('Arm' + free).y > .47);
        }
      }
      if (at(.8) || at(4)) assert.ok(anchors.Chest.y - point('Chest').y > .15);
    }

    if (key === 'Jackknife_Sit-Up' || key === 'Frog_Sit-Ups') {
      fixed('Pelvis');
      if (at(0) || at(clip.duration)) {
        ['Chest', 'Head', ...feet].forEach(contact);
        if (key === 'Jackknife_Sit-Up') hands.forEach(contact);
      }
      if (key === 'Jackknife_Sit-Up' && at(1.1)) {
        assert.ok(point('Head').y > anchors.Head.y + .32);
        for (const side of ['L', 'R']) {
          const hip = point('Thigh' + side);
          const knee = point('Shin' + side);
          const ankle = point('Foot' + side);
          const leg = ankle.clone().sub(hip);
          assert.ok(Math.atan2(leg.y, leg.z) > .61 && Math.atan2(leg.y, leg.z) < .80);
          assert.ok(hip.clone().sub(knee).angleTo(ankle.sub(knee)) > 2.80);
          assert.ok(point('Hand' + side).y > point('Arm' + side).y + .28);
        }
      }
      if (key === 'Frog_Sit-Ups') {
        feet.forEach(fixed);
        assert.ok(Math.abs(soleGap) < .025, 'Frog Sit-Ups sole gap: ' + soleGap);
        assert.ok(pointDistance('ShinL', 'ShinR') > .70 && pointDistance('FootL', 'FootR') < .15);
        assert.ok(lows.ThighL < .035 && lows.ThighR < .035);
        if (at(.95)) assert.ok(point('Head').y - anchors.Head.y > .13);
        if (at(0) || at(.95) || at(1.65) || at(clip.duration)) {
          const vertices = (group) => shoulderContact[group].map(([mesh, i]) =>
            mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
          for (const [side, opposite] of [['L', 'R'], ['R', 'L']]) {
            const shoulder = vertices('Arm' + opposite);
            const palm = vertices('Hand' + side);
            const gap = Math.min(...palm.map((p) => shoulder.reduce((min, q) => Math.min(min, p.distanceTo(q)), Infinity)));
            assert.ok(gap < .008, `${name} Hand${side} to opposite shoulder at ${time}: ${gap}`);
            assert.ok(measurePalm(side).dorsal.y > .90, `${name} palm faces the shoulder`);
          }
        }
      }
    }

    if (jump) {
      if (time <= jump.launch || time >= jump.land) {
        feet.forEach(contact);
        for (const foot of feet) {
          const expected = firstSample.toePoint[foot].clone();
          if (time >= jump.land) expected.add(new THREE.Vector3(...jump.delta));
          assert.ok(toePoint[foot].clone().setY(0).distanceTo(expected.setY(0)) < .014,
            `${name} ${foot} stance slides at ${time}`);
        }
      }
      if (at((jump.launch + jump.land) / 2)) {
        assert.ok(feet.every((foot) => lows[foot] > .20), name + ' feet clear the floor');
        assert.ok(point('Pelvis').distanceTo(anchors.Pelvis) > .55, name + ' travels while airborne');
      }
      if (key === 'Frog_Hops') {
        for (const hand of hands) {
          const wrist = point(hand);
          const head = point('Head');
          assert.ok(wrist.distanceTo(head) < .16 && wrist.z < head.z);
          const { bend, deviation, wristRoll } = measurePalm(hand.at(-1));
          assert.ok(bend < .55 && deviation < .40 && wristRoll < .02, `${name} ${hand} wrist at ${time}`);
        }
      }
    }
  }
  assert.ok(motion > .25, name + ' expected motion');
  console.log(`${id} · ${jump ? 'travel ' + jump.delta.join(', ') : 'closed loop'} · minimum mesh Y ${minFloor.toFixed(4)} m`);
  action.stop();
}
