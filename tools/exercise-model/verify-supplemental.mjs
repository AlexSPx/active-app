import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, Box3, LoopOnce, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createExerciseGroups, dumbbellGripTransform } from './clips.mjs';
import { createSupplementalFixture } from './supplemental-fixtures.mjs';
import { createResistanceFixture } from './resistance-fixtures.mjs';
import { createBarbell } from './barbell.mjs';
import { handAlong, handDorsal } from './hand-frame.mjs';
import { metadata } from './supplemental-catalog.mjs';

const prefix = 'local:exercise:';
const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const groups = createExerciseGroups(asset);
const registered = groups.flatMap(([, entries]) => Object.entries(entries));
const entries = registered.filter(([id]) => Object.hasOwn(metadata, id.slice(prefix.length)));
assert.equal(new Set(registered.map(([id]) => id)).size, registered.length);
assert.equal(entries.length, 100);
const catalog = new Map(JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json',
  import.meta.url))).map((entry) => [entry.id, entry]));
const mixer = new AnimationMixer(asset.scene);
const skin = [];
asset.scene.traverse((object) => { if (object.isSkinnedMesh) skin.push(object); });
const atlas = new Set(skin.map(({ material }) => material.name));
const signatures = new Set();
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const bone = (name) => asset.scene.getObjectByName(name);
const point = (name) => bone(name).getWorldPosition(new Vector3());
const sample = (track, time) => track.createInterpolant().evaluate(time);
const sampleProp = (clip, time) => [
  new Vector3().fromArray(sample(clip.tracks[0], time)),
  new Quaternion().fromArray(sample(clip.tracks[1], time)),
];
const smoothArmMotion = new Set(['Landmine_180s', 'Landmine_Linear_Jammer', 'Rack_Delivery', 'Single-Arm_Linear_Jammer']);
const smoothApparatusMotion = new Set(['V-Bar_Pullup', 'Cable_Russian_Twists', 'Torso_Rotation', 'Close-Grip_Front_Lat_Pulldown']);

