import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createKettlebell } from './kettlebell.mjs';
import { createEntries } from './kettlebell-exercises.mjs';
import { handAlong, measurePalmContacts } from './hand-frame.mjs';

const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
  Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url))).buffer, '');
const catalog = JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url)));
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
assert.ok(Object.keys(entries).length === 9, 'Expected nine kettlebell catalog entries');
const palmContact = measurePalmContacts(asset.scene);
const prop = createKettlebell();
const { points: profile } = prop.getObjectByName('Bell').geometry.parameters;
const { path, radius } = prop.getObjectByName('Handle').geometry.parameters;
const pathPoints = path.getSpacedPoints(128);
const totalLength = path.getLength();
const segmentLength = totalLength / (pathPoints.length - 1);
const segments = pathPoints.slice(1).map((end, i) => {
  const start = pathPoints[i];
  const direction = end.clone().sub(start);
  return { start, direction, lengthSquared: direction.lengthSq(), lane: i * segmentLength };
});
const propVertices = prop.children.flatMap((mesh) => {
  const attr = mesh.geometry.attributes.position;
  return Array.from({ length: attr.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(attr, i));
});
const fingers = ['Index', 'Middle', 'Ring', 'Little'];
const digits = [...fingers, 'Thumb'];
const components = ['getX', 'getY', 'getZ', 'getW'];
const vertices = [];
const distalEdges = [];
const materials = new Set();
asset.scene.updateMatrixWorld(true);
asset.scene.traverse((mesh) => {
  if (!mesh.isSkinnedMesh) return;
  materials.add(mesh.material.name);
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  const point = new THREE.Vector3();
  const bones = [];
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    const dominant = components.reduce((a, b) => skinWeight[b](i) > skinWeight[a](i) ? b : a);
    const bone = mesh.skeleton.bones[skinIndex[dominant](i)].name;
    bones.push(bone);
    const part = digits.find((digit) => bone.startsWith(digit))
      ?? (bone.startsWith('Hand') ? 'Palm' : null);
    vertices.push({ mesh, i, bone, part, foot: point.y < .034 ? (point.x < 0 ? 'R' : 'L') : null });
  }
  // Midpoints also sample the distal pad where a low-poly mesh has sparse vertices.
  const { index } = mesh.geometry;
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    for (const [edge, a] of triangle.entries()) {
      const b = triangle[(edge + 1) % 3];
      if (a < b && bones[a] === bones[b] && /^(Thumb|Index|Middle|Ring|Little)3[LR]$/.test(bones[a])) {
        distalEdges.push({ mesh, a, b, bone: bones[a] });
      }
    }
  }
});

const bodyMixer = new THREE.AnimationMixer(asset.scene);
const propMixer = new THREE.AnimationMixer(prop);
const point = new THREE.Vector3();
const local = new THREE.Vector3();
const delta = new THREE.Vector3();
const inverse = new THREE.Matrix4();
const padEnd = new THREE.Vector3();
const offset = new THREE.Vector3();
const handRotation = new THREE.Quaternion();

function nearestHandle(local) {
  let distanceSquared = Infinity;
  let lane = 0;
  for (const segment of segments) {
    const { start, direction, lengthSquared } = segment;
    const axialDistance = Math.max(0, Math.abs(local.x - start.x) - Math.abs(direction.x));
    if (axialDistance * axialDistance >= distanceSquared) continue;
    const along = THREE.MathUtils.clamp(delta.subVectors(local, start).dot(direction) / lengthSquared, 0, 1);
    const squared = delta.addScaledVector(direction, -along).lengthSq();
    if (squared < distanceSquared) {
      distanceSquared = squared;
      lane = segment.lane + along * segmentLength;
    }
  }
  return { gap: Math.sqrt(distanceSquared) - radius, lane };
}

