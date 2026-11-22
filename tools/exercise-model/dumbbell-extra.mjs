import * as THREE from 'three';
import { handAlong, handDorsal } from './hand-frame.mjs';

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const xAxis = v(1, 0, 0);
const up = v(0, 1, 0);
const forward = v(0, 0, 1);
const rotation = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const { lerp, smoothstep } = THREE.MathUtils;
const pulse = (time) => smoothstep(time, .2, 1.25) * (1 - smoothstep(time, 1.65, 2.8));
const sides = [['L', 1], ['R', -1]];

export const groupLabel = 'Additional dumbbell';

function orient(from, to, normal, target) {
  const axis = to.clone().normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), axis);
  const actual = normal.clone().applyQuaternion(turn);
  const twist = Math.atan2(axis.dot(actual.clone().cross(target)), actual.dot(target));
  return turn.premultiply(rotation(axis, twist));
}

const inward = (sign) => v(-sign, 0, 0);
const hanging = (sign) => [v(sign * .29, -1, .05), v(sign * .19, -1, .16), inward(sign)];

function raise(sign, height, azimuth, flex = .14, turn = 0) {
  const radial = v(sign * Math.sin(azimuth), 0, Math.cos(azimuth));
  const axis = up.clone().negate().cross(radial);
  const outer = v(sign * Math.cos(azimuth), 0, -Math.sin(azimuth));
  const start = v(0, -1, 0);
  const upper = start.clone().applyAxisAngle(axis, height);
  const lower = start.clone().applyAxisAngle(axis, height - flex);
  const palm = outer.negate().applyAxisAngle(lower, sign * turn);
  return [upper, lower, palm];
}

function waistHand(sign, upperLength, lowerLength) {
  const wrist = v(sign * .035, -.33, .105);
  const distance = wrist.length();
  const axis = wrist.clone().normalize();
  const pole = v(sign, 0, -.30);
  pole.addScaledVector(axis, -pole.dot(axis)).normalize();
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const upper = axis.multiplyScalar(along).addScaledVector(pole, Math.sqrt(upperLength ** 2 - along ** 2));
  return [upper, wrist.sub(upper), inward(sign)];
}

