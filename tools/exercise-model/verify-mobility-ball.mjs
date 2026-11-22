import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, LoopOnce, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { handAlong, handDorsal } from './hand-frame.mjs';
import { createEntries, createMobilityBallFixture, groupLabel } from './mobility-ball.mjs';

const read = (path) => readFile(new URL(path, import.meta.url));
const [bytes, rows] = await Promise.all([read('./anatomy.glb'), read('../../apps/client/lib/data/exercise-catalog.json')]);
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .parseAsync(Uint8Array.from(bytes).buffer, '');
const { scene } = asset;
const catalog = new Map(JSON.parse(rows).map((row) => [row.sourceKey, row]));
const meshes = [];
scene.traverse((node) => { if (node.isSkinnedMesh) meshes.push(node); });
const muscles = new Set(meshes.map((mesh) => mesh.material.name));
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
const rollerBones = {
  Adductor: 'ThighL',
  'Brachialis-SMR': 'ArmL',
  'Calves-SMR': 'ShinL',
  'Hamstring-SMR': 'ThighL',
  'Iliotibial_Tract-SMR': 'ThighL',
  'Latissimus_Dorsi-SMR': 'Chest',
  'Lower_Back-SMR': 'Lumbar',
  'Peroneals-SMR': 'ShinL',
  'Piriformis-SMR': 'Pelvis',
  'Quadriceps-SMR': 'ThighL',
  'Rhomboids-SMR': 'Chest',
};
const ballIds = [
  'Backward_Medicine_Ball_Throw', 'Catch_and_Overhead_Throw', 'Chest_Push_from_3_point_stance',
  'Chest_Push_multiple_response', 'Chest_Push_single_response', 'Chest_Push_with_Run_Release',
  'Medicine_Ball_Chest_Pass', 'Medicine_Ball_Full_Twist', 'Medicine_Ball_Scoop_Throw',
  'One-Arm_Medicine_Ball_Slam', 'Overhead_Slam', 'Return_Push_from_Stance',
  'Standing_Two-Arm_Overhead_Throw', 'Supine_Chest_Throw', 'Supine_One-Arm_Overhead_Throw',
  'Supine_Two-Arm_Overhead_Throw',
];
const mobilityIds = ['Adductor_Groin', 'Calf_Stretch_Elbows_Against_Wall', 'Calf_Stretch_Hands_Against_Wall',
  'One_Arm_Against_Wall', 'Peroneals_Stretch', 'Posterior_Tibialis_Stretch'];
const wristLimits = {
  Backward_Medicine_Ball_Throw: [50, 15],
  Medicine_Ball_Scoop_Throw: [50, 15],
  Catch_and_Overhead_Throw: [75, 35],
  'Standing_Two-Arm_Overhead_Throw': [75, 35],
  Chest_Push_from_3_point_stance: [95, 10],
  Chest_Push_with_Run_Release: [80, 10],
  'One-Arm_Medicine_Ball_Slam': [90, 10],
  Overhead_Slam: [96, 15],
  Supine_Chest_Throw: [76, 10],
  'Supine_One-Arm_Overhead_Throw': [88, 65],
  'Supine_Two-Arm_Overhead_Throw': [88, 60],
};
const degrees = (angle) => angle * 180 / Math.PI;
const expected = [...Object.keys(rollerBones), ...ballIds, ...mobilityIds];
assert.ok(groupLabel.length);
assert.equal(expected.length, 33);
assert.deepEqual(Object.keys(entries).sort(), expected.map((id) => 'local:exercise:' + id).sort());

const endpoints = ['HandL', 'HandR', 'FootL', 'FootR', 'Head', 'Pelvis'];
const point = (name) => scene.getObjectByName(name).getWorldPosition(new Vector3());
const attitude = (name) => scene.getObjectByName(name).getWorldQuaternion(new Quaternion());
const mixer = new AnimationMixer(scene);
const vertex = new Vector3();
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const signatures = new Set();

