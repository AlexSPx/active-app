import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createBarbell } from './barbell.mjs';
import { createEntries } from './barbell-standing.mjs';

const fingers = ['Index', 'Middle', 'Ring', 'Little'];

export function checkBarGrip(scene) {
  const skins = { L: [], R: [] };
  scene.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const { skinIndex, skinWeight } = mesh.geometry.attributes;
    const names = Array.from({ length: skinIndex.count }, (_, i) => {
      let dominant = 0;
      for (let j = 1; j < 4; j++) {
        if (skinWeight.getComponent(i, j) > skinWeight.getComponent(i, dominant)) dominant = j;
      }
      const name = mesh.skeleton.bones[skinIndex.getComponent(i, dominant)].name;
      if (/^(Hand|(?:Thumb|Index|Middle|Ring|Little)3)[LR]$/.test(name)) {
        skins[name.at(-1)].push({ mesh, name, index: i });
      }
      return name;
    });
    const triangles = mesh.geometry.index;
    for (let i = 0; i < triangles.count; i += 3) {
      const face = [triangles.getX(i), triangles.getX(i + 1), triangles.getX(i + 2)];
      face.forEach((index, edge) => {
        const next = face[(edge + 1) % 3];
        const name = names[index];
        if (name === names[next] && /3[LR]$/.test(name) && /^(Thumb|Index|Middle|Ring|Little)/.test(name)) {
          skins[name.at(-1)].push({ mesh, name, index, next });
        }
      });
    }
  });

  return (seats, label, shaftGap) => seats.map(({ hand, position, quaternion }) => {
    const side = hand.name.at(-1);
    const sign = side === 'L' ? 1 : -1;
    const rotation = hand.getWorldQuaternion(new THREE.Quaternion());
    const along = new THREE.Vector3(sign * .025, -.137, .065).normalize().applyQuaternion(rotation);
    const shaft = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).applyQuaternion(rotation);
    const around = along.clone().addScaledVector(shaft, -along.dot(shaft)).normalize();
    const dorsal = shaft.clone().cross(around);
    const center = hand.localToWorld(position.clone());
    const point = new THREE.Vector3();
    const second = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const angle = () => THREE.MathUtils.radToDeg(Math.atan2(offset.dot(around), offset.dot(dorsal)));
    const contact = new Map();
    for (const { mesh, name, index, next } of skins[side]) {
      mesh.getVertexPosition(index, point);
      if (next !== undefined) point.lerp(mesh.getVertexPosition(next, second), .5);
      point.applyMatrix4(mesh.matrixWorld);
      offset.copy(point).sub(center);
      const lane = offset.dot(shaft);
      const gap = shaftGap(point);
      if (Math.abs(gap) > .002 || Math.abs(lane) > .066) continue;
      const theta = angle();
      if (name === hand.name ? Math.abs(lane) < .020 : name.startsWith('Thumb') ? theta < -100 : theta >= 115) {
        if (!contact.has(name)) contact.set(name, new Set());
        contact.get(name).add(Math.round(theta));
      }
    }
    const at = label + ', ' + hand.name;
    assert.ok(contact.get(hand.name)?.size >= 2, at + ' palm contact patch');
    assert.ok(contact.get('Thumb3' + side)?.size >= 2, at + ' opposed thumb pad');
    for (const digit of fingers) {
      assert.ok(contact.get(digit + '3' + side)?.size >= 2, at + ' ' + digit + ' distal pad contact');
      const angles = [1, 2, 3].map((joint) => {
        scene.getObjectByName(digit + joint + side).getWorldPosition(offset).sub(center);
        return angle();
      });
      assert.ok(angles[1] - angles[0] >= 30 && angles[2] - angles[1] >= 30, at + ' ' + digit + ' wrap');
    }
    return along.angleTo(hand.getWorldPosition(point).sub(hand.parent.getWorldPosition(second)));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await verify();

async function verify() {
  const read = (path) => readFile(new URL(path, import.meta.url));
  const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    Uint8Array.from(await read('./anatomy.glb')).buffer, '');
  const catalog = JSON.parse(await read('../../apps/client/lib/data/exercise-catalog.json'));
  const { scene } = asset;
  const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
  assert.equal(Object.keys(entries).length, 10);
  const gripTracks = createDumbbellGripTracks(scene);
  const seats = [1, -1].map((sign) => ({
    hand: scene.getObjectByName(sign === 1 ? 'HandL' : 'HandR'),
    ...dumbbellGripTransform(sign),
  }));
  const checkGrip = checkBarGrip(scene);
  const seatRotation = new THREE.Quaternion();
  const bar = createBarbell();
  const radius = bar.getObjectByName('Shaft').geometry.parameters.radiusTop;
  const shaftGap = (point) => Math.hypot(point.y - bar.position.y, point.z - bar.position.z) - radius;
  const figureMixer = new THREE.AnimationMixer(scene);
  const barMixer = new THREE.AnimationMixer(bar);
  const point = new THREE.Vector3();
  const world = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const materials = new Set();
  const meshes = [];
  scene.updateMatrixWorld(true);
  scene.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    materials.add(mesh.material.name);
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    const vertices = Array.from({ length: position.count }, (_, index) => {
      const weights = skinWeight.array;
      const offset = index * 4;
      let dominant = 0;
      for (let j = 1; j < 4; j++) if (weights[offset + j] > weights[offset + dominant]) dominant = j;
      const bone = mesh.skeleton.bones[skinIndex.array[offset + dominant]].name;
      point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
      return { bone, foot: point.y < .036 ? (point.x < 0 ? 0 : 1) : -1,
        hand: /^(Hand|Thumb|Index|Middle|Ring|Little)/.test(bone) };
    });
    meshes.push({ mesh, vertices });
  });

  // Enclosing cylinders also cover the plate bevels and the gaps between sleeve parts.
  const solids = [
    [0, .655, .01425], [.655, .685, .043], [.685, .745, .225],
    [.745, .781, .036], [.781, 1.100, .025],
  ];
  for (const [id, entry] of Object.entries(entries)) {
    if (process.argv[2] && !new RegExp(process.argv[2]).test(id)) continue;
    assert.equal(catalog.find((exercise) => exercise.id === id && exercise.equipment === 'BARBELL')?.name, entry.name);
    assert.equal(entry.equipment, 'barbell');
    assert.equal(entry.framing, 'standing');
    assert.equal(entry.clip.duration, entry.propClip.duration);
    for (const muscle of [...entry.primary, ...entry.supporting]) assert.ok(materials.has(muscle), muscle);
    for (const grip of gripTracks) assert.ok(entry.clip.tracks.some((track) => track.name === grip.name && track.values.every((value, i) => value === grip.values[i])), grip.name);
    const figure = figureMixer.clipAction(entry.clip).play();
    const prop = barMixer.clipAction(entry.propClip).play();
    figure.paused = prop.paused = true;
    let clearance = Infinity;
    let closest;
    let soleError = 0;
    let seatError = 0;
    let shaftError = 0;
    let handDepth = 0;
    let handGap = 0;
    let wristAngle = 0;
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    let travel = 0;
    const start = new THREE.Vector3();
    // Use a different sample rate from the authored clip to exercise interpolation.
    const count = Math.round(entry.clip.duration * 23);
    for (let frame = 0; frame <= count; frame++) {
      figure.time = prop.time = frame / count * entry.clip.duration;
      figureMixer.update(0);
      barMixer.update(0);
      scene.updateMatrixWorld(true);
      bar.updateMatrixWorld(true);
      if (/:(Barbell|Sumo)_Deadlift$/.test(id) && figure.time >= 1.22 && figure.time <= 1.78) {
        for (const side of ['L', 'R']) {
          const ankle = scene.getObjectByName('Foot' + side);
          const knee = ankle.parent;
          knee.getWorldQuaternion(seatRotation);
          const shin = point.copy(ankle.position).applyQuaternion(seatRotation);
          knee.parent.getWorldQuaternion(seatRotation);
          const thigh = world.copy(knee.position).applyQuaternion(seatRotation);
          const flexion = THREE.MathUtils.radToDeg(shin.angleTo(thigh));
          assert.ok(flexion < 9, id + ' knee flexion at lockout ' + side + ': ' + flexion);
        }
      }
      assert.ok(bar.position.y >= .225 - 1e-7, id + ' plate floor');
      assert.ok(axis.set(1, 0, 0).applyQuaternion(bar.quaternion).distanceTo(world.set(1, 0, 0)) < 1e-6);
      minHeight = Math.min(minHeight, bar.position.y);
      maxHeight = Math.max(maxHeight, bar.position.y);
      if (frame === 0) start.copy(bar.position);
      if (frame === count) assert.ok(start.distanceTo(bar.position) < 1e-6, id + ' loop');
      travel = Math.max(travel, start.distanceTo(bar.position));
      for (const seat of seats) {
        point.copy(seat.position).applyMatrix4(seat.hand.matrixWorld).sub(bar.position);
        seatError = Math.max(seatError, Math.hypot(point.y, point.z));
        assert.ok(Math.abs(point.x) < .60, id + ' grip width');
        seat.hand.getWorldQuaternion(seatRotation).multiply(seat.quaternion);
        shaftError = Math.max(shaftError, axis.set(1, 0, 0).applyQuaternion(seatRotation).angleTo(world.set(Math.sign(axis.x), 0, 0)));
      }
      if (frame % 8 === 0) wristAngle = Math.max(wristAngle, ...checkGrip(seats, id + ' at ' + figure.time, shaftGap));
      const soles = [Infinity, Infinity];
      const handGaps = [[Infinity, Infinity, Infinity], [Infinity, Infinity, Infinity]];
      for (const { mesh, vertices } of meshes) {
        for (let index = 0; index < vertices.length; index++) {
          const { bone, foot, hand } = vertices[index];
          mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
          if (foot >= 0) soles[foot] = Math.min(soles[foot], point.y);
          point.sub(bar.position);
          const axial = Math.abs(point.x);
          if (axial > 1.125) continue;
          const radial = Math.hypot(point.y, point.z);
          if (hand && axial < .60) {
            const slot = bone.startsWith('Hand') ? 0 : bone.startsWith('Thumb') ? 1 : 2;
            const side = bone.endsWith('L') ? 0 : 1;
            handGaps[side][slot] = Math.min(handGaps[side][slot], Math.abs(radial - .01425));
            handDepth = Math.max(handDepth, .01425 - radial);
            continue;
          }
          if ((axial < .60 && radial > .16) || radial > .385) continue;
          for (const [from, to, radius] of solids) {
            const end = Math.max(from - axial, axial - to);
            const rim = radial - radius;
            const gap = Math.hypot(Math.max(0, end), Math.max(0, rim)) + Math.min(0, Math.max(end, rim));
            if (gap < clearance) {
              clearance = gap;
              closest = [figure.time.toFixed(3), bone, point.toArray().map((x) => x.toFixed(3))];
            }
          }
        }
      }
      handGap = Math.max(handGap, ...handGaps.flat());
      soleError = Math.max(soleError, ...soles.map(Math.abs));
    }
    assert.ok(travel > .04, id + ' travel');
    assert.ok(clearance > .005, id + ' bar-body clearance ' + JSON.stringify(closest));
    assert.ok(soleError < .003, id + ' planted soles');
    assert.ok(seatError < .00025 && shaftError < .001, id + ' handle alignment');
    assert.ok(wristAngle < .46, id + ' wrist angle ' + wristAngle);
    assert.ok(handDepth < .003 && handGap < .002, id + ' articulated grip contact');
    if (id.endsWith(':Barbell_Deadlift') || id.endsWith(':Sumo_Deadlift')) {
      assert.ok(Math.abs(minHeight - .225) < 1e-7 && maxHeight > .70, id + ' floor-to-lockout range');
    }
    console.log(entry.name, { minHeight, maxHeight, clearance, closest, soleError, seatError, shaftError, handDepth, handGap, wristAngle });
    figure.stop();
    prop.stop();
  }
}
