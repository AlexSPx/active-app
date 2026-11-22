import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { measurePalmContacts } from './hand-frame.mjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createEntries } from './bodyweight-floor.mjs';

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
const materialNames = new Set();
scene.traverse((mesh) => {
  if (!mesh.isSkinnedMesh) return;
  materialNames.add(mesh.material.name);
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  const indices = ['getX', 'getY', 'getZ', 'getW'];
  const groups = Array.from({ length: position.count }, (_, i) => {
    const dominant = indices.reduce((best, axis) => skinWeight[axis](i) > skinWeight[best](i) ? axis : best);
    const name = mesh.skeleton.bones[skinIndex[dominant](i)].name;
    return /[123][LR]$/.test(name) ? 'Hand' + name.at(-1) : name;
  });
  meshes.push({ mesh, groups });
});

const readSurface = (mesh, i, target) => mesh.getVertexPosition(i, target).applyMatrix4(mesh.matrixWorld);
const jointSurfaces = new Map();
for (const [joint, materials, radius] of [
  ['Forearm', ['Triceps', 'Biceps', 'Forearms', 'Other anatomy'], .070],
  ['Shin', ['Quadriceps', 'Calves', 'Other anatomy'], .074],
]) {
  for (const side of ['L', 'R']) {
    const name = joint + side;
    const center = point(name);
    jointSurfaces.set(name, meshes.flatMap(({ mesh, groups }) => materials.includes(mesh.material.name)
      ? groups.flatMap((_, i) => readSurface(mesh, i, new THREE.Vector3()).distanceTo(center) < radius
        ? [[mesh, i]] : [])
      : []));
  }
}

// Depth-test the posed triangles from a viewer preset. A grey muscle poking through a
// highlight can leave a visible hole even when both meshes are watertight.
function highlightProjection(material, offset) {
  const view = new THREE.Matrix4().lookAt(offset, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)).invert();
  const width = 360;
  const height = 300;
  const scale = 240;
  const depth = new Float32Array(width * height).fill(-Infinity);
  const mask = new Uint8Array(depth.length);
  for (const { mesh, groups } of meshes) {
    if (mesh.material.name === 'Skeleton') continue;
    const toScreen = view.clone().multiply(mesh.matrixWorld);
    const points = groups.map((_, i) => {
      const p = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(toScreen);
      return p.set(p.x * scale + width / 2, p.y * scale + 70, p.z);
    });
    const { index } = mesh.geometry;
    const highlighted = Number(mesh.material.name === material);
    for (let i = 0; i < index.count; i += 3) {
      const a = points[index.getX(i)];
      const b = points[index.getX(i + 1)];
      const c = points[index.getX(i + 2)];
      const bx = b.x - a.x;
      const by = b.y - a.y;
      const cx = c.x - a.x;
      const cy = c.y - a.y;
      const area = bx * cy - by * cx;
      if (area <= 0) continue;
      const left = Math.max(0, Math.ceil(Math.min(a.x, b.x, c.x)));
      const right = Math.min(width - 1, Math.floor(Math.max(a.x, b.x, c.x)));
      const top = Math.min(height - 1, Math.floor(Math.max(a.y, b.y, c.y)));
      for (let y = Math.max(0, Math.ceil(Math.min(a.y, b.y, c.y))); y <= top; y++) {
        for (let x = left; x <= right; x++) {
          const u = ((x - a.x) * cy - (y - a.y) * cx) / area;
          const v = (bx * (y - a.y) - by * (x - a.x)) / area;
          if (u < 0 || v < 0 || u + v > 1) continue;
          const z = a.z + u * (b.z - a.z) + v * (c.z - a.z);
          const pixel = y * width + x;
          if (z <= depth[pixel]) continue;
          depth[pixel] = z;
          mask[pixel] = highlighted;
        }
      }
    }
  }
  const visible = mask.reduce((sum, pixel) => sum + pixel, 0);
  let largestHole = 0;
  for (let start = 0; start < mask.length; start++) {
    if (mask[start]) continue;
    const region = [start];
    mask[start] = 2;
    let exterior = false;
    for (let i = 0; i < region.length; i++) {
      const pixel = region[i];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      exterior ||= x === 0 || y === 0 || x === width - 1 || y === height - 1;
      for (const next of [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1,
        pixel - width, pixel + width]) {
        if (mask[next] !== 0) continue;
        mask[next] = 2;
        region.push(next);
      }
    }
    if (!exterior) largestHole = Math.max(largestHole, region.length);
  }
  return { visible, largestHole };
}

