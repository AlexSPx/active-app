import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSupportHands, forearmRoll, handAlong, handDorsal, openHand, palmHeight, supportFingerNames } from './hand-frame.mjs';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const turn = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const pitch = (angle) => turn(v(1, 0, 0), angle);
const yaw = (angle) => turn(v(0, 1, 0), angle);
const roll = (angle) => turn(v(0, 0, 1), angle);
const flat = Math.PI / 2;
const up = v(0, 1, 0);
const sides = [['L', 1], ['R', -1]];
const arms = ['Arm', 'Forearm', 'Hand'];
const legs = ['Thigh', 'Shin', 'Foot'];
const torsoNames = ['Pelvis', 'Lumbar', 'Chest', 'Head'];
const joints = [...torsoNames, ...supportFingerNames,
  ...sides.flatMap(([side]) => [...arms, ...legs].map((name) => name + side))];
const lerp = THREE.MathUtils.lerp;
const core = ['Core'];
const press = ['Shoulders', 'Triceps'];

function align(from, to, facing) {
  const axis = to.clone().normalize();
  const orientation = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), axis);
  const forward = v(0, 0, 1).applyQuaternion(orientation);
  const twist = Math.atan2(axis.dot(forward.clone().cross(facing)),
    forward.dot(facing) - axis.dot(forward) * axis.dot(facing));
  return orientation.premultiply(turn(axis, twist));
}

