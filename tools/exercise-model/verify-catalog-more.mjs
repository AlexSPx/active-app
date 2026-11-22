import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, Box3, LoopOnce, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createDumbbellGripTracks, dumbbellGripTransform } from './clips.mjs';
import { createDumbbell } from './dumbbell.mjs';
import { createFlatBench } from './flat-bench.mjs';
import { createInclineBench } from './incline-bench.mjs';
import { createKettlebell } from './kettlebell.mjs';
import { createStepPlatform } from './dumbbell-expansion.mjs';
import { handAlong, handDorsal, measurePalmContacts } from './hand-frame.mjs';
import * as bodyweight from './bodyweight-catalog-more.mjs';
import * as dumbbell from './dumbbell-catalog-more.mjs';
import * as barbell from './barbell-catalog-more.mjs';
import * as kettlebell from './kettlebell-catalog-more.mjs';

const bytes = Uint8Array.from(await readFile(new URL('./anatomy.glb', import.meta.url)));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
const palms = measurePalmContacts(asset.scene);
const helpers = { createDumbbellGripTracks, dumbbellGripTransform };
const catalog = new Map(JSON.parse(await readFile(
  new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url))).map((entry) => [entry.id, entry]));
const mixer = new AnimationMixer(asset.scene);
const skin = [];
asset.scene.traverse((object) => { if (object.isSkinnedMesh) skin.push(object); });
const atlas = new Set(skin.map(({ material }) => material.name));
const signatures = new Set();
const clips = new Map();
const point = (name) => asset.scene.getObjectByName(name).getWorldPosition(new Vector3());
const key = (track, time) => track.createInterpolant().evaluate(time);
const sample = (entry, time) => {
  const action = mixer.clipAction(entry.clip).setLoop(LoopOnce, 1).play();
  action.paused = true;
  action.time = time;
  mixer.update(0);
  asset.scene.updateMatrixWorld(true);
  return () => action.stop();
};
const propPose = (propClip, time) => [
  new Vector3().fromArray(key(propClip.tracks[0], time)),
  new Quaternion().fromArray(key(propClip.tracks[1], time)),
];
function gripSeat(side, center, frame, id, time, fixed = false) {
  const joint = asset.scene.getObjectByName('Hand' + side);
  const { position, quaternion } = dumbbellGripTransform(side === 'L' ? 1 : -1);
  const inverse = frame.clone().invert();
  const seat = joint.localToWorld(position).sub(center).applyQuaternion(inverse);
  assert.ok(Math.hypot(seat.y, seat.z) < .012, `${id} ${side} handle at ${time} s: ${seat.toArray()}`);
  if (!fixed && /Kettlebell|Floor_Press|Hang_Clean|Renegade_Row/.test(id)) {
    assert.ok(Math.abs(seat.x) < .06, id + ' seat within straight handle');
  }
  const axis = new Vector3(1, 0, 0).applyQuaternion(quaternion)
    .applyQuaternion(joint.getWorldQuaternion(new Quaternion())).applyQuaternion(inverse);
  assert.ok(Math.abs(axis.x) > .99, id + ' handle alignment at ' + time);
  return seat;
}

