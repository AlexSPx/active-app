import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createBarbell } from './barbell.mjs';
import { handAlong } from './hand-frame.mjs';
import { checkBarGrip } from './verify-barbell.mjs';
import { createEntries, q, v, X, sides } from './barbell-standing-more.mjs';

const prefix = 'local:exercise:';
const read = (path) => readFile(new URL(path, import.meta.url));
const atlasName = (name) => ({
  abdominals: 'Core', traps: 'Upper back', lats: 'Upper back', 'middle back': 'Upper back', 'lower back': 'Upper back',
})[name] ?? name[0].toUpperCase() + name.slice(1);

function checkTracks(clip, label) {
  assert.ok(clip.validate(), label);
  assert.equal(new Set(clip.tracks.map((track) => track.name)).size, clip.tracks.length, label);
  for (const track of clip.tracks) {
    const at = label + ' ' + track.name;
    assert.ok(track.values.every(Number.isFinite), at);
    assert.equal(track.times[0], 0, at);
    assert.ok(track.times.every((time, i) => i === 0 || time > track.times[i - 1]), at);
    if (track.times.length > 1) assert.ok(Math.abs(track.times.at(-1) - clip.duration) < 1e-6, at);
    const size = track.getValueSize();
    const start = track.values.slice(0, size);
    const finish = track.values.slice(-size);
    if (size === 4) {
      for (let i = 0; i < track.values.length; i += size) {
        assert.ok(Math.abs(q().fromArray(track.values, i).length() - 1) < 1e-5, at);
      }
      assert.ok(Math.abs(q().fromArray(start).dot(q().fromArray(finish))) > .99999, at + ' loop');
    } else assert.ok(start.every((value, i) => Math.abs(value - finish[i]) < 1e-6), at + ' loop');
  }
}

