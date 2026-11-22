import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { attachDumbbells, createDumbbellGripTracks } from './clips.mjs';
import { createDumbbell } from './dumbbell.mjs';
import { createFlatBench } from './flat-bench.mjs';
import { createEntries } from './flat-bench-exercises.mjs';

const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const catalogPath = process.argv[2] ?? new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath));
const { scene } = asset;
const entries = createEntries(asset, { createPowerGripTracks: createDumbbellGripTracks });
const dumbbellGrip = new Map(createDumbbellGripTracks(scene).map((track) => [track.name, track]));
const props = attachDumbbells(scene, createDumbbell);
const mixer = new THREE.AnimationMixer(scene);
const bench = createFlatBench();
bench.updateMatrixWorld(true);
const [pad, ...frame] = bench.children.map((mesh) => new THREE.Box3().setFromObject(mesh));
const vertices = [];
const materials = new Set();
const point = new THREE.Vector3();
const local = new THREE.Vector3();
const projected = new THREE.Vector3();
const camera = new THREE.OrthographicCamera(-1.32, 1.32, 1.08, -1.08, .05, 20);
camera.position.set(2.2, 1.95, 1.85);
camera.lookAt(0, .68, .12);
camera.updateMatrixWorld(true);

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
  const row = id.endsWith('Dumbbell_Row');
  const bodyweight = entry.equipment === 'bench';
  const active = bodyweight ? [] : entry.equipment === 'bench-dumbbells' ? [0, 1] : [0];
  assert.equal(entry.framing, 'bench', id);
  assert.equal(entry.benchTransform, undefined, id);
  assert.equal(catalog.find((item) => item.id === id && item.equipment ===
    (bodyweight ? 'BODY_ONLY' : 'DUMBBELL'))?.name, entry.name, id);
  assert.ok([...entry.primary, ...entry.supporting].every((name) => materials.has(name)), id);
  const planted = ['L', 'R'].filter((_, index) => !active.includes(index));
  for (const side of ['L', 'R']) {
    const digits = entry.clip.tracks.filter((track) => dumbbellGrip.has(track.name) && track.name.endsWith(side + '.quaternion'));
    assert.equal(digits.length, 15, id + ' ' + side + ' finger tracks');
    assert.equal(new Set(digits.map((track) => track.name)).size, digits.length, id + ' unique finger tracks');
    for (const track of digits) {
      if (planted.includes(side)) assert.deepEqual(Array.from(track.times), [0], id + ' static finger pose');
      else assert.deepEqual(track, dumbbellGrip.get(track.name), id + ' shared dumbbell grip');
    }
  }
  const plantedVertices = new Map();

  const action = mixer.clipAction(entry.clip).play();
  action.paused = true;
  const tracked = bodyweight ? ['FootL', 'FootR'].map((name) => scene.getObjectByName(name))
    : active.map((i) => props[i]);
  const start = tracked.map(() => new THREE.Vector3());
  const travel = tracked.map(() => 0);
  let deepest = 0;
  let headClearance = Infinity;
  let worstSupportGap = 0;
  const steps = Math.round(entry.clip.duration * 20);
  for (let sample = 0; sample <= steps; sample++) {
    action.time = sample * entry.clip.duration / steps;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    const at = id + ' at ' + action.time.toFixed(2) + ' s';
    const contacts = new Map();
    const hands = new Map(planted.map((side) => {
      const hand = scene.getObjectByName('Hand' + side);
      const rotation = hand.getWorldQuaternion(new THREE.Quaternion());
      const wrist = hand.getWorldPosition(new THREE.Vector3());
      const along = new THREE.Vector3(side === 'L' ? .025 : -.025, -.137, .065).normalize();
      const dorsal = new THREE.Vector3(1, 0, 0).cross(along).normalize().applyQuaternion(rotation);
      along.applyQuaternion(rotation);
      const forearm = wrist.clone().sub(hand.parent.getWorldPosition(new THREE.Vector3()));
      const bend = THREE.MathUtils.radToDeg(along.angleTo(forearm));
      assert.ok(dorsal.y > .98 && bend < 35, at + ' support wrist ' + side + ' ' + bend);
      return [side, { wrist, along, gaps: new Map() }];
    }));
    const soles = [Infinity, Infinity];
    const grips = active.map(() => Array(6).fill(Infinity));
    const inverses = active.map((i) => props[i].matrixWorld.clone().invert());
    let handleDepth = 0;
    let foreignHandleDepth = 0;
    let frameHit = false;
    let cameraExtent = 0;
    const recordCamera = (position) => {
      projected.copy(position).project(camera);
      cameraExtent = Math.max(cameraExtent, Math.abs(projected.x), Math.abs(projected.y));
    };

    tracked.forEach((object, index) => {
      object.getWorldPosition(point);
      if (sample === 0) start[index].copy(point);
      travel[index] = Math.max(travel[index], point.distanceTo(start[index]));
      if (sample === steps) assert.ok(point.distanceTo(start[index]) < .0001, at + ' loop');
    });

    for (const vertex of vertices) {
      const { mesh, i, bone, digit } = vertex;
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      assert.ok(Number.isFinite(point.x + point.y + point.z), at + ' vertex');
      const hand = hands.get(bone.at(-1));
      if (hand && (digit >= 0 || bone.startsWith('Hand'))) {
        if (sample === 0) plantedVertices.set(vertex, point.clone());
        else assert.ok(point.distanceToSquared(plantedVertices.get(vertex)) < .0005 ** 2,
          at + ' planted hand drift ' + bone);
        if (Math.abs(point.x) <= .134 && Math.abs(point.z) <= .564) {
          const distance = local.copy(point).sub(hand.wrist).dot(hand.along);
          const region = bone.startsWith('Hand') ? (distance > .064 ? 'knuckles' : distance > .024 ? 'heel' : null)
            : bone.at(-2) === '3' ? bone.slice(0, -1) : null;
          if (region) hand.gaps.set(region, Math.min(hand.gaps.get(region) ?? Infinity, point.y - pad.max.y));
        }
      }
      recordCamera(point);
      assert.ok(point.y >= -.005, at + ' floor');
      if (bone.startsWith('Foot')) {
        const index = bone.endsWith('L') ? 0 : 1;
        soles[index] = Math.min(soles[index], point.y);
      }
      if (Math.abs(point.x) <= .134 && Math.abs(point.z) <= .594) {
        const group = digit >= 0 ? 'Hand' + bone.at(-1) : bone;
        contacts.set(group, Math.min(contacts.get(group) ?? Infinity, point.y - pad.max.y));
      }
      if (pad.containsPoint(point)) deepest = Math.max(deepest, pad.max.y - point.y);
      frameHit ||= frame.some((box) => box.containsPoint(point));
      inverses.forEach((inverse, propIndex) => {
        local.copy(point).applyMatrix4(inverse);
        const axial = Math.abs(local.x);
        const radial = Math.hypot(local.y, local.z);
        // The heads fit inside these two cylinders, so positive clearance is conservative.
        headClearance = Math.min(headClearance, Math.max(.066 - axial, axial - .112, radial - .055));
        if (axial >= .066) return;
        const gap = radial - .014;
        const side = 'LR'[active[propIndex]];
        if (bone.endsWith(side) && (digit >= 0 || bone === 'Hand' + side)) {
          handleDepth = Math.max(handleDepth, -gap);
          if (digit >= 0 || axial < .02) {
            grips[propIndex][digit + 1] = Math.min(grips[propIndex][digit + 1], Math.abs(gap));
          }
        } else foreignHandleDepth = Math.max(foreignHandleDepth, -gap);
      });
    }

    for (const [side, { gaps }] of hands) {
      for (const [region, limit] of Object.entries({
        heel: .003, knuckles: .006, Thumb3: .009, Index3: .003, Middle3: .003, Ring3: .003, Little3: .003,
      })) {
        const gap = gaps.get(region) ?? Infinity;
        assert.ok(gap >= -.003 && gap <= limit, at + ' ' + side + ' ' + region + ' pad gap ' + gap);
      }
    }

    const support = row ? ['HandR', 'ShinR'] : ['Chest', 'Head', 'Pelvis'];
    if (!row && active.length < 2) support.push('HandR');
    if (bodyweight) support.push('HandL');
    for (const bone of support) {
      const gap = contacts.get(bone) ?? Infinity;
      worstSupportGap = Math.max(worstSupportGap, gap);
      assert.ok(gap >= -.006 && gap <= .016, at + ' bench contact ' + bone + ' ' + gap);
    }
    if (!bodyweight) {
      for (const sole of row ? soles.slice(0, 1) : soles) assert.ok(Math.abs(sole) < .012, at + ' planted foot');
    }
    assert.ok(!frameHit && deepest < .006, at + ' bench penetration ' + deepest);
    assert.ok(handleDepth < .002 && foreignHandleDepth < .0001, at + ' handle penetration');
    assert.ok(grips.flat().every((gap) => gap < .0015), at + ' grip gap ' + grips.flat());
    assert.ok(headClearance > .005, at + ' dumbbell head clearance ' + headClearance);

    for (const index of active) {
      props[index].traverse((mesh) => {
        if (!mesh.isMesh) return;
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
          assert.ok(point.y > .08 && !pad.containsPoint(point) &&
            !frame.some((box) => box.containsPoint(point)), at + ' dumbbell bench or floor clearance');
          recordCamera(point);
        }
      });
    }
    if (active.length === 2) {
      props[0].getWorldPosition(point);
      props[1].getWorldPosition(local);
      assert.ok(point.distanceTo(local) > .25, at + ' dumbbell separation');
      assert.ok(Math.abs(point.project(camera).x - local.project(camera).x) > .12, at + ' projected dumbbell separation');
    }
    assert.ok(cameraExtent < .95, at + ' projected framing ' + cameraExtent);
  }
  assert.ok(travel.every((distance) => distance > (bodyweight ? .45 : .22)), id + ' movement ' + travel);
  action.stop();
  console.log(entry.name, {
    travel: travel.map((distance) => +distance.toFixed(3)), padPenetration: +deepest.toFixed(4),
    supportGap: +worstSupportGap.toFixed(4),
    ...(active.length && { headClearance: +headClearance.toFixed(4) }),
  });
}
