import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, Box3, Line3, LoopOnce, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createExerciseGroups, dumbbellGripTransform } from './clips.mjs';
import { handAlong } from './hand-frame.mjs';
import { createResistanceFixture } from './resistance-fixtures.mjs';
import { metadata } from './resistance-catalog.mjs';
import * as cable from './cable-training.mjs';
import * as band from './band-training.mjs';
import * as decline from './decline-bench-training.mjs';
import * as bodyweight from './bodyweight-support.mjs';

const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const registry = createExerciseGroups(asset);
const families = [[cable, 65], [band, 19], [decline, 11], [bodyweight, 5]];
const familyLabels = new Set(families.map(([family]) => family.groupLabel));
const baseline = new Set(registry.filter(([label]) => !familyLabels.has(label)).flatMap(([, entries]) => Object.keys(entries)));
const catalog = new Map(JSON.parse(await readFile(
  new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url))).map((entry) => [entry.id, entry]));
const mixer = new AnimationMixer(asset.scene);
const skin = [];
asset.scene.traverse((object) => { if (object.isSkinnedMesh) skin.push(object); });
const atlas = new Set(skin.map(({ material }) => material.name));
const entries = new Map();
const signatures = new Map();
const sampleCount = 16;
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const joint = (name) => asset.scene.getObjectByName(name);
const position = (name) => joint(name).getWorldPosition(new Vector3());
const interpolant = (track, t) => track.createInterpolant().evaluate(t);
const seat = (side) => joint('Hand' + side)
  .localToWorld(dumbbellGripTransform(side === 'L' ? 1 : -1).position);
const widths = { Decline_Barbell_Bench_Press: .255,
  'Wide-Grip_Decline_Barbell_Bench_Press': .365, 'Decline_Close-Grip_Bench_To_Skull_Crusher': .127,
  'Wide-Grip_Decline_Barbell_Pullover': .321, Inverted_Row: .277 };
const wristLimits = new Map([
  ['Cable_Judo_Flip', .2], ['Flat_Bench_Cable_Flyes', .2], ['Kneeling_High_Pulley_Row', .2],
  ['Decline_Crunch', .55], ['Decline_Oblique_Crunch', .55], ['Decline_EZ_Bar_Triceps_Extension', .8],
  ['Cable_Reverse_Crunch', 1.4], ['One_Arm_Chin-Up', 1.4],
]);