function gripFrame(side) {
  const sign = side === 'L' ? 1 : -1;
  const hand = asset.scene.getObjectByName('Hand' + side);
  const { position, quaternion } = dumbbellGripTransform(sign);
  const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const along = new THREE.Vector3(sign * .025, -.137, .065).normalize();
  along.addScaledVector(axis, -along.dot(axis)).normalize();
  const dorsal = axis.clone().cross(along);
  return {
    hand, position, axis, along, dorsal, inverse: new THREE.Matrix4(),
    pads: distalEdges.filter(({ bone }) => bone.endsWith(side)),
  };
}
const mapMuscle = (name) => ({
  abdominals: 'Core', traps: 'Upper back', 'middle back': 'Upper back',
  'lower back': 'Upper back', lats: 'Upper back',
})[name] ?? name[0].toUpperCase() + name.slice(1);

for (const [id, entry] of Object.entries(entries)) {
  const item = catalog.find((item) => item.id === id && item.equipment === 'KETTLEBELLS');
  assert.equal(entry.name, item?.name);
  assert.deepEqual(entry.primary, [...new Set(item.primaryMuscles.map(mapMuscle))]);
  assert.deepEqual(entry.supporting, [...new Set(item.secondaryMuscles.map(mapMuscle))]
    .filter((muscle) => !entry.primary.includes(muscle)));
  assert.ok([...entry.primary, ...entry.supporting].every((muscle) => materials.has(muscle)));
  assert.equal(entry.equipment, 'kettlebell');
  assert.equal(entry.propClip.duration, entry.clip.duration);
  assert.deepEqual(entry.propClip.tracks.map((track) => track.name), ['.position', '.quaternion']);
  assert.ok(['standing', 'floor'].includes(entry.framing));
  for (const track of entry.clip.tracks) {
    const size = track.getValueSize();
    const last = track.values.length - size;
    const start = track.values.slice(0, size);
    const end = track.values.slice(last);
    if (size === 4) {
      const dot = start.reduce((sum, value, i) => sum + value * end[i], 0);
      assert.ok(1 - Math.abs(dot) < .0001, id + ' body loop ' + track.name);
    } else assert.deepEqual(start, end, id + ' body loop ' + track.name);
  }
  const gripSides = ['L', 'R'].filter((side) => entry.clip.tracks.some((track) => track.name === 'Index2' + side + '.quaternion'));
  const goblet = id.endsWith('Goblet_Squat');
  const highPull = id.endsWith('Sumo_High_Pull');
  if (highPull) for (const track of entry.clip.tracks.filter(({ name }) => /^(Arm|Forearm)[LR]\.quaternion$/.test(name))) {
    const previous = new THREE.Quaternion().fromArray(track.values).normalize();
    const current = new THREE.Quaternion();
    for (let i = 4; i < track.values.length; i += 4) {
      current.fromArray(track.values, i).normalize();
      assert.ok(previous.angleTo(current) < .2, id + ' continuous upper arm and forearm roll');
      previous.copy(current);
    }
  }
  const clean = id.includes('Bottoms-Up_Clean');
  const deadlift = id.endsWith('One-Legged_Deadlift');
  const swing = id.endsWith('Kettlebell_Swings');
  const floorPress = id.endsWith('Kettlebell_Floor_Press');
  const twoHands = goblet || highPull;
  const wristLimit = goblet ? 22 : highPull ? 35 : clean || deadlift || floorPress ? 12 : Infinity;
  assert.deepEqual(gripSides, twoHands ? ['L', 'R'] : ['R'], id + ' active grip hands');
  const grips = gripSides.map(gripFrame);
  let minimumPadSpan = Infinity;
  let minimumLaneSpacing = Infinity;
  const body = bodyMixer.clipAction(entry.clip).play();
  const weight = propMixer.clipAction(entry.propClip).play();
  body.paused = weight.paused = true;
  const start = new THREE.Vector3();
  const startRotation = new THREE.Quaternion();
  let movement = 0;
  let floor = Infinity;
  let footprint = 0;
  let propFloor = Infinity;
  let bellGap = Infinity;
  let handleGap = Infinity;
  let gripDepth = 0;
  let handHalfGap = Infinity;
  let armFloorAtRest = Infinity;
  let worstContact = 0;
  let bellNear, handleNear, contactNear, depthNear, floorNear;
  const planted = deadlift ? ['R'] : ['L', 'R'];
  const ankles = planted.map((side) => asset.scene.getObjectByName('Foot' + side));
  const anchors = ankles.map(() => new THREE.Vector3());
  const rate = 40;
  const sampleCount = Math.round(entry.clip.duration * rate);
  for (let frame = 0; frame <= sampleCount; frame++) {
    const t = frame === sampleCount ? entry.clip.duration : frame / rate;
    body.time = weight.time = t;
    bodyMixer.update(0);
    propMixer.update(0);
    asset.scene.updateMatrixWorld(true);
    prop.updateMatrixWorld(true);
    if (deadlift || swing || floorPress) {
      const freeHand = asset.scene.getObjectByName('HandL');
      const wristAngle = freeHand.position.angleTo(handAlong(1).applyQuaternion(freeHand.quaternion));
      assert.ok(wristAngle < (floorPress ? .50 : .35), `${id} free wrist bend ${wristAngle} at ${t}`);
    }
    if (floorPress) {
      const { heel, knuckles, dorsal, bend } = palmContact('L');
      assert.ok(Math.abs(heel) < .003 && Math.abs(knuckles) < .009 && dorsal.y > .98,
        `${id} free palm floor contact at ${t} s`);
      assert.ok(bend < .04, `${id} supporting wrist follows the forearm at ${t} s`);
      const hand = asset.scene.getObjectByName('HandL');
      const elbow = hand.parent;
      const shoulder = elbow.parent;
      const upper = elbow.getWorldPosition(point).sub(shoulder.getWorldPosition(local)).normalize();
      const lower = hand.getWorldPosition(local).sub(elbow.getWorldPosition(padEnd));
      const front = padEnd.set(0, 0, 1).applyQuaternion(shoulder.getWorldQuaternion(handRotation));
      lower.addScaledVector(upper, -lower.dot(upper)).normalize();
      front.addScaledVector(upper, -front.dot(upper)).normalize();
      assert.ok(front.dot(lower) > .99, `${id} supporting elbow flexes forward at ${t} s`);
    }
    if (clean && t >= 1.32 && t <= 1.65) {
      assert.ok(point.set(0, -1, 0).applyQuaternion(prop.quaternion).y > .95, id + ' bell inversion');
    }
    ankles.forEach((ankle, index) => {
      ankle.getWorldPosition(point);
      if (frame === 0) anchors[index].copy(point);
      assert.ok(point.distanceTo(anchors[index]) < .001, id + ' planted ankle drift');
    });
    inverse.copy(prop.matrixWorld).invert();
    if (frame === 0) {
      start.copy(prop.position);
      startRotation.copy(prop.quaternion);
    }
    movement = Math.max(movement, prop.position.distanceTo(start));
    if (frame === sampleCount) {
      assert.ok(prop.position.distanceTo(start) < .0001, id + ' prop loop position');
      assert.ok(1 - Math.abs(prop.quaternion.dot(startRotation)) < .0001, id + ' prop loop orientation');
    }
    for (const vertex of propVertices) {
      propFloor = Math.min(propFloor, point.copy(vertex).applyMatrix4(prop.matrixWorld).y);
    }
    const soles = { L: Infinity, R: Infinity };
    const contacts = Object.fromEntries(gripSides.flatMap((side) =>
      ['Palm', ...digits].map((part) => [part + side, Infinity])));
    for (const { mesh, i, bone, part, foot } of vertices) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      assert.ok(Number.isFinite(point.x + point.y + point.z), id);
      if (point.y < floor) { floor = point.y; floorNear = [bone, t]; }
      if (frame === 0 && (bone === 'ArmR' || bone === 'ForearmR')) armFloorAtRest = Math.min(armFloorAtRest, point.y);
      if (gripSides.length === 2 && part) {
        handHalfGap = Math.min(handHalfGap, point.x * (bone.endsWith('L') ? 1 : -1));
      }
      if (foot) soles[foot] = Math.min(soles[foot], point.y);
      local.copy(point).applyMatrix4(inverse);
      if (Math.abs(local.x) > .19 || local.y > .11 || local.y < -.34 || Math.abs(local.z) > .16) continue;
      const radial = Math.hypot(local.x, local.z);
      // Test against the lathe profile, using its circumscribed radius.
      for (let j = 1; j < profile.length; j++) {
        const low = profile[j - 1], high = profile[j];
        if (high.y === low.y) continue;
        const altitude = THREE.MathUtils.clamp(local.y, low.y, high.y);
        const r = THREE.MathUtils.lerp(low.x, high.x, (altitude - low.y) / (high.y - low.y));
        const gap = local.y === altitude ? radial - r : Math.hypot(local.y - altitude, Math.max(0, radial - r));
        if (gap < bellGap) { bellGap = gap; bellNear = [bone, t]; }
      }
      const { gap } = nearestHandle(local);
      const contact = part + bone.at(-1);
      if (Object.hasOwn(contacts, contact)) {
        if (-gap > gripDepth) { gripDepth = -gap; depthNear = [bone, t]; }
        contacts[contact] = Math.min(contacts[contact], Math.abs(gap));
      } else if (gap < handleGap) { handleGap = gap; handleNear = [bone, t]; }
    }
    for (const grip of grips) {
      const { hand, position, axis, along, dorsal, pads } = grip;
      grip.inverse.copy(hand.matrixWorld).invert();
      const side = hand.name.at(-1);
      if (twoHands || clean || deadlift || floorPress) {
        hand.getWorldPosition(point).sub(hand.parent.getWorldPosition(local));
        const handDirection = offset.set(side === 'L' ? .025 : -.025, -.137, .065)
          .applyQuaternion(hand.getWorldQuaternion(handRotation));
        const wristAngle = THREE.MathUtils.radToDeg(handDirection.angleTo(point));
        assert.ok(wristAngle < wristLimit, `${id} wrist angle ${wristAngle} at ${t} s`);
        if (highPull && t >= 1.32 && t <= 1.65) {
          assert.ok(point.y < -.08, id + ' wrists must stay below elbows at the top');
        }
        if (highPull && t <= .2) {
          hand.parent.getWorldPosition(local).sub(hand.parent.parent.getWorldPosition(padEnd));
          const elbowFlexion = THREE.MathUtils.radToDeg(point.angleTo(local));
          assert.ok(elbowFlexion < 12, `${id} setup elbow flexion ${elbowFlexion}`);
        }
      }
      const sample = (world) => {
        const { gap, lane } = nearestHandle(local.copy(world).applyMatrix4(inverse));
        offset.copy(world).applyMatrix4(grip.inverse).sub(position);
        return { gap, lane, axial: offset.dot(axis),
          angle: THREE.MathUtils.radToDeg(Math.atan2(offset.dot(along), offset.dot(dorsal))) };
      };
      const byDigit = Object.fromEntries(digits.map((digit) => [digit, []]));
      for (const { mesh, a, b, bone } of pads) {
        mesh.getVertexPosition(a, point).lerp(mesh.getVertexPosition(b, padEnd), .5).applyMatrix4(mesh.matrixWorld);
        const pad = sample(point);
        if (-pad.gap > gripDepth) { gripDepth = -pad.gap; depthNear = [bone, t, 'midpoint']; }
        byDigit[bone.slice(0, -2)].push(pad);
      }
      const lanes = [];
      for (const digit of digits) {
        const at = `${id} ${digit}${side} at ${t.toFixed(3)} s`;
        const opposed = digit === 'Thumb';
        const [base, middle, distal] = [1, 2, 3].map((joint) =>
          sample(asset.scene.getObjectByName(digit + joint + side).getWorldPosition(point)));
        if (!opposed) {
          assert.ok(middle.angle - base.angle >= 30 && distal.angle - middle.angle >= 30, at + ' wrap');
          assert.ok(Math.max(Math.abs(middle.axial - base.axial), Math.abs(distal.axial - base.axial)) < .007,
            at + ' joint drift across lane');
        }
        // A pad on a curved horn can also approach the neighboring straight grip.
        const region = byDigit[digit].filter(({ gap, angle, axial, lane }) => Math.abs(gap) < .0025
          && Math.abs(axial - distal.axial) < .015 && Math.abs(lane - distal.lane) < .014
          && (opposed ? angle < -100 : angle > 115));
        const span = Math.max(...region.map(({ angle }) => angle)) - Math.min(...region.map(({ angle }) => angle));
        assert.ok(span > 1, at + ' distal pad surface span ' + span);
        const lane = region.reduce((sum, sample) => sum + sample.lane, 0) / region.length;
        assert.ok(lane > .015 && lane < totalLength - .015, at + ' pad runs off handle end');
        if (!opposed) lanes.push(lane);
        minimumPadSpan = Math.min(minimumPadSpan, span);
      }
      const direction = Math.sign(lanes[0] - lanes.at(-1));
      for (let i = 1; i < lanes.length; i++) {
        const spacing = (lanes[i - 1] - lanes[i]) * direction;
        assert.ok(spacing > .010, `${id} ${side} at ${t.toFixed(3)} s pad lane spacing ${spacing}`);
        minimumLaneSpacing = Math.min(minimumLaneSpacing, spacing);
      }
    }
    footprint = Math.max(footprint, Math.abs(soles.R), deadlift ? 0 : Math.abs(soles.L));
    for (const [part, gap] of Object.entries(contacts)) {
      if (gap > worstContact) { worstContact = gap; contactNear = [part, t]; }
    }
  }
  // shortcut: sampled vertices and analytic prop surfaces, upgrade to swept mesh collision for other rigs or playback rates.
  assert.ok(movement > .2, `${id} prop travel ${movement}`);
  assert.ok(floor > -.002, `${id} skin floor clearance ${floor} near ${floorNear}`);
  assert.ok(footprint < .005, `${id} sole contact gap ${footprint}`);
  assert.ok(propFloor > -.0005, `${id} prop floor clearance ${propFloor}`);
  if (highPull) assert.ok(propFloor < .001, id + ' starts off the floor');
  if (entry.framing === 'floor') assert.ok(Math.abs(armFloorAtRest) < .006, id + ' working arm floor contact');
  assert.ok(handHalfGap > .002, `${id} two-hand separation ${handHalfGap}`);
  assert.ok(bellGap > .005, `${id} bell clearance ${bellGap} near ${bellNear}`);
  assert.ok(handleGap > .005, `${id} non-grip handle clearance ${handleGap} near ${handleNear}`);
  assert.ok(gripDepth < .0025, `${id} handle grip overlap ${gripDepth} near ${depthNear}`);
  assert.ok(worstContact < .0025, `${id} palm or finger grip gap ${worstContact} near ${contactNear}`);
  console.log(`${entry.name} — bell clearance ${(bellGap * 1000).toFixed(1)} mm, `
    + `non-grip handle clearance ${(handleGap * 1000).toFixed(1)} mm, `
    + `pad span ${minimumPadSpan.toFixed(1)}°, lane spacing ${(minimumLaneSpacing * 1000).toFixed(1)} mm`);
  body.stop();
  weight.stop();
}