export function createEntries({ scene, onlyExercises }, { createDumbbellGripTracks }) {
  const grip = createDumbbellGripTracks(scene);
  const bone = (name) => scene.getObjectByName(name);
  const joints = ['Lumbar', 'Chest', 'Head', ...sides.flatMap(([side]) =>
    ['Arm', 'Forearm', 'Hand'].map((part) => part + side))];
  const entries = {};
  const shoulders = ['Shoulders'];
  const triceps = ['Triceps'];

  function add(id, name, primary, supporting, pose, cues, {
    equipment = 'dumbbells', duration = 3, stance = [0, 0, 0],
    phases = [[0, 'Setup'], [.2, 'Move'], [1.25, 'Pause'], [1.65, 'Return'], [2.8, 'Reset']],
  } = {}) {
    if (onlyExercises && !onlyExercises.includes(id)) return;
    const [spread, thighAngle, shinAngle, hipAngle = 0] = stance;
    const hip = rotation(xAxis, hipAngle);
    const shin = rotation(xAxis, shinAngle);
    const pelvis = bone('Pelvis').position.clone();
    const staticRotation = (joint, q) => new THREE.QuaternionKeyframeTrack(joint + '.quaternion', [0], q.toArray());
    const stanceTracks = [staticRotation('Pelvis', hip)];
    for (const [side, sign] of sides) {
      const thigh = rotation(xAxis, thighAngle).premultiply(rotation(forward, sign * spread));
      stanceTracks.push(
        staticRotation('Thigh' + side, hip.clone().invert().multiply(thigh)),
        staticRotation('Shin' + side, thigh.clone().invert().multiply(shin)),
        staticRotation('Foot' + side, shin.clone().invert()),
      );
      if (sign === 1) {
        // Preserve the ankle height and depth as the stance changes.
        const offset = (name, q) => bone(name).position.clone().applyQuaternion(q).sub(bone(name).position);
        const shift = offset('ThighL', hip).add(offset('ShinL', thigh)).add(offset('FootL', shin));
        pelvis.y -= shift.y;
        pelvis.z -= shift.z;
      }
    }
    stanceTracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', [0], pelvis.toArray()));
    const times = Array.from({ length: duration * 50 + 1 }, (_, frame) => frame / 50);
    const values = Object.fromEntries(joints.map((joint) => [joint, []]));
    for (const time of times) {
      const { arms, lumbar = new THREE.Quaternion(), chest = new THREE.Quaternion(),
        head = new THREE.Quaternion() } = pose(time, pulse(time % 3));
      values.Lumbar.push(...lumbar.toArray());
      values.Chest.push(...chest.toArray());
      values.Head.push(...head.toArray());
      for (const [side, sign] of sides) {
        const [upper, lower, palm] = arms(sign);
        const wrist = bone('Hand' + side);
        const elbowRest = bone('Forearm' + side).position;
        const along = handAlong(sign);
        const palmRest = handDorsal().negate();
        const upperTurn = orient(elbowRest, upper, forward, lower);
        const lowerTurn = orient(wrist.position, lower, palmRest, palm);
        const handTurn = orient(along, lower, palmRest, palm);
        values['Arm' + side].push(...upperTurn.toArray());
        values['Forearm' + side].push(...upperTurn.invert().multiply(lowerTurn).toArray());
        values['Hand' + side].push(...lowerTurn.invert().multiply(handTurn).toArray());
      }
    }
    const tracks = joints.map((joint) => new THREE.QuaternionKeyframeTrack(joint + '.quaternion', times, values[joint]));
    tracks.push(...stanceTracks);
    tracks.push(...grip.filter((track) => equipment === 'dumbbells' || track.name.endsWith('L.quaternion')));
    entries['local:exercise:' + id] = { name, primary, supporting, equipment, phases, cues,
      clip: new THREE.AnimationClip(name, duration, tracks) };
  }

  add('Alternating_Deltoid_Raise', 'Alternating Deltoid Raise', shoulders, [], (time, a) => ({
    arms: (sign) => raise(sign, lerp(.38, 1.61, a), lerp(1.14, time < 3 ? .08 : 1.48, a), .09,
      time < 3 ? 1.32 * a : .16 * a),
  }), [[.2, 'Raise both weights forward', 'Stop near shoulder height and lower to your sides.'],
    [3.2, 'Raise both weights sideways', 'Keep your torso still as you lift.']], {
    duration: 6,
    phases: [[0, 'Setup'], [.2, 'Raise forward'], [1.25, 'Pause'], [1.65, 'Lower'],
      [3.2, 'Raise sideways'], [4.25, 'Pause'], [4.65, 'Lower'], [5.8, 'Reset']],
  });

  add('Dumbbell_Raise', 'Dumbbell Raise', shoulders, ['Biceps'], (_, a) => ({
    arms: (sign) => raise(sign, lerp(.44, 2.13, a), lerp(1.14, 1.39, a), lerp(.12, .78, a),
      lerp(2.55, .27, a)),
  }), [[0, 'Hold the weights by your thighs', 'Start with your palms facing back.'],
    [.2, 'Lead with your elbows', 'Keep your elbows higher than the weights as you lift toward chin height.']]);

  add('Dumbbell_Scaption', 'Dumbbell Scaption', shoulders, ['Upper back'], (_, a) => ({
    arms: (sign) => raise(sign, lerp(.35, 1.60, a), lerp(1.14, Math.PI / 6, a), .065),
  }), [[.2, 'Raise in a shallow V', 'Keep your thumbs up and lift about 30 degrees to either side of straight ahead.']]);

  add('Standing_Dumbbell_Straight-Arm_Front_Delt_Raise_Above_Head',
    'Standing Dumbbell Straight-Arm Front Delt Raise Above Head', shoulders, [], (_, a) => ({
      arms: (sign) => raise(sign, lerp(.44, 2.96, a), lerp(1.14, .24, smoothstep(a, 0, .78)), .12, lerp(2.55, 1.35, a)),
    }), [[.2, 'Trace a high arc', 'Keep a soft bend at the elbows and raise both weights overhead.']]);

  add('Side_Laterals_to_Front_Raise', 'Side Laterals to Front Raise', shoulders, ['Upper back'], (time) => {
    const t = time % 3;
    const lift = smoothstep(t, .15, .95) * (1 - smoothstep(t, 2.05, 2.85));
    const sweep = smoothstep(t, 1.05, 1.95);
    const direction = time < 3 ? 1 - sweep : sweep;
    const azimuth = lerp(.12, 1.48, direction);
    return { arms: (sign) => raise(sign, lerp(.38, 1.67, lift), lerp(1.14, azimuth, lift), .10,
      lerp(1.30, .12, direction) * lift) };
  }, [[.15, 'Raise out to the sides', 'Sweep forward at shoulder height, then lower.'],
    [3.15, 'Reverse the path', 'Raise forward, sweep out to the sides, then lower.']], {
    duration: 6,
    phases: [[0, 'Setup'], [.15, 'Raise sideways'], [1.05, 'Sweep forward'], [2.05, 'Lower'],
      [3.15, 'Raise forward'], [4.05, 'Sweep sideways'], [5.05, 'Lower'], [5.85, 'Reset']],
  });

  for (const [id, name, oneArm] of [
    ['Standing_Bent-Over_One-Arm_Dumbbell_Triceps_Extension',
      'Standing Bent-Over One-Arm Dumbbell Triceps Extension', true],
    ['Standing_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension',
      'Standing Bent-Over Two-Arm Dumbbell Triceps Extension', false],
  ]) {
    add(id, name, triceps, oneArm ? shoulders : [], (_, a) => ({
      lumbar: rotation(xAxis, .18), head: rotation(xAxis, -.28),
      arms: (sign) => {
        const world = oneArm && sign === -1
          ? [v(-.34, -1, -.36), v(.10, -1, -.30), inward(sign)]
          : [v(sign * .31, .08, -1), v(sign * .25, -Math.cos(a * 1.52), -Math.sin(a * 1.52)), inward(sign)];
        return world.map((direction) => direction.applyAxisAngle(xAxis, -1.23));
      },
    }), [[0, 'Hinge at the hips', 'Bend your knees slightly and hold the working upper arms close to your ribs.'],
      [.2, 'Straighten at the elbow', 'Keep the upper arms still as you send the weights behind you.']], {
      equipment: oneArm ? 'dumbbell-left' : 'dumbbells', stance: [.08, -.46, .16, 1.05],
    });
  }

  add('Dumbbell_One-Arm_Triceps_Extension', 'Dumbbell One-Arm Triceps Extension', triceps, [], (_, a) => ({
    arms: (sign) => {
      if (sign === -1) return hanging(sign);
      const upper = v(.23, 1, .02);
      const bend = rotation(v(-.96, .22, -.11).normalize(), lerp(.10, 2.20, a));
      return [upper, upper.clone().applyQuaternion(bend), forward.clone().applyQuaternion(bend)];
    },
  }), [[0, 'Start with the weight overhead', 'Keep the upper arm close to your head and your palm forward.'],
    [.2, 'Lower behind your head', 'Keep your upper arm still as you bend and straighten your elbow.']], {
    equipment: 'dumbbell-left',
    phases: [[0, 'Setup'], [.2, 'Lower'], [1.25, 'Pause'], [1.65, 'Extend'], [2.8, 'Reset']],
  });

  const freeWaist = waistHand(-1, bone('ForearmR').position.length(), bone('HandR').position.length());
  add('Dumbbell_Side_Bend', 'Dumbbell Side Bend', ['Core'], [], (time, a) => {
    const lean = (time < 3 ? 1 : -1) * a;
    return {
      lumbar: rotation(forward, .27 * lean), chest: rotation(forward, .13 * lean),
      arms: (sign) => sign === 1
        ? [v(.41, -1, .43), v(.24, -1, .25), inward(sign)]
          .map((direction) => direction.applyAxisAngle(forward, -.40 * lean))
        : freeWaist,
    };
  }, [[0, 'Hold one weight at your side', 'Rest your free hand at your waist and keep both feet planted.'],
    [.2, 'Bend to the right, then the left', 'Keep the movement in your waist and let the weight hang.']], {
    equipment: 'dumbbell-left', duration: 6, stance: [.14, 0, 0],
    phases: [[0, 'Setup'], [.2, 'Bend right'], [1.25, 'Pause'], [1.65, 'Stand tall'],
      [3.2, 'Bend left'], [4.25, 'Pause'], [4.65, 'Stand tall'], [5.8, 'Reset']],
  });

  add('Spell_Caster', 'Spell Caster', ['Core'], ['Glutes', 'Shoulders'], (time) => {
    const sweep = 2 * smoothstep(time, .2, 1.3) - 2 * smoothstep(time, 1.65, 2.8) - 1;
    return {
      lumbar: rotation(up, .39 * sweep), chest: rotation(up, .31 * sweep),
      arms: (sign) => [v(sign * .10, -1, .63), v(sign * .15, -1, .79), v(0, -.79, -1)]
        .map((direction) => direction.applyAxisAngle(up, .21 * sweep)),
    };
  }, [[0, 'Set a wide stance', 'Hold both weights overhand, off to one side, with your elbows soft.'],
    [.2, 'Turn from your torso', 'Guide both weights across to the other hip, then reverse the sweep.']], {
    stance: [.25, 0, 0], phases: [[0, 'Setup right'], [.2, 'Sweep left'], [1.3, 'Left hip'],
      [1.65, 'Sweep right'], [2.8, 'Right hip']],
  });

  return entries;
}
