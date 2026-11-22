import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { attachDumbbells, createExerciseGroups, createPowerGripTracks } from './clips.mjs';
import { createDumbbell } from './dumbbell.mjs';

const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const { scene } = asset;
const entries = createExerciseGroups(asset).flatMap(([, group]) => Object.values(group));
const props = attachDumbbells(scene, createDumbbell);
const mixer = new THREE.AnimationMixer(scene);
const digits = ['Index', 'Middle', 'Ring', 'Little'];
const vertex = new THREE.Vector3();
const handVertices = { L: [], R: [] };
const distalEdges = { L: [], R: [] };

scene.traverse((mesh) => {
  if (!mesh.isSkinnedMesh) return;
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  const bones = [];
  for (let i = 0; i < skinIndex.count; i++) {
    let dominant = 0;
    for (let k = 1; k < 4; k++) {
      if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, dominant)) dominant = k;
    }
    const bone = mesh.skeleton.bones[skinIndex.getComponent(i, dominant)].name;
    bones.push(bone);
    if (/^(Hand|Forearm|(?:Thumb|Index|Middle|Ring|Little)[123])[LR]$/.test(bone)) {
      handVertices[bone.at(-1)].push({ mesh, i, bone });
    }
  }
  // Sample the skinned distal surface between vertices on the low-poly fingers.
  const { index } = mesh.geometry;
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    triangle.forEach((a, edge) => {
      const b = triangle[(edge + 1) % 3];
      const bone = bones[a];
      if (bone === bones[b] && /^(Thumb|Index|Middle|Ring|Little)3[LR]$/.test(bone)) {
        distalEdges[bone.at(-1)].push({ mesh, a, b, bone });
      }
    });
  }
});

function measure(prop) {
  scene.updateMatrixWorld(true);
  const hand = prop.parent;
  const side = hand.name.at(-1);
  const sign = side === 'L' ? 1 : -1;
  const along = new THREE.Vector3(sign * .025, -.137, .065).normalize();
  const shaft = new THREE.Vector3(1, 0, 0).applyQuaternion(prop.quaternion);
  const around = along.addScaledVector(shaft, -along.dot(shaft)).normalize();
  const dorsal = shaft.clone().cross(around);
  const inverse = prop.matrixWorld.clone().invert();
  const toHand = hand.matrixWorld.clone().invert();
  const sample = (world) => {
    const local = world.clone().applyMatrix4(inverse);
    const offset = world.applyMatrix4(toHand).sub(prop.position);
    return { lane: sign * local.x, radial: Math.hypot(local.y, local.z),
      angle: THREE.MathUtils.radToDeg(Math.atan2(offset.dot(around), offset.dot(dorsal))) };
  };
  const skin = handVertices[side].map(({ mesh, i, bone }) => ({
    bone, ...sample(mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld)),
  }));
  const shaftSkin = skin.filter(({ lane }) => Math.abs(lane) < .066);
  const midpoints = distalEdges[side].map(({ mesh, a, b, bone }) => ({
    bone, ...sample(mesh.getVertexPosition(a, vertex)
      .lerp(mesh.getVertexPosition(b, new THREE.Vector3()), .5).applyMatrix4(mesh.matrixWorld)),
  }));
  const pad = (digit) => [...shaftSkin, ...midpoints]
    .filter(({ bone, lane }) => bone === digit + '3' + side && Math.abs(lane) < .066);
  const near = ({ radial }) => Math.abs(radial - .014) <= .002;
  const angles = (points) => [...new Set(points.map(({ angle }) => Math.round(angle)))];
  const wrap = digits.map((digit) => {
    const joints = [1, 2, 3].map((i) => sample(scene.getObjectByName(digit + i + side).getWorldPosition(vertex)));
    const [base, middle, distal] = joints;
    const farPad = pad(digit).filter((point) => near(point) && point.angle >= 115);
    return { digit, advance: [middle.angle - base.angle, distal.angle - middle.angle],
      drift: Math.max(...joints.map(({ lane }) => Math.abs(lane - base.lane))),
      lane: distal.lane, padAngles: angles(farPad),
      padDrift: Math.max(...farPad.map(({ lane }) => Math.abs(lane - base.lane))) };
  });
  return {
    wrap,
    palm: shaftSkin.some((point) => point.bone === hand.name && Math.abs(point.lane) < .02 && near(point)),
    opposed: angles(pad('Thumb').filter((point) => near(point) && point.angle < -100)),
    minimumRadius: Math.min(...shaftSkin.map(({ radial }) => radial)),
    headClearance: Math.min(...skin.map(({ lane, radial }) => {
      const axial = Math.abs(lane);
      return Math.max(.066 - axial, axial - .112, radial - .055);
    })),
  };
}

