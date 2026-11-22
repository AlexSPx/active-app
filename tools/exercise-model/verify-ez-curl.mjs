import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createEzCurlBar } from './ez-curl-bar.mjs';
import { checkBarGrip } from './verify-barbell.mjs';
import { createFlatBench } from './flat-bench.mjs';
import { createEntries } from './ez-curl-exercises.mjs';
import { createEntries as createStraightBarEntries } from './barbell-standing.mjs';

const read = (path) => readFile(new URL(path, import.meta.url));
const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
  Uint8Array.from(await read('./anatomy.glb')).buffer, '');
const catalog = JSON.parse(await read('../../apps/client/lib/data/exercise-catalog.json'));
const entries = createEntries({ scene }, { createDumbbellGripTracks, dumbbellGripTransform });
assert.equal(Object.keys(entries).length, 4);
const straightBarEntries = createStraightBarEntries({ scene }, { createDumbbellGripTracks, dumbbellGripTransform });
const gripTracks = createDumbbellGripTracks(scene);
const seats = [1, -1].map((sign) => ({
  hand: scene.getObjectByName(sign === 1 ? 'HandL' : 'HandR'),
  ...dumbbellGripTransform(sign),
}));
const checkGrip = checkBarGrip(scene);
const bar = createEzCurlBar();
const bench = createFlatBench();
bench.updateMatrixWorld(true);
const [pad, ...benchFrame] = bench.children.map((mesh) => new THREE.Box3().setFromObject(mesh));
const bodyMixer = new THREE.AnimationMixer(scene);
const barMixer = new THREE.AnimationMixer(bar);
const point = new THREE.Vector3();
const local = new THREE.Vector3();
const inverse = new THREE.Matrix4();
const barInverse = new THREE.Quaternion();
const rotation = new THREE.Quaternion();
const axis = new THREE.Vector3();
const sample = new THREE.Vector3();
const vertices = [];
const muscles = new Set();
scene.updateMatrixWorld(true);
scene.traverse((mesh) => {
  if (!mesh.isSkinnedMesh) return;
  muscles.add(mesh.material.name);
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    let dominant = 0;
    for (let j = 1; j < 4; j++) {
      if (skinWeight.getComponent(i, j) > skinWeight.getComponent(i, dominant)) dominant = j;
    }
    const bone = mesh.skeleton.bones[skinIndex.getComponent(i, dominant)].name;
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    const foot = point.y < .036 ? (point.x > 0 ? 0 : 1) : -1;
    vertices.push({ mesh, i, bone, foot, side: bone.endsWith('L') ? 0 : 1,
      grip: bone.startsWith('Hand') ? 0 : bone.startsWith('Thumb') ? 1 : /^(Index|Middle|Ring|Little)/.test(bone) ? 2 : -1 });
  }
});

