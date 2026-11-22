import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createPullUpBar } from './pull-up-bar.mjs';
import { createEntries } from './pull-up-bar-exercises.mjs';

const read = (path) => readFile(new URL(path, import.meta.url));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
  Uint8Array.from(await read('./anatomy.glb')).buffer, '');
const catalog = JSON.parse(await read('../../apps/client/lib/data/exercise-catalog.json'));
const { scene } = asset;
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
assert.equal(Object.keys(entries).length, 8);
const bar = createPullUpBar();
bar.updateMatrixWorld(true);
const shaft = bar.getObjectByName('Shaft');
const { radiusTop: radius, height: span } = shaft.geometry.parameters;
const shaftY = shaft.position.y;
const frameBoxes = bar.children.filter((part) => part !== shaft).map((part) => new THREE.Box3().setFromObject(part));
const mixer = new THREE.AnimationMixer(scene);
const point = new THREE.Vector3();
const localGrip = new THREE.Vector3();
const meshes = [];
const wrapJoints = ['Hand', 'Thumb3', ...['Index', 'Middle', 'Ring', 'Little'].flatMap((digit) => [
  digit + '1', digit + '3',
])];
const materials = new Set();
const bone = (name) => scene.getObjectByName(name);
const position = (name) => bone(name).getWorldPosition(new THREE.Vector3());
scene.updateMatrixWorld(true);
scene.traverse((mesh) => {
  if (!mesh.isSkinnedMesh) return;
  materials.add(mesh.material.name);
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  const bones = Array.from({ length: skinIndex.count }, (_, index) => {
    const offset = index * 4;
    let dominant = offset;
    for (let j = offset + 1; j < offset + 4; j++) {
      if (skinWeight.array[j] > skinWeight.array[dominant]) dominant = j;
    }
    return mesh.skeleton.bones[skinIndex.array[dominant]].name;
  });
  meshes.push({ mesh, bones });
});