for (const id of expected) {
  const entry = entries['local:exercise:' + id];
  assert.equal(entry.name, catalog.get(id).name);
  assert.ok([...entry.primary, ...entry.supporting].every((muscle) => muscles.has(muscle)), id + ' atlas groups');
  assert.ok(entry.cues.length >= 2 && entry.cues.every(([t, title, cue]) =>
    t >= 0 && t <= entry.clip.duration && title.trim() && cue.trim()), id + ' coached cues');
  assert.ok(entry.clip.validate() && entry.clip.tracks.every((track) => track.values.every(Number.isFinite)), id + ' rig tracks');
  const fixture = entry.mobilityBallFixture && createMobilityBallFixture(entry, scene);
  const fixtureProp = fixture?.root.getObjectByName(id in rollerBones ? 'Foam roller' : 'Medicine ball');
  assert.equal(fixtureProp !== undefined, id in rollerBones || ballIds.includes(id), id + ' equipment');
  if (fixtureProp) assert.equal(fixture.animated, fixtureProp.parent, id + ' exposes the sampled equipment root');
  const action = mixer.clipAction(entry.clip).setLoop(LoopOnce, 1).play();
  action.paused = true;
  function sample(t) {
    action.time = t;
    mixer.update(0);
    scene.updateMatrixWorld(true);
    fixture?.update(t);
    return fixtureProp?.getWorldPosition(new Vector3());
  }
  const origin = sample(0);
  if (fixture?.animated) {
    const peak = entry.phases[2][0];
    const [position, rotation] = entry.propClip.tracks.map((track) => track.createInterpolant());
    sample(entry.clip.duration);
    sample(peak);
    check(fixture.animated.position.distanceTo(new Vector3().fromArray(position.evaluate(peak))) < .001 &&
      fixture.animated.quaternion.angleTo(new Quaternion().fromArray(rotation.evaluate(peak))) < .001,
    id + ' fixture stays synchronized when seeking backward');
    sample(0);
  }
  const rest = endpoints.map(point);
  const restRotations = endpoints.map(attitude);
  const propRestRotation = fixtureProp?.getWorldQuaternion(new Quaternion());
  let rigTravel = 0;
  let propTravel = 0;
  let lowest = Infinity;
  const frames = Math.ceil(entry.clip.duration * 20);
  const signature = [];
  const phaseTimes = new Set(entry.phases.map(([t]) => t));
  for (const t of new Set([...entry.phases.map(([at]) => at), ...Array.from({ length: frames + 1 }, (_, i) =>
    i * entry.clip.duration / frames)])) {
    const prop = sample(t);
    if (prop) {
      propTravel = Math.max(propTravel, prop.distanceTo(origin));
      check(prop.y >= entry.mobilityBallFixture.radius - .003, id + ' prop penetrates floor at ' + t.toFixed(2));
    }
    const limb = endpoints.map(point);
    rigTravel = Math.max(rigTravel, ...limb.map((p, i) => p.distanceTo(rest[i])));
    if (phaseTimes.has(t)) {
      const rotation = attitude('FootL');
      signature.push(...[...limb, rotation, ...(prop ? [prop] : [])].flatMap((sample) =>
        sample.toArray().map((n) => n.toFixed(3))));
    }
    for (const mesh of meshes) {
      for (let j = 0; j < mesh.geometry.attributes.position.count; j += 23) {
        lowest = Math.min(lowest, mesh.localToWorld(mesh.getVertexPosition(j, vertex)).y);
      }
    }
  }
  signatures.add(signature.join(','));
  check(rigTravel > .04, id + ' rig should move');
  check(lowest >= -.043, id + ' skin floor clearance ' + lowest.toFixed(3));
  if (ballIds.includes(id)) check(propTravel > .50, id + ' ball should travel independently across the drill');
  if (id in rollerBones) {
    const start = entry.phases[0][0];
    const peak = entry.phases[2][0];
    sample(start);
    const prior = fixtureProp.getWorldQuaternion(new Quaternion());
    const contact0 = fixtureProp.getWorldPosition(new Vector3()).distanceTo(point(rollerBones[id]));
    sample(peak);
    const contact1 = fixtureProp.getWorldPosition(new Vector3()).distanceTo(point(rollerBones[id]));
    check(prior.angleTo(fixtureProp.getWorldQuaternion(new Quaternion())) > .25, id + ' roller should rotate with the motion');
    check(Math.max(contact0, contact1) < .52, id + ' roller needs to track the target segment');
  }
  if (id === 'Adductor_Groin') {
    const ankleGap = (t) => { sample(t); return point('FootL').distanceTo(point('FootR')); };
    check(Math.abs(ankleGap(.65) - ankleGap(2.30)) < .005 && ankleGap(3.55) - ankleGap(2.30) > .40,
      id + ' hold the isometric squeeze before widening');
  }
  if (id.includes('Against_Wall')) {
    sample(1.45);
    const panel = fixture.root.getObjectByName('Wall contact panel');
    assert.ok(panel);
    if (id.startsWith('Calf')) {
      check(Math.abs(point('FootL').y - .074) < .01 && Math.abs(point('FootR').y - .074) < .01, id + ' heels planted');
      const wrist = point('HandL');
      const elbow = point('ForearmL');
      check(id.includes('Elbows') ? Math.abs(wrist.z - elbow.z) < .08 : wrist.z - elbow.z > .13,
        id + ' uses the correct wall contact');
    } else {
      check(point('HandL').y - point('ForearmL').y > .12, id + ' uses the raised bent arm');
    }
  }
  if (id === 'Peroneals_Stretch' || id === 'Posterior_Tibialis_Stretch') {
    const [leftTail, rightTail] = fixture.root.children.filter(({ name }) => name === 'Strap tail');
    assert.ok(leftTail && rightTail);
    const at = (t) => {
      sample(t);
      return new Vector3(0, -1, 0).applyQuaternion(attitude('FootL')).x;
    };
    const shift = at(1.45) - at(0);
    check((id === 'Peroneals_Stretch' ? -1 : 1) * shift > .38, id + ' pulls the ankle in the prescribed direction');
    check(leftTail.scale.y > .3 && rightTail.scale.y > .3, id + ' strap stays connected while the heel rises');
  }
  if (/^Chest_Push_(single|multiple)/.test(id)) {
    sample(1.18);
    check(point('HandL').y < .095 && point('HandR').y < .095, id + ' catches the body on both hands');
    if (id.includes('multiple')) {
      const returned = sample(2);
      const rethrown = sample(3.45);
      check(rethrown.z - returned.z > 1.5, id + ' passes again after receiving the rebound');
    }
  }
  if (id === 'Supine_Chest_Throw') {
    const launch = sample(.73);
    const apex = sample(1.17);
    check(apex.y - launch.y > .75 && Math.abs(apex.z - launch.z) < .06, id + ' throws vertically above the chest');
  }
  if (id.endsWith('Slam')) {
    const release = sample(1.21);
    const impact = sample(82 / 60);
    const returned = sample(1.62);
    check(release.y - impact.y > .65 && impact.y < .14 && returned.y - impact.y > .35,
      id + ' strikes the floor and returns on a visible bounce');
  }
  const throwsWithArmContinuity = ['Backward_Medicine_Ball_Throw', 'Medicine_Ball_Scoop_Throw',
    'Catch_and_Overhead_Throw', 'Standing_Two-Arm_Overhead_Throw', 'Supine_Two-Arm_Overhead_Throw',
    'Chest_Push_multiple_response'];
  if (id.endsWith('Slam') || throwsWithArmContinuity.includes(id)) {
    const limit = id === 'Overhead_Slam' ? .75 : .55;
    for (const track of entry.clip.tracks.filter(({ name }) => /^(Arm|Forearm)[LR]\.quaternion$/.test(name))) {
      const previous = new Quaternion().fromArray(track.values).normalize();
      const next = new Quaternion();
      for (let i = 4; i < track.values.length; i += 4) {
        next.fromArray(track.values, i).normalize();
        check(previous.angleTo(next) < limit,
          id + ' ' + track.name + ' snaps at ' + track.times[i / 4].toFixed(3));
        previous.copy(next);
      }
    }
  }
  if (id in wristLimits) {
    const [bendLimit, rollLimit] = wristLimits[id];
    const checkArmContinuity = id === 'Supine_Chest_Throw' || id.endsWith('Slam') || id.startsWith('Chest_Push_');
    const arms = checkArmContinuity
      ? ['L', 'R'].flatMap((side) => ['Arm', 'Forearm', 'Hand'].map((part) => part + side))
      : [];
    const previous = arms.map(() => new Quaternion());
    let bend = 0;
    let roll = 0;
    const frames = Math.ceil(entry.clip.duration * 60);
    for (let i = 0; i <= frames; i++) {
      sample(i * entry.clip.duration / frames);
      arms.forEach((joint, index) => {
        const current = attitude(joint).normalize();
        check(!i || previous[index].angleTo(current) < .50, id + ' ' + joint + ' rotates abruptly at sample ' + i);
        previous[index].copy(current);
      });
      for (const [side, sign] of [['L', 1], ['R', -1]]) {
        const wrist = scene.getObjectByName('Hand' + side);
        const distal = wrist.position.clone().normalize();
        const along = handAlong(sign);
        const across = handDorsal().cross(along);
        const posedAcross = across.clone().applyQuaternion(wrist.quaternion);
        const project = (axis) => axis.clone().addScaledVector(distal, -axis.dot(distal));
        bend = Math.max(bend, degrees(distal.angleTo(along.applyQuaternion(wrist.quaternion))));
        roll = Math.max(roll, degrees(project(across).angleTo(project(posedAcross))));
      }
    }
    check(bend < bendLimit, id + ' wrist bend stays below ' + bendLimit + ' degrees (measured ' + bend.toFixed(1) + ')');
    check(roll < rollLimit, id + ' wrist roll stays below ' + rollLimit + ' degrees (measured ' + roll.toFixed(1) + ')');
  }
  if (id === 'Backward_Medicine_Ball_Throw' || id === 'Medicine_Ball_Scoop_Throw') {
    for (const t of [0, .36, .83, 1.21]) {
      const center = sample(t);
      for (const [side, sign] of [['L', 1], ['R', -1]]) {
        const name = 'Hand' + side;
        const hand = attitude(name);
        const outward = handDorsal().applyQuaternion(hand);
        const palm = point(name).addScaledVector(handAlong(sign).applyQuaternion(hand), .086)
          .addScaledVector(outward, -.022);
        check(Math.abs(palm.distanceTo(center) - entry.mobilityBallFixture.radius) < .014 &&
          palm.sub(center).normalize().dot(outward) > .95, id + ' palm stays on the ball through release');
      }
    }
    sample(1.21);
    const airborne = Math.min(point('FootL').y, point('FootR').y);
    check(id.includes('Scoop') ? airborne > .17 : airborne < .09, id + ' shows the specified footwork');
    check(sample(1.66).z < -.80, id + ' ball travels backward over the head');
  }
  if (id === 'Chest_Push_from_3_point_stance' || id === 'Chest_Push_with_Run_Release') {
    sample(0);
    const setup = point('HandR').y;
    sample(1.02);
    const releaseZ = point('Pelvis').z;
    sample(entry.clip.duration);
    const advance = point('Pelvis').z - releaseZ;
    check(id.includes('3_point') ? setup < .09 && advance < .4 : setup > .30 && advance > 1.25,
      id + ' shows its starting support and follow-through');
  }
  if (id === 'Chest_Push_multiple_response') {
    const finish = sample(entry.clip.duration);
    endpoints.forEach((name, i) => {
      check(point(name).distanceTo(rest[i]) < .001 && attitude(name).angleTo(restRotations[i]) < .001,
        id + ' closes the body loop at ' + name);
    });
    check(finish.distanceTo(origin) < .001 && fixtureProp.getWorldQuaternion(new Quaternion()).angleTo(propRestRotation) < .001,
      id + ' closes the ball pose loop');
  }
  if (id === 'Chest_Push_with_Run_Release' || id === 'Medicine_Ball_Full_Twist' || id === 'Supine_Chest_Throw') {
    const count = Math.ceil(entry.clip.duration * 60);
    const hands = ['HandL', 'HandR'];
    sample(0);
    let previous = hands.map(point);
    for (let i = 1; i <= count; i++) {
      sample(i * entry.clip.duration / count);
      const next = hands.map(point);
      check(next.every((hand, j) => hand.distanceTo(previous[j]) < .105), id + ' continuous wrist path at sample ' + i);
      previous = next;
    }
  }
  action.stop();
}

assert.equal(signatures.size, expected.length, 'Every clip needs its own motion');
assert.deepEqual(failures, []);
console.log('33 distinct foam-rolling, mobility and medicine-ball clips verified against the anatomy rig.');