export async function verifyFamily(factory, propFactory, expected, equipment, verify) {
  const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    Uint8Array.from(await read('./anatomy.glb')).buffer, '');
  const { scene } = asset;
  const catalog = new Map(JSON.parse(await read('../../apps/client/lib/data/exercise-catalog.json'))
    .map((item) => [item.id, item]));
  const entries = factory(asset, { createDumbbellGripTracks, dumbbellGripTransform });
  assert.deepEqual(Object.keys(entries).sort(), expected.map((id) => prefix + id).sort());
  const names = new Set();
  const skins = [];
  scene.traverse((object) => {
    if (object.isMesh) names.add(object.material.name);
    if (object.isSkinnedMesh) skins.push(object);
  });
  const point = (name) => scene.getObjectByName(name).getWorldPosition(v());
  const prop = propFactory();
  const bodyMixer = new THREE.AnimationMixer(scene);
  const propMixer = new THREE.AnimationMixer(prop);
  const motionSignatures = new Set();
  const geometry = [];
  prop.updateMatrixWorld(true);
  prop.traverse((part) => {
    if (!part.isMesh) return;
    const { position } = part.geometry.attributes;
    for (let i = 0; i < position.count; i++) geometry.push(v().fromBufferAttribute(position, i).applyMatrix4(part.matrixWorld));
  });

  for (const [key, entry] of Object.entries(entries)) {
    const id = key.slice(prefix.length);
    const source = catalog.get(key);
    assert.equal(source.equipment, equipment, id);
    assert.equal(entry.name, source.name, id);
    assert.deepEqual(entry.primary, [...new Set(source.primaryMuscles.map(atlasName))], id);
    assert.deepEqual(entry.supporting, [...new Set(source.secondaryMuscles.map(atlasName))].filter((m) => !entry.primary.includes(m)), id);
    assert.ok([...entry.primary, ...entry.supporting].every((name) => names.has(name)), id);
    assert.equal(entry.clip.duration, entry.propClip.duration, id);
    for (const markers of [entry.phases, entry.cues]) {
      assert.ok(markers.length >= 3, id);
      markers.forEach(([time, ...labels], i) => {
        assert.ok(time >= 0 && time <= entry.clip.duration && (!i || time > markers[i - 1][0]), id);
        assert.ok(labels.every((label) => label.trim()), id);
      });
    }
    checkTracks(entry.clip, id);
    checkTracks(entry.propClip, id + ' prop');
    const play = (mixer, clip) => mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
    const body = play(bodyMixer, entry.clip);
    const weight = play(propMixer, entry.propClip);
    body.paused = weight.paused = true;
    function at(time) {
      body.time = weight.time = time;
      bodyMixer.update(0);
      propMixer.update(0);
      scene.updateMatrixWorld(true);
      prop.updateMatrixWorld(true);
    }
    let floor = Infinity;
    let skinFloor = Infinity;
    let travel = 0;
    const signature = [];
    at(0);
    const start = prop.position.clone(), startFrame = prop.quaternion.clone();
    const samples = Math.ceil(entry.clip.duration * 30);
    const vertex = v();
    for (let i = 0; i <= samples; i++) {
      const time = (i === samples ? i : i + .37) * entry.clip.duration / samples;
      at(time);
      for (const local of geometry) floor = Math.min(floor, vertex.copy(local).applyMatrix4(prop.matrixWorld).y);
      travel = Math.max(travel, start.distanceTo(prop.position), .20 * startFrame.angleTo(prop.quaternion));
      if (i % 6 === 0 || i === samples) {
        for (const mesh of skins) {
          for (let j = 0; j < mesh.geometry.attributes.position.count; j += 4) {
            const height = mesh.getVertexPosition(j, vertex).applyMatrix4(mesh.matrixWorld).y;
            skinFloor = Math.min(skinFloor, height);
          }
        }
      }
      if (i % 13 === 0) signature.push(...prop.position, ...prop.quaternion);
    }
    assert.ok(floor >= -.003, id + ' prop floor clearance ' + floor);
    assert.ok(skinFloor >= -.009, id + ' skin floor clearance ' + skinFloor);
    assert.ok(travel > .040, id + ' prop movement ' + travel);
    assert.ok(!motionSignatures.has(signature.map((value) => value.toFixed(3)).join(',')), id + ' duplicated motion');
    motionSignatures.add(signature.map((value) => value.toFixed(3)).join(','));
    verify({ id, entry, at, scene, point, prop, floor });
    body.stop();
    weight.stop();
  }
  console.log('Verified ' + Object.keys(entries).length + ' ' + propFactory.name.slice(6).toLowerCase() + ' clips');
}

export function barGripVerifier(scene, prop) {
  const solids = checkBarGrip(scene);
  return (id, held, deep) => {
    const inverse = prop.matrixWorld.clone().invert();
    const seats = sides.filter(([side]) => held.includes(side)).map(([side, sign]) => ({
      hand: scene.getObjectByName('Hand' + side), ...dumbbellGripTransform(sign),
    }));
    for (const { hand, position, quaternion } of seats) {
      const seat = hand.localToWorld(position.clone()).applyMatrix4(inverse);
      assert.ok(Math.hypot(seat.y, seat.z) < .0025 && Math.abs(seat.x) < .585, id + ' hand seat ' + hand.name + ' ' + seat.toArray());
      const axis = X.clone().applyQuaternion(quaternion).applyQuaternion(hand.getWorldQuaternion(q()))
        .transformDirection(inverse);
      assert.ok(Math.abs(axis.x) > .999, id + ' shaft alignment ' + hand.name);
    }
    if (deep && held) solids(seats, id, (world) => {
      const local = world.clone().applyMatrix4(inverse);
      return Math.hypot(local.y, local.z) - .01425;
    });
  };
}

