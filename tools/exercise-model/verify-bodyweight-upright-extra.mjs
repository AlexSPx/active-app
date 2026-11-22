import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createExerciseGroups } from './clips.mjs';
import { createEntries } from './bodyweight-upright-extra.mjs';
import { handAlong } from './hand-frame.mjs';

const bytes = await readFile(new URL('./anatomy.glb', import.meta.url));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .parseAsync(Uint8Array.from(bytes).buffer, '');
const catalog = new Map(JSON.parse(await readFile(new URL(
  '../../apps/client/lib/data/exercise-catalog.json', import.meta.url,
))).map(({ id, name }) => [id, name]));
const { scene } = asset;
const bone = (name) => scene.getObjectByName(name);
const v = () => new THREE.Vector3();
const point = (name) => bone(name).getWorldPosition(v());
const direction = (name, x, y, z) => v().set(x, y, z).applyQuaternion(bone(name).getWorldQuaternion(new THREE.Quaternion()));
const bind = new Map();
const materials = new Set();
const vertices = new Map();
const toes = new Map();
scene.traverse((object) => {
  if (object.isBone) bind.set(object, [...object.position.toArray(), ...object.quaternion.toArray()]);
  if (!object.isSkinnedMesh) return;
  materials.add(object.material.name);
  const { position, skinIndex, skinWeight } = object.geometry.attributes;
  const channels = ['getX', 'getY', 'getZ', 'getW'];
  for (let i = 0; i < position.count; i++) {
    const dominant = channels.reduce((a, b) => skinWeight[b](i) > skinWeight[a](i) ? b : a);
    const joint = object.skeleton.bones[skinIndex[dominant](i)].name;
    const group = /[123][LR]$/.test(joint) ? 'Hand' + joint.at(-1) : joint;
    if (!/^(Foot[LR]|Hand[LR]|Head|Forearm[LR]|Arm[LR])$/.test(group)) continue;
    if (!vertices.has(group)) vertices.set(group, []);
    vertices.get(group).push([object, i]);
    if (group.startsWith('Foot') && skinWeight[dominant](i) > .999) {
      const local = bone(group).worldToLocal(v().fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld));
      if (!toes.has(group) || local.z > toes.get(group).z) toes.set(group, local);
    }
  }
});
const entries = createEntries(asset);
for (const [joint, transform] of bind) {
  assert.deepEqual([...joint.position.toArray(), ...joint.quaternion.toArray()], transform, joint.name + ' bind pose');
}
const existing = new Set();
for (const [label, group] of createExerciseGroups(asset)) {
  if (label === 'Upright bodyweight') {
    assert.deepEqual(Object.keys(group).sort(), Object.keys(entries).sort(), label + ' registered IDs');
  } else {
    Object.keys(group).forEach((id) => existing.add(id));
  }
}
const prefix = 'local:exercise:';
const keys = [
  'Elbow_Circles', 'Elbows_Back', 'Isometric_Chest_Squeezes', 'Middle_Back_Stretch', 'Side_Neck_Stretch',
  'Standing_Lateral_Stretch', 'Triceps_Stretch', 'Upper_Back_Stretch', 'Sit_Squats', 'Fast_Skipping',
];
assert.deepEqual(Object.keys(entries).sort(), keys.map((key) => prefix + key).sort());

const mixer = new THREE.AnimationMixer(scene);
const ends = ['FootL', 'FootR'];
const scratch = v();
const skinPoint = (mesh, index, target) => mesh.getVertexPosition(index, target).applyMatrix4(mesh.matrixWorld);
function sole(name) {
  let height = Infinity;
  for (const [mesh, index] of vertices.get(name)) height = Math.min(height, skinPoint(mesh, index, scratch).y);
  return height;
}
function contactGap(a, b, center, radius = .23) {
  const surface = (name) => vertices.get(name).map(([mesh, i]) => skinPoint(mesh, i, v()))
    .filter((point) => point.distanceTo(center) < radius);
  const points = surface(b);
  let best = Infinity;
  for (const p of surface(a)) for (const q of points) best = Math.min(best, p.distanceToSquared(q));
  return Math.sqrt(best);
}