for (const [family, count] of [[bodyweight, 30], [dumbbell, 12], [barbell, 40], [kettlebell, 18]]) {
  const entries = Object.entries(family.createEntries(asset, helpers));
  assert.equal(entries.length, count, family.groupLabel);
  for (const [id, entry] of entries) {
    assert.equal(entry.name, catalog.get(id)?.name, id);
    assert.ok([...entry.primary, ...entry.supporting].every((muscle) => atlas.has(muscle)), id + ' atlas groups');
    assert.ok(!clips.has(id), id);
    clips.set(id, entry);
    const movement = createHash('sha256');
    let moved = false;
    for (const clip of [entry.clip, entry.propClip, entry.secondPropClip].filter(Boolean)) {
      assert.ok(clip.validate(), id);
      assert.equal(clip.duration, entry.clip.duration, id);
      for (const track of clip.tracks) {
        const size = track.getValueSize();
        assert.ok(track.times.every((time, i) => i === 0 || time > track.times[i - 1]), id);
        for (let i = 1; i <= 16; i++) {
          const values = key(track, i * clip.duration / 16);
          assert.ok(values.every(Number.isFinite), id);
          if (track.name.endsWith('quaternion')) assert.ok(Math.abs(Math.hypot(...values) - 1) < .001, id + ' ' + track.name + ' sample ' + i);
          moved ||= values.some((value, n) => Math.abs(value - track.values[n]) > .005);
          movement.update(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
        }
        if (!entry.oneShot && track.times.length > 1) {
          assert.ok(track.values.slice(0, size).every((value, i) =>
            Math.abs(value - track.values[track.values.length - size + i]) < .003), id + ' loop closure ' + track.name);
        }
      }
    }
    assert.ok(moved, id + ' must move');
    const digest = movement.digest('hex');
    assert.ok(!signatures.has(digest), id + ' has duplicate motion');
    signatures.add(digest);
    const cradle = entry.equipment === 'cradle-dumbbell';
    const cradleSeats = new Map();
    for (let i = 0; i <= 16; i++) {
      const t = i * entry.clip.duration / 16;
      const stop = sample(entry, t);
      const bounds = new Box3();
      for (const mesh of skin) bounds.expandByObject(mesh, true);
      assert.ok(bounds.min.y > -.034, id + ' floor contact at ' + t + ': ' + bounds.min.y);
      if (cradle) {
        const [center, rotation] = propPose(entry.propClip, t);
        for (const side of ['L', 'R']) {
          const wrist = point('Hand' + side).sub(center).applyQuaternion(rotation.clone().invert());
          if (i === 0) cradleSeats.set(side, wrist);
          else assert.ok(wrist.distanceTo(cradleSeats.get(side)) < .009, id + ' steady head cradle at ' + t);
          const hand = asset.scene.getObjectByName('Hand' + side);
          assert.ok(hand.position.angleTo(handAlong(side === 'L' ? 1 : -1).applyQuaternion(hand.quaternion)) < 1,
            id + ' cradle wrist stays aligned at ' + t);
        }
      }
      stop();
    }
    if (family === barbell || family === kettlebell || entry.equipment === 'pull-up-bar') {
      for (let i = 0; i <= 16; i++) {
        const t = i * entry.clip.duration / 16;
        const stop = sample(entry, t);
        if (family === kettlebell) {
          const [center, rotation] = propPose(entry.propClip, t);
          gripSeat('R', center, rotation, id, t);
          if (entry.secondPropClip) {
            const [other, otherRotation] = propPose(entry.secondPropClip, t);
            gripSeat('L', other, otherRotation, id, t);
            assert.ok(center.distanceTo(other) > .12, id + ' independent props');
          }
        } else {
          const hanging = entry.equipment === 'pull-up-bar';
          const [center, frame] = hanging ? [new Vector3(0, 2.30, 0), new Quaternion()] : propPose(entry.propClip, t);
          for (const side of ['L', 'R']) gripSeat(side, center, frame, id, t, hanging || family === barbell);
        }
        stop();
      }
    }
  }
}

const entry = (key) => clips.get('local:exercise:' + key);
for (const id of ['Clean', 'Power_Clean', 'Snatch', 'Power_Snatch']) {
  const [start] = propPose(entry(id).propClip, 0);
  assert.ok(Math.abs(start.y - .225) < .004, id + ' plates start on the floor');
}
for (const t of [0, .8, 2.38]) {
  const row = entry('Alternating_Renegade_Row');
  const [right] = propPose(row.propClip, t);
  const [left] = propPose(row.secondPropClip, t);
  assert.ok(Math.abs(Math.min(left.y, right.y) - .254) < .004, 'supporting bell stays on the floor');
}

function at(key, time, check) {
  const stop = sample(entry(key), time);
  check();
  stop();
}
const frontSquat = 'Front_Barbell_Squat_To_A_Bench';
const frontBench = createFlatBench();
frontBench.position.fromArray(entry(frontSquat).benchTransform.position);
frontBench.updateMatrixWorld(true);
const squatPad = new Box3().setFromObject(frontBench.getObjectByName('Pad'), true);
for (const time of [0, .9, 1.65, 2.4, 3.6]) {
  at(frontSquat, time, () => {
    let bottom = Infinity;
    const vertex = new Vector3();
    for (const mesh of skin) {
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.localToWorld(mesh.getVertexPosition(i, vertex));
        if (vertex.x > squatPad.min.x + .005 && vertex.x < squatPad.max.x - .005
          && vertex.z > squatPad.min.z + .005 && vertex.z < squatPad.max.z - .005) bottom = Math.min(bottom, vertex.y);
      }
    }
    assert.ok(bottom > squatPad.max.y - .008, 'front squat clears the pad at ' + time + ' s: ' + bottom);
    if (time === 1.65) assert.ok(bottom < squatPad.max.y + .008, 'glutes touch the bench at squat depth');
  });
}
const extension = 'Standing_Dumbbell_Triceps_Extension';
let elbows;
at(extension, 0, () => { elbows = ['L', 'R'].map((side) => point('Forearm' + side)); });
at(extension, 1.65, () => {
  assert.ok(propPose(entry(extension).propClip, 1.65)[0].z < point('Head').z - .20, 'dumbbell lowers behind the head');
  for (const [i, side] of ['L', 'R'].entries()) {
    const elbow = point('Forearm' + side);
    const angle = point('Arm' + side).sub(elbow).angleTo(point('Hand' + side).sub(elbow));
    assert.ok(elbow.distanceTo(elbows[i]) < .01 && angle < 1.50, 'elbow flexes beneath a stationary upper arm');
    assert.ok(point('Hand' + side).x * (side === 'L' ? 1 : -1) > .04, 'hands cradle the head without crossing');
  }
});
const supportedRaise = 'Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench';
const headBenchTransform = entry(supportedRaise).benchTransform;
const headBench = createInclineBench({ angle: headBenchTransform.angle });
headBench.position.fromArray(headBenchTransform.position);
const headPad = headBench.getObjectByName('Backrest pad');
const seatPad = headBench.getObjectByName('Seat pad');
seatPad.geometry.computeBoundingBox();
const seatBounds = seatPad.geometry.boundingBox.clone().expandByScalar(.003);
for (const time of [0, .8, 1.4, 2.6, 3.6]) {
  at(supportedRaise, time, () => {
    const head = asset.scene.getObjectByName('Head');
    const vertex = new Vector3();
    let nearest = Infinity;
    for (const mesh of skin) {
      const headIndex = mesh.skeleton.bones.indexOf(head);
      const thighs = mesh.skeleton.bones.map(({ name }, i) => /^Thigh[LR]$/.test(name) ? i : -1).filter((i) => i >= 0);
      const { position, skinIndex } = mesh.geometry.attributes;
      for (let i = 0; i < position.count; i++) {
        const bone = skinIndex.getX(i);
        if (bone === headIndex) {
          headPad.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(i, vertex)));
          if (Math.abs(vertex.x) < .14 && Math.abs(vertex.z) < .41) nearest = Math.min(nearest, vertex.y);
        } else if (thighs.includes(bone)) {
          seatPad.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(i, vertex)));
          assert.ok(!seatBounds.containsPoint(vertex), 'thighs clear the seat pad at ' + time);
        }
      }
    }
    assert.ok(Math.abs(nearest - .032) < .008, 'forehead stays in contact with the incline pad');
  });
}
for (const time of [0, .8, 1.65, 2.4, 3.6]) {
  at('Seated_Front_Deltoid', time, () => {
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      const hand = asset.scene.getObjectByName('Hand' + side);
      const reach = point(hand.name).sub(point('Arm' + side));
      assert.ok(sign * reach.x > .39 && reach.z < -.10, 'deltoid stretch reaches out and back');
      assert.ok(handDorsal().applyQuaternion(hand.getWorldQuaternion(new Quaternion())).y > .98,
        'deltoid stretch keeps palms down');
    }
  });
  at('Front_Barbell_Squat_To_A_Bench', time, () => {
    assert.ok(point('HandR').x > point('HandL').x + .16, 'front bench squat crosses the hands on the bar');
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      const hand = asset.scene.getObjectByName('Hand' + side);
      const along = handAlong(sign).applyQuaternion(hand.getWorldQuaternion(new Quaternion()));
      const distal = point(hand.name).sub(point('Forearm' + side));
      assert.ok(along.angleTo(distal) < 1.40, 'front bench squat wrist bend at ' + time);
    }
  });
}
for (const id of ['Incline_Push-Up_Close-Grip', 'Incline_Push-Up_Medium',
  'Incline_Push-Up_Wide', 'Incline_Push-Up_Reverse_Grip']) {
  for (const time of [0, .6, 1.1, 1.65, 2.33, 2.9, 3.6]) {
    at(id, time, () => {
      for (const side of ['L', 'R']) {
        const hip = point('Thigh' + side);
        const shoulder = point('Arm' + side);
        const elbow = point('Forearm' + side);
        const elbowAngle = shoulder.clone().sub(elbow).angleTo(point('Hand' + side).sub(elbow));
        const bodyAngle = shoulder.sub(hip).angleTo(point('Foot' + side).sub(hip));
        assert.ok(bodyAngle > 2.85, id + ' maintains shoulder-to-ankle alignment');
        assert.ok(elbowAngle > 1.10 && (time !== 0 || elbowAngle > 2.70), id + ' elbow range');
        if (id === 'Incline_Push-Up_Reverse_Grip') {
          const [center, frame] = propPose(entry(id).propClip, time);
          assert.ok(center.distanceTo(new Vector3(0, .520, .490)) < .001, id + ' fixed Smith shaft');
          gripSeat(side, center, frame, id, time);
        } else {
          const { heel, knuckles } = palms(side);
          assert.ok([heel, knuckles].every((height) => Math.abs(height - .430) < .010), id + ' palms on bench');
        }
      }
    });
  }
}
let powerCatch;
at('Power_Clean', 1.23, () => { powerCatch = point('Pelvis').y; });
at('Clean', 1.23, () => assert.ok(powerCatch - point('Pelvis').y > .17, 'power clean catches higher'));
at('Split_Jerk', 1.12, () => {
  assert.ok(point('FootL').z - point('FootR').z > .70, 'split jerk foot placement');
  assert.ok(point('HandL').y > point('Head').y, 'split jerk lockout');
});
let rear, front;
at('Jerk_Balance', 0, () => {
  rear = point('FootR');
  front = point('FootL');
});
at('Jerk_Balance', 1.12, () => {
  assert.ok(point('FootR').distanceTo(rear) < .005, 'jerk balance keeps its rear foot planted through the catch');
  assert.ok(point('FootL').z > front.z + .20, 'jerk balance steps the front foot forward');
});
const boxSquat = entry('Speed_Box_Squat');
const box = boxSquat.fixtures.find(({ kind }) => kind === 'box');
assert.equal(boxSquat.barLoad, 'resisted');
let standingHip;
at('Speed_Box_Squat', 0, () => { standingHip = point('Pelvis').y; });
at('Speed_Box_Squat', 1.65, () => {
  const hip = point('Pelvis');
  assert.ok(Math.abs(hip.y - (box.position[1] + box.size[1] / 2) - .11) < .02
    && Math.abs(hip.z - box.position[2]) < box.size[2] / 2, 'speed squat reaches the box');
});
at('Speed_Box_Squat', 2.32, () => assert.ok(Math.abs(point('Pelvis').y - standingHip) < .005, 'speed squat finishes the fast ascent'));
for (const time of [0, .64, 1.02, 1.4, 2.46]) {
  at('Straight_Raises_on_Incline_Bench', time, () => {
    const upper = point('ForearmL').sub(point('ArmL'));
    const lower = point('HandL').sub(point('ForearmL'));
    assert.ok(upper.angleTo(lower) < .43, 'incline bar raise keeps the elbows nearly extended throughout the arc');
    assert.ok(propPose(entry('Straight_Raises_on_Incline_Bench').propClip, time)[0].y > .225,
      'incline bar raise keeps the plates off the floor');
  });
}
const dumbbellProps = ['L', 'R'].map((side, index) => {
  const prop = createDumbbell();
  const { position, quaternion } = dumbbellGripTransform(index ? -1 : 1);
  prop.position.copy(position);
  prop.quaternion.copy(quaternion);
  asset.scene.getObjectByName('Hand' + side).add(prop);
  return prop;
});
for (let i = 0; i <= 36; i++) {
  at('Lying_Rear_Delt_Raise', i / 10, () =>
    assert.ok(dumbbellProps.every((prop) => new Box3().setFromObject(prop, true).min.y > .006),
      'rear delt raise clears the floor with both dumbbells'));
}
dumbbellProps.forEach((prop) => prop.removeFromParent());
const calfPlatform = createStepPlatform();
calfPlatform.position.fromArray(entry('Dumbbell_Seated_One-Leg_Calf_Raise').platformTransform.position);
const calfBounds = new Box3().setFromObject(calfPlatform);
let calfStart;
for (const time of [0, .64, 1.4, 2.46, 3.6]) {
  at('Dumbbell_Seated_One-Leg_Calf_Raise', time, () => {
    const foot = asset.scene.getObjectByName('FootR');
    const pivot = foot.localToWorld(new Vector3(0, -.073, .186));
    assert.ok(pivot.distanceTo(new Vector3(-.165, calfBounds.max.y, .49)) < .003 && pivot.z > calfBounds.min.z
      && pivot.z < calfBounds.max.z, 'calf raise forefoot stays on the platform');
    if (time === 0) calfStart = point('FootR').y;
    if (time === 1.4) assert.ok(point('FootR').y - calfStart > .08, 'the heel rises around the planted forefoot');
  });
}
const exchange = entry('Double_Kettlebell_Alternating_Hang_Clean');
const rackDifference = (t) => propPose(exchange.propClip, t)[0].y - propPose(exchange.secondPropClip, t)[0].y;
assert.ok(rackDifference(0) > .35 && rackDifference(1.32) < -.35 && rackDifference(2.72) > .35,
  'double hang clean exchanges the racked bell in both directions');
