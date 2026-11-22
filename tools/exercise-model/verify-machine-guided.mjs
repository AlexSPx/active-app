import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, Box3, LoopOnce, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createBarbell } from './barbell.mjs';
import { handAlong } from './hand-frame.mjs';
import { createEntries } from './machine-guided.mjs';
import { createMachineGuidedFixture } from './machine-guided-fixtures.mjs';

const base = (path) => new URL(path, import.meta.url);
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
  Uint8Array.from(await readFile(base('./anatomy.glb'))).buffer, '');
const entries = createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform });
const source = JSON.parse(await readFile(base('../../apps/client/lib/data/exercise-catalog.json')));
const catalog = new Map(source.map((entry) => [entry.id, entry]));
const smith = source.filter(({ id, equipment }) => /smith/i.test(id) && equipment === 'MACHINE').map(({ id }) => id);
const assigned = [
  'Bicycling_Stationary', 'Elliptical_Trainer', 'Jogging_Treadmill', 'Recumbent_Bike', 'Rowing_Stationary',
  'Running_Treadmill', 'Stairmaster', 'Step_Mill', 'Walking_Treadmill', 'Lunge_Sprint',
  'Calf-Machine_Shoulder_Shrug', 'Chair_Squat', 'Glute_Ham_Raise', 'Hack_Squat', 'Lying_Machine_Squat',
  'Narrow_Stance_Hack_Squats', 'Standing_Calf_Raises',
].map((id) => 'local:exercise:' + id);
const shoulderRack = new Set([
  'Chair_Squat', 'Lunge_Sprint', 'Smith_Machine_Squat', 'Smith_Machine_Pistol_Squat',
  'Smith_Single-Leg_Split_Squat', 'Smith_Machine_Calf_Raise', 'Smith_Machine_Reverse_Calf_Raises',
].map((id) => 'local:exercise:' + id));
assert.equal(smith.length, 19);
assert.deepEqual(Object.keys(entries).sort(), [...smith, ...assigned].sort());

const bar = createBarbell();
const figureMixer = new AnimationMixer(asset.scene);
const barMixer = new AnimationMixer(bar);
const surfaces = asset.scene.getObjectsByProperty('isSkinnedMesh', true);
const atlas = new Set(surfaces.map(({ material }) => material.name));
const feet = { L: [], R: [] };
for (const mesh of surfaces) {
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  const axes = ['getX', 'getY', 'getZ', 'getW'];
  for (let i = 0; i < skinIndex.count; i++) {
    const strongest = axes.reduce((best, axis) => skinWeight[axis](i) > skinWeight[best](i) ? axis : best);
    const name = mesh.skeleton.bones[skinIndex[strongest](i)].name;
    if (name.startsWith('Foot')) feet[name.at(-1)].push([mesh, i]);
  }
}
const vertex = new Vector3();
const signatures = new Set();
const bone = (name) => asset.scene.getObjectByName(name);
const joint = (name) => bone(name).getWorldPosition(new Vector3());
const sample = 48;
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };

for (const [id, entry] of Object.entries(entries)) {
  const { clip, propClip, phases, cues, machineGuidedFixture: options } = entry;
  assert.equal(entry.name, catalog.get(id)?.name, id);
  assert.equal(catalog.get(id)?.equipment, 'MACHINE', id);
  assert.ok(entry.primary.length && [...entry.primary, ...entry.supporting].every((name) => atlas.has(name)), id);
  assert.equal(phases[0][0], 0, id);
  assert.ok(phases.every(([t], i) => t <= clip.duration + .00001 && (!i || phases[i - 1][0] < t)), id);
  assert.ok(cues.length >= 2 && cues.every(([t, title, description]) => t >= 0 && t <= clip.duration && title && description), id);
  assert.equal(Boolean(propClip), options.kind === 'smith', id);
  if (propClip) assert.ok(entry.equipment.endsWith('barbell') && propClip.duration === clip.duration, id);

  const signature = createHash('sha256');
  let moving = false;
  for (const motion of [clip, propClip].filter(Boolean)) {
    assert.ok(motion.validate(), id);
    for (const track of motion.tracks) {
      const interpolant = track.createInterpolant();
      const width = track.getValueSize();
      assert.ok(track.times.every((t, i) => !i || t > track.times[i - 1]), id);
      for (let i = 0; i <= sample; i++) {
        const values = Array.from(interpolant.evaluate(motion.duration * i / sample));
        assert.ok(values.every(Number.isFinite), id + ' ' + track.name);
        if (width === 4) assert.ok(Math.abs(Math.hypot(...values) - 1) < .001, id + ' ' + track.name);
        moving ||= values.some((x, j) => Math.abs(x - track.values[j]) > .03);
        signature.update(values.map((x) => Math.round(x * 1000)).join(',') + '|');
      }
      const start = Array.from(track.values.slice(0, width));
      const finish = Array.from(track.values.slice(-width));
      const close = width === 4 ? 1 - Math.abs(start.reduce((sum, x, j) => sum + x * finish[j], 0))
        : Math.hypot(...start.map((x, j) => x - finish[j]));
      assert.ok(close < .001, id + ' loop closure ' + track.name + ' ' + close);
    }
  }
  assert.ok(moving, id);
  const hash = signature.digest('hex');
  assert.ok(!signatures.has(hash), id + ' duplicated motion');
  signatures.add(hash);

  const fixture = createMachineGuidedFixture(entry, asset.scene, bar);
  const figures = figureMixer.clipAction(clip).setLoop(LoopOnce, 1).play();
  const weights = propClip && barMixer.clipAction(propClip).setLoop(LoopOnce, 1).play();
  figures.paused = true;
  if (weights) weights.paused = true;
  const barHeights = [];
  const leftSteps = [];
  const visibleTreads = () => fixture.root.getObjectsByProperty('name', 'Moving stair tread').filter(({ visible }) => visible)
    .map(({ position, scale }) => ({ position: position.clone(), depth: scale.z })).sort((a, b) => a.position.z - b.position.z);
  let firstTreads;
  let lowest = Infinity;
  let drift = 0;
  let handGap = 0;
  let footGap = 0;
  let fixtureGap = 0;
  for (let i = 0; i <= sample; i++) {
    const at = clip.duration * i / sample;
    figures.time = at;
    figureMixer.update(0);
    if (weights) {
      weights.time = at;
      barMixer.update(0);
    }
    fixture.update();
    fixture.root.updateMatrixWorld(true);
    asset.scene.updateMatrixWorld(true);
    fixture.root.traverse((object) => {
      assert.ok(object.matrixWorld.elements.every(Number.isFinite), id + ' ' + object.name);
      if (object.isMesh) assert.ok(object.scale.y > 0, id + ' ' + object.name);
    });
    const bounds = new Box3().setFromObject(fixture.root);
    assert.ok(bounds.min.y > -.04 && bounds.max.y < 2.27 && bounds.max.z - bounds.min.z < 2.25, id + ' fixture bounds');
    if (i % 4 === 0) {
      const figure = new Box3();
      for (const surface of surfaces) figure.expandByObject(surface, true);
      lowest = Math.min(lowest, figure.min.y);
      check(figure.max.y < 2.37, id + ' figure height');
    }
    leftSteps.push(joint('FootL').toArray());
    if (id.endsWith(':Running_Treadmill')) {
      for (const [side, phase] of [['R', 0], ['L', .5]]) {
        if ((i / sample + phase) % 1 >= .373) continue;
        const sole = Math.min(...feet[side].map(([mesh, index]) =>
          mesh.localToWorld(mesh.getVertexPosition(index, vertex)).y));
        assert.ok(Math.abs(sole - .166) < .008, id + ' planted ' + side + ' foot reaches the belt at ' + at);
      }
    }
    if (options.kind === 'bike') {
      const pedals = fixture.root.getObjectsByProperty('name', 'Bike pedal');
      const grips = fixture.root.getObjectsByProperty('name', 'Bike handgrip');
      const [y, z] = options.crank;
      for (const [index, side] of ['L', 'R'].entries()) {
        const pedal = pedals[index].position;
        const hand = bone('Hand' + side).localToWorld(new Vector3(...options.gripOffsets[index]));
        fixtureGap = Math.max(fixtureGap, Math.abs(Math.hypot(pedal.y - y, pedal.z - z) - options.radius),
          hand.distanceTo(grips[index].position));
      }
    }
    if (options.kind === 'sled') {
      const guide = fixture.root.getObjectsByProperty('name', 'Sled guide rail');
      const blocks = fixture.root.getObjectsByProperty('name', 'Sled guide block');
      guide.forEach((rail, index) => {
        const axis = new Vector3(0, 1, 0).applyQuaternion(rail.quaternion);
        const offset = blocks[index].getWorldPosition(new Vector3()).sub(rail.position);
        fixtureGap = Math.max(fixtureGap, offset.cross(axis).length());
      });
    }
    if (options.kind === 'elliptical') {
      const handles = fixture.root.getObjectsByProperty('name', 'Moving handle arm');
      const pedals = fixture.root.getObjectsByProperty('name', 'Elliptical pedal');
      const links = fixture.root.getObjectsByProperty('name', 'Pedal linkage');
      handles.forEach((handle, index) => {
        const pedalEnd = links[index].localToWorld(new Vector3(0, .5, 0));
        fixtureGap = Math.max(fixtureGap, Math.abs(handle.scale.y - .39),
          pedalEnd.distanceTo(pedals[index].position.clone().add(new Vector3(0, .020, 0))));
      });
    }
    if (options.kind === 'stepmill') {
      const phase = (i / sample) % 1;
      const foot = bone(phase < .5 ? 'FootR' : 'FootL').localToWorld(new Vector3(0, -.074, .044));
      const treads = visibleTreads();
      fixtureGap = Math.max(fixtureGap, Math.min(...treads.map(({ position }) =>
        Math.hypot(foot.y - position.y - .037, foot.z - position.z))));
      if (i === 0) firstTreads = treads;
      if (i === sample) {
        assert.equal(treads.length, firstTreads.length, id + ' visible step count at loop seam');
        treads.forEach(({ position, depth }, n) => {
          assert.ok(position.distanceTo(firstTreads[n].position) < .001 && Math.abs(depth - firstTreads[n].depth) < .001,
            id + ' visible tread closes at the loop seam');
        });
      }
    }
    if (weights) {
      barHeights.push(bar.position.y);
      drift = Math.max(drift, Math.hypot(bar.position.x, bar.position.z - options.z));
      const axis = new Vector3(1, 0, 0).applyQuaternion(bar.quaternion);
      assert.ok(Math.abs(axis.x) > .9999, id + ' shaft horizontal');
      const slides = fixture.root.getObjectsByProperty('name', 'Bar carriage');
      assert.equal(slides.length, 2, id);
      for (const slide of slides) assert.ok(Math.abs(slide.getWorldPosition(new Vector3()).y - bar.position.y) < .0001, id);
      for (const [side, sign] of [['L', 1], ['R', -1]]) {
        if (id.includes('Hip_Raise') || id.includes('Leg_Press')) {
          const point = bone('Foot' + side).localToWorld(new Vector3(0, -.080, .063)).sub(bar.position);
          footGap = Math.max(footGap, Math.hypot(point.y, point.z));
        } else if (side !== 'L' || !id.includes('One-Arm')) {
          const hand = bone('Hand' + side);
          const point = hand.localToWorld(dumbbellGripTransform(sign).position).sub(bar.position);
          handGap = Math.max(handGap, Math.hypot(point.y, point.z));
          if (shoulderRack.has(id)) {
            const along = handAlong(sign).applyQuaternion(hand.getWorldQuaternion(new Quaternion()));
            const distal = joint(hand.name).sub(joint('Forearm' + side));
            assert.ok(along.angleTo(distal) < 1.14, id + ' back-rack wrist bend at ' + at);
          }
        }
      }
    }
  }
  if (options.kind === 'stepmill') {
    let previous;
    for (let i = 0; i <= 480; i++) {
      figures.time = clip.duration * i / 480;
      figureMixer.update(0);
      fixture.update();
      const current = visibleTreads();
      if (previous) {
        for (const [from, to] of [[previous, current], [current, previous]]) {
          for (const tread of from.filter(({ depth }) => depth > .04)) {
            assert.ok(to.some(({ position, depth }) => position.distanceTo(tread.position) < .018 &&
              Math.abs(depth - tread.depth) < .1), id + ' tread wraps continuously at sample ' + i);
          }
        }
      }
      previous = current;
    }
  }
  const continuous = {
    'local:exercise:Smith_Machine_Hang_Power_Clean': ['Forearm', .32],
    'local:exercise:Smith_Machine_Hip_Raise': ['Thigh', .06],
  }[id];
  if (continuous) {
    const [jointName, maxStep] = continuous;
    const joints = ['L', 'R'].map((side) => bone(jointName + side));
    const previous = joints.map(() => new Quaternion());
    const current = new Quaternion();
    for (const [index, time] of clip.tracks[0].times.entries()) {
      figures.time = time;
      figureMixer.update(0);
      joints.forEach((joint, side) => {
        joint.getWorldQuaternion(current);
        assert.ok(index === 0 || previous[side].angleTo(current) < maxStep,
          id + ' abrupt ' + joint.name + ' rotation at ' + time);
        previous[side].copy(current);
      });
    }
  }
  if (process.env.MACHINE_GUIDED_DETAILS) {
    console.log(id, { lowest: +lowest.toFixed(3), drift: +drift.toFixed(3), hand: +handGap.toFixed(3), foot: +footGap.toFixed(3), fixtureGap: +fixtureGap.toFixed(3),
      travel: +(Math.max(...barHeights) - Math.min(...barHeights)).toFixed(3) });
  }
  check(lowest > -.012, id + ' penetrates the floor by ' + -lowest);
  if (options.kind === 'treadmill') check(Math.abs(lowest - .166) < .008, id + ' belt contact');
  check(fixtureGap < .014, id + ' loses fixture alignment by ' + fixtureGap);
  if (weights) {
    check(drift < .003, id + ' bar leaves rails by ' + drift);
    check(handGap < .004 && footGap < .020, id + ' loses shaft contact ' + Math.max(handGap, footGap));
    check(Math.max(...barHeights) - Math.min(...barHeights) > .04, id + ' stationary bar');
  }
  if (['bike', 'stepper', 'stepmill', 'elliptical', 'treadmill'].includes(options.kind)) {
    const range = (i) => Math.max(...leftSteps.map((p) => p[i])) - Math.min(...leftSteps.map((p) => p[i]));
    check(range(1) > .10 && (options.kind === 'stepper' || range(2) > .20), id + ' stride or pedal excursion');
  }
  figures.stop();
  weights?.stop();
}

assert.deepEqual(errors, []);
console.log('Verified 36 distinct machine clips, fixture motion and alignment, and Smith bar contact.');