export function createEntries({ scene, onlyExercises }) {
  const figure = clone(scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const pelvis = bone('Pelvis');
  const { reset, pose: supportHand, includeTrack } = createSupportHands(bone);

  // Use skinned sole geometry to keep flat, prone, and side-lying feet on the floor.
  const footPoints = { L: [], R: [] };
  figure.updateMatrixWorld(true);
  figure.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    for (const [side] of sides) {
      const foot = bone('Foot' + side);
      const index = mesh.skeleton.bones.indexOf(foot);
      const inverse = foot.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
      for (let i = 0; i < position.count; i++) {
        if (skinIndex.getX(i) === index && skinWeight.getX(i) > .999) {
          footPoints[side].push(v().fromBufferAttribute(position, i).applyMatrix4(inverse));
        }
      }
    }
  });

  function ankle(side, x, z, rotation, clearance = 0) {
    const lowest = Math.min(...footPoints[side].map((vertex) => vertex.clone().applyQuaternion(rotation).y));
    return v(x, clearance - lowest, z);
  }

  function world(name, rotation) {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  }

  function torso(position, hip, waist = hip, chest = waist, head = chest) {
    pelvis.position.copy(position);
    [hip, waist, chest, head].forEach((rotation, i) => world(torsoNames[i], rotation));
  }

  function limb(chain, side, target, pole, facing, endRotation) {
    const [first, second, third] = chain.map((name) => name + side);
    const axis = target.clone().sub(point(first));
    const upper = bone(second).position.length();
    const lower = bone(third).position.length();
    const length = THREE.MathUtils.clamp(axis.length(), Math.abs(upper - lower) + .0001, upper + lower - .0001);
    axis.normalize();
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length);
    const proximal = axis.clone().multiplyScalar(along).addScaledVector(bend, Math.sqrt(upper ** 2 - along ** 2));
    const distal = axis.multiplyScalar(length).sub(proximal);
    world(first, align(bone(second).position, proximal, facing));
    const end = typeof endRotation === 'function' ? endRotation(distal.clone().normalize()) : endRotation;
    const rotation = align(bone(third).position, distal, facing);
    world(second, chain === arms ? forearmRoll(side, rotation, distal, end) : rotation);
    world(third, end);
  }

  function palm(side, s, wrist, pole, direction = v(-s * .10, 0, 1), pressure = 1) {
    limb(arms, side, wrist, pole, direction, supportHand(s, direction, up, pressure));
  }

  function planted(side, s, z = .47) {
    const foot = pitch(0);
    limb(legs, side, ankle(side, s * .145, z, foot), v(s * .08, 1, 0), up, foot);
  }

  function besideHead(side, s, clasp = false, reach = 0, knee) {
    const head = bone('Head');
    const frame = head.getWorldQuaternion(new THREE.Quaternion());
    const wrist = head.localToWorld(v(s * (clasp ? .112 : .128), clasp ? -.015 : .057 - .14 * reach,
      clasp ? -.037 : .067 + .025 * reach));
    const along = (clasp ? v(-s, .1, -.04) : v(-s * .40, .85, -.14)).applyQuaternion(frame);
    const pole = v(s, .59, 0);
    if (knee) pole.lerp(knee.sub(point('Arm' + side)).normalize(), .72 * reach);
    const dorsal = v(s, .35, -.34).applyQuaternion(frame);
    limb(arms, side, wrist, pole, up, (distal) => openHand(s, distal.lerp(along, .41), dorsal));
  }

  const entries = {};
  function add(key, name, primary, supporting, keys, pose, cues, framing = 'floor', metadata = {}) {
    if (onlyExercises && !onlyExercises.includes(key)) return;
    reset();
    const duration = keys.at(-1)[0];
    const frames = Math.round(duration * 60);
    const times = [...new Set([
      ...Array.from({ length: frames + 1 }, (_, i) => Math.fround(i * duration / frames)),
      ...keys.map(([time]) => Math.fround(time)),
    ])].sort((a, b) => a - b);
    const rotations = joints.map(() => []);
    const positions = [];
    let segment = 1;
    for (const time of times) {
      while (segment < keys.length - 1 && time > keys[segment][0]) segment++;
      const [[start, , from], [end, , to]] = keys.slice(segment - 1, segment + 1);
      const amount = THREE.MathUtils.smoothstep(time, start, end);
      pose(...from.map((value, i) => lerp(value, to[i], amount)));
      positions.push(...pelvis.position.toArray());
      joints.forEach((joint, i) => bone(joint).quaternion.toArray(rotations[i], rotations[i].length));
    }
    const tracks = joints.flatMap((joint, i) => includeTrack(joint, rotations[i])
      ? [new THREE.QuaternionKeyframeTrack(joint + '.quaternion', times, rotations[i])] : []);
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions));
    entries['local:exercise:' + key] = {
      name, primary, supporting, framing, ...metadata, cues,
      phases: keys.slice(0, -1).map(([time, label]) => [time, label]),
      clip: new THREE.AnimationClip(name, duration, tracks).optimize(),
    };
  }

  function sitUp(a, handStyle, top) {
    torso(v(0, .129 - .004 * a, 0), pitch(-flat + .61 * a),
      pitch(-flat + (top + .72) * a), pitch(lerp(-flat, top, a)),
      pitch(lerp(-flat - .31, top + .05, a)));
    for (const [side, s] of sides) {
      planted(side, s, handStyle === 'crossed' ? .395 : .47);
      if (handStyle === 'crossed') {
        const chest = bone('Chest');
        const frame = chest.getWorldQuaternion(new THREE.Quaternion());
        limb(arms, side, chest.localToWorld(v(-s * .125, .176 + s * .035, .132)),
          v(s * .65, .28, .73).applyQuaternion(frame), up,
          openHand(s, v(-s, .30, -.18).applyQuaternion(frame), v(0, 0, 1).applyQuaternion(frame)));
      } else {
        besideHead(side, s, handStyle === 'clasped');
      }
    }
  }

  add('3_4_Sit-Up', '3/4 Sit-Up', core, [],
    [[0, 'Start above the floor', [.25]], [1.25, 'Torso upright', [1]], [1.8, 'Lower three quarters', [1]],
      [3.15, '', [.25]]],
    (a) => sitUp(a, 'sides', 0),
    [[0, 'Plant your feet and set your hands lightly beside your head', 'Begin the first rep lying down.'],
      [1.25, 'Sit upright, then lower three quarters', 'Keep your shoulders off the floor between reps.']]);

  add('Sit-Up', 'Sit-Up', core, [],
    [[0, 'Start with back down', [0]], [1.35, 'Reach the V position', [1]], [2.35, 'Lower to the floor', [1]],
      [3.7, '', [0]]],
    (a) => sitUp(a, 'clasped', -.32),
    [[0, 'Bend your knees and secure your feet', 'Bring your hands behind your head.'],
      [1.35, 'Sit up until your torso and thighs form a V', 'Pause, then return your upper back to the floor.']]);

  add('Janda_Sit-Up', 'Janda Sit-Up', core, ['Glutes', 'Hamstrings'],
    [[0, 'Brace with arms crossed', [0]], [3.8, 'Finish the slow ascent', [1]],
      [4.3, 'Lower under control', [1]], [7.2, '', [0]]],
    (a) => sitUp(a, 'crossed', -.24),
    [[0, 'Cross your arms and press down through your heels', 'Keep your feet flat and tighten your hamstrings and glutes.'],
      [1.1, 'Curl up slowly', 'Keep your heels heavy through the ascent and controlled return.']]);

  add('Russian_Twist', 'Russian Twist', core, ['Upper back'],
    [[0, 'Center', [0]], [.85, 'Turn right', [-1]], [1.65, 'Return to center', [-1]],
      [2.45, 'Center', [0]], [3.3, 'Turn left', [1]], [4.1, 'Return to center', [1]], [4.9, '', [0]]],
    (a) => {
      const tilt = -.63;
      const chest = pitch(tilt).multiply(yaw(.86 * a));
      torso(v(0, .121, 0), pitch(-.65), pitch(-.69).multiply(yaw(.38 * a)), chest,
        pitch(tilt + .10).multiply(yaw(.69 * a)));
      for (const [side, s] of sides) {
        planted(side, s, .53);
        const target = bone('Chest').localToWorld(v(s * .038, .132, .482));
        const direction = v(-s * .30, 0, 1).applyQuaternion(chest);
        limb(arms, side, target, v(s, -.26, 0).applyQuaternion(chest), up,
          openHand(s, direction, v(s, .36, 0).applyQuaternion(chest)));
      }
    },
    [[0, 'Sit back with your knees bent and arms extended', 'Bring your hands together and keep both feet anchored.'],
      [.85, 'Rotate your rib cage and hands as one', 'Keep your hips facing forward as you turn through center to the other side.']]);

  add('Elbow_to_Knee', 'Elbow to Knee', core, [],
    [[0, 'Cross right ankle over left knee', [0]], [1.15, 'Curl left elbow toward right knee', [1]],
      [1.75, 'Lower shoulder blades', [1]], [3, '', [0]]],
    (a) => {
      torso(v(0, .129, 0), pitch(-flat), pitch(-flat + .79 * a),
        pitch(-flat + 1.38 * a).multiply(yaw(-.79 * a)),
        pitch(-flat - .31 + 1.93 * a).multiply(yaw(-.57 * a)));
      planted('L', 1, .275);
      const knee = point('ShinL');
      limb(legs, 'R', knee.add(v(.033, .073, -.036)), v(-1, .30, -.42),
        v(-.71, .71, 0), roll(1.13).multiply(pitch(-.37)));
      besideHead('L', 1, false, a, point('ShinR'));
      besideHead('R', -1);
    },
    [[0, 'Cross your right ankle over your left thigh', 'Keep your left foot flat and support your head lightly.'],
      [1.15, 'Rotate your left shoulder toward the crossed knee', 'Lower both shoulder blades. Switch sides after your reps.']]);

  add('Oblique_Crunches', 'Oblique Crunches', core, [],
    [[0, 'Set up for the right elbow', [0, -1]], [.95, 'Right elbow toward left knee', [1, -1]],
      [1.45, 'Lower right shoulder', [1, -1]], [2.3, 'Switch hands', [0, -1]], [2.95, 'Set up for the left elbow', [0, 1]],
      [3.9, 'Left elbow toward right knee', [1, 1]], [4.4, 'Lower left shoulder', [1, 1]],
      [5.25, 'Switch hands', [0, 1]], [5.9, '', [0, -1]]],
    (a, working) => {
      torso(v(0, .129, 0), pitch(-flat), pitch(-flat + .79 * a),
        pitch(-flat + 1.39 * a).multiply(yaw(-.79 * a * working)),
        pitch(-flat - .31 + 1.96 * a).multiply(yaw(-.60 * a * working)));
      for (const [side, s] of sides) {
        limb(legs, side, v(s * .13, .504, .397), v(s * .06, 1, -.50), up, pitch(0));
      }
      for (const [side, s] of sides) {
        const reach = (1 + s * working) / 2;
        const active = a * reach;
        const head = bone('Head');
        const frame = head.getWorldQuaternion(new THREE.Quaternion());
        const wrist = v(s * .49, palmHeight, -.415).lerp(head.localToWorld(v(s * .124, .05 - .14 * active, .058 + .025 * active)), reach);
        wrist.y += .16 * Math.sin(Math.PI * reach);
        const direction = v(s * .91, 0, -.41);
        supportHand(s, direction, up, 1 - reach);
        const curl = openHand(s, v(-s * .40, .85, -.14).applyQuaternion(frame), v(s, .32, -.12).applyQuaternion(frame));
        const bridge = openHand(s, v(0, -.7, -.7), v(s, .22, 0));
        const floor = openHand(s, direction.clone().addScaledVector(up, -.09), up);
        const hand = reach < .5 ? floor.slerp(bridge, THREE.MathUtils.smoothstep(reach, 0, .5)) :
          bridge.slerp(curl, THREE.MathUtils.smoothstep(reach, .5, 1));
        const knee = point(s === 1 ? 'ShinR' : 'ShinL').sub(point('Arm' + side)).normalize();
        const pole = v(s * .57, .31, .84).lerp(knee, .72 * active);
        limb(arms, side, wrist, pole, v(s * .24, .65, -.72), (distal) => {
          const along = handAlong(s).applyQuaternion(hand);
          const dorsal = handDorsal().applyQuaternion(hand);
          return openHand(s, along.lerp(distal, .64 * reach), dorsal);
        });
      }
    },
    [[0, 'Rest both feet on an elevated surface', 'Place one hand beside your head and the other flat on the floor.'],
      [.95, 'Curl toward the opposite knee', 'Keep your lower back down and switch hands after lowering your shoulder.']],
    'bench', { equipment: 'bench', benchTransform: { position: [0, 0, .451], yaw: flat } });

  const sideFrame = roll(flat + .08).multiply(pitch(flat));
  const sideFoot = roll(flat).multiply(pitch(1.18));
  add('Side_Jackknife', 'Side Jackknife', core, [],
    [[0, 'Lie on your right side', [0]], [1.12, 'Lift shoulder and top leg', [1]], [1.75, 'Lower together', [1]],
      [3.05, '', [0]]],
    (a) => {
      const upper = pitch(-.21 - .64 * a).multiply(sideFrame);
      torso(v(0, .212, 0), sideFrame, pitch(-.21 - .29 * a).multiply(sideFrame),
        upper, pitch(-.06 - .75 * a).multiply(sideFrame));
      limb(legs, 'R', ankle('R', .04, -.80, sideFoot), v(.85, .13, 0), v(1, 0, 0), sideFoot);
      const raise = lerp(-.14, .68, a);
      const foot = pitch(raise).multiply(sideFoot);
      const target = point('ThighL').add(v(.049, .810 * Math.sin(raise), -.810 * Math.cos(raise)));
      limb(legs, 'L', target, v(.98, .20, 0), v(1, 0, 0), foot);
      palm('R', -1, v(.393, palmHeight, .443), v(.06, .25, -1), v(1, 0, .13));
      const wrist = bone('Head').localToWorld(v(.112, .05, .048));
      limb(arms, 'L', wrist, v(-.72, .40 - 1.14 * a, -.70 * a), up,
        openHand(1, v(.68, -.19, .49), v(0, 1, 0)));
    },
    [[0, 'Stack your legs and support yourself with your lower arm', 'Keep your top hand lightly beside your head.'],
      [1.12, 'Lift your top leg and curl your shoulder toward it', 'Lower together and switch sides after your reps.']]);

  const toes = pitch(1.18);
  add('Single-Arm_Push-Up', 'Single-Arm Push-Up', ['Chest'], press,
    [[0, 'Right arm high plank', [0]], [1.2, 'Bottom', [1]], [1.48, 'Press up', [1]], [2.72, '', [0]]],
    (a) => {
      const height = .436 - .234 * a;
      const body = roll(.07 + .13 * a).multiply(pitch(flat - .276 + .254 * a));
      torso(v(-.115 - .027 * a, height, -.026), body, body, body, pitch(flat - .48 + .29 * a));
      for (const [side, s] of sides) {
        const foot = yaw(s * .15).multiply(toes);
        limb(legs, side, ankle(side, s * .255 - .09, -.795, foot), v(s * .14, -1, 0), v(0, -1, 0), foot);
      }
      palm('R', -1, v(-.314, palmHeight, .455), v(-.38, .05, -1), v(.13, 0, 1));
      const back = bone('Lumbar').localToWorld(v(0, .124, -.128));
      limb(arms, 'L', back, v(.91, .30, -.80), up, openHand(1, v(-1, .05, -.06), up));
    },
    [[0, 'Widen your feet and plant your right palm', 'Place your free hand behind your lower back.'],
      [1.2, 'Lower and press with one arm', 'Brace your hips and shoulders. Switch arms after your reps.']]);

  const clockSteps = Array.from({ length: 12 }, (_, step) => {
    const start = 1.5 * step;
    return [
      [start, 'Lower from plank', [0, step, 0, 0]],
      [start + .67, 'Drive off the floor', [1, step, 0, 0]],
      [start + .83, 'Shift the outside foot', [.45, step, 0, 1]],
      [start + .94, 'Take off', [0, step, 0, 1]],
      [start + 1.07, 'Turn left in the air', [0, step + .5, 1, .5]],
      [start + 1.22, 'Land at the next position', [0, step + 1, 0, 0]],
    ];
  }).flat();

  add('Clock_Push-Up', 'Clock Push-Up', ['Chest'], press, [...clockSteps, [18, '', [0, 12, 0, 0]]],
    (lower, step, flight, outsideStep) => {
      const rotation = yaw(step * Math.PI / 6);
      const position = (x, y, z) => v(x, y, z + .30).applyQuaternion(rotation);
      const hip = position(0, .417 - .206 * lower + .13 * flight, -.03);
      const body = rotation.clone().multiply(pitch(flat - .26 + .242 * lower));
      torso(hip, body, body, body, rotation.clone().multiply(pitch(flat - .39 + .19 * lower)));
      for (const [side, s] of sides) {
        const foot = rotation.clone().multiply(toes);
        const outside = s === -1 ? outsideStep : 0;
        const clearance = .13 * flight + .037 * Math.sin(Math.PI * outside) * (1 - flight);
        const target = ankle(side, 0, 0, foot, clearance);
        limb(legs, side, position(s * (.112 + .093 * outside), target.y, -.824),
          v(0, -1, 0), v(0, -1, 0), foot);
        palm(side, s, position(s * .217, palmHeight + .13 * flight, .475),
          v(s * .55, .12, -1).applyQuaternion(rotation), v(-s * .10, 0, 1).applyQuaternion(rotation), 1 - flight);
      }
    },
    [[0, 'Lower in a straight high plank', 'Set your palms shoulder-width apart and brace through your toes.'],
      [.94, 'Push off and turn about 30 degrees', 'Land softly with both hands and keep your body braced.']]);

  add('Handstand_Push-Ups', 'Handstand Push-Ups', ['Shoulders'], ['Triceps'],
    [[0, 'Arms extended', [0]], [1.45, 'Head just above the floor', [1]], [1.9, 'Press up', [1]],
      [3.35, '', [0]]],
    (a) => {
      const body = pitch(Math.PI - .065);
      torso(v(0, 1.045 - .211 * a, -.032), body, body, body, pitch(Math.PI + .08));
      for (const [side, s] of sides) {
        world('Thigh' + side, body);
        world('Shin' + side, body);
        world('Foot' + side, pitch(-flat + .15));
        palm(side, s, v(s * .221, palmHeight, .016), v(s * .83, -.07, .34), v(s * .12, 0, -1));
      }
    },
    [[0, 'Start inverted with your heels against a wall', 'Set both hands at shoulder width. Use a spotter if you are learning the movement.'],
      [1.45, 'Lower your head close to the floor', 'Reverse under control and press until your arms are nearly straight.']], 'standing');

  return entries;
}