for (const [id, entry] of entries) {
  const key = id.slice(prefix.length);
  assert.equal(entry.name, catalog.get(id)?.name, id);
  assert.ok(entry.primary.length && [...entry.primary, ...entry.supporting].every((m) => atlas.has(m)), id + ' atlas');
  for (const marks of [entry.phases, entry.cues]) {
    assert.equal(marks[0][0], 0, id);
    assert.ok(marks.every(([at, ...labels], i) => at <= entry.clip.duration &&
      (!i || at > marks[i - 1][0]) && labels.every((text) => text.trim())), id + ' cues');
  }
  const signature = createHash('sha256');
  let moves = false;
  for (const clip of [entry.clip, entry.propClip, entry.secondPropClip].filter(Boolean)) {
    assert.ok(clip.validate(), id);
    assert.equal(clip.duration, entry.clip.duration, id);
    for (const track of clip.tracks) {
      const size = track.getValueSize();
      const interpolant = track.createInterpolant();
      const start = track.values.slice(0, size);
      const end = track.values.slice(-size);
      const angleLimit = key === 'Plate_Twist' && /^Forearm[LR]\.quaternion$/.test(track.name) ? .32
        : smoothApparatusMotion.has(key) && size === 4 ? .45
        : smoothArmMotion.has(key) && /^(Arm|Forearm|Hand)[LR]\.quaternion$/.test(track.name) ? .45 : 0;
      if (angleLimit) {
        const before = new Quaternion().fromArray(start).normalize();
        const after = new Quaternion();
        for (let i = size; i < track.values.length; i += size) {
          after.fromArray(track.values, i).normalize();
          check(before.angleTo(after) < angleLimit, key + ' abrupt change in ' + track.name + ' at key ' + i / size);
          before.copy(after);
        }
      }
      assert.ok(track.times.every((time, i) => i === 0 || time > track.times[i - 1]), id + ' ascending keys');
      for (let i = 0; i <= 16; i++) {
        const values = interpolant.evaluate(clip.duration * i / 16);
        assert.ok(values.every(Number.isFinite), id + ' finite ' + track.name);
        if (size === 4) assert.ok(Math.abs(Math.hypot(...values) - 1) < .001, id + ' normalized ' + track.name);
        moves ||= clip === entry.clip && values.some((value, n) => Math.abs(value - start[n]) > .015);
        if (clip === entry.clip && track.times.length > 1) {
          signature.update(Array.from(values, (value) => Math.round(value * 500)).join(',') + '|');
        }
      }
      const separation = size === 4 ? 1 - Math.abs(start.reduce((sum, value, i) => sum + value * end[i], 0))
        : Math.hypot(...start.map((value, i) => value - end[i]));
      check(separation < .001, key + ' loop closure ' + track.name);
    }
  }
  assert.ok(moves, id + ' moves');
  const digest = signature.digest('hex');
  assert.ok(!signatures.has(digest), id + ' unique body motion');
  signatures.add(digest);

  const barbell = entry.barLoad && createBarbell();
  const fixture = (entry.fixtures?.length || entry.animatedFixture || barbell) &&
    createSupplementalFixture(entry, barbell);
  const action = mixer.clipAction(entry.clip).setLoop(LoopOnce, 1).play();
  action.paused = true;
  function pose(t) {
    action.time = t;
    mixer.update(0);
    asset.scene.updateMatrixWorld(true);
    return entry.propClip && sampleProp(entry.propClip, t);
  }
  let floor = Infinity;
  let clearance = Infinity;
  let handError = 0;
  let pinError = 0;
  let propTravel = 0;
  let contactError = 0;
  let start;
  const fixedElbows = key === 'Low_Cable_Triceps_Extension' || key === 'Triceps_Overhead_Extension_with_Rope';
  if (fixedElbows) pose(0);
  const startElbows = fixedElbows && ['L', 'R'].map((side) => point('Forearm' + side));
  for (let i = 0; i <= 16; i++) {
    const at = entry.clip.duration * i / 16;
    const prop = pose(at);
    if (fixedElbows) {
      for (const [index, side] of ['L', 'R'].entries()) {
        const hand = bone('Hand' + side);
        check(hand.position.angleTo(handAlong(1 - 2 * index).applyQuaternion(hand.quaternion)) < .30,
          key + ' wrist follows forearm rotation');
        check(startElbows[index].distanceTo(point('Forearm' + side)) < .005, key + ' upper arm stays in place');
      }
    }
    const bounds = new Box3();
    for (const mesh of skin) bounds.expandByObject(mesh, true);
    floor = Math.min(floor, bounds.min.y);
    if (prop) {
      const [center, frame] = prop;
      start ??= center.clone();
      propTravel = Math.max(propTravel, start.distanceTo(center));
      if (key === 'Torso_Rotation' || key === 'Plate_Twist') {
        for (const [side, sign] of [['L', 1], ['R', -1]]) {
          const palm = bone('Hand' + side).localToWorld(handAlong(sign).multiplyScalar(.078).addScaledVector(handDorsal(), -.024));
          const surface = key === 'Plate_Twist'
            ? new Vector3(sign * entry.animatedFixture.size, 0, 0).applyQuaternion(frame).add(center)
            : palm.clone().sub(center).setLength(entry.animatedFixture.size).add(center);
          check(palm.distanceTo(surface) < .014, key + ' palms track the equipment');
        }
      }
      if (key === 'Weighted_Ball_Side_Bend') {
        const palm = bone('HandL').localToWorld(handAlong(1).multiplyScalar(.09).addScaledVector(handDorsal(), -.022));
        const local = palm.sub(center).applyQuaternion(frame.clone().invert());
        check(Math.abs(local.y - .018) < .01 && Math.hypot(local.x, local.z) < entry.animatedFixture.size,
          key + ' palm contacts outside plate face');
      }
      if (entry.equipment.endsWith('barbell')) {
        for (const [side, sign] of [['L', 1], ['R', -1]]) {
          const seat = bone('Hand' + side).localToWorld(dumbbellGripTransform(sign).position);
          const local = seat.sub(center).applyQuaternion(frame.clone().invert());
          handError = Math.max(handError, Math.hypot(local.y, local.z));
        }
        clearance = Math.min(clearance, center.y - .225);
      }
      if (entry.animatedFixture?.kind === 'landmine') {
        const pivot = new Vector3(...entry.fixtures[0].position).add(new Vector3(0, .018, 0));
        pinError = Math.max(pinError, new Vector3(-1.68, 0, 0).applyQuaternion(frame).add(center).distanceTo(pivot));
        for (const [side, sign] of [['L', 1], ['R', -1]]) {
          if (sign === 1 && /One-Arm|Single-Arm/.test(key)) continue;
          const seat = bone('Hand' + side).localToWorld(dumbbellGripTransform(sign).position);
          const local = seat.sub(center).applyQuaternion(frame.clone().invert());
          const lane = entry.animatedFixture.handle ? local.x : local.z;
          contactError = Math.max(contactError, Math.hypot(local.y, lane));
        }
      }
      if (barbell) {
        barbell.position.copy(center);
        barbell.quaternion.copy(frame);
        fixture.update();
        assert.ok(fixture.root.children.length, key + ' connected resistance');
        if (entry.barLoad === 'chains') check(fixture.root.children.some((part) => part.visible &&
          part.position.y >= .027 && Math.abs(part.position.y - center.y) < .035), key + ' chain follows sleeves');
      }
    }
  }
  check(floor >= -.057, key + ' floor clearance ' + floor.toFixed(3));
  check(clearance >= -.018, key + ' plate clearance ' + clearance.toFixed(3));
  check(handError <= .021, key + ' grip drift ' + handError.toFixed(3));
  check(pinError < .001, key + ' landmine pivot remains fixed');
  check(contactError < .016, key + ' grip stays on landmine sleeve or handle: ' + contactError.toFixed(3));
  if (key === 'Rack_Delivery') {
    for (const t of entry.clip.tracks[0].times) {
      pose(t);
      for (const [side, sign] of [['L', 1], ['R', -1]]) {
        const hand = bone('Hand' + side);
        const along = handAlong(sign).applyQuaternion(hand.getWorldQuaternion(new Quaternion()));
        const distal = point(hand.name).sub(point('Forearm' + side));
        assert.ok(along.angleTo(distal) < 1.75, key + ' wrist bend at ' + t);
      }
    }
    pose(entry.phases[2][0]);
    for (const side of ['L', 'R']) {
      const elbow = point('Forearm' + side);
      assert.ok(elbow.z > point('Hand' + side).z + .015 && elbow.y > point('Arm' + side).y,
        key + ' receives the shaft with high elbows in front');
    }
  }
  if (key === 'Front_Plate_Raise') {
    for (let frame = 0; frame <= 30; frame++) {
      pose(1.4 * frame / 30);
      for (const side of ['L', 'R']) {
        check(point('Arm' + side).distanceTo(point('Hand' + side)) > .49,
          'Front plate raise keeps the working arm extended');
      }
    }
  }
  if (key === 'Squat_with_Plate_Movers') {
    assert.equal(entry.animatedFixture.kind, 'plate');
    const { size: radius } = entry.animatedFixture;
    const plateAt = (t) => sampleProp(entry.secondPropClip, t)[0];
    const half = entry.clip.duration / 2;
    const phases = entry.phases.slice(0, entry.phases.length / 2);
    const timeOf = (label) => phases.find(([, phase]) => phase === label)[0];
    const [bottom, slide, mount] = ['Bottom', 'Slide the plate', 'Step onto the plate'].map(timeOf);
    const sole = { L: [], R: [] };
    const vertex = new Vector3();
    const worldVertex = (mesh, i) => mesh.localToWorld(mesh.getVertexPosition(i, vertex));
    pose(0);
    const split = (point('FootL').x + point('FootR').x) / 2;
    for (const mesh of skin) {
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        const p = worldVertex(mesh, i);
        if (p.y < .070) sole[p.x > split ? 'L' : 'R'].push([mesh, i]);
      }
    }
    for (const [offset, direction, inside, outside] of [[0, 1, 'R', 'L'], [half, -1, 'L', 'R']]) {
      pose(offset);
      const setup = point('Pelvis');
      const startPlate = plateAt(offset);
      const lead = point('Foot' + outside);
      pose(offset + bottom);
      check(setup.y - point('Pelvis').y > .30 && point('Foot' + outside).distanceTo(lead) < .005,
        'Squat depth with the lead foot planted on the plate');
      pose(offset + slide);
      const planted = point('Foot' + outside);
      const trailing = point('Foot' + inside);
      check(direction * (planted.x - startPlate.x) > radius && direction * (trailing.x - startPlate.x) > radius &&
        planted.distanceTo(trailing) < .20 && plateAt(offset + slide).distanceTo(startPlate) < .005,
      'Both feet step to the opposite side before the plate moves');
      for (let i = 0; i <= 8; i++) {
        const at = offset + slide + (mount - slide) * i / 8;
        const plate = plateAt(at);
        pose(at);
        let edge = Infinity;
        for (const [mesh, j] of sole[inside]) {
          const p = worldVertex(mesh, j);
          if (p.y < .036) edge = Math.min(edge, Math.hypot(p.x - plate.x, p.z - plate.z));
        }
        check(Math.abs(edge - radius) < .006 && Math.abs(plate.y - .018) < .001 &&
          point('Foot' + outside).distanceTo(planted) < .005, 'Inside foot stays against the rim during the floor slide');
      }
      const next = plateAt(offset + half);
      pose(offset + half);
      const foot = point('Foot' + inside);
      check(direction * (startPlate.x - next.x) > .20 && Math.hypot(foot.x - next.x, foot.z - next.z) < .005 &&
        Math.abs(foot.y - .110) < .005 && setup.distanceTo(point('Pelvis')) > .30,
      'The plate travels sideways and supports the other foot for the next squat');
    }
    const feet = [...sole.L, ...sole.R];
    const frames = Math.round(entry.clip.duration * 60);
    for (let i = 0; i <= frames; i++) {
      const at = entry.clip.duration * i / frames;
      const plate = plateAt(at);
      pose(at);
      check(feet.every(([mesh, j]) => {
        const p = worldVertex(mesh, j);
        return p.y >= -.005 && (p.y >= .031 || Math.hypot(p.x - plate.x, p.z - plate.z) >= radius - .003);
      }), 'Feet clear the floor and plate at ' + at.toFixed(2) + ' s');
    }
  }
  if (key === 'Barbell_Ab_Rollout' || key === 'Barbell_Rollout_from_Bench') {
    const [origin] = pose(0);
    const [extended, frame] = pose(1.4);
    const roll = 2 * Math.atan2(frame.x, frame.w);
    check(Math.abs(roll * .225 - (extended.z - origin.z)) < .001,
      key + ' plates roll in the direction of travel');
  }
  if (key === 'Barbell_Rollout_from_Bench') {
    pose(0);
    const setup = point('FootL');
    const knee = point('ShinL');
    const [extended] = pose(1.4);
    check(propTravel > .7 && Math.abs(extended.y - .225) < .006, key + ' rolls away on the floor');
    check(knee.y > .46 && knee.y < .51 && point('ShinL').distanceTo(knee) < .02 &&
      point('FootL').distanceTo(setup) < .01, key + ' keeps the knees and shins on the bench');
    check(point('HandL').z - point('Head').z > .25, key + ' reaches forward beyond the head');
    const elbow = point('ForearmL');
    check(elbow.clone().sub(point('ArmL')).angleTo(point('HandL').sub(elbow)) < .35,
      key + ' finishes with long arms');
  }
  if (key === 'Exercise_Ball_Pull-In') {
    pose(0);
    const setup = point('HandL');
    pose(1.4);
    check(setup.y < .065 && point('HandL').distanceTo(setup) < .02 && propTravel > .43,
      'Ball pull-in keeps the hands planted as the ball rolls toward them');
  }
  if (key === 'Ball_Leg_Curl') {
    pose(.2);
    const straight = point('FootL').distanceTo(point('ThighL'));
    pose(1.5);
    check(straight - point('FootL').distanceTo(point('ThighL')) > .25 && propTravel > .45,
      'Ball leg curl flexes the knee and rolls the ball in');
  }
  if (key === 'Weighted_Jump_Squat') {
    pose(1.37);
    check(point('FootL').y > .15 && point('FootR').y > .15, 'Weighted jump squat has an airborne phase');
  }
  if (key === 'Zottman_Preacher_Curl') {
    pose(1.4);
    const first = bone('HandL').getWorldQuaternion(new Quaternion());
    pose(1.94);
    check(first.angleTo(bone('HandL').getWorldQuaternion(new Quaternion())) > 2.6,
      'Zottman curl turns the grip at the peak');
  }
  if (key === 'Cable_Russian_Twists') {
    pose(0);
    const setup = point('HandL').lerp(point('HandR'), .5).x;
    const [pulley] = entry.resistance.anchors;
    const reach = [];
    for (let i = 0; i <= 16; i++) {
      pose(entry.clip.duration * i / 16);
      reach.push((point('HandL').lerp(point('HandR'), .5).x - setup) * Math.sign(pulley[0]));
    }
    check(Math.min(...reach) < -.25 && Math.max(...reach) < .015,
      'Cable Russian twist turns away from the fixed pulley throughout the rep');
  }
  if (key === 'Seated_Two-Arm_Palms-Up_Low-Pulley_Wrist_Curl') {
    pose(0);
    const forearms = ['ForearmL', 'ForearmR', 'HandL', 'HandR'].map(point);
    const wrist = bone('HandL').getWorldQuaternion(new Quaternion());
    pose(1.4);
    check(['ForearmL', 'ForearmR', 'HandL', 'HandR'].every((name, i) => point(name).distanceTo(forearms[i]) < .001),
      key + ' elbows and wrists stay in place');
    check(bone('HandL').getWorldQuaternion(new Quaternion()).angleTo(wrist) > 1, key + ' hands flex at the wrists');
  }
  if (entry.resistance?.support === 'feet') {
    const resistance = createResistanceFixture(entry.resistance, asset.scene, dumbbellGripTransform);
    const brace = resistance.root.getObjectByName('Foot brace');
    for (const t of [0, .8, 1.4, 2.8]) {
      pose(t);
      for (const side of ['L', 'R']) {
        const contact = brace.worldToLocal(bone('Foot' + side).localToWorld(new Vector3(0, -.074, .095)));
        check(Math.abs(contact.z + .0375) < .003 && Math.abs(contact.y) < .13, key + ' sole against foot brace');
      }
    }
  }
  if (key === 'V-Bar_Pullup') {
    for (const track of entry.clip.tracks.filter(({ name }) => /^Hand[LR]\.quaternion$/.test(name))) {
      const start = new Quaternion().fromArray(track.values).normalize();
      const end = new Quaternion().fromArray(track.values, track.values.length - 4).normalize();
      check(start.angleTo(end) < .003, key + ' wrist returns to the same angle');
    }
    const grips = fixture.root.getObjectsByProperty('name', 'V grip');
    for (let i = 0; i <= 32; i++) {
      pose(entry.clip.duration * i / 32);
      for (const [index, side] of ['R', 'L'].entries()) {
        const seat = bone('Hand' + side).localToWorld(dumbbellGripTransform(index ? 1 : -1).position);
        check(seat.distanceTo(grips[index].position) < .005, key + ' maintains handle contact');
      }
    }
  }
  if (key.endsWith('Linear_Jammer')) {
    const [start] = pose(0);
    const [finish] = pose(1.4);
    check(finish.y > start.y + .30 && finish.z > start.z + .30, key + ' drives the load up and away from the chest');
    const arm = point('ForearmR').sub(point('ArmR'));
    const forearm = point('HandR').sub(point('ForearmR'));
    check(arm.angleTo(forearm) < .68, key + ' finishes with the working arm extended');
  }
  if (key === 'Double_Kettlebell_Windmill') {
    const floorBell = new Vector3(.385, .254, .258);
    for (const [from, to] of [[0, 1.50], [3.05, entry.clip.duration]]) {
      for (let i = 0; i <= 16; i++) {
        const [center] = sampleProp(entry.secondPropClip, from + (to - from) * i / 16);
        check(center.distanceTo(floorBell) < .001, key + ' lower bell stays planted through contact and release');
      }
    }
    for (const time of [1.50, 1.72, 2.20, 2.80, 3.05]) {
      pose(time);
      const [center] = sampleProp(entry.secondPropClip, time);
      const seat = bone('HandL').localToWorld(dumbbellGripTransform(1).position);
      check(seat.distanceTo(center) < .004, key + ' lower bell stays in the closed hand');
      if (time === 2.20) check(center.y > floorBell.y + .30, key + ' lower bell follows the figure up');
    }
  }
  action.stop();
}
assert.deepEqual(failures, []);
console.log('100 distinct catalog clips verified, including floor clearance, bar grips, landmine pivots and exercise-specific motion.');