const core = meshes.find(({ mesh }) => mesh.material.name === 'Core').mesh;
const ribEdges = [];
const coreRest = Array.from({ length: core.geometry.attributes.position.count }, (_, i) =>
  readSurface(core, i, new THREE.Vector3()));
const { index } = core.geometry;
for (let i = 0; i < index.count; i += 3) {
  for (let edge = 0; edge < 3; edge++) {
    const a = index.getX(i + edge);
    const b = index.getX(i + (edge + 1) % 3);
    const span = coreRest[a].distanceTo(coreRest[b]);
    if (span > .003 && [a, b].every((j) => coreRest[j].y > 1.1 && coreRest[j].y < 1.28)) {
      ribEdges.push([a, b, span]);
    }
  }
}
const dorsalSpine = meshes.flatMap(({ mesh, groups }) => groups.flatMap((group, i) => {
  if (group !== 'Chest' && group !== 'Lumbar') return [];
  const { x, z } = readSurface(mesh, i, new THREE.Vector3());
  return Math.abs(x) < .075 && z < -.065 ? [[mesh, i]] : [];
}));
assert.ok(ribEdges.length > 100 && dorsalSpine.length > 100);

const hands = ['HandL', 'HandR'];
const feet = ['FootL', 'FootR'];
const knees = ['ShinL', 'ShinR'];
const forearms = ['ForearmL', 'ForearmR'];
const upperBack = ['Chest', 'Head'];
const press = [...hands, ...feet];
const bridge = [...upperBack, ...hands, ...feet];
const crunch = ['Pelvis', ...feet];
const contacts = {
  Pushups: press,
  'Push-Up_Wide': press,
  'Push-Ups_-_Close_Triceps_Position': press,
  Plank: [...hands, ...forearms, ...feet],
  Butt_Lift_Bridge: bridge,
  Pelvic_Tilt_Into_Bridge: bridge,
  Single_Leg_Glute_Bridge: [...upperBack, ...hands, 'FootR'],
  Crunches: crunch,
  'Crunch_-_Hands_Overhead': crunch,
  'Cross-Body_Crunch': ['Pelvis'],
  Reverse_Crunch: [...upperBack, ...hands],
  Dead_Bug: [...upperBack, 'Pelvis'],
  '90_90_Hamstring': [...upperBack, ...hands, 'FootR'],
  Cat_Stretch: [...hands, ...knees],
  Rear_Leg_Raises: hands,
  Superman: ['Chest', 'Lumbar'],
};
assert.deepEqual(Object.keys(entries).sort(), Object.keys(contacts)
  .map((key) => 'local:exercise:' + key).sort());

