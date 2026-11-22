import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { attachDumbbells, createDumbbellGripTracks } from './clips.mjs';
import { createDumbbell } from './dumbbell.mjs';
import { createInclineBench } from './incline-bench.mjs';
import { createEntries } from './incline-bench-exercises.mjs';

const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const catalogPath = process.argv[2] ?? new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath));
const { scene } = asset;
const entries = createEntries(asset, { createPowerGripTracks: createDumbbellGripTracks });
const props = attachDumbbells(scene, createDumbbell);
const mixer = new THREE.AnimationMixer(scene);
const vertices = [];
const materials = new Set();
const point = new THREE.Vector3();
const local = new THREE.Vector3();
const other = new THREE.Vector3();
const wristRotation = new THREE.Quaternion();
scene.traverse((mesh) => {
  if (!mesh.isSkinnedMesh) return;
  materials.add(mesh.material.name);
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    let dominant = 0;
    for (let j = 1; j < 4; j++) {
      if (skinWeight.getComponent(i, j) > skinWeight.getComponent(i, dominant)) dominant = j;
    }
    const bone = mesh.skeleton.bones[skinIndex.getComponent(i, dominant)].name;
    const digit = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'].findIndex((name) => bone.startsWith(name));
    vertices.push({ mesh, i, bone, digit });
  }
});

