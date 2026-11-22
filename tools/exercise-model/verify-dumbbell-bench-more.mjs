import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { attachDumbbells, createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createEntries } from './dumbbell-bench-more.mjs';
import { createDumbbell } from './dumbbell.mjs';
import { createFlatBench } from './flat-bench.mjs';
import { createInclineBench } from './incline-bench.mjs';
import { handAlong } from './hand-frame.mjs';

const flat = 'Pad', seat = 'Seat pad', back = 'Backrest pad';
const table = {
  'Bent-Arm_Dumbbell_Pullover': [[flat, 'Chest']],
  'Close-Grip_Dumbbell_Press': [[flat, 'Chest']],
  Dumbbell_Lying_Supination: [[flat, 'Pelvis'], [flat, 'Chest'], [flat, 'ArmR']],
  Dumbbell_Shoulder_Press: [[seat, 'Pelvis'], [back, 'Chest']],
  Flexor_Incline_Dumbbell_Curls: [[seat, 'Pelvis'], [back, 'Chest']],
  Hammer_Grip_Incline_DB_Bench_Press: [[seat, 'Pelvis'], [back, 'Chest']],
  Incline_Dumbbell_Flyes: [[seat, 'Pelvis'], [back, 'Chest']],
  Lying_Supine_Dumbbell_Curl: [[flat, 'Pelvis'], [flat, 'Chest'], [flat, 'Head']],
  'Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench': [[flat, 'ForearmL'], [flat, 'ForearmR']],
  'Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench': [[flat, 'ForearmL'], [flat, 'ForearmR']],
  Reverse_Flyes: [[back, 'Chest'], [back, 'Lumbar']],
  'Seated_Bent-Over_One-Arm_Dumbbell_Triceps_Extension': [[flat, 'ThighL'], [flat, 'ThighR']],
  'Seated_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension': [[flat, 'ThighL'], [flat, 'ThighR']],
  Seated_Dumbbell_Inner_Biceps_Curl: [[flat, 'Pelvis']],
  'Seated_Dumbbell_Palms-Up_Wrist_Curl': [[flat, 'ThighL'], [flat, 'ThighR']],
  'Seated_One-Arm_Dumbbell_Palms-Down_Wrist_Curl': [[flat, 'ThighL'], [flat, 'ThighR']],
  'Seated_One-Arm_Dumbbell_Palms-Up_Wrist_Curl': [[flat, 'ThighL'], [flat, 'ThighR']],
  Seated_Side_Lateral_Raise: [[flat, 'Pelvis']],
  'Standing_One-Arm_Dumbbell_Curl_Over_Incline_Bench': [[back, 'ArmL'], [back, 'HandR']],
  'Straight-Arm_Dumbbell_Pullover': [[flat, 'Chest']],
};

const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const catalog = JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url)));
const { scene } = asset;
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
const prefix = 'local:exercise:';
assert.deepEqual(Object.keys(entries).sort(), Object.keys(table).map((id) => prefix + id).sort());

const grip = createDumbbellGripTracks(scene);
const attached = attachDumbbells(scene, createDumbbell);
const standalone = createDumbbell();
const mixer = new THREE.AnimationMixer(scene);
const propMixer = new THREE.AnimationMixer(standalone);
const skin = [];
const materials = new Set();
const point = new THREE.Vector3();
const local = new THREE.Vector3();
const world = (name) => scene.getObjectByName(name).getWorldPosition(new THREE.Vector3());
const atlas = (name) => name === 'lats' ? 'Upper back' : name[0].toUpperCase() + name.slice(1);

scene.traverse((mesh) => {
  if (!mesh.isSkinnedMesh) return;
  materials.add(mesh.material.name);
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  for (let i = 0; i < skinIndex.count; i++) {
    let dominant = 0;
    for (let j = 1; j < 4; j++) {
      if (skinWeight.getComponent(i, j) > skinWeight.getComponent(i, dominant)) dominant = j;
    }
    skin.push([mesh, i, mesh.skeleton.bones[skinIndex.getComponent(i, dominant)].name]);
  }
});

