import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, Box3, LoopOnce, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createBarbell } from './barbell.mjs';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createEntries } from './final-strength.mjs';
import { createFinalStrengthFixture } from './final-strength-fixtures.mjs';
import { createKettlebell } from './kettlebell.mjs';
import { handAlong } from './hand-frame.mjs';

const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
const catalog = new Map(JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url)))
  .map(({ id, name }) => [id, name]));
const expectedIds = `
Atlas_Stone_Trainer Atlas_Stones Axle_Deadlift Car_Deadlift Chain_Handle_Extension
Chain_Press Circus_Bell Conans_Wheel Crucifix Farmers_Walk Keg_Load Log_Lift
Lying_Face_Down_Plate_Neck_Resistance Lying_Face_Up_Plate_Neck_Resistance Otis-Up
Power_Stairs Rickshaw_Carry Rickshaw_Deadlift Sandbag_Load Seated_Head_Harness_Neck_Resistance
Sledgehammer_Swings Standing_Olympic_Plate_Hand_Squeeze Tire_Flip Trap_Bar_Deadlift Weighted_Squat
Wrist_Roller Yoke_Walk Kettlebell_Turkish_Get-Up_Lunge_style Kettlebell_Turkish_Get-Up_Squat_style
One-Arm_Open_Palm_Kettlebell_Clean Open_Palm_Kettlebell_Clean Plyo_Kettlebell_Pushups
Kneeling_Jump_Squat Lying_Cambered_Barbell_Row
`.trim().split(/\s+/).map((key) => 'local:exercise:' + key);
assert.deepEqual(Object.keys(entries).sort(), expectedIds.sort());

const mixer = new AnimationMixer(asset.scene);
const skin = [];
asset.scene.traverse((object) => { if (object.isSkinnedMesh) skin.push(object); });
const atlas = new Set(skin.map(({ material }) => material.name));
const joint = (name) => asset.scene.getObjectByName(name);
const p = (name) => joint(name).getWorldPosition(new Vector3());
const signatures = new Set();
const problems = [];
function check(condition, message) {
  if (!condition) problems.push(message);
}

const gripSpans = {
  Axle_Deadlift: .265, Car_Deadlift: .355, Rickshaw_Carry: .372, Rickshaw_Deadlift: .372,
  Trap_Bar_Deadlift: .32, Log_Lift: .237, Chain_Press: 0, Chain_Handle_Extension: 0, Farmers_Walk: 0,
};
const smoothTurns = new Set(['Tire_Flip', 'Log_Lift', 'Circus_Bell', 'Sledgehammer_Swings',
  'One-Arm_Open_Palm_Kettlebell_Clean', 'Open_Palm_Kettlebell_Clean']);
