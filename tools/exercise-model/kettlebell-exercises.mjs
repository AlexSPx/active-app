import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSupportHands, openHand, palmHeight, supportFingerNames } from './hand-frame.mjs';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const q = () => new THREE.Quaternion();
const up = v(0, 1, 0);
const front = v(0, 0, 1);
const back = v(0, 0, -1);
const xAxis = v(1, 0, 0);
const pitch = (angle) => q().setFromAxisAngle(xAxis, angle);
const ease = (time, start, end) => THREE.MathUtils.smoothstep(time, start, end);
const mix = (a, b, amount) => a.clone().lerp(b, amount);
const project = (direction, axis) => direction.clone().addScaledVector(axis, -direction.dot(axis)).normalize();
const basis = (axis, along) => q().setFromRotationMatrix(new THREE.Matrix4()
  .makeBasis(axis, along, axis.clone().cross(along)));

export function createEntries({ scene, onlyExercises }, { createDumbbellGripTracks, dumbbellGripTransform }) {
  const figure = clone(scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const pelvis = bone('Pelvis');
  const pelvisRest = pelvis.position.clone();
  const sides = ['L', 'R'];
  const joints = ['Pelvis', 'Lumbar', 'Chest', 'Head', ...sides.flatMap((side) =>
    ['Arm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot'].map((part) => part + side))];
  const gripTracks = createDumbbellGripTracks(figure);
  const rightShoulder = bone('ArmR');
  const shoulderRest = rightShoulder.position.clone();
  const entries = {};
  const reverseX = v(-1, 0, 0);

  function world(name, rotation) {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(q()).invert().multiply(rotation));
  }

  function torso(position, tilt, head = tilt * .55) {
    pelvis.position.copy(position);
    for (const name of ['Pelvis', 'Lumbar', 'Chest']) world(name, pitch(tilt));
    world('Head', pitch(head));
  }

  function orient(rest, direction, facing, target) {
    const axis = direction.clone().normalize();
    const turn = q().setFromUnitVectors(rest.clone().normalize(), axis);
    const actual = project(facing.clone().applyQuaternion(turn), axis);
    const desired = project(target, axis);
    return turn.premultiply(q().setFromAxisAngle(axis,
      Math.atan2(axis.dot(actual.clone().cross(desired)), actual.dot(desired))));
  }

  function reach(first, second, third, end, pole, facing, endRotation, roll = facing, followWrist = false, alignElbow = false) {
    const offset = end.clone().sub(point(first));
    const a = bone(second).position.length();
    const b = bone(third).position.length();
    const distance = THREE.MathUtils.clamp(offset.length(), Math.abs(a - b) + .0001, a + b - .0001);
    const axis = offset.normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const upper = axis.clone().multiplyScalar(along)
      .addScaledVector(project(pole, axis), Math.sqrt(a * a - along * along));
    const lower = axis.multiplyScalar(distance).sub(upper);
    const upperAcross = followWrist && !alignElbow ? xAxis : front;
    const elbowFacing = alignElbow ? lower : followWrist ? xAxis : facing;
    world(first, orient(bone(second).position, upper, upperAcross, elbowFacing));
    const distal = bone(third).position;
    const rotation = typeof endRotation === 'function' ? endRotation(lower) : endRotation;
    const forearm = followWrist
      ? q().setFromUnitVectors(distal.clone().applyQuaternion(rotation).normalize(), lower.clone().normalize()).multiply(rotation)
      : orient(distal, lower, front, roll);
    world(second, forearm);
    world(third, rotation);
  }

  function leg(side, ankle, foot = 0, kneeUp = false, spread = .12) {
    const sign = side === 'L' ? 1 : -1;
    const pole = kneeUp ? v(sign * .12, 1, 0) : v(sign * spread, 0, 1);
    reach('Thigh' + side, 'Shin' + side, 'Foot' + side, ankle, pole, front, pitch(foot));
  }

  function stand(position = pelvisRest, tilt = 0, width = .16, spread = .12) {
    torso(position, tilt);
    for (const [i, side] of sides.entries()) leg(side, v((1 - i * 2) * width, .074, -.004), 0, false, spread);
  }

  function freeArm(side, wrist, pole = v(.6, -.3, -.6)) {
    reach('Arm' + side, 'Forearm' + side, 'Hand' + side, wrist, pole, front, pitch(.1));
  }

  function carriedCenter(center, axis, along, extension) {
    // Keep the authored bell path when the original wrist target reached the arm limit.
    const handAlong = v(-.025, -.137, .065).normalize();
    const across = project(xAxis, handAlong);
    const inward = across.clone().cross(handAlong);
    const seat = handAlong.clone().multiplyScalar(.10004)
      .addScaledVector(inward, -.03918).addScaledVector(across, -.05364);
    const shaft = across.applyAxisAngle(inward, .5);
    const rotation = basis(axis, project(along, axis))
      .multiply(basis(shaft, project(handAlong, shaft)).invert());
    const wristOffset = center.clone().sub(seat.applyQuaternion(rotation)).sub(point('ArmR'));
    const upper = bone('ForearmR').position.length();
    const lower = bone('HandR').position.length();
    const length = extension ?? THREE.MathUtils.clamp(wristOffset.length(),
      Math.abs(upper - lower) + .0001, upper + lower - .0001);
    return center.clone().addScaledVector(wristOffset, length / wristOffset.length() - 1);
  }

  function heldFrame(side, axis, along) {
    const sign = side === 'L' ? 1 : -1;
    const handAlong = v(sign * .025, -.137, .065).normalize();
    const { position: seat, quaternion } = dumbbellGripTransform(sign);
    const handleAxis = xAxis.clone().applyQuaternion(quaternion);
    const inward = project(xAxis, handAlong).cross(handAlong);
    const rotation = basis(axis, project(along, axis))
      .multiply(basis(handleAxis, project(handAlong, handleAxis)).invert());
    const offset = seat.applyQuaternion(rotation);
    return { rotation, offset, inward };
  }

  function held(side, at, axis, along, pole, fitReach = false, followWrist = false) {
    const { rotation, offset, inward } = heldFrame(side, axis, along);
    const wrist = at.clone().sub(offset);
    if (fitReach) {
      const shoulder = point('Arm' + side);
      const reachLimit = bone('Forearm' + side).position.length() + bone('Hand' + side).position.length() - .0002;
      const fromShoulder = wrist.clone().sub(shoulder);
      const axial = fromShoulder.dot(axis);
      const radial = fromShoulder.clone().addScaledVector(axis, -axial);
      // Roll and slide along the straight handle before adding shoulder reach.
      const slide = THREE.MathUtils.clamp(-axial, -.026, .026);
      const safeRadius = Math.sqrt(Math.max(0, reachLimit ** 2 - (axial + slide) ** 2));
      if (radial.length() > safeRadius) {
        const shoulderRadial = radial.addScaledVector(offset, 1).addScaledVector(axis, -offset.dot(axis));
        const seatRadial = offset.clone().addScaledVector(axis, -offset.dot(axis));
        const angle = Math.atan2(axis.dot(seatRadial.clone().cross(shoulderRadial)), seatRadial.dot(shoulderRadial));
        const limit = Math.acos(THREE.MathUtils.clamp((shoulderRadial.lengthSq() + seatRadial.lengthSq()
          - safeRadius ** 2) / (2 * shoulderRadial.length() * seatRadial.length()), -1, 1));
        const turn = angle - THREE.MathUtils.clamp(angle, -limit, limit);
        rotation.premultiply(q().setFromAxisAngle(axis, turn));
        wrist.copy(at).sub(offset.applyAxisAngle(axis, turn));
      }
      const radialDistance = wrist.clone().sub(shoulder).addScaledVector(axis, -axial).length();
      const axialLimit = Math.sqrt(Math.max(0, reachLimit ** 2 - radialDistance ** 2));
      wrist.addScaledVector(axis, Math.sign(slide) * Math.min(Math.abs(slide), Math.max(0, Math.abs(axial) - axialLimit)));
      const target = wrist.clone().sub(shoulder);
      const remaining = target.length() - reachLimit;
      if (remaining > 1e-8) {
        const socket = bone('Arm' + side);
        socket.position.copy(socket.parent.worldToLocal(shoulder.add(target.setLength(remaining))));
      }
    }
    const palm = inward.applyQuaternion(rotation).negate();
    reach('Arm' + side, 'Forearm' + side, 'Hand' + side, wrist, pole, front, rotation, palm, followWrist);
  }

  function prop(center, axis = xAxis, down = v(0, -1, 0)) {
    return [center, basis(axis, project(down, axis).negate())];
  }

  function add(id, name, primary, supporting, phases, cue, pose, hands = 'R', framing = 'standing') {
    if (onlyExercises && !onlyExercises.includes(id)) return;
    const duration = 3.2;
    const rate = 60;
    const times = Array.from({ length: Math.round(duration * rate) + 1 }, (_, frame) => frame / rate);
    const rotations = joints.map(() => []);
    const positions = [];
    const shoulders = [];
    const propPositions = [];
    const propRotations = [];
    for (const time of times) {
      rightShoulder.position.copy(shoulderRest);
      const [position, rotation] = pose(time);
      shoulders.push(...rightShoulder.position.toArray());
      positions.push(...pelvis.position.toArray());
      joints.forEach((name, i) => rotations[i].push(...bone(name).quaternion.toArray()));
      propPositions.push(...position.toArray());
      propRotations.push(...rotation.toArray());
    }
    const tracks = joints.map((name, i) =>
      new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, rotations[i]));
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions));
    if (shoulders.some((value, i) => value !== shoulderRest.getComponent(i % 3))) {
      tracks.push(new THREE.VectorKeyframeTrack('ArmR.position', times, shoulders));
    }
    tracks.push(...gripTracks.filter((track) => hands.includes(track.name.split('.')[0].at(-1))));
    entries['local:exercise:' + id] = {
      name, primary, supporting, phases, cues: [[phases[1][0], ...cue]], equipment: 'kettlebell', framing,
      clip: new THREE.AnimationClip(name, duration, tracks),
      propClip: new THREE.AnimationClip(name + ' kettlebell', duration, [
        new THREE.VectorKeyframeTrack('.position', times, propPositions),
        new THREE.QuaternionKeyframeTrack('.quaternion', times, propRotations),
      ]),
    };
  }

  const rep = (t) => ease(t, .2, 1.32) * (1 - ease(t, 1.65, 3));
  const phases = (lift, peak, lower) => [[0, 'Setup'], [.2, lift], [1.32, peak], [1.65, lower], [3, 'Reset']];
  const posterior = ['Glutes', 'Upper back'];
  const squatSupport = ['Calves', 'Glutes', 'Hamstrings', 'Shoulders'];

  add('One-Arm_Kettlebell_Row', 'One-Arm Kettlebell Row', ['Upper back'], ['Biceps'],
    phases('Row', 'At ribs', 'Lower'), ['Row toward your waist', 'Keep your torso still and draw your elbow back.'], (t) => {
      const a = rep(t);
      stand(v(0, .83, -.16), 1.08);
      freeArm('L', v(.32, .67, .33));
      const center = mix(v(-.255, .455, .336), v(-.260, .88, .165), a);
      const axis = back;
      const along = mix(v(0, -1, 0), v(-.16, -.85, 0), a);
      const grip = carriedCenter(center, axis, along);
      held('R', grip, axis, along, v(-.68, .10, -1), true);
      return prop(grip, axis);
    });

  add('Kettlebell_One-Legged_Deadlift', 'Kettlebell One-Legged Deadlift', ['Hamstrings'], posterior,
    phases('Hinge', 'Torso parallel', 'Stand'), ['Reach your free heel back', 'Keep a soft bend in your standing knee.'], (t) => {
      const a = rep(t);
      torso(v(-.14, .883 - .062 * a, -.014 - .145 * a), a * 1.47);
      leg('R', v(-.23, .074, -.004));
      const hip = point('ThighL');
      const angle = .22 + a * 1.19;
      leg('L', hip.add(v(.036, -.786 * Math.cos(angle), -.786 * Math.sin(angle))), -angle);
      const balance = mix(v(.22, .77, .07), v(.34, .85, .21), a);
      reach('ArmL', 'ForearmL', 'HandL', balance, v(.34, -.24, -.9), front,
        (distal) => openHand(1, distal, xAxis), front, true);
      const center = point('ArmR').add(v(-.139 - .032 * a, -.549 + .018 * a, .13));
      held('R', center, back, v(-.12, -1, 0), v(-.85, .12, .06), false, true);
      return prop(center, back);
    });

  add('One-Arm_Kettlebell_Swings', 'One-Arm Kettlebell Swings', ['Hamstrings'], ['Calves', ...posterior, 'Shoulders'],
    phases('Drive', 'Float', 'Hike back'), ['Snap your hips forward', 'Let the bell float and hinge as it returns.'], (t) => {
      const a = rep(t);
      stand(v(0, .78 + .077 * a, -.21 + .21 * a), .84 * (1 - a), .316, .87);
      reach('ArmL', 'ForearmL', 'HandL', mix(v(.42, .89, -.21), v(.37, 1.02, .32), a),
        v(.6, -.3, -.6), front, (distal) => openHand(1, distal, xAxis), front, true);
      const angle = -.36 + 1.85 * a;
      const along = v(.32 * (1 - a), -Math.cos(angle), Math.sin(angle)).normalize();
      const center = point('ArmR').addScaledVector(along, .61);
      const handleAxis = v(-Math.cos(.60 * (1 - a)), 0, Math.sin(.60 * (1 - a)));
      const grip = carriedCenter(center, handleAxis, along, .511);
      held('R', grip, handleAxis, along, v(-.55, -.65, -.4), true);
      const bellAngle = angle - .45 * (1 - a);
      return prop(grip, handleAxis, v(0, -Math.cos(bellAngle), Math.sin(bellAngle)));
    });

  add('One-Arm_Overhead_Kettlebell_Squats', 'One-Arm Overhead Kettlebell Squats', ['Quadriceps'], squatSupport,
    phases('Squat', 'Bottom', 'Stand'), ['Keep the bell overhead', 'Sit between your hips and keep your working elbow extended.'], (t) => {
      const a = rep(t);
      stand(v(0, .851 - .355 * a, -.04 - .14 * a), .12 + .41 * a, .245);
      freeArm('L', point('ArmL').add(v(.295, -.28, .28)));
      const center = point('ArmR').add(v(-.082, .602, .066));
      const along = v(-.12, 1, 0);
      const grip = carriedCenter(center, reverseX, along);
      held('R', grip, reverseX, along, v(-.6, .1, -.5), true);
      return prop(grip, xAxis, v(0, -.23, -1));
    });

  add('One-Arm_Kettlebell_Para_Press', 'One-Arm Kettlebell Para Press', ['Shoulders'], ['Triceps'],
    phases('Press', 'Lockout', 'Lower'), ['Press up and out', 'Keep the palm facing forward and lower the bell under control.'], (t) => {
      const a = rep(t);
      stand();
      freeArm('L', v(.31, .775, .06));
      const center = point('ArmR').add(mix(v(-.195, .155, .229), v(-.077, .605, .073), a));
      const grip = carriedCenter(center, reverseX, v(0, 1, .12));
      held('R', grip, reverseX, v(0, 1, .04), v(-1, -.75, -.15), true);
      return prop(grip, xAxis, v(0, -.23, -1));
    });

  const floorPressId = 'One-Arm_Kettlebell_Floor_Press';
  const support = createSupportHands(bone);
  support.pose(1, xAxis, up);
  add(floorPressId, 'One-Arm Kettlebell Floor Press', ['Chest'], ['Triceps'],
    phases('Press', 'Lockout', 'Lower'), ['Press straight up', 'Rotate the palm forward as the elbow extends.'], (t) => {
      const a = rep(t);
      torso(v(0, .143, 0), -Math.PI / 2, -Math.PI / 2);
      for (const [i, side] of sides.entries()) leg(side, v((1 - i * 2) * .19, .074, .55), 0, true);
      reach('ArmL', 'ForearmL', 'HandL', v(.653, palmHeight - .005, -.325), v(0, -.68, 1),
        up, (lower) => openHand(1, lower, up), up, true, true);

      const angle = THREE.MathUtils.lerp(1.95, .04, a);
      const upper = v(-Math.sin(angle) * .98, Math.cos(angle), Math.sin(angle) * .20);
      const wrist = point('ArmR').addScaledVector(upper, bone('ForearmR').position.length())
        .addScaledVector(up, bone('HandR').position.length());
      const turn = a * Math.PI / 2;
      const axis = v(-Math.sin(turn), 0, Math.cos(turn));
      const { rotation, offset, inward } = heldFrame('R', axis, up);
      const elbowFlexion = v(.98 * Math.cos(angle), Math.sin(angle), -.20 * Math.cos(angle));
      world('ArmR', orient(bone('ForearmR').position, upper, front, elbowFlexion));
      const forearm = q().setFromUnitVectors(bone('HandR').position.clone().applyQuaternion(rotation).normalize(), up);
      world('ForearmR', forearm.multiply(rotation));
      world('HandR', rotation);
      const bellDown = inward.applyQuaternion(rotation).addScaledVector(up, -.33);
      return prop(wrist.add(offset), axis, bellDown);
    }, 'R', 'floor');
  const floorPress = entries['local:exercise:' + floorPressId];
  if (floorPress) {
    floorPress.clip.tracks.push(...supportFingerNames.filter((name) => name.endsWith('L')).map((name) =>
      new THREE.QuaternionKeyframeTrack(name + '.quaternion', [0], bone(name).quaternion.toArray())));
  }
  support.reset();

  add('Bottoms-Up_Clean_From_The_Hang_Position', 'Bottoms-Up Clean From The Hang Position',
    ['Forearms'], ['Biceps', 'Shoulders'], phases('Drive and curl', 'Balance the bell', 'Lower'),
    ['Finish with the bell upside down', 'Keep your wrist firm and your elbow beneath the handle.'], (t) => {
      const a = rep(t);
      const hinge = ease(t, .05, .28) * (1 - ease(t, .28, .65));
      stand(v(0, .883 - .07 * hinge, -.12 * hinge), .52 * hinge);
      freeArm('L', v(.34, .78, .12));
      const angle = THREE.MathUtils.lerp(.43, Math.PI - .22, a);
      const along = v(0, -Math.cos(angle), Math.sin(angle));
      const upper = mix(v(-.78, -1, .60), v(-.46, -.67, .74), a).normalize();
      const wrist = point('ArmR').addScaledVector(upper, bone('ForearmR').position.length())
        .addScaledVector(along, bone('HandR').position.length());
      const { offset } = heldFrame('R', reverseX, along);
      const center = wrist.add(offset);
      held('R', center, reverseX, along, upper);
      return prop(center.clone().addScaledVector(along, -.00045), reverseX, along);
    });

  add('Goblet_Squat', 'Goblet Squat', ['Quadriceps'], squatSupport,
    phases('Descend', 'Bottom', 'Stand'), ['Keep the bell at your chest', 'Sit between your thighs with your whole foot planted.'], (t) => {
      const a = rep(t);
      stand(v(0, .86 - .43 * a, -.04 - .125 * a), .08 + .38 * a, .235);
      const center = point('Chest').add(v(0, .02, .445 + .055 * a));
      // Invert the bell so the horn grip points along the forearms.
      const tilt = pitch(3.02);
      for (const [index, side] of sides.entries()) {
        const sign = 1 - 2 * index;
        // Fit the shaft frame across each curved horn using the mirrored skinned pads.
        const seat = center.clone().add(v(sign * .12564, -.038975, -.00086).applyQuaternion(tilt));
        const axis = v(-.27497, -sign * .95805, sign * .0808).normalize().applyQuaternion(tilt);
        const along = v(-sign * .12457, -.04783, -.99106).applyQuaternion(tilt);
        held(side, seat, axis, along, v(sign * .20, -1, -.30));
      }
      return [center, tilt];
    }, 'LR');

  add('Kettlebell_Sumo_High_Pull', 'Kettlebell Sumo High Pull', ['Upper back'],
    ['Adductors', 'Glutes', 'Hamstrings', 'Quadriceps', 'Shoulders'], phases('Drive and pull', 'Elbows high', 'Lower'),
    ['Drive through your feet', 'Extend your knees and hips, then lead the pull with your elbows.'], (t) => {
      const drive = ease(t, .2, .95) * (1 - ease(t, 2.1, 3));
      stand(v(0, THREE.MathUtils.lerp(.54305, .854, drive), -.165 + .165 * drive),
        .88 * (1 - drive), .325, .55);
      const pull = ease(t, .65, 1.32) * (1 - ease(t, 1.65, 2.55));
      const hang = THREE.MathUtils.lerp(.04, .53, drive);
      const swing = THREE.MathUtils.lerp(hang, 2.18, pull);
      const along = v(0, -1, THREE.MathUtils.lerp(.04, .43, drive)).normalize();
      const upper = v(THREE.MathUtils.lerp(-.16, .15, pull), -Math.cos(swing), Math.sin(swing)).normalize();
      const { offset } = heldFrame('L', reverseX, along);
      const upperLength = bone('ForearmL').position.length();
      const lowerLength = bone('HandL').position.length();
      const elbow = point('ArmL').addScaledVector(upper, upperLength);
      // Keep both hands on the straight grip as the elbows rise.
      const lateral = .064 - offset.x - elbow.x;
      const wrist = elbow.addScaledVector(along, Math.sqrt(lowerLength ** 2 - lateral ** 2));
      const center = wrist.add(offset);
      center.x = 0;
      for (const [i, side] of sides.entries()) {
        const sign = 1 - 2 * i;
        held(side, center.clone().add(v(sign * .064, 0, 0)), reverseX,
          along, v(sign * upper.x, upper.y, upper.z), false, true);
      }
      return prop(center.clone().add(v(0, .0002, 0)));
    }, 'LR');

  return entries;
}