for (const [id, entry] of Object.entries(entries)) {
  assert.equal(entry.name, catalog.find((row) => row.id === id)?.name);
  assert.equal(entry.equipment, 'pull-up-bar');
  assert.equal(entry.framing, 'pull-up-bar');
  for (const name of [...entry.primary, ...entry.supporting]) assert.ok(materials.has(name), name);
  const action = mixer.clipAction(entry.clip).play();
  action.paused = true;
  const count = Math.round(entry.clip.duration * 23);
  const exercise = id.split(':').at(-1);
  const widthRange = {
    Pullups: [.99, 1.02],
    Mixed_Grip_Chin: [1.04, 1.12],
    Gorilla_Chin_Crunch: [1.13, 1.22],
  }[exercise];
  const shoulderSpan = bone('ArmL').position.distanceTo(bone('ArmR').position);
  let clearance = Infinity;
  let frameClearance = Infinity;
  let floor = Infinity;
  let handGap = 0;
  let handDepth = 0;
  let drift = 0;
  let wristAngle = 0;
  let elbowMin = Infinity;
  let elbowMax = 0;
  let previous;
  let step = 0;
  let top;
  let chestAtStart;
  let chestAtTop;
  const socketsAtStart = ['L', 'R'].map((side) => bone('Arm' + side).position.clone());
  let socketTravel = 0;
  const shoulderAtHang = new Map();
  const shoulderEdgeStrains = [];
  const initial = {};
  let noseHeight;
  let noseZ = -Infinity;
  let closest;
  let headClearance = Infinity;
  const poses = [];
  for (let i = 0; i <= count; i++) {
    action.time = entry.clip.duration * i / count;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    const joints = ['Pelvis', 'Head', 'ForearmL', 'ForearmR', 'ShinL', 'ShinR', 'FootL', 'FootR'].map(position);
    poses.push(joints);
    if (previous) step = Math.max(step, ...joints.map((p, j) => p.distanceTo(previous[j])));
    previous = joints;
    if (i === 0) chestAtStart = position('Chest');
    if (!top || joints[0].y > top[0].y) {
      top = joints;
      chestAtTop = position('Chest');
    }
    if (exercise === 'Scapular_Pull-Up') {
      socketTravel = Math.max(socketTravel, ...['L', 'R'].map((side, j) =>
        bone('Arm' + side).position.distanceTo(socketsAtStart[j])));
    }
    const gaps = ['L', 'R'].map((side) => Object.fromEntries(wrapJoints.map((joint) => [joint + side, Infinity])));
    const gripFrames = [];
    for (const [sideIndex, side] of ['L', 'R'].entries()) {
      const hand = bone('Hand' + side);
      const sign = sideIndex === 0 ? 1 : -1;
      const along = new THREE.Vector3(sign * .025, -.137, .065).normalize();
      const inward = new THREE.Vector3(1, 0, 0).cross(along).normalize();
      const grip = dumbbellGripTransform(sign);
      const contact = hand.localToWorld(grip.position);
      const attitude = hand.getWorldQuaternion(new THREE.Quaternion());
      const frame = attitude.clone().multiply(grip.quaternion);
      gripFrames.push({ center: contact, inverse: frame.clone().invert() });
      const shaftAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(grip.quaternion).applyQuaternion(attitude);
      assert.ok(Math.abs(shaftAxis.x) > .99999 && Math.abs(contact.x) < .731, id + ' shaft alignment');
      assert.ok(Math.hypot(contact.y - shaftY, contact.z) < .0005, id + ' shaft centering ' + [action.time, ...contact.toArray()]);
      const under = id.endsWith(':Chin-Up') || id.endsWith(':Gorilla_Chin_Crunch')
        || (id.endsWith(':Mixed_Grip_Chin') && side === 'R');
      const palmZ = inward.negate().applyQuaternion(attitude).z;
      if (i === 0) initial[side] = contact;
      assert.ok((under ? -palmZ : palmZ) > .85, id + ' palm direction');
      drift = Math.max(drift, initial[side].distanceTo(contact));
      const wrist = position('Hand' + side);
      const elbow = position('Forearm' + side);
      const lower = wrist.clone().sub(elbow);
      const bend = THREE.MathUtils.radToDeg(lower.angleTo(elbow.sub(position('Arm' + side))));
      elbowMin = Math.min(elbowMin, bend);
      elbowMax = Math.max(elbowMax, bend);
      wristAngle = Math.max(wristAngle, THREE.MathUtils.radToDeg(lower.angleTo(along.applyQuaternion(attitude))));
    }
    for (const { mesh, bones } of meshes) {
      const sampleShoulder = exercise === 'Scapular_Pull-Up' && mesh.material.name === 'Shoulders'
        && (i === 0 || (action.time >= 1.45 && action.time < 1.50));
      const skin = sampleShoulder ? [] : null;
      for (let j = 0; j < bones.length; j++) {
        const name = bones[j];
        mesh.getVertexPosition(j, point).applyMatrix4(mesh.matrixWorld);
        floor = Math.min(floor, point.y);
        if (skin) skin.push(point.clone());
        if (id.endsWith(':Gorilla_Chin_Crunch') && name === 'Head'
          && action.time >= 1.45 && action.time < 1.50 && Math.abs(point.x) < .02 && point.z > noseZ) {
          noseZ = point.z;
          noseHeight = point.y;
        }
        if (Math.abs(point.x) > .72) {
          for (const box of frameBoxes) frameClearance = Math.min(frameClearance, box.distanceToPoint(point));
        }
        if (Math.abs(point.x) > span / 2) continue;
        const gap = Math.hypot(point.y - shaftY, point.z) - radius;
        if (/^(Hand|Thumb|Index|Middle|Ring|Little)/.test(name)) {
          assert.ok(Math.abs(point.x) < .731, id + ' hand outside usable shaft');
          const side = name.endsWith('L') ? 0 : 1;
          const { center: seat, inverse } = gripFrames[side];
          const radial = localGrip.copy(point).sub(seat).applyQuaternion(inverse);
          // Proximal segments enter from the palm side; tips pass the shaft and oppose the thumb.
          const wraps = name.startsWith('Thumb') ? radial.y > radius * .65
            : name.at(-2) === '3' ? radial.z > radius * .65 : radial.z < -radius * .3;
          if (wraps && name in gaps[side]) gaps[side][name] = Math.min(gaps[side][name], Math.abs(gap));
          handDepth = Math.max(handDepth, -gap);
        } else {
          if (name === 'Head') headClearance = Math.min(headClearance, gap);
          if (gap < clearance) {
            clearance = gap;
            closest = [action.time.toFixed(2), name, point.toArray().map((n) => n.toFixed(3))];
          }
        }
      }
      if (skin && i === 0) shoulderAtHang.set(mesh, skin);
      else if (skin) {
        const hang = shoulderAtHang.get(mesh);
        const indices = mesh.geometry.index;
        for (let j = 0; j < indices.count; j++) {
          const a = indices.getX(j);
          const b = indices.getX(j % 3 === 2 ? j - 2 : j + 1);
          const length = hang[a].distanceTo(hang[b]);
          if (length > .004) shoulderEdgeStrains.push(Math.abs(skin[a].distanceTo(skin[b]) / length - 1));
        }
      }
    }
    for (const [name, gap] of gaps.flatMap(Object.entries)) {
      assert.ok(gap < .003, id + ' ' + name + ' shaft wrap at ' + action.time + ' s: ' + gap);
      handGap = Math.max(handGap, gap);
    }
  }
  const start = poses[0];
  const travel = top[0].y - start[0].y;
  assert.ok(start.every((p, j) => p.distanceTo(poses.at(-1)[j]) < .00001), id + ' loop');
  assert.ok(step < .09, id + ' joint continuity ' + step);
  assert.ok(drift < .0005, id + ' grip drift ' + drift);
  assert.ok(handDepth < .003, id + ' hand penetration ' + handDepth);
  assert.ok(clearance > .008 && headClearance > .008, id + ' shaft clearance ' + JSON.stringify(closest));
  // The frame test only needs points within 10 mm of its innermost part.
  assert.ok(frameClearance > .01 && floor > .25, id + ' frame and floor clearance');
  assert.ok(elbowMin < 12 && elbowMax < 150 && wristAngle < 70, id + ' arm range ' + [elbowMin, elbowMax, wristAngle]);
  const widthRatio = initial.L.distanceTo(initial.R) / shoulderSpan;
  if (widthRange) assert.ok(widthRatio >= widthRange[0] && widthRatio <= widthRange[1],
    id + ' grip width relative to shoulder centers ' + widthRatio);
  if (exercise === 'Pullups' || exercise === 'Mixed_Grip_Chin') {
    assert.ok(wristAngle < 18, id + ' wrist alignment ' + wristAngle);
  }
  let shoulderStrain;
  if (exercise === 'Scapular_Pull-Up') {
    assert.ok(travel > .04 && travel < .06 && elbowMax < 5, id + ' straight-arm shoulder lift');
    const chestLift = chestAtTop.y - chestAtStart.y;
    assert.ok(chestLift > .014 && chestLift < .024 && socketTravel < .022, id + ' shoulder girdle motion');
    shoulderEdgeStrains.sort((a, b) => a - b);
    shoulderStrain = shoulderEdgeStrains[Math.floor(shoulderEdgeStrains.length * .95)];
    assert.ok(shoulderStrain < .25, id + ' skinned shoulder edge strain ' + shoulderStrain);
  } else if (id.endsWith(':Hanging_Leg_Raise')) {
    const peak = poses[Math.round(count * .47)];
    for (const [knee, ankle] of [[4, 6], [5, 7]]) {
      assert.ok(peak[ankle].z - start[ankle].z > .73, id + ' leg height');
      assert.ok(Math.abs(peak[knee].y - peak[ankle].y) < .035, id + ' extended knees');
    }
    assert.ok(travel < .005 && elbowMax < 8, id + ' controlled hang');
  } else if (id.endsWith(':Wind_Sprints')) {
    for (const [time, knee, other] of [[.80, 4, 5], [1.60, 5, 4]]) {
      const pose = poses[Math.round(time / entry.clip.duration * count)];
      assert.ok(pose[knee].y - pose[other].y > .27, id + ' alternating knee drive');
    }
    assert.ok(travel < .005 && elbowMax < 8, id + ' controlled hang');
  } else {
    assert.ok(travel > .39 && elbowMax > 75, id + ' pull range');
    if (id.endsWith(':Mixed_Grip_Chin')) {
      assert.ok(top[2].x - top[0].x > top[0].x - top[3].x + .025, id + ' mixed elbow path');
    }
    if (id.endsWith(':Gorilla_Chin_Crunch')) {
      assert.ok(Math.abs(noseHeight - shaftY) < .035, id + ' nose-height peak ' + noseHeight);
      for (const knee of [4, 5]) {
        assert.ok(top[knee].y > chestAtTop.y && top[knee].distanceTo(chestAtTop) < .34,
          id + ' knees tucked to the chest at the top of the pull');
      }
    }
  }
  console.log(entry.name, { travel, clearance, headClearance, floor, handGap, handDepth, drift, step, wristAngle,
    elbowMin, elbowMax, ...(widthRange ? { widthRatio } : {}),
    ...(exercise === 'Scapular_Pull-Up' ? { socketTravel, shoulderStrain, chestLift: chestAtTop.y - chestAtStart.y } : {}),
    ...(exercise === 'Gorilla_Chin_Crunch' ? { kneeToChest: top[4].distanceTo(chestAtTop) } : {}) });
  action.stop();
}