for (const [id, entry] of Object.entries(entries)) {
  const prone = /Incline_Row|Prone_Incline/.test(id);
  const lowIncline = entry.benchTransform.angle === Math.PI / 6;
  const bench = createInclineBench(entry.benchTransform);
  bench.position.fromArray(entry.benchTransform.position);
  bench.rotation.y = entry.benchTransform.yaw ?? 0;
  bench.updateMatrixWorld(true);
  const volumes = [];
  const benchBounds = new THREE.Box3().setFromObject(bench).expandByScalar(.025);
  bench.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    volumes.push({ name: mesh.name, box: mesh.geometry.boundingBox, inverse: mesh.matrixWorld.clone().invert(),
      bounds: new THREE.Box3().setFromObject(mesh).expandByScalar(.025) });
  });
  assert.equal(entry.framing, 'bench', id);
  assert.equal(entry.equipment, 'incline-bench-dumbbells', id);
  assert.equal(catalog.find((item) => item.id === id && item.equipment === 'DUMBBELL')?.name, entry.name, id);
  assert.ok([...entry.primary, ...entry.supporting].every((name) => materials.has(name)), id);
  const fingers = createDumbbellGripTracks(scene).map((track) =>
    [scene.getObjectByName(track.name.split('.')[0]), new THREE.Quaternion().fromArray(track.values)]);
  assert.equal(entry.clip.tracks.filter((track) => /^(Thumb|Index|Middle|Ring|Little)/.test(track.name)).length,
    30, id);

  const action = mixer.clipAction(entry.clip).play();
  action.paused = true;
  const support = prone ? ['Backrest pad:Chest', 'Backrest pad:Lumbar']
    : ['Backrest pad:Chest', 'Backrest pad:Head', 'Seat pad:ThighL', 'Seat pad:ThighR', 'Seat pad:Pelvis'];
  const gaps = new Map(support.map((key) => [key, [Infinity, -Infinity]]));
  const start = props.map(() => new THREE.Vector3());
  const centers = props.map(() => new THREE.Vector3());
  const travel = props.map(() => 0);
  const arms = ['L', 'R'].map((side) => ['Arm', 'Forearm', 'Hand'].map((joint) => scene.getObjectByName(joint + side)));
  const originalElbows = props.map(() => new THREE.Vector3());
  const angles = props.map(() => [Infinity, -Infinity]);
  let deepest = 0;
  let headClearance = Infinity;
  let separation = Infinity;
  const steps = Math.round(entry.clip.duration * 20);
  for (let sample = 0; sample <= steps; sample++) {
    action.time = sample * entry.clip.duration / steps;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    const at = id + ' at ' + action.time.toFixed(2) + ' s';
    for (const [bone, expected] of fingers) {
      assert.ok(1 - Math.abs(bone.quaternion.dot(expected)) < 1e-6, at + ' grip rotation ' + bone.name);
    }
    const contacts = new Map();
    const soles = [Infinity, Infinity];
    const grips = props.map(() => Array(6).fill(Infinity));
    const inverses = props.map((prop) => prop.matrixWorld.clone().invert());
    let handleDepth = 0;
    let foreignHandleDepth = 0;
    props.forEach((object, index) => {
      const center = object.getWorldPosition(centers[index]);
      if (sample === 0) start[index].copy(center);
      const distance = center.distanceTo(start[index]);
      travel[index] = Math.max(travel[index], distance);
      if (sample === steps) assert.ok(distance < .0001, at + ' loop');
      if (id.includes('Alternate_Incline')) {
        const stationary = index === 0 ? action.time <= 3.6 : action.time >= 3.6;
        if (stationary) assert.ok(distance < .0001, at + ' alternating sides');
      }

      const [shoulder, elbow, wrist] = arms[index];
      elbow.getWorldPosition(point);
      if (sample === 0) originalElbows[index].copy(point);
      if (id.includes('Curl')) assert.ok(point.distanceTo(originalElbows[index]) < .002, at + ' steady upper arm');
      const upper = shoulder.getWorldPosition(local).sub(point);
      const lower = wrist.getWorldPosition(other).sub(point);
      const flexion = Math.PI - upper.angleTo(lower);
      wrist.getWorldQuaternion(wristRotation);
      const sign = index === 0 ? 1 : -1;
      const handDirection = local.set(sign * .025, -.137, .065).applyQuaternion(wristRotation);
      assert.ok(handDirection.angleTo(lower) < THREE.MathUtils.degToRad(5), at + ' wrist alignment');
      angles[index][0] = Math.min(angles[index][0], flexion);
      angles[index][1] = Math.max(angles[index][1], flexion);
    });

    for (const { mesh, i, bone, digit } of vertices) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      assert.ok(Number.isFinite(point.x + point.y + point.z), at + ' vertex');
      assert.ok(point.y >= -.005, at + ' floor');
      if (bone.startsWith('Foot')) {
        const index = bone.endsWith('L') ? 0 : 1;
        soles[index] = Math.min(soles[index], point.y);
      }
      if (benchBounds.containsPoint(point)) for (const { name, box, inverse, bounds } of volumes) {
        if (!bounds.containsPoint(point)) continue;
        local.copy(point).applyMatrix4(inverse);
        const pad = name.endsWith('pad');
        if (pad && local.x >= box.min.x && local.x <= box.max.x &&
            local.z >= box.min.z && local.z <= box.max.z && local.y >= box.min.y) {
          const key = name + ':' + bone;
          const gap = local.y - box.max.y;
          contacts.set(key, Math.min(contacts.get(key) ?? Infinity, gap));
        }
        if (!box.containsPoint(local)) continue;
        if (pad) deepest = Math.max(deepest, box.max.y - local.y);
        else assert.fail(at + ' body intersects ' + name);
      }
      inverses.forEach((inverse, propIndex) => {
        if (point.distanceToSquared(centers[propIndex]) > .15 ** 2) return;
        local.copy(point).applyMatrix4(inverse);
        const axial = Math.abs(local.x);
        const radial = Math.hypot(local.y, local.z);
        // The heads fit inside these two cylinders, so positive clearance is conservative.
        const end = Math.max(.066 - axial, axial - .112);
        const radiusGap = radial - .055;
        const clearance = Math.hypot(Math.max(0, end), Math.max(0, radiusGap))
          + Math.min(0, Math.max(end, radiusGap));
        headClearance = Math.min(headClearance, clearance);
        if (axial >= .066) return;
        const gap = radial - .014;
        const side = 'LR'[propIndex];
        if (bone.endsWith(side) && (digit >= 0 || bone === 'Hand' + side)) {
          handleDepth = Math.max(handleDepth, -gap);
          if (digit >= 0 || axial < .02) {
            grips[propIndex][digit + 1] = Math.min(grips[propIndex][digit + 1], Math.abs(gap));
          }
        } else foreignHandleDepth = Math.max(foreignHandleDepth, -gap);
      });
    }

    for (const [key, range] of gaps) {
      const gap = contacts.get(key) ?? Infinity;
      const maxGap = key.endsWith('Pelvis') ? .016 : .008;
      assert.ok(gap >= -.006 && gap <= maxGap, at + ' contact ' + key + ' ' + gap);
      if (lowIncline && key === 'Seat pad:Pelvis') {
        assert.ok(Math.abs(gap) < .003, at + ' pelvis seated on pad ' + gap);
      }
      if (lowIncline && key === 'Backrest pad:Chest') {
        assert.ok(gap >= 0 && gap < .003, at + ' chest supported without pad penetration ' + gap);
      }
      range[0] = Math.min(range[0], gap);
      range[1] = Math.max(range[1], gap);
    }
    assert.ok(soles.every((sole) => Math.abs(sole) < .006), at + ' planted feet ' + soles);
    assert.ok(deepest < (lowIncline ? .001 : .006), at + ' bench penetration ' + deepest);
    assert.ok(handleDepth < .002 && foreignHandleDepth < .0001, at + ' handle penetration');
    assert.ok(grips.flat().every((gap) => gap < .0015), at + ' grip gap ' + grips.flat());
    // The calibrated hand's closest skin is about 5 mm from the enclosing cylinder.
    assert.ok(headClearance > .0049, at + ' dumbbell head clearance ' + headClearance);

    for (const prop of props) {
      prop.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
          assert.ok(point.y > .08, at + ' prop floor clearance');
          for (const { name, box, inverse, bounds } of volumes) {
            if (bounds.containsPoint(point)) {
              assert.ok(!box.containsPoint(local.copy(point).applyMatrix4(inverse)), at + ' prop intersects ' + name);
            }
          }
        }
      });
    }
    separation = Math.min(separation, centers[0].distanceTo(centers[1]));
    // Each prop fits within a sphere of radius hypot(.112, .055).
    assert.ok(separation > .25, at + ' dumbbell separation ' + separation);
  }
  assert.ok(travel.every((distance) => distance > .22), id + ' movement ' + travel);
  for (const [min, max] of angles) {
    if (id.includes('Flyes')) assert.ok(max - min < .01 && min > .15 && max < .65, id + ' steady elbow bend');
    else if (id.includes('Front_Incline')) assert.ok(max < .35 && max - min < .01, id + ' steady elbow bend');
    else assert.ok(min < .25 && max > 1.25, id + ' elbow range ' + [min, max]);
  }
  action.stop();
  const mm = (value) => +(value * 1000).toFixed(2);
  console.log(entry.name, {
    travelMm: travel.map(mm),
    flexionDegrees: angles.map((range) => range.map((angle) => Math.round(THREE.MathUtils.radToDeg(angle)))),
    contactMm: Object.fromEntries([...gaps].map(([key, range]) => [key, range.map(mm)])),
    maxPadPenetrationMm: mm(deepest),
    minHeadClearanceMm: mm(headClearance),
    minPropSeparationMm: mm(separation),
  });
}