const checks = {
  Elbow_Circles(sample) {
    for (const side of ['L', 'R']) {
      const wrist = point('Hand' + side);
      const elbow = point('Forearm' + side);
      sample(1);
      const up = point('Forearm' + side);
      sample(2);
      const back = point('Forearm' + side);
      sample(3);
      const down = point('Forearm' + side);
      assert.ok(up.y - down.y > .12 && elbow.z - back.z > .10);
      assert.ok(wrist.distanceTo(point('Hand' + side)) < .001);
      assert.ok(contactGap('Hand' + side, 'Arm' + side, point('Arm' + side)) < .012);
      sample(0);
    }
  },
  Elbows_Back(sample) {
    const elbows = ['ForearmL', 'ForearmR'].map(point);
    sample(1.2);
    for (const [i, name] of ['ForearmL', 'ForearmR'].entries()) assert.ok(elbows[i].z - point(name).z > .10);
    assert.ok(point('HandL').z < point('Pelvis').z - .13);
  },
  Isometric_Chest_Squeezes(sample) {
    const wrist = point('HandL');
    sample(1.2);
    assert.ok(point('HandL').z - wrist.z > .035);
    assert.ok(contactGap('HandL', 'HandR', point('HandL')) < .009, 'Palms meet');
    assert.ok(vertices.get('HandL').every(([mesh, i]) => skinPoint(mesh, i, scratch).x > -.003), 'Hands stay on their own side');
    const hold = point('HandL');
    sample(4.1);
    assert.ok(hold.distanceTo(point('HandL')) < .001);
  },
  Middle_Back_Stretch(sample) {
    for (const [time, sign] of [[1.2, 1], [13.6, -1]]) {
      sample(time);
      assert.ok(direction('Chest', 0, 0, 1).x * sign > .69);
      assert.ok(Math.abs(direction('Pelvis', 0, 0, 1).x) < .001);
    }
  },
  Side_Neck_Stretch(sample) {
    for (const [time, side, sign] of [[1.2, 'L', 1], [6.6, 'R', -1]]) {
      sample(time);
      assert.ok(direction('Head', 0, 1, 0).x * sign > .30);
      assert.ok(contactGap('Hand' + side, 'Head', point('Hand' + side)) < .012);
    }
  },
  Standing_Lateral_Stretch(sample) {
    for (const [time, upper, sign] of [[1.2, 'R', 1], [6.6, 'L', -1]]) {
      sample(time);
      assert.ok(direction('Chest', 0, 1, 0).x * sign > .40);
      assert.ok(point('Forearm' + upper).y > point('Head').y);
      assert.ok(contactGap('Hand' + upper, 'Head', point('Hand' + upper)) < .012);
    }
  },
  Triceps_Stretch(sample) {
    for (const [time, upper, assist] of [[1.2, 'L', 'R'], [13.6, 'R', 'L']]) {
      sample(time);
      assert.ok(point('Forearm' + upper).y - point('Hand' + upper).y > .10);
      assert.ok(point('Hand' + upper).z < point('Head').z - .10);
      assert.ok(contactGap('Hand' + assist, 'Forearm' + upper, point('Forearm' + upper)) < .012);
    }
  },
  Upper_Back_Stretch(sample) {
    const wrist = point('HandL');
    sample(1.2);
    assert.ok(point('HandL').z - wrist.z > .14);
    assert.ok(direction('Chest', 0, 1, 0).z > .24);
    assert.ok(contactGap('HandL', 'HandR', point('HandL')) < .012);
  },
  Sit_Squats(sample) {
    const high = point('Pelvis');
    sample(.62);
    assert.ok(high.y - point('Pelvis').y > .19 && high.z - point('Pelvis').z > .13);
    assert.ok(point('ThighL').y - point('ShinL').y > .24, 'Thigh should stay above parallel');
  },
  Fast_Skipping(sample) {
    for (const [from, to, foot] of [[0, .17, 'FootR'], [.17, .29, 'FootL'], [.43, .61, 'FootL'],
      [.61, .73, 'FootR'], [.87, 1.07, 'FootR'], [1.07, 1.32, 'FootL']]) {
      sample(from);
      const anchor = bone(foot).localToWorld(toes.get(foot).clone());
      for (let i = 0; i <= 6; i++) {
        const time = THREE.MathUtils.lerp(from, to, i / 6);
        sample(time);
        const toe = bone(foot).localToWorld(toes.get(foot).clone());
        assert.ok(Math.abs(sole(foot)) < .007, foot + ' contact during support');
        assert.ok(Math.hypot(toe.x - anchor.x, toe.z - anchor.z) < .001, foot + ' planted toe drift at ' + time);
      }
    }
    for (const [takeoff, land, side] of [[.29, .43, 'L'], [.73, .87, 'R']]) {
      const foot = 'Foot' + side;
      const other = side === 'L' ? 'FootR' : 'FootL';
      sample(takeoff);
      assert.ok(Math.abs(sole(foot)) < .007 && sole(other) > .25);
      sample((takeoff + land) / 2);
      assert.ok(sole(foot) > .018 && sole(other) > .25);
      sample(land);
      assert.ok(Math.abs(sole(foot)) < .007 && sole(other) > .25);
    }
  },
};