const measurePalm = measurePalmContacts(scene);
const mixer = new THREE.AnimationMixer(scene);
const vertex = new THREE.Vector3();
const gripWidth = new Map();
for (const [id, { name, primary, supporting, framing, clip, phases, cues }] of Object.entries(entries)) {
  const key = id.slice('local:exercise:'.length);
  assert.equal(name, catalog.get(id), id);
  assert.equal(framing, 'floor', id);
  assert.ok(clip.validate(), id);
  assert.ok([...primary, ...supporting].every((muscle) => materialNames.has(muscle)), id);
  for (const markers of [phases, cues]) {
    assert.ok(markers.length && markers.every(([time], i) =>
      time >= (markers[i - 1]?.[0] ?? 0) && time <= clip.duration), id + ' marker times');
  }
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
  action.paused = true;
  const pose = (time) => {
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
  };
  const bindings = clip.tracks.map((track) => {
    const [joint, property] = track.name.split('.');
    return scene.getObjectByName(joint)[property];
  });
  pose(0);
  const first = bindings.map((binding) => binding.clone());
  const baseline = Object.fromEntries([...hands, ...feet, ...upperBack, 'Pelvis', 'Lumbar', 'ArmL', 'ArmR', ...knees]
    .map((joint) => [joint, point(joint)]));
  pose(clip.duration);
  bindings.forEach((binding, i) => assert.ok(
    (binding.isQuaternion ? binding.angleTo(first[i]) : binding.distanceTo(first[i])) < .001,
    name + ' loop closure',
  ));

  let moved = 0;
  let minFloor = Infinity;
  let maxContact = 0;
  const samples = Array.from({ length: Math.ceil(clip.duration * 15) + 1 }, (_, i) => i / 15)
    .filter((time) => time < clip.duration).concat([clip.duration, ...phases.map(([time]) => time)]);
  for (const time of samples) {
    pose(time);
    bindings.forEach((binding, i) => {
      assert.ok(binding.toArray().every(Number.isFinite), name + ' finite transforms');
      moved = Math.max(moved, binding.isQuaternion ? binding.angleTo(first[i]) : binding.distanceTo(first[i]));
    });
    const lows = {};
    for (const { mesh, groups } of meshes) {
      for (let i = 0; i < groups.length; i++) {
        mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
        const y = vertex.y;
        const group = groups[i];
        lows[group] = Math.min(lows[group] ?? Infinity, y);
      }
    }
    const lowest = Math.min(...Object.values(lows));
    assert.ok(Number.isFinite(lowest) && lowest >= -.014, `${name} floor penetration at ${time}: ${lowest}`);
    minFloor = Math.min(minFloor, lowest);
    const support = [...contacts[key]];
    if (key === 'Rear_Leg_Raises' || key === 'Cross-Body_Crunch') {
      const prefix = key === 'Rear_Leg_Raises' ? 'Shin' : 'Foot';
      const planted = point(prefix + 'L').y <= point(prefix + 'R').y ? 'L' : 'R';
      support.push(prefix + planted);
    }
    if (key === 'Cross-Body_Crunch') {
      const posedCore = coreRest.map((_, i) => readSurface(core, i, new THREE.Vector3()));
      const maxStretch = Math.max(...ribEdges.map(([a, b, span]) => posedCore[a].distanceTo(posedCore[b]) / span));
      assert.ok(maxStretch < 1.23, `${name} upper abdominal skin stretches ${maxStretch}× at ${time}`);
    }
    if (key === 'Superman' && time === 0) {
      assert.ok([...hands, ...feet].every((group) => lows[group] <= .012), name + ' contacts the floor at setup');
    }
    if (key === 'Superman' && time >= 1.35 && time <= 3.35) support.push('Pelvis');
    for (const side of ['L', 'R']) {
      const group = 'Hand' + side;
      const label = `${name} ${group} at ${time}`;
      if (key === 'Cross-Body_Crunch' || key === 'Dead_Bug') {
        const { bend, deviation, wristRoll } = measurePalm(side);
        const crunch = key === 'Cross-Body_Crunch';
        assert.ok(bend < (crunch ? .80 : .05) && deviation < (crunch ? .53 : .05) && wristRoll < .02,
          label + ' wrist articulation');
        if (crunch) assert.ok(lows[group] >= -.003, label + ' hand penetrates floor');
      }
      if (key === 'Crunches' || key === 'Crunch_-_Hands_Overhead') {
        const { bend, deviation, wristRoll } = measurePalm(side);
        assert.ok(bend < .70 && deviation < .38 && wristRoll < .02,
          `${label} wrist articulation: ${bend}, ${deviation}, ${wristRoll}`);
      }
      if (key === 'Superman') assert.ok(lows[group] >= -.002, label + ' hand penetrates floor');
      if (!support.includes(group) && !(key === 'Superman' && time <= .25)) continue;
      const { heel, knuckles, dorsal, direction, bend, deviation, wristRoll } = measurePalm(side);
      assert.ok(lows[group] >= -.002 && heel <= .009 && knuckles <= .009,
        `${label} heel/knuckle clearance: ${lows[group]}, ${heel}, ${knuckles}`);
      assert.ok(dorsal.y > .99 && direction.z > .97, label + ' palm down, fingers forward');
      assert.ok(bend < (key === 'Plank' ? .25 : 1.65) && deviation < .55 && wristRoll < .02, label + ' wrist articulation');
      if (key === 'Plank') assert.ok(lows['Forearm' + side] <= .004, label + ' forearm resting on floor');
    }
    for (const group of support) {
      const maxGap = .016;
      assert.ok(lows[group] <= maxGap, `${name} ${group} floats at ${time}: ${lows[group]}`);
      maxContact = Math.max(maxContact, lows[group]);
      if (hands.includes(group) || feet.includes(group)) {
        assert.ok(point(group).distanceTo(baseline[group]) < .003, `${name} ${group} slides at ${time}`);
      }
    }
  }

  assert.ok(key === 'Plank' ? moved < .001 : moved > .15, name + ' expected motion');
  pose(1.35);
  if (key.startsWith('Push')) {
    gripWidth.set(key, baseline.HandL.distanceTo(baseline.HandR));
    assert.ok(baseline.Chest.y - point('Chest').y > .19, name + ' reaches the bottom');
  }
  if (key === 'Crunches' || key === 'Crunch_-_Hands_Overhead') {
    assert.ok(point('Head').y - baseline.Head.y > .09, name + ' curls up');
    assert.ok(point('Pelvis').distanceTo(baseline.Pelvis) < .001, name + ' holds pelvis down');
    if (key === 'Crunch_-_Hands_Overhead') assert.ok(point('HandL').z < point('Head').z - .25);
  }
  if (key === 'Cross-Body_Crunch') {
    const up = new THREE.Vector3(0, 2.82, -.68).normalize();
    const project = (p) => new THREE.Vector2(p.x, p.dot(up));
    const jointSkin = (joint) => jointSurfaces.get(joint)
      .map(([mesh, i]) => readSurface(mesh, i, new THREE.Vector3()));
    for (const [peak, arm, leg, sign] of [[.9, 'R', 'L', 1], [3.2, 'L', 'R', -1]]) {
      pose(peak);
      const shoulder = 'Arm' + arm;
      const elbow = point('Forearm' + arm);
      const knee = point('Shin' + leg);
      assert.ok(point(shoulder).y - baseline[shoulder].y > .13 && knee.z < baseline['Shin' + leg].z - .4);
      const gap = elbow.distanceTo(knee);
      assert.ok(elbow.x * sign > .075 && gap > .055 && gap < .10,
        name + ' elbow reaches the opposite knee, joint gap ' + gap);
      const elbowSkin = jointSkin('Forearm' + arm);
      const kneeSkin = jointSkin('Shin' + leg);
      const axis = project(elbow).sub(project(knee)).normalize();
      const screenGap = Math.min(...elbowSkin.map((p) => project(p).dot(axis))) -
        Math.max(...kneeSkin.map((p) => project(p).dot(axis)));
      let distance = Infinity;
      for (const a of elbowSkin) {
        for (const b of kneeSkin) distance = Math.min(distance, a.distanceToSquared(b));
      }
      assert.ok(screenGap > .020 && distance > .020 ** 2 && distance < .065 ** 2,
        `${name} front silhouette and skin clearance at ${peak}: ${screenGap}, ${Math.sqrt(distance)}`);
    }
    for (const time of [.45, .75, .9, 1.15, 1.55, 2.75, 3.05, 3.2, 3.45, 3.85]) {
      pose(time);
      for (const offset of [[0, .68, 2.82], [2.82, .68, 0], [-2.82, .68, 0]]) {
        const { visible, largestHole } = highlightProjection('Core', new THREE.Vector3(...offset));
        assert.ok(visible > 600 && largestHole <= 9,
          `${name} abdominal projection at ${time}, view ${offset}: ${visible} visible, ${largestHole} hole`);
      }
    }
  }
  if (key === 'Pelvic_Tilt_Into_Bridge') {
    pose(1);
    const tiltHeight = point('Pelvis').y;
    assert.ok(tiltHeight > baseline.Pelvis.y + .006 && tiltHeight < baseline.Pelvis.y + .045);
    pose(2.5);
    assert.ok(point('Pelvis').y - tiltHeight > .1);
  }
  if (key === 'Butt_Lift_Bridge' || key === 'Single_Leg_Glute_Bridge' || key === 'Reverse_Crunch') {
    assert.ok(point('Pelvis').y - baseline.Pelvis.y > .07, name + ' raises hips');
    if (key === 'Single_Leg_Glute_Bridge') assert.ok(point('FootL').y > .3, name + ' holds the free leg up');
  }
  if (key === 'Dead_Bug' || key === 'Rear_Leg_Raises') {
    assert.ok(point('FootL').distanceTo(baseline.FootL) > .4);
    assert.ok(point('FootR').distanceTo(baseline.FootR) < .003);
    pose(3.35);
    assert.ok(point('FootR').distanceTo(baseline.FootR) > .4);
    assert.ok(point('FootL').distanceTo(baseline.FootL) < .003);
  }
  if (key === '90_90_Hamstring') {
    assert.ok(point('FootL').y - baseline.FootL.y > .3 && point('ShinL').distanceTo(baseline.ShinL) < .03);
  }
  if (key === 'Superman') {
    assert.ok(point('HandL').y - baseline.HandL.y > .35 && point('FootL').y - baseline.FootL.y > .3);
  }
  if (key === 'Cat_Stretch' || key === 'Superman') {
    pose(1.5);
    if (key === 'Cat_Stretch') {
      for (const time of [0, .35, .7, 1.05, 1.35, 16, 17]) {
        pose(time);
        const { visible, largestHole } = highlightProjection('Upper back', new THREE.Vector3(0, .68, -2.82));
        assert.ok(visible > 2100 && largestHole <= 9,
          `${name} rear projection at ${time}: ${visible} visible, ${largestHole} hole`);
      }
      pose(1.5);
      const crest = () => Math.max(...dorsalSpine.map(([mesh, i]) => readSurface(mesh, i, vertex).y));
      const roundedHeight = crest();
      assert.ok(point('Chest').y - point('Pelvis').y > .17 && baseline.Head.y - point('Head').y > .06,
        name + ' rounds through the lumbar spine and upper back');
      pose(0);
      assert.ok(roundedHeight - crest() > .10, name + ' raises the skinned back crest by ten centimeters');
      pose(1.5);
    }
    const hold = bindings.map((binding) => binding.clone());
    pose(key === 'Cat_Stretch' ? 16 : 3.3);
    bindings.forEach((binding, i) => assert.ok(
      (binding.isQuaternion ? binding.angleTo(hold[i]) : binding.distanceTo(hold[i])) < .001,
      name + ' hold must stay still',
    ));
  }

  action.stop();
  console.log(`${name}  floor ${(minFloor * 1000).toFixed(1)} mm, max contact gap ${(maxContact * 1000).toFixed(1)} mm`);
}
assert.ok(gripWidth.get('Push-Ups_-_Close_Triceps_Position') + .4 < gripWidth.get('Pushups'));
assert.ok(gripWidth.get('Pushups') + .08 < gripWidth.get('Push-Up_Wide'));
console.log(`Verified ${Object.keys(entries).length} catalog floor clips against the Three.js skinned GLB.`);