const shaft = bar.getObjectByName('Shaft').geometry;
const radius = shaft.parameters.radius;
const path = shaft.parameters.path;
const segments = [];
for (const curve of path.curves) {
  const points = curve.getPoints(curve.isLineCurve3 ? 1 : 6);
  for (let i = 1; i < points.length; i++) segments.push(new THREE.Line3(points[i - 1], points[i]));
}
// Enclosing cylinders include the bevels and the rims of the sleeve hardware.
const solids = bar.children.filter((mesh) => mesh.name !== 'Shaft').map((mesh) => {
  mesh.geometry.computeBoundingBox();
  const { min, max } = mesh.geometry.boundingBox;
  return [mesh.position.x + min.y, mesh.position.x + max.y, max.x];
});
function shaftGapAt(barLocalPoint) {
  let gap = Infinity;
  for (const segment of segments) {
    segment.closestPointToPoint(barLocalPoint, true, sample);
    gap = Math.min(gap, barLocalPoint.distanceTo(sample) - radius);
  }
  return gap;
}
const barVertices = bar.children.flatMap((mesh) => {
  mesh.updateMatrix();
  const attr = mesh.geometry.attributes.position;
  return Array.from({ length: attr.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(attr, i).applyMatrix4(mesh.matrix));
});

for (const [id, entry] of Object.entries(entries)) {
  if (process.argv[2] && !new RegExp(process.argv[2]).test(id)) continue;
  assert.ok(!(id in straightBarEntries), id + ' duplicate straight-bar ID');
  const seeded = catalog.find((item) => item.id === id);
  assert.equal(entry.name, seeded.name);
  assert.equal(seeded.equipment, id.endsWith('Close-Grip_EZ_Bar_Curl') ? 'BARBELL' : 'E_Z_CURL_BAR');
  const standing = entry.framing === 'standing';
  const narrow = !id.endsWith(':EZ-Bar_Curl');
  const press = id.endsWith('_Press');
  assert.equal(entry.equipment, standing ? 'ez-curl-bar' : 'bench-ez-curl-bar');
  assert.ok([...entry.primary, ...entry.supporting].every((muscle) => muscles.has(muscle)));
  assert.equal(entry.clip.duration, entry.propClip.duration);
  for (const grip of gripTracks) {
    assert.deepEqual(entry.clip.tracks.find((track) => track.name === grip.name)?.values, grip.values, grip.name);
  }
  for (const track of [...entry.clip.tracks, ...entry.propClip.tracks]) {
    assert.ok(track.values.every(Number.isFinite), track.name);
    const size = track.getValueSize();
    for (let i = 0; i < size; i++) assert.ok(Math.abs(track.values[i] - track.values.at(i - size)) < 1e-5, track.name);
  }

  const figure = bodyMixer.clipAction(entry.clip).play();
  const prop = barMixer.clipAction(entry.propClip).play();
  figure.paused = prop.paused = true;
  const setTime = (time) => {
    figure.time = prop.time = time;
    bodyMixer.update(0);
    barMixer.update(0);
    scene.updateMatrixWorld(true);
    bar.updateMatrixWorld(true);
  };

  const upperArm = scene.getObjectByName('ForearmL');
  const wrist = scene.getObjectByName('HandL');
  const pose = (time) => {
    setTime(time);
    const elbow = upperArm.getWorldPosition(new THREE.Vector3());
    return { elbow, upper: elbow.clone().sub(upperArm.parent.getWorldPosition(new THREE.Vector3())),
      forearm: wrist.getWorldPosition(new THREE.Vector3()).sub(elbow), bar: bar.position.clone() };
  };
  const start = pose(0);
  const peak = pose(1.4);
  if (standing) {
    assert.ok(peak.bar.y - start.bar.y > .40 && Math.abs(peak.bar.y - start.elbow.y - .30) < .06);
    assert.ok(start.elbow.distanceTo(peak.elbow) < .001 && start.forearm.angleTo(peak.forearm) > (narrow ? 1.60 : 1.8));
  } else if (press) {
    assert.ok(start.bar.y - peak.bar.y > .32 && peak.bar.z - start.bar.z > .16);
    assert.ok(peak.upper.y < 0 && Math.abs(peak.elbow.x) < .30 && peak.forearm.y > .19);
  } else {
    assert.ok(start.elbow.distanceTo(peak.elbow) < .001 && start.upper.y > .275);
    assert.ok(start.forearm.angleTo(peak.forearm) > 1.5 && start.bar.z - peak.bar.z > .17);
  }

  let clearance = Infinity;
  let closest;
  let maxDepth = 0;
  let maxGap = 0;
  let maxSeatError = 0;
  let maxAxisError = 0;
  let maxWristAngle = 0;
  let supportError = 0;
  let floorError = 0;
  let padDepth = 0;
  if (id.endsWith('EZ-Bar_Press')) {
    const upperArms = seats.map(({ hand }) => hand.parent.parent);
    let previous;
    for (let frame = 0; frame <= Math.round(entry.clip.duration * 60); frame++) {
      const time = frame / 60;
      setTime(time);
      const current = upperArms.map((arm) => arm.getWorldQuaternion(new THREE.Quaternion()));
      if (previous) current.forEach((rotation, index) => {
        assert.ok(rotation.angleTo(previous[index]) < .12, id + ' upper arm snaps at ' + time);
      });
      previous = current;
    }
  }
  const frames = Math.round(entry.clip.duration * 23);
  for (let frame = 0; frame <= frames; frame++) {
    const time = frame / frames * entry.clip.duration;
    setTime(time);
    inverse.copy(bar.matrixWorld).invert();
    barInverse.copy(bar.quaternion).invert();
    assert.ok(bar.position.y >= .145, id + ' floor clearance');
    for (const vertex of barVertices) {
      point.copy(vertex).applyMatrix4(bar.matrixWorld);
      assert.ok(point.y >= 0 && (standing || ![pad, ...benchFrame].some((box) => box.containsPoint(point))));
    }
    seats.forEach((seat, i) => {
      const sign = i === 0 ? 1 : -1;
      const hand = seat.hand;
      hand.getWorldPosition(point).sub(hand.parent.getWorldPosition(sample));
      const handAlong = local.set(sign * .025, -.137, .065).applyQuaternion(hand.getWorldQuaternion(rotation));
      maxWristAngle = Math.max(maxWristAngle, handAlong.angleTo(point));
      if (id.endsWith('Skullcrusher')) {
        const upperArm = hand.parent.parent;
        upperArm.getWorldQuaternion(rotation);
        const upperDirection = sample.copy(hand.parent.position).applyQuaternion(rotation).normalize();
        const bend = point.clone().addScaledVector(upperDirection, -point.dot(upperDirection)).normalize();
        const front = local.set(0, 0, 1).applyQuaternion(rotation);
        assert.ok(bend.dot(front) > .9, id + ' elbow flexion direction at ' + time);
      }
      point.copy(seat.position).applyMatrix4(seat.hand.matrixWorld).applyMatrix4(inverse);
      maxSeatError = Math.max(maxSeatError, point.distanceTo(local.set(sign * (narrow ? .105 : .245), 0, narrow ? .030 : .020)));
      seat.hand.getWorldQuaternion(rotation).multiply(seat.quaternion).premultiply(barInverse);
      axis.set(1, 0, 0).applyQuaternion(rotation);
      maxAxisError = Math.max(maxAxisError, axis.angleTo(local.set(2, 0, sign * (narrow ? 1 : -1))
        .multiplyScalar(standing ? 1 : -1)));
    });

    if (frame % 8 === 0) checkGrip(seats, id + ' at ' + figure.time,
      (world) => shaftGapAt(local.copy(world).applyMatrix4(inverse)));
    const gaps = [[Infinity, Infinity, Infinity], [Infinity, Infinity, Infinity]];
    const soles = [Infinity, Infinity];
    const support = [Infinity, Infinity, Infinity];
    for (const { mesh, i, bone, foot, side, grip } of vertices) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      assert.ok(point.y > -.005, id + ' body floor');
      if (foot >= 0) soles[foot] = Math.min(soles[foot], point.y);
      if (!standing) {
        if (Math.abs(point.x) < .125 && Math.abs(point.z) < .58) {
          for (const [index, name] of ['Pelvis', 'Chest', 'Head'].entries()) {
            if (bone === name) support[index] = Math.min(support[index], point.y - pad.max.y);
          }
        }
        if (pad.containsPoint(point)) padDepth = Math.max(padDepth, pad.max.y - point.y);
        assert.ok(!benchFrame.some((box) => box.containsPoint(point)), id + ' bench frame/body');
      }
      local.copy(point).applyMatrix4(inverse);
      if (Math.abs(local.x) > .62 || Math.hypot(local.y, local.z) > .19) continue;
      const shaftGap = shaftGapAt(local);
      const held = grip >= 0 && Math.abs(local.x - (side === 0 ? 1 : -1) * (narrow ? .105 : .245)) < .10;
      if (held) {
        gaps[side][grip] = Math.min(gaps[side][grip], Math.abs(shaftGap));
        maxDepth = Math.max(maxDepth, -shaftGap);
      }
      let gap = held ? Infinity : shaftGap;
      const radial = Math.hypot(local.y, local.z);
      for (const [from, to, r] of solids) {
        const end = Math.max(from - local.x, local.x - to);
        const rim = radial - r;
        gap = Math.min(gap, Math.hypot(Math.max(0, end), Math.max(0, rim)) + Math.min(0, Math.max(end, rim)));
      }
      if (gap < clearance) {
        clearance = gap;
        closest = [figure.time.toFixed(3), bone, point.toArray()];
      }
    }
    maxGap = Math.max(maxGap, ...gaps.flat());
    floorError = Math.max(floorError, ...soles.map(Math.abs));
    if (!standing) supportError = Math.max(supportError, ...support.map(Math.abs));
  }
  console.log(entry.name, { clearance, closest, maxDepth, maxGap, maxSeatError, maxAxisError, maxWristAngle, floorError, supportError, padDepth,
    start: start.bar.toArray(), peak: peak.bar.toArray() });
  assert.ok(clearance > .005, id + ' bar/body clearance');
  if (!standing && !press) assert.ok(closest[1] === 'Head' && clearance < .065, id + ' forehead approach');
  assert.ok(maxSeatError < .0005 && maxAxisError < .001, id + ' wrist seat alignment');
  assert.ok(maxWristAngle < .45, id + ' wrist angle');
  assert.ok(maxDepth < .003 && maxGap < .002, id + ' palm, thumb and finger contact');
  assert.ok(floorError < .003, id + ' planted soles');
  assert.ok(supportError < .005 && padDepth < .005, id + ' head, back and hip contact');
  figure.stop();
  prop.stop();
}
