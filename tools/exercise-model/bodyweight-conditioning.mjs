import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import {
  createSupportHands, forearmRoll, handAlong, handDorsal, openHand, palmHeight, supportFingerNames,
} from './hand-frame.mjs';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const q = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const pitch = (angle) => q(v(1, 0, 0), angle);
const roll = (angle) => q(v(0, 0, 1), angle);
const flat = Math.PI / 2;
const lerp = THREE.MathUtils.lerp;

function align(from, to, reference, facing) {
  const axis = to.clone().normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), axis);
  const actual = reference.clone().applyQuaternion(turn);
  actual.addScaledVector(axis, -actual.dot(axis));
  return turn.premultiply(q(axis, Math.atan2(axis.dot(actual.clone().cross(facing)), actual.dot(facing))));
}

export function createEntries({ scene, onlyExercises }) {
  const figure = clone(scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const pelvis = bone('Pelvis');
  const sides = [['L', 1], ['R', -1]];
  figure.updateMatrixWorld(true);
  const footPoints = Object.fromEntries(sides.map(([side]) => [side, []]));
  figure.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    for (const [side] of sides) {
      const foot = bone('Foot' + side);
      const index = mesh.skeleton.bones.indexOf(foot);
      const inverse = foot.matrixWorld.clone().invert();
      for (let i = 0; i < position.count; i++) {
        if (skinIndex.getX(i) === index && skinWeight.getX(i) > .999) {
          footPoints[side].push(v().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
        }
      }
    }
  });

  const toes = Object.fromEntries(sides.map(([side]) => {
    const sole = footPoints[side];
    if (!sole.length) throw new Error('Missing rigid sole for Foot' + side);
    return [side, sole.reduce((best, vertex) => vertex.z > best.z ? vertex : best)];
  }));

  function groundedAnkle(side, origin, rotation, clearance = 0, reference) {
    const sole = footPoints[side];
    const low = sole.reduce((height, vertex) => Math.min(height, vertex.clone().applyQuaternion(rotation).y), Infinity);
    const toe = toes[side];
    const shift = reference
      ? toe.clone().applyQuaternion(reference).sub(toe.clone().applyQuaternion(rotation)) : v();
    return origin.add(v(shift.x, clearance - low, shift.z));
  }

  const names = ['Pelvis', 'Lumbar', 'Chest', 'Head', ...supportFingerNames, ...sides.flatMap(([side]) =>
    ['Arm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot'].map((name) => name + side))];

  const { reset: resetFingers, pose: supportHand, includeTrack } = createSupportHands(bone);

  function world(name, orientation) {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation));
  }

  function torso(position, hip, back = hip, chest = back, head = chest, twist = 0, bank = 0) {
    pelvis.position.copy(position);
    [hip, back, chest, head].forEach((angle, i) => world(names[i], roll(bank).multiply(pitch(angle)).multiply(q(v(0, 1, 0), twist))));
  }

  function limb(chain, side, target, pole, rotation, facing, fitPalm = false) {
    const [first, second, third] = chain.map((name) => name + side);
    const axis = target.clone().sub(point(first));
    const upper = bone(second).position.length();
    const lower = bone(third).position.length();
    const distance = THREE.MathUtils.clamp(axis.length(), Math.abs(upper - lower) + .0001, upper + lower - .0001);
    axis.normalize();
    const along = (upper ** 2 - lower ** 2 + distance ** 2) / (2 * distance);
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const proximal = axis.clone().multiplyScalar(along).addScaledVector(bend, Math.sqrt(upper ** 2 - along ** 2));
    const distal = axis.multiplyScalar(distance).sub(proximal);
    world(first, facing ? align(bone(second).position, proximal, v(0, 0, 1), facing) :
      align(bone(second).position, proximal, v(1, 0, 0), v(1, 0, 0)));
    const hand = typeof rotation === 'function' ? rotation(distal.clone().normalize()) : rotation;
    const forearm = facing ? align(bone(third).position, distal, v(0, 0, 1), facing) :
      align(bone(third).position, distal, v(1, 0, 0), v(1, 0, 0));
    world(second, fitPalm ? forearmRoll(side, forearm, distal, hand) : forearm);
    world(third, hand);
  }

  const arm = (side, target, pole, rotation, facing = v(0, 0, 1), fitPalm = false) =>
    limb(['Arm', 'Forearm', 'Hand'], side, target, pole, rotation, facing, fitPalm);
  const leg = (side, target, pole, rotation, facing = pole) =>
    limb(['Thigh', 'Shin', 'Foot'], side, target, pole, rotation, facing);
  const palm = (s, pressure = 1) => supportHand(s, v(-s * .10, 0, 1), v(0, 1, 0), pressure);

  const entries = {};
  function add(key, name, primary, supporting, framing, keys, pose, cues) {
    if (onlyExercises && !onlyExercises.includes(key)) return;
    resetFingers();
    const duration = keys.at(-1)[0];
    const frames = Math.round(duration * 60);
    const times = [...new Set([
      ...Array.from({ length: frames + 1 }, (_, i) => Math.fround(i * duration / frames)),
      ...keys.map(([time]) => Math.fround(time)),
    ])].sort((a, b) => a - b);
    const rotations = names.map(() => []);
    const positions = [];
    let segment = 1;
    for (const time of times) {
      while (segment < keys.length - 1 && time > keys[segment][0]) segment++;
      const [[start, , from], [end, , to]] = keys.slice(segment - 1, segment + 1);
      const u = THREE.MathUtils.smoothstep(time, start, end);
      pose(...from.map((value, i) => lerp(value, to[i], u)), time);
      positions.push(...pelvis.position.toArray());
      names.forEach((joint, i) => bone(joint).quaternion.toArray(rotations[i], rotations[i].length));
    }
    const tracks = names.flatMap((joint, i) => includeTrack(joint, rotations[i])
      ? [new THREE.QuaternionKeyframeTrack(joint + '.quaternion', times, rotations[i])] : []);
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions));
    entries['local:exercise:' + key] = {
      name, primary, supporting, framing, cues, phases: keys.map(([at, phase]) => [at, phase]),
      clip: new THREE.AnimationClip(name, duration, tracks).optimize(),
    };
  }

  function crawl(left, right, spider) {
    const height = spider ? .275 : .474;
    const slope = Math.asin((height - .19) / .824);
    torso(v(0, height, spider ? -.824 + .824 * Math.cos(slope) : -.061), spider ? flat - slope : 1.55);
    for (const [side, s] of sides) {
      const a = s === 1 ? left : right;
      arm(side, v(s * (spider ? .30 : .215), palmHeight, spider ? .40 : .49),
        spider ? v(s * .36, .1, -.8) : v(s * .12, 0, -1), palm(s), v(0, 0, 1), true);
      const pole = spider ? v(s, -.22, .35) : v(.14 * s, -.54, .83);
      const rotation = pitch(1.18 - .30 * a);
      const ankle = groundedAnkle(side,
        v(s * (.085 + (spider ? .38 : .045) * a), 0, -.824 + (spider ? .64 : .54) * a),
        rotation, (spider ? .11 : .20) * a);
      leg(side, ankle, pole, rotation, spider ? null : v(0, -1, .1));
    }
  }

  add('Mountain_Climbers', 'Mountain Climbers', ['Core'], ['Shoulders', 'Quadriceps'], 'floor',
    [[0, 'Left knee in', [1, 0]], [.15, 'Switch legs', [1, 0]], [.35, 'Right knee in', [0, 1]],
      [.50, 'Switch legs', [0, 1]], [.70, 'Left knee in', [1, 0]]],
    (left, right) => crawl(left, right, false),
    [[0, 'Drive one knee under your hips', 'Brace through both palms and keep your shoulders over your hands.'],
      [.15, 'Switch legs quickly', 'Extend the bent leg as the other knee moves forward.']]);

  add('Spider_Crawl', 'Spider Crawl', ['Core'], ['Chest', 'Shoulders', 'Triceps'], 'floor',
    [[0, 'Low plank', [0, 0]], [1, 'Left knee toward elbow', [1, 0]], [2, 'Return', [0, 0]],
      [3, 'Right knee toward elbow', [0, 1]], [4, 'Return', [0, 0]]],
    (left, right) => crawl(left, right, true),
    [[0, 'Hold a low plank', 'Bend your elbows and keep your chest above the floor.'],
      [1, 'Drive the knee outside', 'Bring your knee toward the same-side elbow, then return and switch sides.']]);

  add('Push_Up_to_Side_Plank', 'Push Up to Side Plank', ['Chest'], ['Core', 'Shoulders', 'Triceps'], 'floor',
    [[0, 'High plank', [0, 0]], [.8, 'Push-up bottom', [1, 0]], [1.5, 'Press up', [0, 0]],
      [2.4, 'Left side plank', [0, 1]], [3.2, 'High plank', [0, 0]],
      [4, 'Push-up bottom', [1, 0]], [4.7, 'Press up', [0, 0]],
      [5.6, 'Right side plank', [0, -1]], [6.4, 'High plank', [0, 0]]],
    (lower, twist) => {
      const open = Math.abs(twist);
      const angle = lerp(1.35, 1.515, lower) - .20 * open;
      torso(v(twist * .18, .19 + .824 * Math.cos(angle) - .035 * open + .028 * lower,
        -.824 + .81 * Math.sin(angle)), angle, angle, angle, angle, -twist * 1.50);
      const support = twist < 0 ? 'R' : 'L';
      const supportSign = twist < 0 ? -1 : 1;
      const footTurn = roll(-twist * 1.06).multiply(pitch(1.18));
      const supportAnkle = groundedAnkle(support, v(supportSign * .10, 0, -.824), footTurn, 0, pitch(1.18));
      const kneeFacing = v(0, 0, 1).applyQuaternion(pelvis.quaternion);
      for (const [side, s] of sides) {
        const lift = Math.max(0, -s * twist);
        const raised = point('Arm' + side).add(v(-s * .025, .51, 0));
        const planted = palm(s, 1 - lift);
        arm(side, v(s * .29, palmHeight, .45).lerp(raised, lift),
          v(s * .55, .15 - .75 * lift, -.9), (forearm) => {
            const release = THREE.MathUtils.smoothstep(lift, 0, .40);
            const fingers = handAlong(s).applyQuaternion(planted).lerp(forearm, release);
            const dorsal = handDorsal().applyQuaternion(planted).lerp(v(s, 0, 0), release);
            return openHand(s, fingers, dorsal);
          }, v(0, 0, 1), true);
        const ankle = side === support ? supportAnkle :
          groundedAnkle(side, v(s * .10, 0, -.824), footTurn, 0, pitch(1.18)).lerp(
            point('Thigh' + side).sub(point('Thigh' + support)).normalize().multiplyScalar(.075).add(supportAnkle), lift);
        leg(side, ankle, kneeFacing, footTurn);
      }
    },
    [[0, 'Set your hands just outside your shoulders', 'Lower your chest and hips together.'],
      [1.5, 'Press, then rotate', 'Shift onto one arm, stack your legs, and reach your free hand toward the ceiling.'],
      [3.2, 'Repeat on the other side', 'Return both palms to the floor before lowering again.']]);

  add('Jackknife_Sit-Up', 'Jackknife Sit-Up', ['Core'], ['Quadriceps'], 'floor',
    [[0, 'Extend', [0]], [1.1, 'Fold into a V', [1]], [1.6, 'Hold', [1]], [2.8, 'Extend', [0]]],
    (a) => {
      torso(v(0, .13, 0), -flat - .10 * a, -flat + .79 * a, -flat + 1.04 * a, -1.88 + 1.28 * a);
      for (const [side, s] of sides) {
        const angle = -.095 + .85 * a;
        leg(side, v(s * .093, .13 + .819 * Math.sin(angle), .819 * Math.cos(angle)),
          v(0, 1, -.15), pitch(-flat + .75 * a));
        const direction = v(0, lerp(-.16, .66, a) + .69 * Math.sin(Math.PI * a), lerp(-1, .75, a)).normalize();
        const fingers = v(0, direction.y + .16 * (1 - a), direction.z);
        // Rotate the palm off the floor with the reach, where world up would become parallel to the fingers.
        const dorsal = v(0, -fingers.z, fingers.y).lerp(v(s, 0, 0), a);
        arm(side, point('Arm' + side).addScaledVector(direction, .514), v(s, .32, 0),
          supportHand(s, fingers, dorsal.normalize(), 1 - a), v(s, 0, 0), true);
      }
    },
    [[0, 'Reach overhead with both legs extended', 'Start on your back with your arms beside your ears.'],
      [.55, 'Fold at the waist', 'Lift straight legs and reach both arms toward your feet.'],
      [1.6, 'Lower with control', 'Return your torso and legs together.']]);

  add('Frog_Sit-Ups', 'Frog Sit-Ups', ['Core'], [], 'floor',
    [[0, 'Diamond setup', [0]], [.95, 'Curl', [1]], [1.65, 'Hold', [1]], [2.65, 'Lower', [0]]],
    (a) => {
      torso(v(0, .125, 0), -flat, -flat + .14 * a, -flat + .41 * a, -1.88 + .69 * a);
      for (const [side, s] of sides) {
        const footTurn = roll(-s * 1.56).multiply(q(v(0, 1, 0), s * .17));
        leg(side, groundedAnkle(side, v(s * .068, 0, .44), footTurn), v(s, .025, 0), footTurn);
        const opposite = point('Arm' + (s === 1 ? 'R' : 'L'));
        arm(side, opposite.add(v(s * .099, .085 + .022 * s, -.007)), v(s * .58, 1, .75),
          openHand(s, v(-s, -.30, -.23), v(0, 1, 0)), v(0, 1, 0), true);
      }
    },
    [[0, 'Bring the soles together', 'Let your knees fall out and cross your hands toward opposite shoulders.'],
      [.45, 'Curl your ribs up', 'Keep your hips down and raise only the upper torso.']]);

  function jump(y, reach, extension, time, frog) {
    const launch = frog ? .65 : .72;
    const flight = THREE.MathUtils.clamp((time - launch) / .50, 0, 1);
    const x = frog ? 0 : -1.16 * flight;
    const z = frog ? .96 * flight : 0;
    const clearance = (frog ? .92 : 1.16) * flight * (1 - flight);
    const lean = frog ? 0 : extension * .17;
    torso(v(x - lean * .30, y + clearance, z), .075 + .48 * (1 - reach), .075 + .31 * (1 - reach),
      .075 + .21 * (1 - reach), .02, 0, lean);
    const footTurn = pitch(.30 * extension);
    for (const [side, s] of sides) {
      const target = groundedAnkle(side, v(x + s * (frog ? .19 : .14), 0, z), footTurn, clearance, pitch(0));
      leg(side, target, v(s * .27, 0, 1), footTurn);
      const shoulder = point('Arm' + side);
      if (frog) {
        arm(side, point('Head').add(v(s * .09, .085, -.083)), v(s, .1, .65),
          (forearm) => openHand(s, forearm.lerp(v(-s * .74, .46, .18).normalize(), .42), v(0, 0, -1)),
          v(0, 1, 0), true);
      } else {
        // Keep the wrist an arm's distance from the shoulder through the swing.
        const swing = lerp(-.54, 2.07, reach);
        const radius = lerp(.43, .35, reach);
        const sweep = v(s * .13 - .22 * reach, -radius * Math.cos(swing), radius * Math.sin(swing));
        const pole = v(0, sweep.z, -sweep.y).normalize();
        const outward = sweep.clone().cross(pole).normalize().multiplyScalar(-s);
        arm(side, shoulder.add(sweep), pole, (forearm) => openHand(s, forearm, outward), outward, true);
      }
    }
  }

  add('Frog_Hops', 'Frog Hops', ['Quadriceps'], ['Glutes', 'Hamstrings', 'Calves'], 'standing',
    [[0, 'Squat', [.50, 0, 0]], [.65, 'Drive', [.88, 1, 1]],
      [.9, 'Flight', [.74, .8, .22]], [1.15, 'Land', [.77, .74, 0]],
      [1.48, 'Absorb', [.50, 0, 0]]],
    (y, reach, extension, time) => jump(y, reach, extension, time, true),
    [[0, 'Squat with hands behind your head', 'Keep your chest up and your knees in line with your feet.'],
      [.65, 'Hop forward', 'Drive off both feet and keep the jump low.'],
      [1.15, 'Land softly', 'Absorb the landing with both legs.']]);

  add('Side_Standing_Long_Jump', 'Side Standing Long Jump', ['Quadriceps'], ['Glutes', 'Hamstrings', 'Calves'], 'standing',
    [[0, 'Athletic stance', [.72, .47, 0]], [.42, 'Load', [.55, 0, 0]],
      [.72, 'Drive right', [.875, 1, 1]], [.97, 'Flight', [.76, 1, .22]],
      [1.22, 'Land', [.77, .74, 0]], [1.57, 'Absorb', [.55, 0, 0]],
      [2, 'Stabilize', [.72, .47, 0]]],
    (y, reach, extension, time) => jump(y, reach, extension, time, false),
    [[0, 'Load both legs', 'Set your feet hip-width apart and bend your hips and knees.'],
      [.72, 'Jump to your right', 'Swing your arms into the jump and keep your chest facing forward.'],
      [1.22, 'Land on both feet', 'Bend your hips and knees to absorb the landing.']]);

  return entries;
}
