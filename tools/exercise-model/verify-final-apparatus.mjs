import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, Line3, LoopOnce, Matrix4, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { handAlong } from './hand-frame.mjs';
import { createEntries, createFinalApparatusFixture, groupLabel } from './final-apparatus.mjs';

const expected = `
Ab_Roller Anterior_Tibialis-SMR Balance_Board Band_Assisted_Pull-Up
Behind_Head_Chest_Stretch Chair_Leg_Extended_Stretch Chair_Upper_Body_Stretch Chest_And_Front_Of_Shoulder_Stretch
Donkey_Calf_Raises Foot-SMR Hyperextensions_Back_Extensions IT_Band_and_Glute_Stretch
Intermediate_Hip_Flexor_and_Quad_Stretch Inverted_Row_with_Straps Kipping_Muscle_Up Knee_Hip_Raise_On_Parallel_Bars
London_Bridges Muscle_Up Neck-SMR One_Handed_Hang
Platform_Hamstring_Slides Quad_Stretch Ring_Dips Rocky_Pull-Ups_Pulldowns
Rope_Climb Round_The_World_Shoulder_Stretch Seated_Band_Hamstring_Curl Standing_Elevated_Quad_Stretch
Suspended_Fallout Suspended_Push-Up Suspended_Reverse_Crunch Suspended_Row
Suspended_Split_Squat Weighted_Bench_Dip Weighted_Pull_Ups Weighted_Sit-Ups_-_With_Bands
Bodyweight_Flyes Cable_Wrist_Curl Smith_Incline_Shoulder_Raise Prone_Manual_Hamstring
`.trim().split(/\s+/);
const read = (path) => readFile(new URL(path, import.meta.url));
const [bytes, catalogJson] = await Promise.all([read('./anatomy.glb'), read('../../apps/client/lib/data/exercise-catalog.json')]);
const catalog = new Map(JSON.parse(catalogJson).map((entry) => [entry.sourceKey, entry]));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(Uint8Array.from(bytes).buffer, '');
const { scene } = asset;
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
assert.ok(groupLabel.trim());
assert.equal(expected.length, 40);
assert.deepEqual(Object.keys(entries).sort(), expected.map((id) => 'local:exercise:' + id).sort());

const meshes = [];
scene.traverse((node) => { if (node.isSkinnedMesh) meshes.push(node); });
const muscles = new Set(meshes.map(({ material }) => material.name));
const mixer = new AnimationMixer(scene);
const point = (name) => scene.getObjectByName(name).getWorldPosition(new Vector3());
const bones = ['Pelvis', 'Head', 'ForearmL', 'ForearmR', 'HandL', 'HandR', 'ShinL', 'ShinR', 'FootL', 'FootR'];
const handSeat = (side, index) => scene.getObjectByName('Hand' + side)
  .localToWorld(dumbbellGripTransform(1 - 2 * index).position);
const wristRotation = () => scene.getObjectByName('HandL').getWorldQuaternion(new Quaternion());
const footSeat = (side) => scene.getObjectByName('Foot' + side).localToWorld(new Vector3(0, -.034, .092));
const vertex = new Vector3();
const signatures = new Set();
const wristChecks = new Set(['Intermediate_Hip_Flexor_and_Quad_Stretch', 'Suspended_Row', 'Ring_Dips', 'Donkey_Calf_Raises']);