function padsFor(entry) {
  const transform = entry.benchTransform;
  const fixture = entry.equipment.startsWith('incline-') ? createInclineBench(transform) : createFlatBench();
  fixture.position.fromArray(transform?.position ?? [0, 0, 0]);
  fixture.rotation.y = transform?.yaw ?? 0;
  fixture.updateMatrixWorld(true);
  return [flat, seat, back].flatMap((name) => {
    const pad = fixture.getObjectByName(name);
    if (!pad) return [];
    pad.geometry.computeBoundingBox();
    const box = pad.geometry.boundingBox.clone();
    // The flat pad is extruded along local Z and turned horizontal by its mesh transform.
    if (name === flat) box.applyMatrix4(pad.matrix);
    return [{ name, box, inverse: (name === flat ? fixture : pad).matrixWorld.clone().invert() }];
  });
}

const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual}, expected ${expected} ± ${tolerance}`);

function checkTracks(clip) {
  for (const track of clip.tracks) {
    assert.ok(track.validate() && track.values.every(Number.isFinite), clip.name + ' ' + track.name);
    const size = track.getValueSize();
    if (track.times.length > 1) near(track.times.at(-1), clip.duration, 1e-6, track.name + ' final key');
    for (let i = 0; i < size; i++) near(track.values[i], track.values.at(i - size), 1e-6, track.name + ' loop');
    if (size === 4) {
      for (let i = 0; i < track.values.length; i += size) {
        near(Math.hypot(...track.values.slice(i, i + size)), 1, 1e-5, track.name + ' unit quaternion');
        if (i < size) continue;
        const dot = track.values.slice(i, i + size).reduce((sum, value, j) => sum + value * track.values[i - size + j], 0);
        assert.ok(Math.abs(dot) > .99, clip.name + ' discontinuous ' + track.name + ' at ' + track.times[i]);
      }
    }
  }
}

function headDistance(p) {
  const axial = Math.abs(p.x);
  const edge = Math.max(Math.abs(p.y), Math.abs(.5 * p.y + .8660254 * p.z),
    Math.abs(-.5 * p.y + .8660254 * p.z));
  return Math.max(.066 - axial, axial - .112, edge - .055 * Math.cos(Math.PI / 6));
}

const paths = new Set();
for (const [suffix, supports] of Object.entries(table)) {
  const id = prefix + suffix;
  const entry = entries[id];
  const { name, clip, propClip, equipment } = entry;
  const row = catalog.find((row) => row.id === id);
  assert.equal(row.equipment, 'DUMBBELL', id);
  assert.equal(name, row.name, id);
  assert.equal(clip.name, name, id);
  assert.equal(entry.framing, 'bench', id);
  assert.deepEqual(entry.primary, row.primaryMuscles.map(atlas), id);
  assert.deepEqual([...entry.supporting].sort(), row.secondaryMuscles.map(atlas).sort(), id);
  assert.ok([...entry.primary, ...entry.supporting].every((muscle) => materials.has(muscle)), id);
  assert.ok(entry.phases.every(([time, label], i) => label && time >= 0 && time < clip.duration
    && (i === 0 || time > entry.phases[i - 1][0])), id);
  assert.ok(entry.cues.length >= 2 && entry.cues.every(([time, title, body]) => title && body
    && entry.phases.some(([key]) => key === time)), id);
  checkTracks(clip);

  const cradle = /Pullover|Close-Grip/.test(suffix);
  const wrists = suffix.includes('Wrist_Curl');
  const kneeling = suffix.includes('Over_A_Bench');
  const singleRight = suffix.startsWith('Seated_One-Arm');
  const singleLeft = /Supination|One-Arm_Dumbbell_Triceps|Standing_One-Arm/.test(suffix);
  const activeSides = singleLeft ? ['L'] : singleRight ? ['R'] : ['L', 'R'];
  const fixture = supports.some(([pad]) => pad !== flat) ? 'incline-bench' : 'bench';
  assert.equal(equipment, cradle ? 'bench-cradle-dumbbell'
    : fixture + (singleLeft ? '-dumbbell-left' : singleRight ? '-dumbbell-right' : '-dumbbells'), id);
  assert.equal(Boolean(propClip), cradle, id);
  if (cradle) {
    assert.equal(entry.grip, 'two-hand-head-cradle', id);
    assert.equal(clip.duration, propClip.duration, id);
    assert.deepEqual(propClip.tracks.map(({ name }) => name), ['.position', '.quaternion'], id);
    checkTracks(propClip);
    for (const { times } of propClip.tracks) assert.deepEqual(times, clip.tracks[0].times, id + ' synchronized keys');
  } else {
    for (const side of activeSides) {
      for (const track of grip.filter(({ name }) => name.endsWith(side + '.quaternion'))) {
        assert.deepEqual(clip.tracks.find(({ name }) => name === track.name)?.values, track.values, id + ' ' + track.name);
      }
    }
  }
  assert.deepEqual(entry.dumbbellOffsets, suffix === 'Flexor_Incline_Dumbbell_Curls' ? [-.008, .008] : undefined);
  attached.forEach((prop, i) => {
    prop.position.copy(dumbbellGripTransform(1 - 2 * i).position);
    prop.translateX(entry.dumbbellOffsets?.[i] ?? 0);
  });
  const pads = padsFor(entry);
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
  action.paused = true;
  const propAction = propClip && propMixer.clipAction(propClip).setLoop(THREE.LoopOnce, 1).play();
  if (propAction) propAction.paused = true;
  const drawn = cradle ? [standalone] : activeSides.map((side) => attached['LR'.indexOf(side)]);
  const times = [...new Set([...Array.from({ length: 37 }, (_, i) => i / 10), ...entry.phases.map(([time]) => time)])];
  const anchors = [], starts = {}, travel = drawn.map(() => 0), path = [];
  const wristTurns = {}, startTurns = {}, keyPoses = new Map();
  const fixedElbows = /Curl|Extension|Supination/.test(suffix);
  const sideLying = suffix.includes('Lying_Supination');
  const preacher = suffix.startsWith('Standing_One');
  const metrics = { floor: Infinity, propFloor: Infinity, depth: 0, propDepth: 0, weightPad: 0,
    overlap: Infinity, palm: 0, thumb: 0, fingers: 0, support: {}, brace: {} };
  for (const time of times) {
    const at = suffix + ' at ' + time + 's';
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    if (singleRight) {
      const hand = scene.getObjectByName('HandL');
      assert.ok(hand.position.angleTo(handAlong(1).applyQuaternion(hand.quaternion)) < .8, at + ' support wrist');
    }
    if (cradle) {
      const { box, inverse } = pads[0];
      const hip = world('Pelvis').applyMatrix4(inverse);
      const head = world('Head').applyMatrix4(inverse);
      assert.ok(hip.y < box.max.y && hip.x < box.min.x && head.x > box.max.x, at + ' cross-bench setup');
    }
    if (propAction) {
      propAction.time = time;
      propMixer.update(0);
      standalone.updateMatrixWorld(true);
    }

    for (const side of ['L', 'R']) {
      const ankle = world('Foot' + side);
      starts['Foot' + side] ??= ankle;
      near(ankle.distanceTo(starts['Foot' + side]), 0, .0005, at + ' fixed foot ' + side);
    }
    for (const side of activeSides) {
      const elbow = world('Forearm' + side);
      const wrist = world('Hand' + side);
      starts['Forearm' + side] ??= elbow;
      starts['Hand' + side] ??= wrist;
      if (fixedElbows) near(elbow.distanceTo(starts['Forearm' + side]), 0, .0005, at + ' fixed elbow ' + side);
      if (wrists) {
        near(wrist.distanceTo(starts['Hand' + side]), 0, .0005, at + ' fixed wrist ' + side);
        for (const name of ['Hand', 'Forearm']) {
          const key = name + side;
          const turn = scene.getObjectByName(key).getWorldQuaternion(new THREE.Quaternion());
          startTurns[key] ??= turn;
          const change = turn.angleTo(startTurns[key]);
          if (name === 'Hand') wristTurns[side] = Math.max(wristTurns[side] ?? 0, change);
          else near(change, 0, .002, at + ' forearm rotation ' + side);
        }
      }
    }

    const centers = drawn.map((prop) => prop.getWorldPosition(new THREE.Vector3()));
    if (time === 0 || time === entry.phases[2][0]) {
      const elbow = activeSides.map((side) => {
        const joint = world('Forearm' + side);
        return joint.clone().sub(world('Arm' + side)).angleTo(world('Hand' + side).sub(joint));
      });
      keyPoses.set(time, { centers, elbow });
    }
    const axis = centers.length === 2 ? centers[1].clone().sub(centers[0]).normalize() : null;
    const limits = [-Infinity, Infinity];
    for (const [i, prop] of drawn.entries()) {
      anchors[i] ??= centers[i];
      travel[i] = Math.max(travel[i], centers[i].distanceTo(anchors[i]));
      if (entry.phases.some(([key]) => key === time)) {
        path.push(...centers[i].toArray(), ...prop.getWorldQuaternion(new THREE.Quaternion()).toArray());
      }
      for (const child of prop.children) {
        const { position } = child.geometry.attributes;
        for (let j = 0; j < position.count; j++) {
          point.fromBufferAttribute(position, j).applyMatrix4(child.matrixWorld);
          metrics.propFloor = Math.min(metrics.propFloor, point.y);
          if (axis) {
            const distance = point.dot(axis);
            limits[i] = i === 0 ? Math.max(limits[0], distance) : Math.min(limits[1], distance);
          }
          for (const { box, inverse } of pads) {
            local.copy(point).applyMatrix4(inverse);
            if (box.containsPoint(local)) metrics.weightPad = Math.max(metrics.weightPad, box.max.y - local.y);
          }
        }
      }
    }
    if (axis) metrics.overlap = Math.min(metrics.overlap, limits[1] - limits[0]);

    const inverseProps = drawn.map((prop) => prop.matrixWorld.clone().invert());
    const palms = [Infinity, Infinity], thumbs = [Infinity, Infinity], fingers = [Infinity, Infinity];
    const contacts = supports.map(() => Infinity);
    const regions = {};
    const sole = { FootL: Infinity, FootR: Infinity, ShinL: Infinity, ShinR: Infinity };
    let chestEdge = Infinity;
    for (const [mesh, i, bone] of skin) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      if (bone in sole) sole[bone] = Math.min(sole[bone], point.y);
      metrics.floor = Math.min(metrics.floor, point.y);
      if ((wrists && !kneeling && time === 0 && /^(Forearm|Thigh)[LR]$/.test(bone))
        || (time === 0 && /Supination/.test(suffix) && /^(Head|ForearmR|HandR)$/.test(bone))) {
        (regions[bone] ??= []).push(point.clone());
      }
      for (const { name: pad, box, inverse } of pads) {
        local.copy(point).applyMatrix4(inverse);
        if (preacher && bone === 'Chest' && pad === back && local.z > .29) {
          chestEdge = Math.min(chestEdge, box.distanceToPoint(local));
        }
        if (local.x < box.min.x + .006 || local.x > box.max.x - .006
          || local.z < box.min.z + .006 || local.z > box.max.z - .006) continue;
        const gap = local.y - box.max.y;
        const index = supports.findIndex(([name, joint]) => pad === name && bone === joint);
        if (index >= 0) contacts[index] = Math.min(contacts[index], gap);
        if (local.y >= box.min.y) metrics.depth = Math.max(metrics.depth, -gap);
      }
      for (const [j, inverse] of inverseProps.entries()) {
        local.copy(point).applyMatrix4(inverse);
        if (Math.abs(local.x) > .14 || Math.abs(local.y) > .08 || Math.abs(local.z) > .08) continue;
        const radial = Math.hypot(local.y, local.z);
        const head = headDistance(local);
        const depth = -Math.min(head, Math.max(Math.abs(local.x) - .066, radial - .014));
        if (depth > metrics.propDepth) {
          metrics.propDepth = depth;
          metrics.propBone = bone;
        }
        if (cradle && local.x > .047) {
          const side = 'LR'.indexOf(bone.at(-1));
          if (side < 0) continue;
          if (bone.startsWith('Thumb')) thumbs[side] = Math.min(thumbs[side], Math.abs(head));
          if (bone.startsWith('Hand') && local.y * (1 - 2 * side) > .010 && radial < .052) {
            palms[side] = Math.min(palms[side], Math.abs(local.x - .066));
          }
        } else if (!cradle && Math.abs(local.x) < .066 && bone.endsWith(activeSides[j])) {
          const gap = Math.abs(radial - .014);
          if (bone.startsWith('Hand') && Math.abs(local.x) < .020) palms[j] = Math.min(palms[j], gap);
          if (bone.startsWith('Thumb3')) thumbs[j] = Math.min(thumbs[j], gap);
          if (/^(Index|Middle|Ring|Little)3/.test(bone)) fingers[j] = Math.min(fingers[j], gap);
        }
      }
    }
    contacts.forEach((gap, i) => {
      const key = supports[i].join('/');
      metrics.support[key] = Math.max(metrics.support[key] ?? 0, Math.abs(gap));
    });
    metrics.palm = Math.max(metrics.palm, ...palms.slice(0, activeSides.length));
    metrics.thumb = Math.max(metrics.thumb, ...thumbs.slice(0, activeSides.length));
    if (!cradle) metrics.fingers = Math.max(metrics.fingers, ...fingers.slice(0, activeSides.length));
    if (!sideLying) {
      for (const side of ['L', 'R']) {
        near(sole[(kneeling ? 'Shin' : 'Foot') + side], 0, .010, at + ' floor contact ' + side);
      }
    }
    if (preacher) metrics.brace.chest = Math.max(metrics.brace.chest ?? 0, chestEdge);
    const regionGap = (first, second) => {
      let gap = Infinity;
      for (const a of regions[first]) for (const b of regions[second]) gap = Math.min(gap, a.distanceToSquared(b));
      return Math.sqrt(gap);
    };
    if (time === 0 && wrists && !kneeling) {
      for (const side of activeSides) metrics.brace[side] = regionGap('Forearm' + side, 'Thigh' + side);
    }
    if (time === 0 && suffix.includes('Supination')) {
      metrics.brace.head = Math.min(regionGap('Head', 'ForearmR'), regionGap('Head', 'HandR'));
    }
  }

  assert.ok(travel.every((distance) => distance > (wrists ? .065 : .19)), id + ' dumbbell travel ' + travel);
  if (wrists) assert.ok(activeSides.every((side) => wristTurns[side] > 1), id + ' wrist range');
  const start = keyPoses.get(0);
  const peak = keyPoses.get(entry.phases[2][0]);
  if (suffix.includes('Pullover')) {
    assert.ok(peak.centers[0].z < start.centers[0].z - .35 && peak.centers[0].z < world('Head').z - .15, id + ' overhead arc');
    assert.ok(start.elbow.every((angle) => suffix.startsWith('Bent') ? angle > .85 : angle < .52), id + ' starting elbow bend');
    peak.elbow.forEach((angle, i) => near(angle, start.elbow[i], .095, id + ' fixed elbow bend'));
  }
  if (suffix.includes('Close-Grip')) {
    assert.ok(peak.centers[0].y < start.centers[0].y - .24, id + ' lowers toward chest');
    assert.ok(peak.elbow.every((angle, i) => angle > start.elbow[i] + 1.1), id + ' pressing elbow range');
  }
  if (sideLying) {
    [...start.elbow, ...peak.elbow].forEach((angle) => near(angle, Math.PI / 2, .01, id + ' right-angle elbow'));
    assert.ok(peak.centers[0].y > start.centers[0].y + .25, id + ' external rotation');
  }
  assert.ok(metrics.floor > -.010 && metrics.propFloor > .01, id + ' floor clearance');
  assert.ok(metrics.depth < .013 && metrics.weightPad < .003, id + ' bench clearance ' + JSON.stringify(metrics));
  assert.ok(metrics.overlap > -.002, id + ' overlapping weights ' + metrics.overlap);
  assert.ok(metrics.propDepth < .004, id + ' weight intersects ' + metrics.propBone);
  near(metrics.palm, 0, cradle ? .003 : .002, id + ' palm contact');
  near(metrics.thumb, 0, .003, id + ' thumb contact');
  if (!cradle) near(metrics.fingers, 0, .003, id + ' distal finger contact');
  for (const [region, gap] of Object.entries(metrics.support)) near(gap, 0, .020, id + ' pad support ' + region);
  for (const [region, gap] of Object.entries(metrics.brace)) near(gap, 0, region === 'chest' ? .035 : .014, id + ' brace ' + region);
  const signature = path.map((value) => value.toFixed(4)).join(',');
  assert.ok(!paths.has(signature), id + ' duplicates another dumbbell path');
  paths.add(signature);
  console.log(`${name} — ${times.length} samples, ${(Math.min(...travel) * 100).toFixed(1)} cm minimum dumbbell travel`);
  action.stop();
  propAction?.stop();
}

console.log(`Verified ${paths.size} distinct bench and seated dumbbell clips.`);
