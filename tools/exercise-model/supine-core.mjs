import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSupportHands, forearmRoll, openHand, palmHeight, supportFingerNames } from './hand-frame.mjs';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const turn = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const pitch = (angle) => turn(v(1, 0, 0), angle);
const flat = Math.PI / 2;
const sides = [['L', 1], ['R', -1]];
const arms = ['Arm', 'Forearm', 'Hand'];
const legs = ['Thigh', 'Shin', 'Foot'];
const joints = ['Pelvis', 'Lumbar', 'Chest', 'Head', ...supportFingerNames,
  ...sides.flatMap(([side]) => [...arms, ...legs].map((name) => name + side))];

function align(from, to, facing) {
  const axis = to.clone().normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), axis);
  const forward = v(0, 0, 1).applyQuaternion(rotation);
  const twist = Math.atan2(axis.dot(forward.clone().cross(facing)),
    forward.dot(facing) - forward.dot(axis) * facing.dot(axis));
  return rotation.premultiply(turn(axis, twist));
}

export function createEntries({ scene, onlyExercises }) {
  const figure = clone(scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const pelvis = bone('Pelvis');
  const { reset, pose: supportHand, includeTrack } = createSupportHands(bone);

  function world(name, rotation) {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  }

  function torso({ curl = 0, lift = 0, twist = 0, lean = 0 } = {}) {
    const hip = pitch(-flat + .40 * lift);
    const waist = turn(v(0, 1, 0), -.20 * lean).multiply(pitch(-flat - .80 * lift + .13 * curl));
    const chest = turn(v(0, 1, 0), -.45 * lean).multiply(turn(v(0, 0, 1), -.59 * twist))
      .multiply(pitch(-flat + .43 * curl));
    // Keep the mid-back supported when the shoulders and hips curl together.
    const tuck = Math.min(curl, lift * 2);
    pelvis.position.set(0, .129 - tuck * (.047 - .011 * tuck), 0);
    // Pivot the pelvis around the back that stays on the floor during a hip raise.
    const lumbar = bone('Lumbar').position;
    const upper = bone('Chest').position;
    pelvis.position.add(lumbar.clone().add(upper).applyQuaternion(pitch(-flat)))
      .sub(lumbar.clone().applyQuaternion(hip)).sub(upper.clone().applyQuaternion(pitch(-flat - .80 * lift)));
    world('Pelvis', hip);
    world('Lumbar', waist);
    world('Chest', chest);
    const head = turn(v(0, 1, 0), -.45 * lean).multiply(turn(v(0, 0, 1), -.36 * twist))
      .multiply(pitch(-flat - .31 + .72 * curl));
    world('Head', head);
  }

  function limb(chain, side, target, pole, facing, endRotation) {
    const [first, second, third] = chain.map((name) => name + side);
    const axis = target.clone().sub(point(first));
    const upper = bone(second).position.length();
    const lower = bone(third).position.length();
    const length = THREE.MathUtils.clamp(axis.length(), Math.abs(upper - lower) + .0001, upper + lower - .0001);
    axis.normalize();
    const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length);
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const proximal = axis.clone().multiplyScalar(along).addScaledVector(bend, Math.sqrt(upper ** 2 - along ** 2));
    const distal = axis.multiplyScalar(length).sub(proximal);
    world(first, align(bone(second).position, proximal, facing));
    const end = typeof endRotation === 'function' ? endRotation(distal.clone().normalize()) : endRotation;
    const rotation = align(bone(third).position, distal, facing);
    world(second, chain === arms ? forearmRoll(side, rotation, distal, end) : rotation);
    world(third, end);
  }

  function arm(side, s, wrist, along, dorsal, pole, pressure = 0) {
    const hand = pressure ? supportHand(s, along, dorsal, pressure) : openHand(s, along, dorsal);
    limb(arms, side, wrist, pole, dorsal, hand);
  }

  function floorHand(side, s, wide = false) {
    const direction = wide ? v(s * .85, 0, .53) : v(s * .20, 0, 1);
    arm(side, s, v(s * (wide ? .50 : .30), palmHeight, wide ? -.18 : -.025), direction,
      v(0, 1, 0), v(s, .1, 0), 1);
  }

  function pitchedLeg(side, thigh, shin, foot) {
    world('Thigh' + side, pitch(-flat - thigh));
    world('Shin' + side, pitch(-flat - shin));
    world('Foot' + side, pitch(foot));
  }

  function longArm(side, s, angle, pressure = 0, inward = 0) {
    const direction = v(-s * inward, Math.sin(angle), Math.cos(angle)).normalize();
    const dorsal = v(0, -direction.z, direction.y).lerp(v(s, 0, 0), 1 - pressure);
    const wrist = point('Arm' + side).add(v(s * .022, 0, 0)).addScaledVector(direction, .515);
    arm(side, s, wrist, direction, dorsal, v(s, 0, 0), pressure);
  }

  const entries = {};
  function add(key, name, supporting, keys, pose, cues) {
    if (onlyExercises && !onlyExercises.includes(key)) return;
    reset();
    const duration = keys.at(-1)[0];
    const frameCount = Math.round(duration * 60);
    const times = Array.from({ length: frameCount + 1 }, (_, i) => duration * i / frameCount);
    const rotations = joints.map(() => []);
    const positions = [];
    let segment = 1;
    for (const time of times) {
      while (segment < keys.length - 1 && time > keys[segment][0]) segment++;
      const [[start, , from], [end, , to]] = keys.slice(segment - 1, segment + 1);
      const amount = THREE.MathUtils.smoothstep(time, start, end);
      pose(...from.map((value, i) => THREE.MathUtils.lerp(value, to[i], amount)));
      positions.push(...pelvis.position.toArray());
      joints.forEach((joint, i) => bone(joint).quaternion.toArray(rotations[i], rotations[i].length));
    }
    const tracks = joints.flatMap((joint, i) => includeTrack(joint, rotations[i])
      ? [new THREE.QuaternionKeyframeTrack(joint + '.quaternion', times, rotations[i])] : []);
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions));
    entries['local:exercise:' + key] = {
      name, primary: ['Core'], supporting, framing: 'floor', cues,
      phases: keys.slice(0, -1).map(([time, label]) => [time, label]),
      clip: new THREE.AnimationClip(name, duration, tracks).optimize(),
    };
  }

  add('Air_Bike', 'Air Bike', ['Quadriceps'],
    [[0, 'Pedal toward the left', [0]], [.8, 'Right elbow to left knee', [1]], [1, 'Switch sides', [1]],
      [1.8, 'Pedal toward the right', [0]], [2.6, 'Left elbow to right knee', [-1]], [2.8, 'Return to center', [-1]],
      [3.6, '', [0]]],
    (a) => {
      torso({ curl: .62 + .84 * Math.abs(a), twist: a });
      for (const [side, s] of sides) {
        const pedal = s * a;
        pitchedLeg(side, 1.40 + 1.04 * Math.min(0, pedal) + .70 * Math.max(0, pedal),
          -.05 - .31 * Math.min(0, pedal) - .28 * Math.max(0, pedal), -1.47 + .45 * Math.abs(pedal));
        const wrist = bone('Head').localToWorld(v(s * .124, .051, .071));
        const fingers = v(-s * .30, .43, -.85);
        const dorsal = v(s, 0, 0);
        const pole = v(s * (.64 - .68 * Math.max(0, -pedal)), .83, .57);
        limb(arms, side, wrist, pole, dorsal, (distal) => openHand(s, distal.lerp(fingers, .37), dorsal));
      }
    },
    [[0, 'Start with knees up and shoulders curled', 'Keep your hands light beside your head.'],
      [.8, 'Reach across as the other leg extends', 'Bring your right elbow toward the left knee, then reverse.']]);

  add('Alternate_Heel_Touchers', 'Alternate Heel Touchers', [],
    [[0, 'Reach right', [0]], [.8, 'Touch right heel', [-1]], [1.4, 'Return to center', [-1]],
      [2.1, 'Reach left', [0]], [2.9, 'Touch left heel', [1]], [3.5, 'Return to center', [1]], [4.2, '', [0]]],
    (a) => {
      torso({ curl: .85 * Math.abs(a), lean: a });
      for (const [side, s] of sides) {
        limb(legs, side, v(s * .229, .073, .365), v(s * .12, 1, 0), v(0, 1, 0), pitch(0));
        const reach = Math.max(0, s * a);
        arm(side, s, v(s * (.30 - .043 * reach), .049, .005 + .213 * reach),
          v(-s * .13 * reach, 0, 1), v(0, 1, 0), v(s, -.1, 0), 1);
      }
    },
    [[0, 'Plant your feet and reach along your sides', 'Keep both feet still.'],
      [.8, 'Reach to one heel', 'Curl and bend to the side, then switch through center.']]);

  add('Bent-Knee_Hip_Raise', 'Bent-Knee Hip Raise', [],
    [[0, 'Draw knees in', [0]], [1.2, 'Hold the hip curl', [1]], [2.2, 'Lower with control', [1]], [3.4, '', [0]]],
    (a) => {
      torso({ lift: a });
      for (const [side, s] of sides) {
        pitchedLeg(side, .60 + 1.53 * a, -.71 + 1.53 * a, -.32 - .93 * a);
        floorHand(side, s);
      }
    },
    [[0, 'Hover with both knees bent', 'Keep your arms on the floor and hold the bend in your knees.'],
      [1.2, 'Curl your pelvis off the floor', 'Bring your knees toward your chest without swinging.']]);

  add('Bottoms_Up', 'Bottoms Up', [],
    [[0, 'Tuck from straight legs', [0, 0, 0]], [.95, 'Extend legs overhead', [1, 0, 0]],
      [1.65, 'Hold the hip lift', [1, 1, 1]], [2.15, 'Lower your hips and tuck', [1, 1, 1]],
      [2.85, 'Extend along the floor', [1, 0, 0]], [3.85, '', [0, 0, 0]]],
    (tuck, extend, lift) => {
      torso({ lift });
      for (const [side, s] of sides) {
        pitchedLeg(side, -.032 + 1.922 * tuck - .32 * extend, -.075 + .16 * tuck + 1.49 * extend,
          -1.57 + .20 * tuck - 1.52 * extend);
        floorHand(side, s);
      }
    },
    [[0, 'Start long with palms down', 'Tuck your knees in before extending.'],
      [1.65, 'Reach both feet straight up', 'Roll your pelvis up briefly with your shoulders still supported.']]);

  add('Cocoons', 'Cocoons', [],
    [[0, 'Curl from a long reach', [0]], [1.2, 'Hold the tuck', [1]], [1.75, 'Unfold', [1]], [3, '', [0]]],
    (a) => {
      torso({ curl: 1.44 * a, lift: .72 * a });
      for (const [side, s] of sides) {
        pitchedLeg(side, -.032 + 2.032 * a, -.075 + .05 * a, -1.57 + .82 * a);
        longArm(side, s, Math.PI + .10 - 2.53 * a, 1 - a);
      }
    },
    [[0, 'Extend arms and legs', 'Begin with your arms reaching behind your head.'],
      [1.2, 'Tuck and curl together', 'Sweep your arms toward your knees as your hips and shoulders rise.']]);

  add('Scissor_Kick', 'Scissor Kick', ['Quadriceps'],
    [[0, 'Separate from a low hover', [0]], [.55, 'Left leg high', [1]], [1.65, 'Right leg high', [-1]],
      [2.2, 'Return to hover', [0]], [2.5, '', [0]]],
    (a) => {
      torso();
      for (const [side, s] of sides) {
        const lift = Math.abs(a);
        const elevation = .11 + .31 * lift + .36 * a * s;
        pitchedLeg(side, elevation + .035, elevation - .035, -flat + .08 - elevation);
        floorHand(side, s, true);
      }
    },
    [[0, 'Hover with hands still and palms down', 'Keep your lower back supported and both knees soft.'],
      [.55, 'Scissor vertically', 'Raise one leg as the other lowers without touching the floor.']]);

  add('Toe_Touchers', 'Toe Touchers', [],
    [[0, 'Reach from a low curl', [0]], [1.1, 'Reach toward toes', [1]], [1.65, 'Lower shoulders', [1]], [2.85, '', [0]]],
    (a) => {
      torso({ curl: 1.92 * a });
      for (const [side, s] of sides) {
        limb(legs, side, v(s * .073, .910, -.036), v(s * .10, 0, -.99), v(0, 0, -1), pitch(-Math.PI));
        const shoulder = point('Arm' + side);
        const toe = bone('Foot' + side).localToWorld(v(s * .073, -.066, .125));
        const reach = v(0, .707, .707).lerp(toe.sub(shoulder).normalize(), a).normalize();
        arm(side, s, shoulder.addScaledVector(reach, .515), reach, v(s, 0, 0), v(s, 0, 0));
      }
    },
    [[0, 'Stack feet over hips', 'Keep your legs together and reach both arms up at an angle.'],
      [1.1, 'Lift your shoulders and reach', 'Aim toward your toes while keeping your lower back down.']]);

  add('Tuck_Crunch', 'Tuck Crunch', [],
    [[0, 'Curl out of the tuck', [0]], [1.1, 'Hold the crunch', [1]], [1.65, 'Lower shoulders', [1]], [2.85, '', [0]]],
    (a) => {
      torso({ curl: 1.13 * a });
      for (const [side, s] of sides) {
        limb(legs, side, v(-s * .044, .55 + s * .052, .32), v(s * .25, .79, -.57),
          v(s * .15, .77, .63), pitch(-1.46 + .17 * s));
        const opposite = point('Arm' + (s === 1 ? 'R' : 'L'));
        arm(side, s, opposite.add(v(s * .14, .078 + .028 * s, .034)),
          v(-s, -.32, -.35), v(0, 1, 0), v(s * .68, 1, .72));
      }
    },
    [[0, 'Cross your ankles and fold your arms', 'Keep the tuck fixed as your shoulders move.'],
      [1.1, 'Curl your ribs toward your hips', 'Keep your lower back supported and lower slowly.']]);

  return entries;
}
