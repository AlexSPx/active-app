import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { attachDumbbells, createDumbbellGripTracks, createExerciseGroups, dumbbellGripTransform } from './clips.mjs';
import { createDumbbell } from './dumbbell.mjs';
import { createEntries, groupLabel } from './dumbbell-extra.mjs';
import { handAlong } from './hand-frame.mjs';

const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const catalog = JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url)));
const existing = new Set(createExerciseGroups(asset).filter(([label]) => label !== groupLabel)
  .flatMap(([, group]) => Object.keys(group)));
const entries = createEntries(asset, { createDumbbellGripTracks });
const { scene } = asset;
const grip = createDumbbellGripTracks(scene);
const props = attachDumbbells(scene, createDumbbell);
const mixer = new THREE.AnimationMixer(scene);
const bone = (name) => scene.getObjectByName(name);
const point = (object) => object.getWorldPosition(new THREE.Vector3());
const attitude = (object) => object.getWorldQuaternion(new THREE.Quaternion());
const direction = (from, to) => point(bone(to)).sub(point(bone(from))).normalize();
const materialFor = (name) => ({ abdominals: 'Core', traps: 'Upper back' })[name]
  ?? name[0].toUpperCase() + name.slice(1);

const bones = [];
const materials = new Set();
const skin = [];
scene.updateMatrixWorld(true);
scene.traverse((object) => {
  if (object.isBone) bones.push(object);
  if (!object.isSkinnedMesh) return;
  materials.add(object.material.name);
  const { skinIndex, skinWeight } = object.geometry.attributes;
  for (let i = 0; i < skinIndex.count; i++) {
    let dominant = 0;
    for (let k = 1; k < 4; k++) {
      if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, dominant)) dominant = k;
    }
    const joint = object.skeleton.bones[skinIndex.getComponent(i, dominant)].name;
    const hand = /^(Hand|(?:Thumb|Index|Middle|Ring|Little)[123])[LR]$/.test(joint) ? joint.at(-1) : '';
    skin.push({ mesh: object, i, joint, hand });
  }
});

function pose() {
  return {
    upper: ['L', 'R'].map((side) => direction('Arm' + side, 'Forearm' + side)),
    lower: ['L', 'R'].map((side) => direction('Forearm' + side, 'Hand' + side)),
    elbows: ['L', 'R'].map((side) => point(bone('Forearm' + side))),
    weights: props.map(point),
    shaftY: props.map((prop) => new THREE.Vector3(1, 0, 0).applyQuaternion(attitude(prop)).y),
    chestUp: new THREE.Vector3(0, 1, 0).applyQuaternion(attitude(bone('Chest'))),
    chestForward: new THREE.Vector3(0, 0, 1).applyQuaternion(attitude(bone('Chest'))),
  };
}

const horizontal = ({ upper }, lateral) => upper.every(({ x, y, z }) =>
  Math.abs(y) < .15 && (lateral ? Math.abs(x) > .94 : z > .94));