for (const id of ['Bench_Jump', 'Front_Box_Jump']) {
  assert.ok(entry(id).oneShot, id);
  at(id, 1.69, () => {
    const foot = point('FootL');
    assert.ok(id === 'Front_Box_Jump' ? foot.y > .35 && foot.z > .7 : foot.y < .09 && foot.z > 1, id + ' landing');
  });
}
at('Double_Kettlebell_Jerk', 1.15, () =>
  assert.ok(point('FootL').z - point('FootR').z > .70, 'double kettlebell split catch'));
at('Two-Arm_Kettlebell_Jerk', 1.15, () =>
  assert.ok(Math.abs(point('FootL').z - point('FootR').z) < .02, 'two-arm jerk parallel landing'));
const floorPress = clips.get('local:exercise:Alternating_Floor_Press');
const { points: bellProfile } = createKettlebell().getObjectByName('Bell').geometry.parameters;
const bellRadius = Math.max(...bellProfile.map((point) => point.x));
const worldVertex = new Vector3();
const bellVertex = new Vector3();
for (let frame = 0; frame <= 120; frame++) {
  const t = frame * floorPress.clip.duration / 120;
  const stop = sample(floorPress, t);
  for (const clip of [floorPress.propClip, floorPress.secondPropClip]) {
    const [center, inverse] = propPose(clip, t);
    inverse.invert();
    for (const mesh of skin) {
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, worldVertex).applyMatrix4(mesh.matrixWorld);
        bellVertex.copy(worldVertex).sub(center).applyQuaternion(inverse);
        const { x, y, z } = bellVertex;
        if (y <= bellProfile[0].y || y >= bellProfile.at(-1).y || x * x + z * z >= (bellRadius + .005) ** 2) continue;
        const upper = bellProfile.findIndex((point) => point.y >= y);
        const [low, high] = [bellProfile[upper - 1], bellProfile[upper]];
        const radius = low.x + (high.x - low.x) * (y - low.y) / (high.y - low.y);
        assert.ok(Math.hypot(x, z) > radius + .005, `Alternating Floor Press bell clearance at ${t} s`);
      }
    }
  }
  stop();
}

console.log('100 distinct catalog clips validated, including loops, handle alignment, and catch and landing poses.');