for (const [family, count] of families) {
  const familyEntries = Object.entries(new Map(registry).get(family.groupLabel));
  assert.equal(familyEntries.length, count, family.groupLabel);
  for (const [id, entry] of familyEntries) {
    const key = id.slice('local:exercise:'.length);
    assert.equal(entry.name, catalog.get(id)?.name, id);
    assert.ok(!baseline.has(id) && !entries.has(id), id + ' already animated');
    assert.ok(entry.primary.length && [...entry.primary, ...entry.supporting].every((m) => atlas.has(m)), id + ' atlas');
    assert.equal(entry.phases[0][0], 0, id);
    assert.ok(entry.phases.every(([at], i, phases) => at <= entry.clip.duration && (!i || at > phases[i - 1][0])), id);
    assert.ok(entry.cues.length >= 2 && entry.cues.every(([at, title, detail]) =>
      at >= 0 && at <= entry.clip.duration && title && detail), id);
    entries.set(id, entry);

    const hash = createHash('sha256');
    let moved = false;
    for (const clip of [entry.clip, entry.propClip].filter(Boolean)) {
      assert.ok(clip.validate(), id);
      assert.equal(clip.duration, entry.clip.duration, id);
      for (const track of clip.tracks) {
        const size = track.getValueSize();
        assert.ok(track.times.every((time, i) => i === 0 || time > track.times[i - 1]), id);
        if (size === 4 && ['Cable_Judo_Flip', 'V-Bar_Pulldown', 'Kneeling_High_Pulley_Row', 'Standing_Cable_Lift'].includes(key)) {
          const previous = new Quaternion();
          const current = new Quaternion().fromArray(track.values);
          for (let n = 4; n < track.values.length; n += 4) {
            previous.copy(current);
            current.fromArray(track.values, n);
            assert.ok(previous.angleTo(current) < (key === 'Cable_Judo_Flip' ? .50 : .34),
              id + ' abrupt change in ' + track.name + ' at key ' + n / 4);
          }
        }
        for (let i = 0; i <= sampleCount; i++) {
          const values = interpolant(track, clip.duration * i / sampleCount);
          assert.ok(values.every(Number.isFinite), id + ' ' + track.name);
          if (size === 4) assert.ok(Math.abs(Math.hypot(...values) - 1) < .001, id + ' ' + track.name);
          moved ||= values.some((value, n) => Math.abs(value - track.values[n]) > .012);
          // Quantize the sampled motion so floating-point noise cannot count as a distinct clip.
          hash.update(Array.from(values, (value) => Math.round(value * 1000)).join(',') + '|');
        }
        if (track.times.length > 1) {
          const start = track.values.slice(0, size);
          const finish = track.values.slice(-size);
          const separation = size === 4 ? 1 - Math.abs(start.reduce((sum, value, i) => sum + value * finish[i], 0))
            : Math.hypot(...start.map((value, i) => value - finish[i]));
          check(separation < .002, id + ' loop closure ' + track.name);
        }
      }
    }
    assert.ok(moved, id + ' motion');
    const signature = hash.digest('hex');
    assert.ok(!signatures.has(signature), id + ' repeats ' + signatures.get(signature));
    signatures.set(signature, id);

    const resistance = entry.resistance && createResistanceFixture(entry.resistance, asset.scene, dumbbellGripTransform);
    const action = mixer.clipAction(entry.clip).setLoop(LoopOnce, 1).play();
    action.paused = true;
    let floor = Infinity;
    let contact = 0;
    for (let i = 0; i <= sampleCount; i++) {
      const t = entry.clip.duration * i / sampleCount;
      action.time = t;
      mixer.update(0);
      asset.scene.updateMatrixWorld(true);
      const figure = new Box3();
      for (const mesh of skin) figure.expandByObject(mesh, true);
      floor = Math.min(floor, figure.min.y);
      if (resistance) {
        resistance.update();
        resistance.root.updateMatrixWorld(true);
        resistance.root.traverse((object) => {
          if (object.isMesh) {
            assert.ok(object.matrixWorld.elements.every(Number.isFinite), id + ' ' + object.name);
            assert.ok(object.scale.y > 0, id + ' ' + object.name + ' collapsed');
          }
        });
        const fixture = new Box3().setFromObject(resistance.root);
        assert.ok(fixture.min.y > -.04 && fixture.max.y < 2.55, id + ' fixture bounds at ' + t);
        if (key === 'One-Legged_Cable_Kickback') {
          const brace = resistance.root.getObjectByName('Frame handhold');
          for (const side of ['L', 'R']) {
            const local = brace.worldToLocal(seat(side));
            check(Math.hypot(local.x, local.z) < .004 && Math.abs(local.y) < .5, id + ' both hands on the frame');
          }
        }
        if (key === 'Wide-Grip_Pulldown_Behind_The_Neck') {
          const cable = resistance.root.getObjectByName('Cable');
          const line = new Line3(cable.localToWorld(new Vector3(0, -.5, 0)), cable.localToWorld(new Vector3(0, .5, 0)));
          const head = joint('Head').localToWorld(new Vector3(0, .082, .035));
          check(line.closestPointToPoint(head, true, new Vector3()).distanceTo(head) > .11, id + ' cable clears head');
        }
        if (entry.resistance.attachment?.kind === 'stirrup') {
          const grips = resistance.root.children.filter(({ name }) => name === 'Handle grip');
          entry.resistance.attachment.hands.forEach((side, index) =>
            assert.ok(grips[index].position.distanceTo(seat(side)) < .0001, id + ' stirrup at ' + t));
        }
        if (key === 'Calf_Raises_-_With_Bands') {
          for (const [side, sign] of [['L', 1], ['R', -1]]) {
            const forefoot = joint('Foot' + side).localToWorld(new Vector3(0, -.064, .19));
            assert.ok(forefoot.distanceTo(new Vector3(sign * .167, .01, .19)) < .002, id + ' stays on band at ' + t);
          }
        }
        if (entry.resistance.support === 'feet') {
          const brace = resistance.root.getObjectByName('Foot brace');
          for (const side of ['L', 'R']) {
            const sole = joint('Foot' + side).localToWorld(new Vector3(0, -.074, .095));
            const contact = brace.worldToLocal(sole);
            assert.ok(Math.abs(contact.z + .0375) < .003 && Math.abs(contact.y) < .13, id + ' sole against foot brace at ' + t);
          }
        }
      }
      if (entry.propClip) {
        const [location, turn] = entry.propClip.tracks;
        const center = new Vector3().fromArray(interpolant(location, t));
        const inverse = new Quaternion().fromArray(interpolant(turn, t)).invert();
        for (const [side, sign] of [['L', 1], ['R', -1]]) {
          const expected = entry.equipment.endsWith('ez-curl-bar') ? [sign * .105, 0, .03] : [sign * widths[key], 0, 0];
          const relative = seat(side).sub(center).applyQuaternion(inverse);
          contact = Math.max(contact, relative.distanceTo(new Vector3(...expected)));
        }
      }
      if (entry.equipment === 'pull-up-bar') {
        for (const side of key === 'One_Arm_Chin-Up' ? ['R'] : ['L', 'R']) {
          const actual = seat(side);
          contact = Math.max(contact, Math.hypot(actual.y - 2.30, actual.z));
        }
      }
      if (wristLimits.has(key)) {
        for (const [side, sign] of [['L', 1], ['R', -1]]) {
          const hand = joint('Hand' + side);
          check(hand.position.angleTo(handAlong(sign).applyQuaternion(hand.quaternion)) < wristLimits.get(key),
            id + ' wrist alignment at ' + t);
        }
      }
    }
    action.stop();
    check(floor > -.034, id + ' skinned floor clearance ' + floor.toFixed(4));
    check(contact < .012, id + ' maximum hand-to-prop error ' + contact.toFixed(4));
  }
  console.log(family.groupLabel + ' · ' + count + ' catalog entries sampled');
}
assert.equal(entries.size, 100);
assert.deepEqual([...entries.keys()].map((id) => id.split(':').at(-1)).sort(), Object.keys(metadata).sort());