function checkMotion(key, sample) {
  const start = sample(0);
  const peak = sample(1.25);
  switch (key) {
    case 'Alternating_Deltoid_Raise':
      assert.ok(horizontal(peak, false) && horizontal(sample(4.25), true), key);
      assert.ok(sample(3).weights.every((weight, i) => weight.distanceTo(start.weights[i]) < .001), key);
      break;
    case 'Side_Laterals_to_Front_Raise':
      assert.ok(horizontal(sample(1.05), true) && horizontal(sample(1.95), false), key);
      assert.ok(horizontal(sample(4.05), false) && horizontal(sample(4.95), true), key);
      break;
    case 'Dumbbell_Raise':
      assert.ok(peak.weights.every((weight, i) => peak.elbows[i].y > weight.y + .025
        && weight.y > point(bone('Head')).y - .015), key);
      break;
    case 'Dumbbell_Scaption':
      assert.ok(peak.upper.every(({ x, y, z }, i) =>
        Math.abs(y) < .05 && Math.abs(Math.atan2(x * (1 - 2 * i), z) - Math.PI / 6) < .01), key);
      assert.ok(peak.upper.every((upper, i) => upper.angleTo(peak.lower[i]) < .08), key);
      assert.ok(peak.shaftY.every((y, i) => y * (1 - 2 * i) > .95), key);
      break;
    case 'Standing_Dumbbell_Straight-Arm_Front_Delt_Raise_Above_Head':
      assert.ok(peak.weights.every((weight) => weight.y > point(bone('Head')).y + .38), key);
      assert.ok(sample(.75).weights.every((weight) => weight.z > .52), key);
      break;
    case 'Standing_Bent-Over_One-Arm_Dumbbell_Triceps_Extension':
    case 'Standing_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension':
      assert.ok(peak.chestUp.z > .9, key);
      for (let i = 0; i < (key.includes('One-Arm') ? 1 : 2); i++) {
        assert.ok(peak.elbows[i].distanceTo(start.elbows[i]) < .001, key);
        assert.ok(start.lower[i].y < -.95 && peak.lower[i].z < -.95, key);
        assert.ok(peak.upper[i].angleTo(peak.lower[i]) < .15, key);
      }
      break;
    case 'Dumbbell_One-Arm_Triceps_Extension':
      assert.ok(start.lower[0].y > .94 && peak.lower[0].z < -.70, key);
      assert.ok(start.elbows[0].distanceTo(peak.elbows[0]) < .001, key);
      assert.ok(peak.weights[0].z < -.19 && peak.weights[0].y < start.weights[0].y - .44, key);
      break;
    case 'Dumbbell_Side_Bend': {
      const opposite = sample(4.25);
      assert.ok(peak.chestUp.x < -.30 && opposite.chestUp.x > .30, key);
      assert.ok(peak.lower[0].y < -.94 && opposite.lower[0].y < -.94, key);
      assert.ok(Math.abs(peak.weights[0].y - opposite.weights[0].y) > .14, key);
      break;
    }
    case 'Spell_Caster':
      assert.ok(start.chestForward.x < -.60 && peak.chestForward.x > .60, key);
      assert.ok(start.weights.every((weight, i) => peak.weights[i].x - weight.x > .50), key);
      assert.ok(peak.upper.every((upper, i) => upper.angleTo(peak.lower[i]) < .20), key);
      assert.ok([start, sample(.75), peak].every(({ shaftY }) => shaftY.every((y) => Math.abs(y) < .17)), key);
      break;
    default:
      assert.fail('Missing pose expectations for ' + key);
  }
}