for (const [id, entry] of Object.entries(entries)) {
  const key = id.split(':').at(-1);
  const { clip, propClip, secondPropClip, phases, cues } = entry;
  assert.equal(entry.name, catalog.get(id), id);
  assert.ok([...entry.primary, ...entry.supporting].every((name) => atlas.has(name)), id);
  assert.equal(phases[0][0], 0, id);
  assert.ok(phases.every(([at], i) => at < clip.duration && (!i || at > phases[i - 1][0])), id);
  assert.ok(cues.length >= 3 && cues.every(([at]) => at >= 0 && at < clip.duration), id);
  const sampled = new Set([0, clip.duration, ...phases.map(([at]) => at)]);
  for (let i = 1; i < 20; i++) sampled.add(clip.duration * i / 20);
  const hash = createHash('sha256');
  for (const animation of [clip, propClip, secondPropClip].filter(Boolean)) {
    assert.equal(animation.duration, clip.duration, id);
    assert.ok(animation.validate(), id);
    for (const track of animation.tracks) {
      assert.ok(track.values.every(Number.isFinite), id + ' ' + track.name);
      const size = track.getValueSize();
      if (size === 4) {
        const first = new Quaternion();
        const next = new Quaternion();
        for (let i = 0; i < track.values.length; i += size) {
          assert.ok(Math.abs(Math.hypot(...track.values.subarray(i, i + size)) - 1) < .001, id);
          if (i && smoothTurns.has(key) && /^(Arm|Forearm|Hand|\.)/.test(track.name)) {
            first.fromArray(track.values, i - size).normalize();
            next.fromArray(track.values, i).normalize();
            check(first.angleTo(next) < (key === 'Log_Lift' ? .32 : .65),
              key + ' continuous arm and prop rotation on ' + track.name);
          }
        }
      }
      if (!entry.oneShot && track.times.length > 1) {
        const start = track.values.slice(0, size);
        const end = track.values.slice(-size);
        const gap = size === 4 ? 1 - Math.abs(new Quaternion().fromArray(start).dot(new Quaternion().fromArray(end)))
          : Math.hypot(...start.map((value, i) => value - end[i]));
        check(gap < .002, key + ' loop closure ' + track.name + ' ' + gap.toFixed(3));
      }
      if (animation === clip) hash.update(track.values);
    }
  }
  const signature = hash.digest('hex');
  assert.ok(!signatures.has(signature), id + ' repeated motion');
  signatures.add(signature);

  const fixture = entry.finalStrengthFixture && createFinalStrengthFixture(entry, asset.scene);
  assert.equal(Boolean(fixture?.secondAnimated), Boolean(secondPropClip), id);
  const standalone = !fixture && (entry.equipment === 'kettlebell' ? createKettlebell() : createBarbell());
  const [position, orientation] = propClip.tracks.map((track) => track.createInterpolant());
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
  action.paused = true;
  function sample(t) {
    action.time = t;
    mixer.update(0);
    asset.scene.updateMatrixWorld(true);
    fixture?.update(t);
    if (standalone) {
      standalone.position.fromArray(position.evaluate(t));
      standalone.quaternion.fromArray(orientation.evaluate(t));
    }
  }
  let bodyFloor = Infinity;
  let propFloor = Infinity;
  let gripError = 0;
  for (const t of sampled) {
    sample(t);
    const body = new Box3();
    for (const mesh of skin) body.expandByObject(mesh, true);
    const equipment = new Box3().setFromObject(fixture?.root || standalone, true);
    bodyFloor = Math.min(bodyFloor, body.min.y);
    propFloor = Math.min(propFloor, equipment.min.y);
    assert.ok(!equipment.isEmpty() && equipment.min.toArray().every(Number.isFinite)
      && equipment.max.toArray().every(Number.isFinite), id + ' equipment bounds');
    if (key in gripSpans) {
      for (const [side, sign] of [['L', 1], ['R', -1]]) {
        const hand = joint('Hand' + side).localToWorld(dumbbellGripTransform(sign).position);
        const prop = sign < 0 && fixture.secondAnimated ? fixture.secondAnimated : fixture.animated;
        const handle = new Vector3(sign * gripSpans[key], 0, 0).applyQuaternion(prop.quaternion).add(prop.position);
        gripError = Math.max(gripError, hand.distanceTo(handle));
      }
    }
    if (key === 'Yoke_Walk') {
      for (const [side, sign] of [['L', 1], ['R', -1]]) {
        const hand = joint('Hand' + side);
        const along = handAlong(sign).applyQuaternion(hand.getWorldQuaternion(new Quaternion()));
        const distal = p(hand.name).sub(p('Forearm' + side));
        const handle = new Vector3(sign * .46, -.205, 0).add(fixture.animated.position);
        assert.ok(hand.localToWorld(dumbbellGripTransform(sign).position).distanceTo(handle) < .004,
          'yoke hand stays on the upright at ' + t);
        assert.ok(along.angleTo(distal) < .55, 'yoke wrist bend at ' + t);
      }
    }
  }
  check(bodyFloor > -.019, key + ' figure intersects floor by ' + (-bodyFloor).toFixed(3) + ' m');
  check(propFloor > -.014, key + ' equipment intersects floor by ' + (-propFloor).toFixed(3) + ' m');
  check(gripError < .026, key + ' hand slips ' + gripError.toFixed(3) + ' m');

  if (key === 'Car_Deadlift') {
    sample(0);
    const pivot = fixture.animated.localToWorld(new Vector3(0, 0, 1.62));
    sample(1.4);
    assert.ok(fixture.animated.localToWorld(new Vector3(0, 0, 1.62)).distanceTo(pivot) < .001, id);
  } else if (key === 'Sledgehammer_Swings') {
    const head = fixture.root.getObjectByName('Sledgehammer head');
    const tire = fixture.root.getObjectByName('Tire carcass');
    const surface = new Box3();
    for (const time of [1.48, 3.36]) {
      sample(time);
      fixture.root.updateMatrixWorld(true);
      surface.setFromObject(tire, true);
      const strike = new Box3().setFromObject(head, true);
      assert.ok(Math.abs(strike.min.y - surface.max.y) < .025, 'hammer reaches the tire during each strike');
    }
    sample(2.06);
    const hand = joint('HandL').localToWorld(dumbbellGripTransform(1).position);
    const local = fixture.animated.worldToLocal(hand);
    assert.ok(Math.hypot(local.y, local.z) > .095, 'left hand clears the shaft while changing grip');
  } else if (key === 'Kneeling_Jump_Squat') {
    sample(0);
    assert.ok(p('ShinL').y < .13 && p('ShinR').y < .13, 'knees on floor');
    sample(1.03);
    assert.ok(p('FootL').y > .23 && p('FootR').y > .23, 'both feet airborne');
    sample(clip.duration);
    assert.ok(p('Pelvis').y > .85 && p('FootL').y < .08 && p('FootR').y < .08, 'stand after landing');
  } else if (key === 'Plyo_Kettlebell_Pushups') {
    sample(0);
    assert.ok(p('HandR').y - p('HandL').y > .17, 'right hand raised');
    sample(1.10);
    assert.ok(p('HandL').y - p('HandR').y > .17, 'left hand raised after switch');
  } else if (key === 'Kettlebell_Turkish_Get-Up_Lunge_style' || key === 'Kettlebell_Turkish_Get-Up_Squat_style') {
    sample(2.49);
    const knee = p('ShinL').y;
    check(key.endsWith('Lunge_style') ? knee < .17 : knee > .27, key + ' intermediate knee height ' + knee.toFixed(3));
    sample(3.65);
    assert.ok(p('HandR').y > p('Head').y + .16, 'bell stays overhead at stand');
  }
  action.stop();
}
assert.deepEqual(problems, []);
console.log(signatures.size + ' final strength clips passed catalog, track, pose, grip, and fixture checks.');