for (const key of keys) {
  const id = prefix + key;
  const wristLimit = { Elbow_Circles: .78, Side_Neck_Stretch: 1.08, Triceps_Stretch: 1.08, Fast_Skipping: .12 }[key];
  const { name, clip, primary, supporting, phases, cues, framing, equipment, propClip, oneShot } = entries[id];
  assert.ok(!existing.has(id), id + ' already registered');
  assert.equal(name, catalog.get(id), id);
  assert.equal(clip.name, name);
  assert.equal(framing, 'standing');
  assert.equal(equipment, undefined);
  assert.equal(propClip, undefined);
  assert.ok(clip.validate(), id);
  assert.ok([...primary, ...supporting].every((muscle) => materials.has(muscle)), id + ' muscle materials');
  for (const markers of [phases, cues]) {
    assert.ok(markers.length > 0 && markers.every(([time, label], i) =>
      time >= (markers[i - 1]?.[0] ?? 0) && time <= clip.duration && label.length), id + ' markers');
  }
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
  action.paused = true;
  function sample(time) {
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
  }
  sample(0);
  const anchors = ends.map(point);
  const animated = clip.tracks.map(({ name }) => {
    const [joint, property] = name.split('.');
    return bone(joint)[property];
  });
  const start = animated.map((transform) => transform.clone());
  sample(clip.duration);
  if (key === 'Fast_Skipping') {
    assert.equal(oneShot, true);
    assert.ok(point('Pelvis').z - start.at(-1).z > .95);
    assert.ok(ends.every((name) => Math.abs(sole(name)) < .007));
  } else {
    assert.equal(oneShot, undefined);
    for (const [i, transform] of animated.entries()) {
      const distance = transform.isQuaternion ? transform.angleTo(start[i]) : transform.distanceTo(start[i]);
      assert.ok(distance < .001, id + ' loop closure: ' + clip.tracks[i].name);
    }
  }
  sample(0);
  const previous = animated.map((transform) => transform.clone());
  for (let i = 0; i <= Math.ceil(clip.duration * 24); i++) {
    sample(Math.min(clip.duration, (i + .31) / 24));
    for (const [j, transform] of animated.entries()) {
      if (transform.isQuaternion) {
        assert.ok(transform.angleTo(previous[j]) < .80, id + ' abrupt rotation: ' + clip.tracks[j].name + ' at ' + action.time);
        previous[j].copy(transform);
      }
    }
    for (const [j, foot] of ends.entries()) {
      const y = sole(foot);
      assert.ok(y > -.007, id + ' floor penetration at ' + action.time + 's: ' + y);
      if (!oneShot) {
        assert.ok(y < .007, id + ' lost floor contact');
        assert.ok(point(foot).distanceTo(anchors[j]) < .001, id + ' shifted a planted foot');
      }
    }
    if (wristLimit) for (const [index, side] of ['L', 'R'].entries()) {
      const hand = bone('Hand' + side);
      const bend = hand.position.angleTo(handAlong(1 - 2 * index).applyQuaternion(hand.quaternion));
      assert.ok(bend < wristLimit, id + ' wrist bend at ' + action.time + ': ' + bend);
    }
    assert.ok(point('Head').y - point('Pelvis').y > .50, id + ' upright torso');
  }
  sample(0);
  checks[key](sample);
  action.stop();
  console.log('PASS ' + id);
}
