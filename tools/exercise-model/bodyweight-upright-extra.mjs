import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSupportHands, forearmRoll, supportFingerNames } from './hand-frame.mjs';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const q = () => new THREE.Quaternion();
const rotation = (x = 0, y = 0, z = 0) => q().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
const sides = ['L', 'R'];
const front = v(0, 0, 1);
const up = v(0, 1, 0);

function bend(origin, target, upper, lower, pole) {
  const axis = target.clone().sub(origin);
  const distance = axis.length();
  if (distance >= upper + lower || distance <= Math.abs(upper - lower)) {
    throw new Error('Unreachable joint target ' + target.toArray().join(', '));
  }
  axis.divideScalar(distance);
  const along = (upper ** 2 - lower ** 2 + distance ** 2) / (2 * distance);
  const bendDirection = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
  return origin.clone().addScaledVector(axis, along)
    .addScaledVector(bendDirection, Math.sqrt(upper ** 2 - along ** 2));
}

export function createEntries({ scene, onlyExercises }) {
  const figure = clone(scene);
  figure.updateMatrixWorld(true);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const pelvis = bone('Pelvis');
  const { reset: resetFingers, pose: openHand, includeTrack } = createSupportHands(bone);
  const joints = ['Pelvis', 'Lumbar', 'Chest', 'Head', ...supportFingerNames, ...sides.flatMap((side) =>
    ['Thigh', 'Shin', 'Foot', 'Arm', 'Forearm', 'Hand'].map((name) => name + side))].map(bone);
  const soles = sides.map((side) => {
    const foot = bone('Foot' + side);
    const points = [];
    figure.traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return;
      const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
      const index = mesh.skeleton.bones.indexOf(foot);
      const toFoot = foot.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
      for (let i = 0; i < position.count; i++) {
        if (skinIndex.getX(i) === index && skinWeight.getX(i) > .999) {
          points.push(v().fromBufferAttribute(position, i).applyMatrix4(toFoot));
        }
      }
    });
    const toe = points.reduce((a, b) => a.z > b.z ? a : b);
    return { points, toe };
  });
  const eachSide = (pose) => sides.forEach((side, i) => pose(side, 1 - 2 * i, i));
  const world = (joint, orientation) => {
    joint.quaternion.copy(joint.parent.getWorldQuaternion(q()).invert().multiply(orientation));
  };
  const aim = (segment, target) => q().setFromUnitVectors(segment.clone().normalize(), target.clone().normalize());
  function limb(names, target, pole, orientation, matchWrist = false) {
    const [upper, lower, end] = names.map(bone);
    const origin = point(upper.name);
    const joint = bend(origin, target, lower.position.length(), end.position.length(), pole);
    const distal = target.clone().sub(joint);
    const lowerRotation = aim(end.position, distal);
    const attitude = typeof orientation === 'function' ? orientation(distal.clone().normalize()) : orientation;
    world(upper, aim(lower.position, joint.sub(origin)));
    world(lower, matchWrist ? forearmRoll(end.name.at(-1), lowerRotation, distal, attitude) : lowerRotation);
    world(end, attitude);
  }
  const arm = (side, target, pole, orientation) =>
    limb(['Arm', 'Forearm', 'Hand'].map((name) => name + side), target, pole, orientation, true);
  // Targets expressed relative to the chest follow the torso during a twist or side bend.
  const chestArm = (side, sign, target, pole, along, dorsal) => {
    const chest = bone('Chest');
    const turn = chest.getWorldQuaternion(q());
    arm(side, chest.localToWorld(target), pole.applyQuaternion(turn),
      turn.multiply(openHand(sign, along, dorsal)));
  };
  const relaxed = (side, sign, swing = 0) => {
    const wrist = point('Arm' + side).add(v(sign * .072, -.484 + .23 * Math.abs(swing), .04 + .30 * swing));
    arm(side, wrist, v(sign * .15, -.35, -1),
      openHand(sign, v(0, -1, .16 + swing), v(sign, 0, 0), 0));
  };
  const hipHand = (side, sign) => chestArm(side, sign, v(sign * .168, -.207, .039),
    v(sign, 0, -.5), v(-sign * .48, -.82, .21), v(sign, .02, 0));

  function stance({ x = 0, y = .870, z = 0, pitch = 0, lean = 0, twist = 0, tilt = 0,
    width = .143, feet = [[0, 0, 0], [0, 0, 0]], lift = 0 } = {}) {
    pelvis.position.set(x, y + lift, z);
    pelvis.quaternion.copy(rotation(pitch));
    bone('Lumbar').quaternion.copy(rotation(lean * .5, twist * .46, tilt * .45));
    bone('Chest').quaternion.copy(rotation(lean * .5, twist * .54, tilt * .55));
    bone('Head').quaternion.copy(rotation(-lean * .38, -twist * .10, -tilt * .12));
    eachSide((side, sign, i) => {
      const [forward, clearance, roll] = feet[i];
      const orientation = rotation(roll);
      const { points, toe } = soles[i];
      const low = points.reduce((height, p) => Math.min(height, p.y * Math.cos(roll) - p.z * Math.sin(roll)), Infinity);
      const ankle = v(sign * width, lift + clearance - low, forward + toe.z - toe.clone().applyQuaternion(orientation).z);
      limb(['Thigh', 'Shin', 'Foot'].map((name) => name + side), ankle, v(sign * .12, 0, 1), orientation);
    });
  }

  const entries = {};
  function add(key, name, primary, supporting, keys, pose, cues, options = {}) {
    if (onlyExercises && !onlyExercises.includes(key)) return;
    const duration = keys.at(-1)[0];
    const count = Math.ceil(duration * 60);
    const times = [...new Set([...Array.from({ length: count + 1 }, (_, i) => Math.fround(duration * i / count)),
      ...keys.map(([time]) => Math.fround(time))])].sort((a, b) => a - b);
    const positions = [];
    const rotations = joints.map(() => []);
    let segment = 1;
    for (const time of times) {
      while (time > keys[segment][0] && segment < keys.length - 1) segment++;
      const [from, , start] = keys[segment - 1];
      const [to, , finish] = keys[segment];
      const weight = THREE.MathUtils.smoothstep(time, from, to);
      resetFingers();
      try {
        pose(start.map((value, i) => THREE.MathUtils.lerp(value, finish[i], weight)), time);
      } catch (cause) {
        throw new Error(name + ' at ' + time.toFixed(3) + 's', { cause });
      }
      positions.push(...pelvis.position.toArray());
      joints.forEach((joint, i) => rotations[i].push(...joint.quaternion.toArray()));
    }
    const tracks = joints.flatMap((joint, i) => includeTrack(joint.name, rotations[i])
      ? [new THREE.QuaternionKeyframeTrack(joint.name + '.quaternion', times, rotations[i])] : []);
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions));
    entries['local:exercise:' + key] = {
      name, primary, supporting, framing: 'standing', ...options, cues,
      phases: keys.flatMap(([time, label]) => label ? [[time, label]] : []),
      clip: new THREE.AnimationClip(name, duration, tracks).optimize(),
    };
  }
  const hold = (label, seconds = 2) => [[0, 'Setup', [0]], [1.2, label, [1]],
    [1.2 + seconds, 'Release', [1]], [2.4 + seconds, null, [0]]];
  const alternate = (left, right, seconds) => [...hold(left, seconds).slice(0, 3),
    [2.4 + seconds, 'Switch sides', [0]], [3.6 + seconds, right, [-1]],
    [3.6 + 2 * seconds, 'Release', [-1]], [4.8 + 2 * seconds, null, [0]]];

  add('Elbow_Circles', 'Elbow Circles', ['Shoulders'], ['Upper back'],
    [[0, 'Hands on shoulders', []], [1, 'Elbows up', []],
      [2, 'Elbows back', []], [3, 'Elbows down', []], [4, null, []]],
    (_, time) => {
      stance();
      const angle = Math.PI * time / 2;
      eachSide((side, sign) => {
        const wrist = bone('Chest').localToWorld(v(sign * .145, .220, .099));
        const fingers = v(sign * .22, -.52, -.86).normalize();
        arm(side, wrist, v(sign * .70, .57 * Math.sin(angle), .92 * Math.cos(angle)),
          (distal) => openHand(sign, fingers.lerp(distal, .43), v(0, .55, 1)));
      });
    }, [[0, 'Keep hands at the shoulders', 'Draw a slow circle with both elbows.']]);

  add('Elbows_Back', 'Elbows Back', ['Chest'], ['Shoulders'], hold('Draw elbows back'),
    ([amount]) => {
      stance({ lean: -.10 * amount });
      eachSide((side, sign) => chestArm(side, sign, v(sign * .092, -.204, -.123),
        v(sign, -.18, .29 - 1.13 * amount), v(-sign * .22, -1, 0), v(0, 0, -1)));
    }, [[0, 'Hands on your lower back', 'Point your fingers down.'],
      [1.2, 'Pull the elbows back', 'Open your chest without forcing the elbows together.']]);

  add('Isometric_Chest_Squeezes', 'Isometric Chest Squeezes', ['Chest'], ['Shoulders', 'Triceps'],
    hold('Press palms together', 3),
    ([amount]) => {
      stance();
      eachSide((side, sign) => chestArm(side, sign, v(sign * .043, .035, .367 + .043 * amount),
        v(sign, -.65, -.10), front.clone(), v(sign, 0, 0)));
    }, [[0, 'Bring the palms together', 'Point your fingers ahead and soften the shoulders.'],
      [1.2, 'Squeeze and breathe', 'Build pressure gradually and breathe during the hold.'],
      [4.2, 'Release slowly', 'Ease the pressure between the hands.']]);

  add('Middle_Back_Stretch', 'Middle Back Stretch', ['Upper back'], ['Core'],
    alternate('Rotate left', 'Rotate right', 10),
    ([amount]) => {
      stance({ twist: .82 * amount });
      eachSide(hipHand);
    }, [[0, 'Set your feet and hips', 'Stand shoulder-width apart with your hands on your hips.'],
      [1.2, 'Rotate at the waist', 'Keep your hips facing forward. Hold for ten seconds on each side.']]);

  // The rig has no dedicated neck highlight material.
  add('Side_Neck_Stretch', 'Side Neck Stretch', [], [], alternate('Tilt left', 'Tilt right', 3),
    ([amount]) => {
      stance();
      bone('Head').quaternion.copy(rotation(0, 0, -.34 * amount));
      eachSide((side, sign) => {
        const assistance = Math.max(0, amount * sign);
        const head = bone('Head');
        const wrist = point('Arm' + side).add(v(sign * .072, -.484, .04))
          .lerp(head.localToWorld(v(sign * .128, .096, .021)), assistance);
        wrist.z += .13 * Math.sin(Math.PI * assistance);
        const fingers = v(-sign * .68 * assistance, -1 + 1.86 * assistance, .16).normalize();
        arm(side, wrist, v(sign, -.19, -.15),
          (distal) => openHand(sign, fingers.lerp(distal, .70 * Math.sin(Math.PI * assistance)), v(sign, 0, 0)));
      });
    }, [[0, 'Relax your shoulders', 'Keep your chest and gaze facing forward.'],
      [1.2, 'Guide the tilt gently', 'Let the hand rest just above the ear while the opposite shoulder stays down.']]);

  add('Standing_Lateral_Stretch', 'Standing Lateral Stretch', ['Core'], [],
    alternate('Bend left', 'Bend right', 3),
    ([amount]) => {
      stance({ y: .844, width: .204, tilt: -.44 * amount });
      eachSide((side, sign) => {
        const raise = Math.max(0, -amount * sign);
        chestArm(side, sign, v(sign * .168, -.207, .039).lerp(v(sign * .085, .423, -.092), raise),
          v(sign, .9 * raise, -.5), v(-sign * .48, -.82, .21).lerp(v(-sign * .83, -.62, .34), raise),
          v(sign, .04, -.95 * raise));
      });
    }, [[0, 'Set a wide stance', 'Soften the knees and keep your weight on both feet.'],
      [1.2, 'Bend toward the hand on your hip', 'Place the other hand behind your head and reach through that elbow.']]);

  add('Triceps_Stretch', 'Triceps Stretch', ['Triceps'], ['Upper back'],
    alternate('Stretch the left arm', 'Stretch the right arm', 10),
    ([amount]) => {
      stance();
      const sign = amount >= 0 ? 1 : -1;
      const [side, assistSide] = sign === 1 ? sides : [...sides].reverse();
      const reach = Math.abs(amount);
      const raisedWrist = point('Arm' + side).add(v(sign * .072, -.484, .04))
        .lerp(v(sign * .083, 1.492, -.167), reach);
      raisedWrist.x += sign * .23 * Math.sin(Math.PI * reach);
      raisedWrist.z += .12 * Math.sin(Math.PI * reach);
      arm(side, raisedWrist, v(sign * .15, -.35, -1).lerp(v(sign * .26, 1, .65), reach),
        openHand(sign, v(-sign * .14 * reach, -1, .16 - .59 * reach), v(sign * (1 - reach), 0, -reach), reach));
      const elbow = point('Forearm' + side);
      const assistWrist = point('Arm' + assistSide).add(v(-sign * .072, -.484, .04))
        .lerp(elbow.clone().add(v(-sign * .072, .021, .102)), reach);
      assistWrist.z += .17 * Math.sin(Math.PI * reach);
      const fingers = v(sign * .72 * reach, -1 + 1.22 * reach, .16 - .80 * reach).normalize();
      arm(assistSide, assistWrist, v(-sign * .15, -.35, -1).lerp(v(-sign, .18, .40), reach),
        (distal) => openHand(-sign, fingers.lerp(distal, .72 * Math.sin(Math.PI * reach)),
          v(-sign * (1 - reach), 0, reach), reach));
    }, [[0, 'Raise one arm and bend the elbow', 'Reach your hand behind your head.'],
      [1.2, 'Guide the raised elbow', 'Hold gently for ten seconds, then stretch the other side.']]);

  add('Upper_Back_Stretch', 'Upper Back Stretch', ['Upper back'], [], hold('Round and reach'),
    ([amount]) => {
      stance({ lean: .26 * amount });
      eachSide((side, sign) => chestArm(side, sign, v(sign * .067, -.036 + .143 * amount + sign * .009, .305 + .164 * amount + sign * .013),
        v(sign, -.70, -.10), v(-sign * .83, -.11, .56), v(0, 1, 0)));
    }, [[0, 'Join the hands', 'Bring your fingers together in front of you.'],
      [1.2, 'Reach forward', 'Round the upper back gently as you reach through your hands.']]);

  add('Sit_Squats', 'Sit Squats', ['Quadriceps'], ['Glutes', 'Hamstrings'],
    [[0, 'Stand', [0]], [.62, 'Reverse above parallel', [1]], [1.20, 'Stand', [0]]],
    ([amount]) => {
      stance({ y: .878 - .203 * amount, z: -.143 * amount, pitch: .28 * amount, lean: .23 * amount, width: .185 });
      eachSide((side, sign) => relaxed(side, sign, .93 * amount));
    }, [[0, 'Start shoulder-width apart', 'Keep the whole foot on the floor.'],
      [.62, 'Sit back and reverse', 'Stop above parallel and drive back up without a pause.']]);

  // Each foot lands, leaves briefly, and lands again before the opposite foot takes over.
  const skip = [
    [0, 'Set a split stance', [.840, -.10, -.05, -.25, 0, 0, 0, 0, 0, .20]],
    [.08, null, [.837, -.06, .025, .045, .065, .04, 0, 0, .14, -.15]],
    [.17, 'Step left', [.834, .01, .06, .16, 0, 0, 0, 0, .35, -.50]],
    [.29, 'Hop on left', [.879, .12, .09, .16, 0, .35, .32, .30, .45, -.94]],
    [.43, 'Land on left', [.851, .24, .08, .32, 0, .18, .52, .31, .36, -.80]],
    [.61, 'Step right', [.836, .43, -.06, .32, 0, .36, .55, 0, 0, .50]],
    [.73, 'Hop on right', [.879, .52, -.09, .65, .30, .45, .55, 0, .35, .94]],
    [.87, 'Land on right', [.851, .64, -.08, .85, .31, .36, .71, 0, .18, .80]],
    [1.07, 'Step through', [.836, .80, .06, .91, 0, 0, .71, 0, .25, -.42]],
    [1.18, null, [.855, .86, .025, .91, 0, 0, .82, .075, .14, -.16]],
    [1.32, 'Finish', [.870, .91, 0, .91, 0, 0, .91, 0, 0, 0]],
  ];
  add('Fast_Skipping', 'Fast Skipping', ['Quadriceps'], ['Adductors', 'Calves', 'Glutes', 'Hamstrings'], skip,
    ([y, z, x, lz, ly, lp, rz, ry, rp, swing], time) => {
      const lift = [[.29, .43], [.73, .87]].reduce((height, [from, to]) => height
        + Math.max(0, 4.9 * (time - from) * (to - time)), 0);
      stance({ x, y, z, pitch: .05, lift, width: .122, feet: [[lz, ly, lp], [rz, ry, rp]] });
      eachSide((side, sign) => {
        const drive = sign * swing;
        const wrist = point('Arm' + side).add(v(sign * .093, -.484 + .23 * Math.abs(drive), .04 + .30 * drive));
        arm(side, wrist, v(sign * .15, -.53, -.78), (distal) => openHand(sign, distal, v(sign, 0, 0), 0));
      });
    }, [[0, 'Start with one foot ahead', 'Stay tall and keep the steps light.'],
      [.29, 'Step, hop, then switch', 'Land on the takeoff foot and keep each hop low and quick.']], { oneShot: true });

  return entries;
}