const wraps = ({ advance, drift, padAngles, padDrift }) =>
  advance.every((angle) => angle >= 30) && drift < .007 && padAngles.length >= 2 && padDrift < .013;

const weightedSides = {
  dumbbells: [0, 1], 'dumbbell-left': [0], 'dumbbell-right': [1],
  'bench-dumbbells': [0, 1], 'bench-dumbbell-left': [0], 'bench-dumbbell-right': [1], 'incline-bench-dumbbells': [0, 1],
  'decline-bench-dumbbells': [0, 1],
  'incline-bench-dumbbell-left': [0], 'incline-bench-dumbbell-right': [1], 'bench-platform-dumbbell-right': [1], 'step-platform-dumbbells': [0, 1],
};
let checked = 0;
let maximumDepth = 0;
let minimumHeadClearance = Infinity;
for (const { equipment, clip, phases } of entries) {
  const sides = weightedSides[equipment];
  if (!sides) continue;
  const action = mixer.clipAction(clip).play();
  action.paused = true;
  for (const [time] of phases) {
    action.time = time;
    mixer.update(0);
    for (const side of sides) {
      const result = measure(props[side]);
      const at = clip.name + ' at ' + time + ' s, ' + props[side].parent.name;
      assert.ok(result.wrap.every(wraps), at + ' ' + JSON.stringify(result.wrap));
      assert.ok(result.wrap.slice(1).every(({ lane }, i) => result.wrap[i].lane - lane > .014), at + ' finger lanes');
      assert.ok(result.palm && result.opposed.length >= 2, at + ' palm and opposed thumb');
      assert.ok(result.minimumRadius > .012, at + ' shaft penetration ' + (.014 - result.minimumRadius));
      // Conservative cylindrical bounds enclose the hex heads.
      assert.ok(result.headClearance > .0049, at + ' head clearance ' + result.headClearance);
      maximumDepth = Math.max(maximumDepth, .014 - result.minimumRadius);
      minimumHeadClearance = Math.min(minimumHeadClearance, result.headClearance);
      if (clip.name === 'Dumbbell Squat' && time === 0) {
        console.log(at + ' distal pad reach ' + result.wrap
          .map(({ digit, padAngles }) => digit + ' ' + Math.max(...padAngles) + '°').join(', '));
      }
    }
  }
  checked++;
  action.stop();
}

const squat = entries.find(({ clip }) => clip.name === 'Dumbbell Squat').clip;
const legacyPose = new THREE.AnimationClip('Legacy dumbbell squat', squat.duration,
  [...squat.tracks.filter(({ name }) => !/^(Thumb|Index|Middle|Ring|Little)/.test(name)),
    ...createPowerGripTracks(scene)]);
const legacy = mixer.clipAction(legacyPose).play();
legacy.paused = true;
mixer.update(0);
for (const [i, prop] of props.entries()) {
  const sign = i === 0 ? 1 : -1;
  const along = new THREE.Vector3(sign * .025, -.137, .065).normalize();
  const across = new THREE.Vector3(1, 0, 0).addScaledVector(along, -along.x).normalize();
  const dorsal = across.clone().cross(along);
  prop.position.copy(along).multiplyScalar(.10654).addScaledVector(dorsal, -.03918)
    .addScaledVector(across, sign * .05364);
  prop.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), across.applyAxisAngle(dorsal, -sign * .5));
  const { wrap } = measure(prop);
  assert.ok(wrap.slice(2).every((digit) => !wraps(digit)), 'Legacy ring and little fingers should fail the shape check');
  console.log(prop.parent.name + ' legacy ring/little angular advances ' + wrap.slice(2)
    .map(({ advance }) => advance.map(Math.round).join('° / ') + '°').join(', '));
}
assert.equal(checked, 114, 'standard dumbbell grip clips');
console.log(checked + ' dumbbell clips at all phase keys, '
  + (maximumDepth * 1000).toFixed(2) + ' mm maximum shaft penetration, '
  + (minimumHeadClearance * 1000).toFixed(2) + ' mm minimum hand-to-head clearance');