function pose(key, time, evaluate) {
  const { clip } = entries.get('local:exercise:' + key);
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
  action.paused = true;
  action.time = time;
  mixer.update(0);
  asset.scene.updateMatrixWorld(true);
  const result = evaluate();
  action.stop();
  return result;
}
const at = (key, time, name) => pose(key, time, () => position(name));
const declineExtension = entries.get('local:exercise:Decline_EZ_Bar_Triceps_Extension');
for (const track of declineExtension.clip.tracks.filter(({ name }) => /^Forearm[LR]\.quaternion$/.test(name))) {
  const before = new Quaternion().fromArray(track.values).normalize();
  const after = new Quaternion();
  for (let i = 4; i < track.values.length; i += 4) {
    after.fromArray(track.values, i).normalize();
    check(before.angleTo(after) < .18, 'decline EZ-bar extension keeps forearm rotation continuous');
    before.copy(after);
  }
}
check(at('Cable_Deadlifts', 1.4, 'Pelvis').y - at('Cable_Deadlifts', 0, 'Pelvis').y > .27, 'deadlift must stand up');
check(pose('Alternating_Cable_Shoulder_Press', 1.02, () => position('HandL').y - position('HandR').y) > .25,
  'first shoulder press must leave the right hand at the shoulder');
check(pose('Alternating_Cable_Shoulder_Press', 2.72, () => position('HandR').y - position('HandL').y) > .25,
  'second shoulder press must leave the left hand at the shoulder');
check(at('Cable_Reverse_Crunch', 1.4, 'Pelvis').y - at('Cable_Reverse_Crunch', 0, 'Pelvis').y > .10,
  'reverse crunch must lift the pelvis');
check(at('Monster_Walk', 1.99, 'FootR').z - at('Monster_Walk', 0, 'FootR').z > .38,
  'monster walk must advance before retracing its steps');
check(at('Hip_Lift_with_Band', 1.4, 'Pelvis').y - at('Hip_Lift_with_Band', 0, 'Pelvis').y > .24,
  'band bridge must lift the hips');
check(at('Floor_Glute-Ham_Raise', 1.34, 'HandL').y < .09, 'glute-ham raise hands must reach the floor');
check(at('Decline_Dumbbell_Bench_Press', 0, 'Head').y + .10 < at('Decline_Dumbbell_Bench_Press', 0, 'Pelvis').y,
  'decline press must keep the head below the hips');
const fixtures = [decline.createDeclineBench(), bodyweight.createBodyweightSupport('chair'),
  bodyweight.createBodyweightSupport('ankle-restraint')];
fixtures[0].updateMatrixWorld(true);
const declineGrip = fixtures[0].getObjectByName('Reverse crunch handhold');
const declineRollers = fixtures[0].children.filter(({ name }) => name === 'Leg roller');
const vertex = new Vector3();
for (const time of [0, .85, 1.4, 2, 2.65, 3.6]) {
  pose('Decline_Reverse_Crunch', time, () => {
    for (const side of ['L', 'R']) {
      const local = declineGrip.worldToLocal(seat(side));
      check(Math.hypot(local.x, local.z) < .004 && Math.abs(local.y) < .18, 'decline crunch hands hold the bench');
    }
    let clearance = Infinity;
    for (const mesh of skin) {
      for (let i = 0; i < mesh.geometry.attributes.position.count; i += 4) {
        mesh.localToWorld(mesh.getVertexPosition(i, vertex));
        if (Math.abs(vertex.x) > .19) continue;
        for (const roller of declineRollers) {
          clearance = Math.min(clearance, Math.hypot(vertex.y - roller.position.y, vertex.z - roller.position.z));
        }
      }
    }
    check(clearance > .053, 'decline crunch clears both rollers at ' + time);
  });
}
for (const fixture of fixtures) {
  const bounds = new Box3().setFromObject(fixture);
  check(bounds.min.y >= -.001 && bounds.max.y < 1.1 && !bounds.isEmpty(), fixture.name + ' floor and size');
}
assert.deepEqual(errors, []);
console.log('100 distinct catalog clips passed the rig, attachment, and motion checks.');
