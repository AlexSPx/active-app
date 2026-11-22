import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createDipStation } from './dip-station.mjs';
import { createEntries } from './dip-station-exercises.mjs';

const read = (path) => readFile(new URL(path, import.meta.url));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
  Uint8Array.from(await read('./anatomy.glb')).buffer, '');
const catalog = JSON.parse(await read('../../apps/client/lib/data/exercise-catalog.json'));
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
assert.deepEqual(Object.keys(entries).sort(), [
  'local:exercise:Dips_-_Chest_Version',
  'local:exercise:Dips_-_Triceps_Version',
  'local:exercise:Parallel_Bar_Dip',
]);

const { scene } = asset;
scene.updateMatrixWorld(true);
const meshes = [];
scene.traverse((mesh) => {
  if (!mesh.isSkinnedMesh) return;
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

const station = createDipStation();
station.updateMatrixWorld(true);
const parts = station.children.map((part) => {
  part.geometry.computeBoundingBox();
  return { worldBox: new THREE.Box3().setFromObject(part).expandByScalar(.06), box: part.geometry.boundingBox, inverse: part.matrixWorld.clone().invert(),
    center: part.position, radius: part.geometry.parameters.radiusTop, name: part.name };
});
const mixer = new THREE.AnimationMixer(scene);
const bones = [];
scene.traverse((bone) => { if (bone.isBone) bones.push(bone); });
const bone = (name) => scene.getObjectByName(name);
const position = (name) => bone(name).getWorldPosition(new THREE.Vector3());
const point = new THREE.Vector3();
const localGrip = new THREE.Vector3();
const local = new THREE.Vector3();
const gripBone = /^(Hand|Thumb|Index|Middle|Ring|Little)/;
const wrapJoints = ['Hand', 'Thumb3', ...['Index', 'Middle', 'Ring', 'Little'].flatMap((digit) => [
  digit + '1', digit + '3',
])];
const tolerances = {
  'Dips_-_Chest_Version': { bend: 89, lean: 30 },
  'Dips_-_Triceps_Version': { bend: 90, lean: 0 },
  Parallel_Bar_Dip: { bend: 108, lean: 12 },
};

const bottomElbowWidths = new Map();
for (const [id, entry] of Object.entries(entries)) {
  assert.equal(entry.name, catalog.find((row) => row.id === id)?.name);
  assert.equal(entry.equipment, 'dip-station');
  assert.equal(entry.framing, 'standing');
  for (const name of [...entry.primary, ...entry.supporting]) {
    assert.ok(meshes.some(({ mesh }) => mesh.material.name === name));
  }
  const action = mixer.clipAction(entry.clip).setLoop(THREE.LoopOnce, 0).play();
  action.paused = true;
  const sample = (time) => {
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
  };
  const poseAt = (time) => {
    sample(time);
    return bones.map(({ position, quaternion }) => [position.clone(), quaternion.clone()]);
  };
  const initial = poseAt(0);
  const samePose = (a, b) => a.every(([p, q], i) =>
    p.distanceTo(b[i][0]) < 1e-6 && q.angleTo(b[i][1]) < .001);
  assert.ok(samePose(initial, poseAt(4)), id + ' loop');
  assert.ok(samePose(initial, poseAt(3)), id + ' support hold begins');
  assert.ok(samePose(initial, poseAt(3.5)), id + ' support hold midpoint');
  assert.ok(samePose(poseAt(1.55), poseAt(1.8)), id + ' bottom pause');
  const { bend, lean } = tolerances[id.split(':').at(-1)];
  const startY = positionAfter(0, 'Pelvis').y;
  const startFoot = position('FootL');
  const bottomY = positionAfter(1.65, 'Pelvis').y;
  const elbow = position('ForearmL');
  bottomElbowWidths.set(id, elbow.x - position('ForearmR').x);
  const bottomElbow = THREE.MathUtils.radToDeg(position('HandL').sub(elbow)
    .angleTo(elbow.clone().sub(position('ArmL'))));
  assert.ok(Math.abs(bottomElbow - bend) < .1, id + ' bottom elbow ' + bottomElbow);
  assert.ok(Math.abs(THREE.MathUtils.radToDeg(bone('Pelvis').rotation.x) - lean) < .1, id + ' torso lean');
  assert.ok(startY - bottomY > .09 && startFoot.y - position('FootL').y > .06, id + ' rep travel ' + [startY - bottomY, startFoot.y - position('FootL').y]);
  const topElbow = positionAfter(0, 'ForearmL');
  assert.ok(position('HandL').sub(topElbow).angleTo(topElbow.sub(position('ArmL'))) < .08, id + ' straight-arm support');
  function positionAfter(time, name) {
    sample(time);
    return position(name);
  }

  const contact = {};
  let floor = Infinity;
  let stationGap = .06;
  let worstPart;
  let gripGap = 0;
  let gripDepth = 0;
  let wristBend = 0;
  let bodyGap = .012;
  let closestBody;
  let priorJoints;
  for (let frame = 0; frame <= 100; frame++) {
    const time = frame * .04;
    sample(time);
    const joints = ['Head', 'Pelvis', 'ForearmL', 'ForearmR', 'FootL', 'FootR'].map(position);
    if (priorJoints) assert.ok(joints.every((p, i) => p.distanceTo(priorJoints[i]) < .035), id + ' continuous motion');
    priorJoints = joints;
    const gaps = ['L', 'R'].map((side) => Object.fromEntries(wrapJoints.map((joint) => [joint + side, Infinity])));
    const gripFrames = [];
    for (const [i, side] of ['L', 'R'].entries()) {
      const sign = i === 0 ? 1 : -1;
      const hand = bone('Hand' + side);
      const along = new THREE.Vector3(sign * .025, -.137, .065).normalize();
      const inward = new THREE.Vector3(1, 0, 0).cross(along).normalize();
      const grip = dumbbellGripTransform(sign);
      const center = hand.localToWorld(grip.position);
      const rotation = hand.getWorldQuaternion(new THREE.Quaternion());
      const gripRotation = rotation.clone().multiply(grip.quaternion);
      gripFrames.push({ center, inverse: gripRotation.clone().invert() });
      const shaft = new THREE.Vector3(1, 0, 0).applyQuaternion(grip.quaternion).applyQuaternion(rotation);
      assert.ok(Math.abs(shaft.z) > .99999 && center.distanceTo(new THREE.Vector3(sign * .260, 1.150, .100)) < .0005,
        id + ' fixed shaft alignment');
      assert.ok(sign * inward.applyQuaternion(rotation).x > .80, id + ' inward-facing palm ' + [side, inward.toArray(), along.clone().applyQuaternion(rotation).toArray()]);
      if (frame === 0) contact[side] = rotation;
      assert.ok(rotation.angleTo(contact[side]) < .001, id + ' fixed hand orientation');
      const forearm = position('Hand' + side).sub(position('Forearm' + side));
      wristBend = Math.max(wristBend, THREE.MathUtils.radToDeg(forearm.angleTo(along.applyQuaternion(rotation))));
    }

    // Compare nearby lower-arm and trunk vertices at sampled poses.
    const trunk = new Map();
    const hands = [];
    const cell = (x, y, z) => [Math.floor(x / .02), Math.floor(y / .02), Math.floor(z / .02)];
    for (const { mesh, bones } of meshes) {
      for (let j = 0; j < bones.length; j++) {
        const name = bones[j];
        mesh.getVertexPosition(j, point).applyMatrix4(mesh.matrixWorld);
        assert.ok(Number.isFinite(point.lengthSq()), id + ' finite skin');
        floor = Math.min(floor, point.y);
        const hand = gripBone.test(name);
        if ((hand || name.startsWith('Forearm')) && Math.abs(point.x) < .225) hands.push(point.clone());
        if (/^(Pelvis|Lumbar|Chest|Thigh)/.test(name) && Math.abs(point.x) > .13) {
          const key = cell(point.x, point.y, point.z).join();
          if (!trunk.has(key)) trunk.set(key, []);
          trunk.get(key).push(point.clone());
        }
        for (const { worldBox, box, inverse, center, radius, name: part } of parts) {
          if (!worldBox.containsPoint(point)) continue;
          if (part === 'Grip' && hand && Math.sign(center.x) === (name.endsWith('L') ? 1 : -1)) {
            assert.ok(point.z > -.29 && point.z < .42, id + ' hand remains on usable grip');
            const radialGap = Math.hypot(point.x - center.x, point.y - center.y) - radius;
            const side = center.x > 0 ? 0 : 1;
            const { center: seat, inverse } = gripFrames[side];
            const radial = localGrip.copy(point).sub(seat).applyQuaternion(inverse);
            // Proximal segments enter from the palm side; tips pass the shaft and oppose the thumb.
            const wraps = name.startsWith('Thumb') ? radial.y > radius * .65
              : name.at(-2) === '3' ? radial.z > radius * .65 : radial.z < -radius * .3;
            if (wraps && name in gaps[side]) gaps[side][name] = Math.min(gaps[side][name], Math.abs(radialGap));
            gripDepth = Math.max(gripDepth, -radialGap);
            continue;
          }
          local.copy(point).applyMatrix4(inverse);
          const gap = radius
            ? Math.hypot(Math.max(0, Math.hypot(local.x, local.z) - radius),
              Math.max(0, Math.abs(local.y) - box.max.y))
            : box.distanceToPoint(local);
          if (gap < stationGap) {
            stationGap = gap;
            worstPart = [time, name, part, point.toArray()];
          }
        }
      }
    }
    for (const vertex of hands) {
      const [x, y, z] = cell(vertex.x, vertex.y, vertex.z);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const other of trunk.get([x + dx, y + dy, z + dz].join()) ?? []) {
          const gap = other.distanceTo(vertex);
          if (gap < bodyGap) {
            bodyGap = gap;
            closestBody = [time, vertex.toArray(), other.toArray()];
          }
        }
      }
    }
    for (const [name, gap] of gaps.flatMap(Object.entries)) {
      assert.ok(gap < .003, id + ' ' + name + ' shaft wrap at ' + time + ' s: ' + gap);
      gripGap = Math.max(gripGap, gap);
    }
  }
  console.log(entry.name, { travel: startY - bottomY, bottomElbow, floor, stationGap, worstPart, gripGap, gripDepth, wristBend, bodyGap, closestBody });
  assert.ok(floor > .02, id + ' floor clearance');
  assert.ok(stationGap > .005, id + ' station clearance ' + JSON.stringify(worstPart));
  assert.ok(gripDepth < .004, id + ' hand penetration ' + gripDepth);
  assert.ok(wristBend < 65 && bodyGap > .005, id + ' wrist and torso clearance');
  action.stop();
}

assert.ok(bottomElbowWidths.get('local:exercise:Dips_-_Chest_Version')
  > bottomElbowWidths.get('local:exercise:Dips_-_Triceps_Version') + .08, 'chest dip flares wider than triceps dip');
