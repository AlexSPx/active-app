import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { forearmRoll, openHand, palmHeight, supportFingerNames, createSupportHands } from './hand-frame.mjs';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const pitch = (angle) => new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), angle);
const flat = Math.PI / 2;

function align(from, to, forward, up) {
  const axis = to.clone().normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), axis);
  const actual = forward.clone().applyQuaternion(turn);
  actual.addScaledVector(axis, -actual.dot(axis));
  const target = up.clone().addScaledVector(axis, -up.dot(axis));
  const twist = Math.atan2(axis.dot(actual.clone().cross(target)), actual.dot(target));
  return turn.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, twist));
}

export function createEntries({ scene, onlyExercises }) {
  const figure = clone(scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const sides = ['L', 'R'];
  const pelvis = bone('Pelvis');
  const jointNames = ['Pelvis', 'Lumbar', 'Chest', 'Head', ...supportFingerNames, ...sides.flatMap((side) =>
    ['Arm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot'].map((name) => name + side))];
  const { reset: resetFingers, pose: supportHand, includeTrack } = createSupportHands(bone);

  const world = (name, rotation) => {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  };
  const torso = (position, hip, waist = hip, chest = waist, head = chest) => {
    pelvis.position.copy(position);
    world('Pelvis', pitch(hip));
    world('Lumbar', pitch(waist));
    world('Chest', pitch(chest));
    world('Head', pitch(head));
  };

  function limb(names, end, pole, proximalFacing, distalFacing, endRotation, fitPalm = false) {
    const [first, second, third] = names;
    const origin = point(first);
    const axis = end.clone().sub(origin);
    const upper = bone(second).position.length();
    const lower = bone(third).position.length();
    const length = THREE.MathUtils.clamp(axis.length(), Math.abs(upper - lower) + .0001, upper + lower - .0001);
    axis.normalize();
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length);
    const firstSegment = axis.clone().multiplyScalar(along)
      .addScaledVector(bend, Math.sqrt(upper ** 2 - along ** 2));
    const secondSegment = axis.multiplyScalar(length).sub(firstSegment);
    world(first, align(bone(second).position, firstSegment, v(0, 0, 1), proximalFacing));
    const distal = align(bone(third).position, secondSegment, v(0, 0, 1), distalFacing);
    const handRotation = typeof endRotation === 'function' ? endRotation(secondSegment) : endRotation;
    world(second, fitPalm ? forearmRoll(third.at(-1), distal, secondSegment, handRotation) : distal);
    world(third, handRotation);
  }

  const hand = (sign, along, dorsal) => align(
    v(sign * .025, -.137, .065), along, v(sign, .15, .05), dorsal,
  );
  const arms = (side, end, pole, rotation, facing = v(0, 0, 1), fitPalm = false) =>
    limb(['Arm', 'Forearm', 'Hand'].map((name) => name + side), end, pole, facing, facing, rotation, fitPalm);
  const legs = (side, end, pole, rotation, facing = pole) =>
    limb(['Thigh', 'Shin', 'Foot'].map((name) => name + side), end, pole, facing, facing, rotation);

  const entries = {};
  function add(key, name, primary, supporting, keys, pose, phases, cues, framing) {
    if (onlyExercises && !onlyExercises.includes(key)) return;
    resetFingers();
    const duration = keys.at(-1)[0];
    const frameCount = Math.round(duration * 60);
    const times = Array.from({ length: frameCount + 1 }, (_, i) => i * duration / frameCount);
    const rotations = jointNames.map(() => []);
    const positions = [];
    let segment = 1;
    for (const time of times) {
      while (segment < keys.length - 1 && time > keys[segment][0]) segment++;
      const [[start, from], [end, to]] = keys.slice(segment - 1, segment + 1);
      const amount = THREE.MathUtils.smoothstep(time, start, end);
      pose(THREE.MathUtils.lerp(from, to, amount), time);
      positions.push(...pelvis.position.toArray());
      jointNames.forEach((joint, i) => bone(joint).quaternion.toArray(rotations[i], rotations[i].length));
    }
    const tracks = jointNames.flatMap((joint, i) => includeTrack(joint, rotations[i])
      ? [new THREE.QuaternionKeyframeTrack(joint + '.quaternion', times, rotations[i])] : []);
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions));
    entries['local:exercise:' + key] = {
      name, primary, supporting, phases, cues, framing,
      clip: new THREE.AnimationClip(name, duration, tracks).optimize(),
    };
  }

  const eachSide = (pose) => sides.forEach((side, i) => pose(side, 1 - 2 * i));
  const identity = new THREE.Quaternion();
  const up = v(0, 1, 0);
  const front = v(0, 0, 1);
  const flatHand = (s, direction = 1) => supportHand(s, v(0, 0, direction), up);
  const relaxed = (side, s) => {
    const shoulder = point('Arm' + side);
    arms(side, shoulder.add(v(s * .084, -.49, .02)), v(s * .2, 0, -.8),
      (forearm) => openHand(s, forearm, v(s, 0, 0)), front, true);
  };
  const standing = (tilt = 0) => {
    torso(v(0, .862, .021 + .037 * tilt), -.32 * tilt, -.12 * tilt, 0);
    eachSide((side, s) => legs(side, v(s * .15, .074, 0), front, identity));
  };
  const supine = () => torso(v(0, .129, 0), -flat, -flat, -flat, -flat - .31);
  const hold = (key, name, primary, framing, pose, setup, reach, seconds, switchSides = false, supporting = []) =>
    add(key, name, primary, supporting, [[0, 0], [.25, 0], [1.5, 1], [1.5 + seconds, 1], [2.75 + seconds, 0]], pose,
      [[0, 'Setup'], [.25, 'Move into stretch'], [1.5, 'Hold'], [1.5 + seconds, 'Release']],
      [[0, 'Set up', setup], [1.5, 'Hold the stretch', reach],
        ...(switchSides ? [[2.75 + seconds, 'Switch sides', 'Repeat the stretch on the other side.']] : [])], framing);
  const lateralArm = (side, direction, rotation, pole = v(0, -1, -.1), facing = front, fitPalm = false) => {
    const shoulder = point('Arm' + side);
    arms(side, shoulder.addScaledVector(direction, .515), pole, rotation, facing, fitPalm);
  };

  add('Arm_Circles', 'Arm Circles', ['Shoulders'], [], [[0, 0], [10, 5], [20, 0]], (_, time) => {
    standing();
    const theta = Math.PI * (time <= 10 ? time : 20 - time);
    eachSide((side, s) => {
      const direction = v(s, .29 * Math.sin(theta), .29 * Math.cos(theta)).normalize();
      lateralArm(side, direction, hand(s, direction, up));
    });
  }, [[0, 'Forward circles'], [10, 'Reverse circles']],
  [[0, 'Extend arms to the sides', 'Trace small circles from your shoulders with straight arms.'],
    [10, 'Reverse direction', 'Maintain the same range as you circle back.']], 'standing');

  add('Wrist_Circles', 'Wrist Circles', ['Forearms'], [], [[0, 0], [4, 1]], (_, time) => {
    standing();
    const theta = Math.PI * time;
    eachSide((side, s) => {
      const direction = v(s, .40 * Math.sin(theta), .40 * Math.cos(theta));
      const lateral = v(s, 0, 0);
      const facing = front.clone().applyQuaternion(openHand(s, lateral, up));
      lateralArm(side, lateral, openHand(s, direction, up), v(0, -1, -.1), facing);
    });
  }, [[0, 'Circle forward'], [2, 'Repeat']],
  [[0, 'Keep arms still', 'With palms down and arms out at shoulder height, draw circles from your wrists.']], 'standing');

  add('Dynamic_Back_Stretch', 'Dynamic Back Stretch', ['Upper back'], ['Shoulders'],
    [[0, 0], [8, 1]], (_, time) => {
      standing();
      const rep = Math.min(Math.floor(time / 1.6), 4);
      const swing = (1 - Math.cos(2 * Math.PI * time / 1.6)) / 2;
      const angle = swing * (1.28 + .46 * rep);
      eachSide((side, s) => {
        const direction = v(s * .105, -Math.cos(angle), Math.sin(angle)).normalize();
        const outward = v(s, 0, 0);
        lateralArm(side, direction, openHand(s, direction, outward), outward, outward, true);
      });
    }, [[0, 'Swing forward'], [3.2, 'Increase reach'], [6.4, 'Reach overhead']],
    [[0, 'Keep arms straight', 'Swing forward and up. Increase the reach on each repetition.']], 'standing');

  add('Dynamic_Chest_Stretch', 'Dynamic Chest Stretch', ['Chest'], ['Shoulders'], [[0, 0], [6, 1]], (_, time) => {
    standing();
    const count = 5 * (time / 6) ** 1.25;
    const sweep = (1 - Math.cos(2 * Math.PI * count)) / 2;
    const angle = THREE.MathUtils.lerp(-.287, 1.98, sweep);
    eachSide((side, s) => {
      const direction = v(s * Math.sin(angle), 0, Math.cos(angle));
      const fingers = v(s * Math.sin(1.98 * sweep), 0, Math.cos(1.98 * sweep));
      const dorsal = v(s * fingers.z, 0, -s * fingers.x);
      lateralArm(side, direction, supportHand(s, fingers, dorsal), v(0, -1, -.1), up, true);
    });
  }, [[0, 'Open and close'], [3, 'Increase speed']],
  [[0, 'Begin with hands together', 'Sweep straight arms out and back, then bring your palms together in front.']], 'standing');

  hold('Upward_Stretch', 'Upward Stretch', ['Shoulders'], 'standing', (a) => {
    standing();
    eachSide((side, s) => {
      const fingers = v(0, 1, -.16 * a);
      const dorsal = v(s, 0, 0);
      arms(side, v(s * .044, 1.64 + .197 * a, .23 - .32 * a), v(s, 0, .15),
        supportHand(s, fingers, dorsal), front, true);
    });
  }, 'Stand tall with your palms touching.', 'Lengthen your arms up and gently back without arching your back.', 10);

  hold('Standing_Pelvic_Tilt', 'Standing Pelvic Tilt', ['Upper back'], 'standing', (a) => {
    standing(a);
    eachSide(relaxed);
  }, 'Stand with feet apart and knees soft.', 'Tuck your tailbone forward while keeping your chest upright.', 2, false, ['Core']);

  hold('Shoulder_Stretch', 'Shoulder Stretch', ['Shoulders'], 'standing', (a) => {
    standing();
    relaxed('R', -1);
    const angle = 1.15 * a;
    const direction = v(-Math.sin(angle), -1 + a, Math.cos(angle) * a).normalize();
    const dorsal = v(0, -direction.z, direction.y);
    lateralArm('L', direction, (forearm) => openHand(1, forearm, dorsal), v(0, -1, -.1), dorsal, true);
  }, 'Stand tall with your shoulders relaxed.', 'Reach your straight left arm across the front of your chest.', 10, true);

  hold('Leg-Up_Hamstring_Stretch', 'Leg-Up Hamstring Stretch', ['Hamstrings'], 'floor', (a) => {
    supine();
    legs('R', v(-.145, .074, .42), up, identity);
    const angle = .06 + .35 * a;
    const knee = point('ThighL').add(v(0, .446 * Math.cos(angle), -.446 * Math.sin(angle)));
    const shin = .52 - .86 * a;
    const target = knee.add(v(0, .376 * Math.cos(shin), .376 * Math.sin(shin)));
    const pole = target.clone().sub(point('ThighL')).cross(v(-1, 0, 0));
    legs('L', target, pole, pitch(-1.93 - .86 * a));
    eachSide((side, s) => arms(side, v(s * .30, .040, .022), v(s, 0, 0), flatHand(s), up, true));
  }, 'Lie on your back. Keep one foot flat and raise the other leg.', 'Straighten the raised leg and draw it toward your nose.', 10, true);

  hold('The_Straddle', 'The Straddle', ['Adductors'], 'floor', (a) => {
    torso(v(0, .093, 0), .05 + .34 * a, .05 + .54 * a, .10 + .70 * a);
    eachSide((side, s) => {
      legs(side, v(s * .61, .06, .626), up, pitch(-flat));
      arms(side, v(s * (.235 - .075 * a), palmHeight, .275 + .185 * a),
        v(s * .6, 0, -.5), supportHand(s, v(0, 0, 1), up, a), up, true);
    });
  }, 'Sit tall with your legs straight in a V.',
  'Hinge forward between your legs and reach both hands to the floor.', 12, false, ['Hamstrings']);

  hold('Kneeling_Hip_Flexor', 'Kneeling Hip Flexor', ['Quadriceps'], 'floor', (a) => {
    const knee = v(-.11, .065, .028);
    const angle = .05 + .38 * a;
    const hip = knee.clone().add(v(0, .446 * Math.cos(angle), .446 * Math.sin(angle)));
    const tilt = -.14 * a;
    torso(hip.sub(bone('ThighR').position.clone().applyQuaternion(pitch(tilt))), tilt, -.08 * a, 0);
    legs('L', v(.15, .074, .57), front, identity);
    world('ThighR', align(bone('ShinR').position, knee.clone().sub(point('ThighR')), front, front));
    world('ShinR', align(bone('FootR').position, v(0, -.024, -.376), front, front));
    world('FootR', pitch(Math.PI));
    eachSide(relaxed);
  }, 'Plant your front foot and rest the opposite knee and top of the foot on the floor.',
  'Shift your hips forward while keeping your torso upright.', 15, true);

  function quadruped(shift, reverse) {
    torso(v(0, .525, -.17 - shift), flat, flat, flat, flat - .16);
    eachSide((side, s) => {
      arms(side, v(s * .19, palmHeight, .30), v(s * .12, 0, reverse ? 1 : -1), flatHand(s, reverse ? -1 : 1), front, true);
      legs(side, v(s * .108, .041, -.553), v(0, -1, .22), pitch(Math.PI), front);
    });
  }
  hold('Kneeling_Forearm_Stretch', 'Kneeling Forearm Stretch', ['Forearms'], 'floor', (a) => {
    quadruped(.125 * a, true);
  }, 'Kneel with palms down and your fingers pointing back toward your knees.',
  'Gently lean back with your palms flat.', 20);

  add('Hip_Circles_prone', 'Hip Circles (prone)', ['Glutes'], ['Core'], [[0, 0], [6, 1]], (_, time) => {
    quadruped(0, false);
    const theta = 2 * Math.PI * time / 3;
    const outward = .42 + .19 * Math.sin(theta);
    const rearward = .29 + .18 * Math.cos(theta);
    const direction = v(outward, -.62, -rearward).normalize();
    const shin = v(outward * .74, rearward, -.68).normalize();
    world('ThighL', align(bone('ShinL').position, direction, front, front));
    world('ShinL', align(bone('FootL').position, shin, front, v(0, -1, 0)));
    world('FootL', pitch(2.65));
  }, [[0, 'Circle raised knee'], [3, 'Repeat']],
  [[0, 'Keep one knee lifted', 'Circle the bent knee from the hip without twisting your torso.'],
    [6, 'Switch sides', 'Repeat with the other leg.']], 'floor');

  add('Lower_Back_Curl', 'Lower Back Curl', ['Upper back'], [], [[0, 0], [.2, 0], [1.35, 1], [1.7, 1], [2.85, 0]],
    (a) => {
      torso(v(0, .151, 0), flat, flat - .10 - .19 * a, flat - .54 * a, flat - .72 * a);
      eachSide((side, s) => {
        legs(side, v(s * .10, .045, -.822), v(0, -1, 0), pitch(3.11), v(0, -1, 0));
        const direction = v(s, -.20 + .11 * a, 0).normalize();
        lateralArm(side, direction, hand(s, direction, up));
      });
    }, [[0, 'Setup'], [.2, 'Lift chest'], [1.35, 'Brief pause'], [1.7, 'Lower']],
    [[0, 'Lie face down with arms out', 'Leave your legs on the floor.'],
      [1.35, 'Lift from your back', 'Raise your chest without pushing through your hands.']], 'floor');

  return entries;
}