async function verify() {
  await verifyFamily(createEntries, createBarbell, [
    'Barbell_Lunge', 'Barbell_Side_Bend', 'Clean_Deadlift', 'Clean_Shrug', 'Close-Grip_Standing_Barbell_Curl',
    'Frankenstein_Squat', 'Front_Barbell_Squat', 'Jefferson_Squats', 'Narrow_Stance_Squats', 'Olympic_Squat',
    'Push_Press', 'Snatch_Deadlift', 'Snatch_Pull', 'Snatch_Shrug', 'Standing_Front_Barbell_Raise_Over_Head',
    'Stiff_Leg_Barbell_Good_Morning', 'Upright_Barbell_Row', 'Wide-Grip_Standing_Barbell_Curl',
    'Wide_Stance_Stiff_Legs', 'Wrist_Rotations_with_Straight_Bar',
  ], 'BARBELL', ({ id, entry, at, scene, prop, point, floor }) => {
    assert.equal(entry.equipment, 'barbell', id);
    const checkGrip = barGripVerifier(scene, prop);
    const held = id === 'Frankenstein_Squat' ? '' : 'LR';
    for (let frame = 0; frame <= 36; frame++) {
      at(frame * entry.clip.duration / 36);
      checkGrip(id, held, frame % 12 === 0);
      if (id === 'Wide_Stance_Stiff_Legs') {
        for (const [side] of sides) {
          const knee = point('Shin' + side);
          const bend = point('Thigh' + side).sub(knee).angleTo(point('Foot' + side).sub(knee));
          assert.ok(bend > 2.65, id + ' keeps the legs nearly straight throughout the hinge');
        }
      }
      if (['Barbell_Lunge', 'Barbell_Side_Bend', 'Narrow_Stance_Squats', 'Olympic_Squat',
        'Stiff_Leg_Barbell_Good_Morning', 'Upright_Barbell_Row'].includes(id)) {
        for (const [side, sign] of sides) {
          const hand = scene.getObjectByName('Hand' + side);
          const along = handAlong(sign).applyQuaternion(hand.getWorldQuaternion(q()));
          const forearm = point(hand.name).sub(point('Forearm' + side));
          const bend = THREE.MathUtils.radToDeg(along.angleTo(forearm));
          assert.ok(bend < 65, id + ' wrist bend ' + bend);
        }
      }
    }
    at(0);
    const top = prop.position.y, start = point('Pelvis'), foot = point('FootR'), shoulder = point('ArmR');
    if (id.endsWith('Deadlift') || ['Snatch_Pull', 'Wide_Stance_Stiff_Legs'].includes(id)) {
      assert.ok(floor < .002, id + ' floor start');
      at(1.75);
      assert.ok(prop.position.y > top + .50, id + ' first pull');
      if (id === 'Snatch_Pull') assert.ok(point('FootR').y > foot.y + .03, id + ' ankle drive');
    } else if (id.endsWith('Shrug')) {
      at(1.4);
      assert.ok(point('ArmR').y > shoulder.y + .065, id + ' shoulder elevation');
      assert.ok(point('Pelvis').distanceTo(start) < .001, id + ' stationary lower body');
    } else if (id === 'Barbell_Lunge') {
      at(1.55);
      assert.ok(point('FootR').z > foot.z + .62 && point('Pelvis').y < start.y - .27, id + ' forward lunge');
    } else if (id === 'Barbell_Side_Bend') {
      at(1.05);
      const right = X.clone().applyQuaternion(prop.quaternion).y;
      at(2.55);
      assert.ok(right > .25 && X.clone().applyQuaternion(prop.quaternion).y < -.25, id + ' bends both ways');
    } else if (id === 'Frankenstein_Squat') {
      at(1.65);
      assert.ok(point('HandR').z - point('ArmR').z > .43, id + ' open arms extended');
      assert.ok(entry.clip.tracks.every((track) => !track.name.startsWith('Index')), id + ' no grip');
    } else if (id === 'Front_Barbell_Squat') {
      at(1.65);
      assert.ok(point('HandR').x > point('HandL').x + .16, id + ' crossed hands');
    } else if (id === 'Push_Press') {
      at(.36);
      assert.ok(point('Pelvis').y < start.y - .10, id + ' dip');
      at(1.25);
      assert.ok(prop.position.y > top + .49, id + ' lockout');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await verify();