for (const id of expected) {
  const entry = entries['local:exercise:' + id];
  assert.equal(entry.name, catalog.get(id).name);
  assert.ok([...entry.primary, ...entry.supporting].every((muscle) => muscles.has(muscle)), id + ' atlas groups');
  assert.equal(entry.phases[0][0], 0);
  assert.equal(entry.phases.at(-1)[0], entry.clip.duration);
  assert.ok(entry.cues.length >= 3 && entry.cues.every(([at, title, detail], i) =>
    at >= 0 && at <= entry.clip.duration && (!i || at > entry.cues[i - 1][0]) && title.trim() && detail.trim()), id + ' cues');
  assert.ok(entry.clip.validate() && entry.clip.tracks.every(({ values }) => values.every(Number.isFinite)), id + ' rig tracks');
  if (['Neck-SMR', 'London_Bridges', 'Rope_Climb', 'Muscle_Up', 'Kipping_Muscle_Up', 'Seated_Band_Hamstring_Curl'].includes(id)) {
    for (const { name, values } of entry.clip.tracks.filter(({ name }) => name.endsWith('.quaternion'))) {
      const previous = new Quaternion();
      const current = new Quaternion().fromArray(values);
      for (let i = 4; i < values.length; i += 4) {
        previous.copy(current);
        current.fromArray(values, i);
        assert.ok(previous.angleTo(current) < .36, id + ' abrupt change in ' + name + ' at key ' + i / 4);
      }
    }
  }

  const config = entry.finalApparatusFixture;
  const fixture = createFinalApparatusFixture(entry, scene);
  assert.ok(fixture.root.children.length, id + ' equipment');
  const rope = fixture.root.getObjectByName('Climbing rope');
  const closedGrip = rope && ['L', 'R'].map((side) => new Quaternion().fromArray(
    entry.clip.tracks.find(({ name }) => name === 'Index1' + side + '.quaternion').values));
  const props = [[fixture.animated, entry.propClip], [fixture.secondAnimated, entry.secondPropClip]];
  for (const [prop, clip] of props) {
    assert.equal(Boolean(prop), Boolean(clip), id + ' prop binding');
    if (clip) assert.ok(clip.validate() && clip.duration === entry.clip.duration, id + ' prop tracks');
  }
  const action = mixer.clipAction(entry.clip).setLoop(LoopOnce, 1).play();
  action.paused = true;
  const signature = [];
  let lowest = Infinity;
  let travel = 0;
  function sample(time) {
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    fixture.update(time);
    fixture.root.updateMatrixWorld(true);
    for (const [prop, clip] of props) {
      if (!prop) continue;
      const [pos, rot] = clip.tracks.map((track) => track.createInterpolant().evaluate(time));
      assert.ok(prop.position.distanceTo(new Vector3().fromArray(pos)) < 1e-6, id + ' equipment position sync');
      assert.ok(1 - Math.abs(prop.quaternion.dot(new Quaternion().fromArray(rot))) < 1e-6, id + ' equipment rotation sync');
    }
    return bones.map(point);
  }
  const initial = sample(0);
  const initialWrist = wristRotation();
  const phaseTimes = new Set(entry.phases.map(([at]) => at));
  for (const t of new Set([...phaseTimes, ...Array.from({ length: 41 }, (_, i) => i * entry.clip.duration / 40)])) {
    const positions = sample(t);
    if (wristChecks.has(id)) {
      for (const [side, sign] of [['L', 1], ['R', -1]]) {
        const hand = scene.getObjectByName('Hand' + side);
        const bend = hand.position.angleTo(handAlong(sign).applyQuaternion(hand.quaternion));
        assert.ok(bend < 1.05, id + ' wrist alignment at ' + t);
      }
    }
    if (id === 'Weighted_Bench_Dip') {
      for (const [side, sign] of [['L', 1], ['R', -1]]) {
        assert.ok(point('Hand' + side).distanceTo(new Vector3(sign * .203, .4735, -.195)) < .003,
          id + ' keeps both palms on the bench');
      }
    }
    if (phaseTimes.has(t)) signature.push(...positions.flatMap((p) => p.toArray().map((n) => n.toFixed(3))));
    travel = Math.max(travel, ...positions.map((position, i) => position.distanceTo(initial[i])));
    fixture.root.traverse(({ matrixWorld }) => assert.ok(matrixWorld.elements.every(Number.isFinite), id + ' fixture transforms'));
    for (const mesh of meshes) {
      for (let i = 0; i < mesh.geometry.attributes.position.count; i += 13) {
        lowest = Math.min(lowest, mesh.localToWorld(mesh.getVertexPosition(i, vertex)).y);
      }
    }
    if (config.kind === 'suspension') {
      const loops = fixture.root.getObjectsByProperty('name', config.rings ? 'Gymnastic ring' : 'Foot cradle');
      const straps = fixture.root.getObjectsByProperty('name', config.rings ? 'Ring strap' : 'Suspension strap');
      config.anchors.forEach((anchor, index) => {
        const side = index || config.endpoint === 'footR' ? 'R' : 'L';
        const contact = config.endpoint === 'hands' ? handSeat(side, index) : footSeat(side);
        assert.ok(Math.abs(contact.distanceTo(new Vector3(...anchor)) - config.length) < .022, id + ' strap reach at ' + t);
        const radius = config.rings ? .105 : .056;
        assert.ok(Math.abs(straps[index].scale.y + (loops.length ? 2 * radius : .105) - config.length) < .022,
          id + ' strap length at ' + t);
        if (loops.length) assert.ok(loops[index].localToWorld(new Vector3(0, -radius, 0)).distanceTo(contact) < .001,
          id + ' ring or cradle contact at ' + t);
      });
    }
    if (id === 'Foot-SMR') {
      const center = fixture.animated.position;
      const travel = center.z - .627;
      const arch = scene.getObjectByName('FootL').localToWorld(new Vector3(0, -.073, .107 - travel));
      assert.ok(arch.distanceTo(center.clone().add(new Vector3(0, .033, 0))) < .001, id + ' arch contact at ' + t);
      assert.ok(fixture.animated.quaternion.angleTo(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0),
        travel / .033)) < .002, id + ' roller rolls across the floor at ' + t);
    }
    if (config.kind === 'pull-up') {
      for (const [index, side] of (config.step ? ['L'] : ['L', 'R']).entries()) {
        const seat = handSeat(side, index);
        assert.ok(Math.hypot(seat.y - 2.3, seat.z) < .005, id + ' fixed bar contact at ' + t);
      }
    }
    if (rope) {
      const line = new Line3(rope.localToWorld(new Vector3(0, -.5, 0)), rope.localToWorld(new Vector3(0, .5, 0)));
      const contacts = [];
      for (const [index, side] of ['L', 'R'].entries()) {
        const finger = scene.getObjectByName('Index1' + side);
        if (closedGrip[index].angleTo(finger.quaternion) > .06) continue;
        const grip = handSeat(side, index);
        contacts.push(grip);
        assert.ok(line.closestPointToPoint(grip, true, new Vector3()).distanceTo(grip) < .016,
          id + ' closed hand on the rope at ' + t);
      }
      if (contacts.length === 2) assert.ok(contacts[0].distanceTo(contacts[1]) > .075, id + ' hands clear each other at ' + t);
    }
    if (id === 'Ab_Roller') {
      assert.equal(fixture.animated.position.y.toFixed(3), '0.088');
      for (const [index, side] of ['L', 'R'].entries()) {
        const axle = fixture.animated.localToWorld(new Vector3((1 - 2 * index) * .145, 0, 0));
        assert.ok(handSeat(side, index).distanceTo(axle) < .005, id + ' hand on axle at ' + t);
      }
    }
    if (id === 'Bodyweight_Flyes') {
      for (const [index, side] of ['L', 'R'].entries()) {
        const prop = index ? fixture.secondAnimated : fixture.animated;
        assert.ok(Math.abs(prop.position.y - .145) < .001, id + ' plate stays on floor');
        assert.ok(handSeat(side, index).distanceTo(prop.localToWorld(new Vector3(.105, 0, .030))) < .005, id + ' grip on EZ bar');
      }
    }
    if (id === 'Smith_Incline_Shoulder_Raise') {
      assert.ok(Math.abs(fixture.animated.position.z - config.z) < .001, id + ' shaft stays on rail plane');
      for (const [index, side] of ['L', 'R'].entries()) {
        const seat = handSeat(side, index);
        assert.ok(Math.hypot(seat.y - fixture.animated.position.y, seat.z - config.z) < .005, id + ' Smith grip');
      }
    }
  }
  assert.ok(lowest > -.012, id + ' sampled floor clearance ' + lowest);
  if (id === 'Cable_Wrist_Curl') {
    sample(entry.phases[2][0]);
    assert.ok(wristRotation().angleTo(initialWrist) > 1, id + ' wrist flexion');
    assert.ok(travel < .002, id + ' stationary forearms and body');
  } else {
    assert.ok(travel > .035, id + ' body motion ' + travel);
  }
  if (id === 'Foot-SMR') {
    sample(entry.phases[2][0]);
    assert.ok(fixture.animated.position.z > .685, id + ' roller travels during the scan');
  }
  if (id === 'Kipping_Muscle_Up') {
    const rings = fixture.root.getObjectsByProperty('name', 'Gymnastic ring');
    const body = meshes.map((mesh) => {
      const { skinIndex, skinWeight } = mesh.geometry.attributes;
      const names = mesh.skeleton.bones.map(({ name }) => name);
      const indices = [];
      // Closed hands intentionally wrap the rings. Check the surface outside the grip.
      for (let i = 0; i < skinIndex.count; i++) {
        let dominant = 0;
        for (let j = 1; j < 4; j++) {
          if (skinWeight.getComponent(i, j) > skinWeight.getComponent(i, dominant)) dominant = j;
        }
        if (/^(Pelvis|Lumbar|Chest|Head|Neck|Clavicle|Arm|Forearm)/.test(names[skinIndex.getComponent(i, dominant)])) {
          indices.push(i);
        }
      }
      return { mesh, indices };
    });
    const ringSpaces = rings.map(() => new Matrix4());
    const local = new Vector3();
    const { radius, tube } = rings[0].geometry.parameters;
    const ringBoundsSquared = (radius + tube) ** 2;
    const [supportStart] = entry.phases[4];
    const [supportEnd] = entry.phases[5];
    let penetration = 0;
    let contactTime = 0;
    const samples = Math.ceil(entry.clip.duration * 120);
    for (let frame = 0; frame <= samples; frame++) {
      const t = frame * entry.clip.duration / samples;
      sample(t);
      for (const [index, side] of ['L', 'R'].entries()) {
        const sign = 1 - 2 * index;
        const hand = scene.getObjectByName('Hand' + side);
        const bend = hand.position.angleTo(handAlong(sign).applyQuaternion(hand.quaternion));
        assert.ok(bend < 1.01, id + ' wrist bend ' + side + ' at ' + t);
        const seat = handSeat(side, index);
        const ring = rings[index];
        const tangent = new Vector3(1, 0, 0).transformDirection(ring.matrixWorld);
        const gripAxis = new Vector3(1, 0, 0).applyQuaternion(dumbbellGripTransform(sign).quaternion)
          .transformDirection(hand.matrixWorld);
        assert.ok(Math.abs(tangent.dot(gripAxis)) > .9995, id + ' ring tangent ' + side + ' at ' + t);
        assert.ok(ring.localToWorld(new Vector3(0, -.105, 0)).distanceTo(seat) < .001, id + ' ring seat ' + side + ' at ' + t);
        assert.ok(Math.abs(seat.distanceTo(new Vector3(...config.anchors[index])) - config.length) < .003,
          id + ' ring strap reach ' + side + ' at ' + t);
        if (t >= supportStart && t <= supportEnd) {
          const elbow = point('Forearm' + side);
          const upper = elbow.clone().sub(point('Arm' + side));
          const lower = point('Hand' + side).sub(elbow);
          assert.ok(upper.angleTo(lower) < .18, id + ' straight-arm support ' + side + ' at ' + t);
        }
        ringSpaces[index].copy(ring.matrixWorld).invert();
      }
      for (const { mesh, indices } of body) {
        for (const index of indices) {
          mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
          for (let i = 0; i < rings.length; i++) {
            if (vertex.distanceToSquared(rings[i].position) > ringBoundsSquared) continue;
            local.copy(vertex).applyMatrix4(ringSpaces[i]);
            const depth = tube - Math.hypot(Math.hypot(local.x, local.y) - radius, local.z);
            if (depth > penetration) {
              penetration = depth;
              contactTime = t;
            }
          }
        }
      }
    }
    assert.ok(penetration < .001, id + ' ring penetration ' + (penetration * 1000).toFixed(2) + ' mm at ' + contactTime);
  }
  signatures.add(signature.join(','));
  const finish = sample(entry.clip.duration);
  assert.ok(finish.every((position, i) => position.distanceTo(initial[i]) < .001), id + ' closed loop');
  sample(entry.phases[1][0]);
  action.stop();
  mixer.uncacheClip(entry.clip);
  fixture.root.traverse((object) => object.geometry?.dispose());
}
assert.equal(signatures.size, expected.length, 'distinct sampled motion');
console.log('Verified all 40 final apparatus clips and fixtures.');