assert.ok(Object.keys(entries).length >= 10);
const vertex = new THREE.Vector3();
const local = new THREE.Vector3();
for (const [id, entry] of Object.entries(entries)) {
  const catalogItem = catalog.find((item) => item.id === id);
  assert.ok(!existing.has(id), 'Already registered: ' + id);
  assert.equal(catalogItem?.equipment, 'DUMBBELL');
  assert.equal(entry.name, catalogItem.name);
  assert.deepEqual(entry.primary, catalogItem.primaryMuscles.map(materialFor));
  assert.deepEqual(entry.supporting, catalogItem.secondaryMuscles.map(materialFor));
  assert.ok([...entry.primary, ...entry.supporting].every((name) => materials.has(name)));
  assert.ok(!entry.propClip && !entry.oneShot, id);
  assert.ok(entry.clip.validate(), id);

  const expectedEquipment = /One-Arm|Side_Bend/.test(id) ? 'dumbbell-left' : 'dumbbells';
  assert.equal(entry.equipment, expectedEquipment, id);
  props[0].visible = entry.equipment.endsWith('dumbbells') || entry.equipment.endsWith('dumbbell-left');
  props[1].visible = entry.equipment.endsWith('dumbbells') || entry.equipment.endsWith('dumbbell-right');
  const active = props.filter((prop) => prop.visible);
  assert.equal(active.length, expectedEquipment === 'dumbbells' ? 2 : 1);
  for (const [index, prop] of props.entries()) {
    const { position, quaternion } = dumbbellGripTransform(1 - 2 * index);
    assert.equal(prop.parent.name, 'Hand' + 'LR'[index]);
    assert.ok(prop.position.distanceTo(position) < 1e-7 && prop.quaternion.angleTo(quaternion) < 1e-7);
  }
  const fingers = grip.map((track) => {
    const joint = bone(track.name.split('.')[0]);
    const weighted = props['LR'.indexOf(joint.name.at(-1))].visible;
    const actual = entry.clip.tracks.find((sample) => sample.name === track.name);
    assert.equal(Boolean(actual), weighted, track.name);
    return [joint, weighted ? new THREE.Quaternion().fromArray(track.values).normalize() : joint.quaternion.clone()];
  });

  const action = mixer.clipAction(entry.clip).play();
  action.paused = true;
  function setTime(time) {
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
  }
  checkMotion(catalogItem.sourceKey, (time) => {
    setTime(time);
    return pose();
  });
  setTime(0);
  const initial = bones.map((joint) => joint.matrixWorld.clone());
  const feet = ['L', 'R'].map((side) => bone('Foot' + side));
  const ankle = feet.map(point);
  let previous = bones.map(attitude);
  let clearance = Infinity;
  let shaftClearance = Infinity;
  let propFloor = Infinity;
  let worst;
  const frames = entry.clip.duration * 50;
  for (let frame = 0; frame <= frames; frame++) {
    const time = frame / 50;
    setTime(time);
    for (const [i, joint] of bones.entries()) {
      const elements = joint.matrixWorld.elements;
      assert.ok(elements.every(Number.isFinite), joint.name);
      if (frame === frames) assert.ok(elements.every((v, k) => Math.abs(v - initial[i].elements[k]) < .0001),
        id + ' loop at ' + joint.name);
    }
    const current = bones.map(attitude);
    assert.ok(current.every((q, i) => q.angleTo(previous[i]) < .20),
      id + ' abrupt motion at ' + time + ' ' + bones[current.findIndex((q, i) => q.angleTo(previous[i]) >= .20)]?.name);
    previous = current;
    assert.ok(feet.every((foot, i) => point(foot).distanceTo(ankle[i]) < .0001), id + ' foot slide');
    for (const [joint, expected] of fingers) {
      assert.ok(1 - Math.abs(joint.quaternion.dot(expected)) < 1e-6, id + ' grip at ' + joint.name);
    }
    const inverses = active.map((prop) => prop.matrixWorld.clone().invert());
    active.forEach((prop) => {
      const side = prop.parent.name.at(-1);
      const handDirection = handAlong(side === 'L' ? 1 : -1).applyQuaternion(attitude(prop.parent));
      assert.ok(handDirection.angleTo(direction('Forearm' + side, 'Hand' + side)) < .01, id + ' wrist');
      for (const mesh of prop.children) {
        const { position } = mesh.geometry.attributes;
        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
          propFloor = Math.min(propFloor, vertex.y);
          if (active.length === 2 && prop === active[0]) {
            local.copy(vertex).applyMatrix4(inverses[1]);
            const radius = Math.hypot(local.y, local.z);
            assert.ok(Math.abs(local.x) > .112 || radius > (Math.abs(local.x) < .066 ? .014 : .055),
              id + ' dumbbells intersect at ' + time);
          }
        }
      }
    });
    if (frame % 2 && frame !== frames) continue;
    const soles = [Infinity, Infinity];
    const contact = active.map(() => [Infinity, Infinity]);
    for (const { mesh, i, joint, hand } of skin) {
      mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
      assert.ok(vertex.y > -.012 && Number.isFinite(vertex.x + vertex.y + vertex.z), id + ' skin floor');
      if (joint.startsWith('Foot')) {
        const index = 'LR'.indexOf(joint.at(-1));
        soles[index] = Math.min(soles[index], vertex.y);
      }
      for (const [index, inverse] of inverses.entries()) {
        local.copy(vertex).applyMatrix4(inverse);
        const axial = Math.abs(local.x);
        const radius = Math.hypot(local.y, local.z);
        const gap = Math.max(.066 - axial, axial - .112, radius - .055);
        if (gap < clearance) {
          clearance = gap;
          worst = [time, joint, active[index].parent.name];
        }
        const side = active[index].parent.name.at(-1);
        const grippingHand = hand === side;
        if (axial >= .066) continue;
        const shaftGap = radius - .014;
        shaftClearance = Math.min(shaftClearance, shaftGap + (grippingHand ? .002 : 0));
        if (grippingHand && joint.startsWith('Hand') && axial < .020) {
          contact[index][0] = Math.min(contact[index][0], Math.abs(shaftGap));
        }
        if (grippingHand && joint.startsWith('Thumb3')) {
          contact[index][1] = Math.min(contact[index][1], Math.abs(shaftGap));
        }
      }
    }
    assert.ok(soles.every((y) => Math.abs(y) < .012), id + ' sole contact');
    assert.ok(contact.flat().every((gap) => gap < .002), id + ' palm or thumb contact');
  }
  assert.ok(clearance > .0049, id + ' head clearance ' + clearance + ' at ' + worst);
  assert.ok(shaftClearance > 0, id + ' shaft clearance ' + shaftClearance);
  assert.ok(propFloor > .1, id + ' prop floor clearance ' + propFloor);
  action.stop();
  console.log(entry.name + ' — ' + entry.clip.duration + ' s, ' + active.length + ' dumbbell(s), '
    + (clearance * 1000).toFixed(1) + ' mm head clearance, ' + (propFloor * 1000).toFixed(0) + ' mm floor clearance');
}
