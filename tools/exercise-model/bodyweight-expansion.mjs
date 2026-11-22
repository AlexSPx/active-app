import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSupportHands, handAlong, openHand, palmHeight, supportFingerNames } from './hand-frame.mjs';

export const groupLabel = 'Bodyweight movement and stretching';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const turn = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const pitch = (angle) => turn(v(1, 0, 0), angle);
const yaw = (angle) => turn(v(0, 1, 0), angle);
const roll = (angle) => turn(v(0, 0, 1), angle);
const flat = Math.PI / 2;
const up = v(0, 1, 0);
const forward = v(0, 0, 1);
const sides = [['L', 1], ['R', -1]];
const arms = ['Arm', 'Forearm', 'Hand'];
const legs = ['Thigh', 'Shin', 'Foot'];
const torsoNames = ['Pelvis', 'Lumbar', 'Chest', 'Head'];
const joints = [...torsoNames, ...supportFingerNames,
  ...sides.flatMap(([side]) => [...arms, ...legs].map((name) => name + side))];
const { lerp, smoothstep, clamp } = THREE.MathUtils;
const swing = (from, to) => new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
const quads = ['Quadriceps'];
const back = ['Upper back'];
const core = ['Core'];
const press = ['Shoulders', 'Triceps'];

function align(from, direction, facing) {
  const axis = direction.clone().normalize();
  const rotation = swing(from, axis);
  const actual = forward.clone().applyQuaternion(rotation);
  return rotation.premultiply(turn(axis, Math.atan2(axis.dot(actual.clone().cross(facing)),
    actual.dot(facing) - axis.dot(actual) * axis.dot(facing))));
}

export function createEntries({ scene, onlyExercises }, { createDumbbellGripTracks, dumbbellGripTransform }) {
  const figure = clone(scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const pelvis = bone('Pelvis');
  const { reset, pose: supportHand, includeTrack } = createSupportHands(bone);
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

  function ankle(side, x, z, rotation, clearance = 0, heelPivot = false) {
    const low = Math.min(...footPoints[side].map((vertex) => vertex.clone().applyQuaternion(rotation).y));
    if (heelPivot) {
      const heel = footPoints[side].reduce((a, b) => a.z < b.z ? a : b);
      z += heel.z - heel.clone().applyQuaternion(rotation).z;
    }
    return v(x, clearance - low, z);
  }

  function world(name, rotation) {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  }

  function torso(position, hip, waist = hip, chest = waist, head = chest) {
    pelvis.position.copy(position);
    [hip, waist, chest, head].forEach((rotation, i) => world(torsoNames[i], rotation));
  }

  function limb(chain, side, target, pole, endRotation, facing) {
    const [first, second, third] = chain.map((name) => name + side);
    const axis = target.clone().sub(point(first));
    const upper = bone(second).position.length();
    const lower = bone(third).position.length();
    const length = clamp(axis.length(), Math.abs(upper - lower) + .0001, upper + lower - .0001);
    axis.normalize();
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length);
    const proximal = axis.clone().multiplyScalar(along).addScaledVector(bend, Math.sqrt(upper ** 2 - along ** 2));
    const distal = axis.clone().multiplyScalar(length).sub(proximal);
    const normal = axis.cross(bend);
    world(first, align(bone(second).position, proximal, facing ?? normal.clone().cross(proximal)));
    const end = typeof endRotation === 'function' ? endRotation(distal.clone().normalize()) : endRotation;
    const bind = bone(third).position;
    const orientation = chain === arms
      ? swing(bind.clone().applyQuaternion(end), distal).multiply(end)
      : align(bind, distal, facing ?? normal.cross(distal));
    world(second, orientation);
    world(third, end);
  }

  function leg(side, x, z, foot = pitch(0), clearance = 0, knee = forward, heelPivot = false) {
    limb(legs, side, ankle(side, x, z, foot, clearance, heelPivot), knee, foot);
  }

  function arm(side, s, wrist, pole, along, dorsal = up) {
    limb(arms, side, wrist, pole, along ? openHand(s, along, dorsal)
      : (distal) => openHand(s, distal, dorsal));
  }

  function palm(side, s, wrist, pole, direction = forward) {
    limb(arms, side, wrist, pole, supportHand(s, direction, up));
  }

  function holdFoot(side, s, pole, reverse = false) {
    const foot = bone('Foot' + side);
    const attitude = foot.getWorldQuaternion(new THREE.Quaternion());
    const grip = foot.localToWorld(v(s * .015, -.026, .079));
    const along = v(-s * .30, 0, 1).applyQuaternion(attitude);
    if (reverse) along.negate();
    const dorsal = v(0, 1, 0).applyQuaternion(attitude);
    arm(side, s, grip.addScaledVector(along, -.076).addScaledVector(dorsal, .042), pole, along, dorsal);
  }

  function relaxed(side, s, amount = 0, drive = 0) {
    const shoulder = point('Arm' + side);
    arm(side, s, shoulder.add(v(s * .085, -.474 + Math.abs(amount) * .045 + Math.max(0, amount) * drive,
      amount * .30)), v(s * .58, -.18, -1), null, v(s, 0, -.2));
  }

  const entries = {};
  function add(key, name, primary, supporting, keys, pose, cues, metadata = {}, extraTracks = [], movingJoints = []) {
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
    const jointPositions = movingJoints.map((joint) => ({ joint, rest: bone(joint).position.clone(), values: [] }));
    let segment = 1;
    for (const time of times) {
      while (segment < keys.length - 1 && time > keys[segment][0]) segment++;
      const [[start, , from], [end, , to]] = keys.slice(segment - 1, segment + 1);
      const amount = smoothstep(time, start, end);
      pose(...from.map((value, i) => lerp(value, to[i], amount)), time);
      positions.push(...pelvis.position.toArray());
      for (const { joint, values } of jointPositions) values.push(...bone(joint).position.toArray());
      joints.forEach((joint, i) => bone(joint).quaternion.toArray(rotations[i], rotations[i].length));
    }
    const tracks = joints.flatMap((joint, i) => includeTrack(joint, rotations[i])
      ? [new THREE.QuaternionKeyframeTrack(joint + '.quaternion', times, rotations[i])] : []);
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions), ...extraTracks);
    for (const { joint, rest, values } of jointPositions) {
      tracks.push(new THREE.VectorKeyframeTrack(joint + '.position', times, values));
      bone(joint).position.copy(rest);
    }
    entries['local:exercise:' + key] = {
      name, primary, supporting, framing: 'floor', cues, ...metadata,
      phases: keys.flatMap(([time, label]) => label ? [[time, label]] : []),
      clip: new THREE.AnimationClip(name, duration, tracks).optimize(),
    };
  }

  const stretch = (setup, peak, hold = 'Release') =>
    [[0, setup, [0]], [1.15, peak, [1]], [2.65, hold, [1]], [3.8, '', [0]]];

  function groundKnee(side, thigh) {
    world('Thigh' + side, pitch(thigh));
    world('Shin' + side, pitch(flat));
    world('Foot' + side, pitch(2.38));
  }

  add('All_Fours_Quad_Stretch', 'All Fours Quad Stretch', quads, [],
    stretch('Three-point support', 'Draw heel toward hip'),
    (a) => {
      torso(v(-.045, .527 - .028 * a, -.14 + .103 * a), pitch(1.54), pitch(1.56), pitch(1.52), pitch(1.07));
      groundKnee('R', .08 + .28 * a);
      palm('R', -1, v(-.187, palmHeight, .35), v(-.14, -.15, -1));
      world('ThighL', pitch(.26 + .40 * a));
      world('ShinL', pitch(3.80 + .22 * a));
      world('FootL', pitch(4.17 + .14 * a));
      holdFoot('L', 1, v(1, .30, -.70));
    },
    [[0, 'Set up on hands and knees', 'Lift your left knee and take the left ankle with your left hand.'],
      [1.15, 'Draw your heel in and extend your hip', 'Keep the knee flexed and press your hips toward the floor. Hold for 10–20 seconds, then switch sides.']]);

  add('Alternate_Leg_Diagonal_Bound', 'Alternate Leg Diagonal Bound', quads,
    ['Adductors', 'Calves', 'Glutes', 'Hamstrings'],
    [[0, 'Load right foot', [-.03, .79, 0, .126, 0, -.14, -.127, 0, .075, -.33]],
      [.25, 'Drive left knee', [-.063, .845, .045, .12, .43, .44, -.127, 0, .075, -.88]],
      [.66, 'Land left', [.45, .78, .62, .53, 0, .67, -.01, .36, .19, -.58]],
      [.88, 'Drive right knee', [.48, .847, .72, .53, 0, .67, .20, .48, .83, .93]],
      [1.29, 'Land right', [-.07, .78, 1.27, .46, .29, .82, -.12, 0, 1.32, .50]],
      [1.61, 'Settle', [-.10, .865, 1.36, .02, 0, 1.38, -.22, 0, 1.32, 0]],
      [1.84, '', [-.10, .865, 1.36, .02, 0, 1.38, -.22, 0, 1.32, 0]]],
    (x, y, z, lx, ly, lz, rx, ry, rz, drive, time) => {
      const flight = Math.max(0, 4.9 * (time - .25) * (.66 - time), 4.9 * (time - .88) * (1.29 - time));
      torso(v(x, y + flight, z), roll(-.10 * drive).multiply(pitch(.13)), pitch(.12), pitch(.10), pitch(.02));
      leg('L', lx, lz, pitch(0), ly + flight, v(.14, 0, 1));
      leg('R', rx, rz, pitch(0), ry + flight, v(-.14, 0, 1));
      for (const [side, s] of sides) relaxed(side, s, s * drive, .13);
    },
    [[0, 'Load the front foot', 'Bend slightly at the hip and knee before pushing off.'],
      [.25, 'Bound forward and to the side', 'Drive the opposite knee up, land on that foot, then bound back across the line.']],
    { framing: 'standing', oneShot: true });

  add('Ankle_Circles', 'Ankle Circles', ['Calves'], [],
    [[0, 'Stand with support', [0, 0]], [.50, 'Lift right foot', [1, 0]], [2.15, 'One right ankle circle', [1, 1]],
      [2.50, 'Switch feet', [0, 1]], [3, 'Lift left foot', [-1, 1]], [4.65, 'One left ankle circle', [-1, 2]],
      [5.15, '', [0, 2]]],
    (lift, cycles) => {
      torso(v(.40 + .073 * lift, .871, .16), pitch(0));
      arm('L', 1, v(.709, 1.25, .086), v(.33, -1, .43), v(0, 0, -1), v(-1, 0, 0));
      relaxed('R', -1);
      for (const [side, s] of sides) {
        const amount = Math.max(0, -s * lift);
        const angle = cycles * Math.PI * 2;
        const foot = pitch(.27 * amount * Math.cos(angle)).multiply(roll(.30 * amount * Math.sin(angle)));
        leg(side, .40 + s * .116, .16 + .113 * amount, foot, .055 * amount);
      }
    },
    [[0, 'Use a stable upright for balance', 'Keep your weight over your standing foot.'],
      [.50, 'Draw a circle with your big toe', 'Lift the foot slightly and circle from the ankle. Repeat with the other foot.']],
    { framing: 'standing', equipment: 'pull-up-bar' });

  add('Bench_Dips', 'Bench Dips', ['Triceps'], ['Chest', 'Shoulders'],
    stretch('Arms extended', 'Elbows bent', 'Press up'),
    (a) => {
      torso(v(0, .421 - .227 * a, .180 + .047 * a), pitch(.13 + .13 * a), pitch(.075), pitch(.055), pitch(0));
      for (const [side, s] of sides) {
        palm(side, s, v(s * .208, .430 + palmHeight, -.050), v(s * .10, -.28, -1), v(s * .08, 0, 1));
        leg(side, s * .132, .920, pitch(-.22), 0, v(s * .10, .9, .36));
      }
    },
    [[0, 'Set your palms on the bench edge', 'Face away from the bench, extend your legs, and keep your heels down.'],
      [1.15, 'Bend your elbows back', 'Keep your hips close to the bench, then press through both palms to extend your elbows.']],
    { framing: 'bench', equipment: 'bench', benchTransform: { position: [0, 0, -.095], yaw: flat } });

  add('Carioca_Quick_Step', 'Carioca Quick Step', ['Adductors'], ['Core', 'Calves', 'Glutes', 'Hamstrings', 'Quadriceps'],
    [[0, 'Athletic stance', [0, .812, .13, 0, .06, -.13, 0, -.06, .27]],
      [.24, 'Cross right foot behind', [.16, .789, .13, 0, .06, .29, 0, -.17, -.25]],
      [.46, 'Step left', [.38, .808, .55, 0, .05, .29, 0, -.17, .28]],
      [.70, 'Drive right knee up', [.54, .815, .55, 0, .05, .48, .54, .33, -.42]],
      [.93, 'Set right foot down', [.62, .803, .55, 0, .05, .73, 0, .02, -.14]],
      [1.14, 'Open with left foot', [.82, .817, .97, 0, .06, .73, 0, .02, .22]],
      [1.39, 'Cross behind again', [1, .795, .97, 0, .06, 1.09, 0, -.17, -.28]],
      [1.66, 'Step out and finish', [1.19, .831, 1.32, 0, .05, 1.07, 0, -.07, 0]],
      [1.85, '', [1.19, .831, 1.32, 0, .05, 1.07, 0, -.07, 0]]],
    (x, y, lx, ly, lz, rx, ry, rz, twist, time) => {
      const step = (start, end) => time > start && time < end ? Math.sin(Math.PI * (time - start) / (end - start)) : 0;
      const leftLift = .08 * (step(.24, .46) + step(.93, 1.14) + step(1.39, 1.66));
      const rightLift = .09 * (step(0, .24) + step(1.14, 1.39) + step(1.39, 1.66));
      torso(v(x, y, 0), yaw(twist * .85), yaw(twist * .32), yaw(-twist * .6), pitch(0));
      leg('L', lx, lz, pitch(0), Math.max(ly, leftLift), v(.28, 0, 1));
      leg('R', rx, rz, pitch(0), ry + rightLift, v(-.28, 0, 1));
      for (const [side, s] of sides) relaxed(side, s, s * (twist * 1.8 + .12), .17);
    },
    [[0, 'Keep your eyes and feet forward', 'Travel sideways from a relaxed stance.'],
      [.24, 'Quick-step behind, then drive the knee', 'Cross behind with the right foot, step left, and swing the arms as the right knee rises.']],
    { framing: 'standing', oneShot: true });

  add('Childs_Pose', "Child's Pose", back, ['Glutes'],
    [[0, 'Hands and knees', [0, 0]], [.70, 'Walk hands forward', [.13, 1]], [1.6, 'Sit back on heels', [1, 1]],
      [2.45, 'Rest arms beside feet', [1, 0]], [3.45, 'Reach forward to return', [1, 1]], [4.8, '', [0, 0]]],
    (a, reach) => {
      const thigh = lerp(.05, -1.23, a);
      torso(v(0, .080 + .446 * Math.cos(thigh), -.16 + .446 * Math.sin(thigh)), pitch(lerp(1.48, 2.03, a)),
        pitch(lerp(1.54, 1.49, a)), pitch(lerp(1.55, 1.67, a)), pitch(lerp(1.08, 2.03, a)));
      for (const [side, s] of sides) {
        groundKnee(side, thigh);
        const wrist = v(s * lerp(.20, .28, a * (1 - reach)), palmHeight + .055 * a * Math.sin(Math.PI * reach),
          .38 + .013 * reach - .82 * a * (1 - reach));
        palm(side, s, wrist, v(s, .33, -.32), forward.clone().applyQuaternion(yaw(-s * 2.50 * a * (1 - reach))));
      }
    },
    [[0, 'Start on hands and knees', 'Walk your hands forward.'],
      [1.6, 'Sink your hips toward your heels', 'Let your spine round as your forehead lowers. Bring your hands alongside your feet and breathe.']]);

  add('Chin_To_Chest_Stretch', 'Chin To Chest Stretch', back, [],
    stretch('Sit tall with hands behind head', 'Chin toward chest'),
    (a) => {
      torso(v(0, .137, 0), pitch(-.13), pitch(.07 * a), pitch(.05 + .17 * a), pitch(.04 + .70 * a));
      for (const [side, s] of sides) {
        leg(side, s * .083, .79, pitch(-.35), 0, v(s * .08, 1, 0));
        const head = bone('Head');
        const frame = head.getWorldQuaternion(new THREE.Quaternion());
        arm(side, s, head.localToWorld(v(s * .092, .104, -.112)), v(s * .46, -.42, .92),
          v(-s * .94, .05, .03).applyQuaternion(frame), v(0, 0, -1).applyQuaternion(frame));
      }
    },
    [[0, 'Sit on the floor and cradle your head', 'Bring your fingertips together behind your head with elbows pointing forward.'],
      [1.15, 'Gently draw your chin down', 'Keep your shoulders relaxed and hold for 20–30 seconds.']]);

  add('Dancers_Stretch', "Dancer's Stretch", back, ['Glutes'],
    stretch('Cross right leg over left', 'Rotate to the right'),
    (a) => {
      torso(v(0, .138, 0), yaw(-.12), roll(.23).multiply(yaw(-.26 - .40 * a)),
        roll(.42).multiply(yaw(-.34 - .70 * a)), yaw(-.40 - .88 * a));
      leg('L', .13, .798, pitch(-.32), 0, up);
      leg('R', .255, .30, yaw(-.22), 0, v(-.18, 1, 0));
      palm('R', -1, v(-.285, palmHeight, -.166), v(-.50, .1, -.80), v(-.64, 0, -.77));
      const knee = point('ShinR');
      arm('L', 1, knee.clone().add(v(.059 - .075 * a, -.064, .095)), v(.66, -.7, .45),
        v(-.12, -.83, -.40), v(.9, .4, .1));
    },
    [[0, 'Sit tall and cross your right foot over', 'Keep the left leg straight and plant your right hand behind you.'],
      [1.15, 'Rotate toward the bent knee', 'Brace the left arm against the right leg. Hold for 10–20 seconds, then switch sides.']]);

  const gripFingers = createDumbbellGripTracks(scene);
  const pikeGrips = sides.map(([side, s]) => {
    const { position, quaternion } = dumbbellGripTransform(s);
    const axis = v(1, 0, 0).applyQuaternion(quaternion);
    const hand = swing(axis, v(-1, 0, 0));
    const tangent = handAlong(s).applyQuaternion(hand);
    hand.premultiply(pitch(Math.atan2(-tangent.z, tangent.y) + .28));
    return { side, s, hand, wrist: v(s * .215, 2.30, 0).sub(position.applyQuaternion(hand)) };
  });

  add('Hanging_Pike', 'Hanging Pike', core, [],
    stretch('Hang with knees bent at 90°', 'Lift shins near bar', 'Lower slowly'),
    (a) => {
      const hip = pitch(-.10 - 1.01 * a);
      const waist = pitch(-.10 - .59 * a);
      const chest = pitch(-.10 - .14 * a);
      const position = v(0, 1.222, -.056).add(bone('Lumbar').position.clone().applyQuaternion(pitch(-.10)))
        .add(bone('Chest').position.clone().applyQuaternion(pitch(-.10)))
        .sub(bone('Lumbar').position.clone().applyQuaternion(hip))
        .sub(bone('Chest').position.clone().applyQuaternion(waist));
      torso(position, hip, waist, chest, pitch(-.11 - .12 * a));
      for (const { side, s, hand, wrist } of pikeGrips) {
        limb(arms, side, wrist, v(s * .32, -.35, -.72), hand);
        world('Thigh' + side, pitch(-flat - 1.43 * a));
        world('Shin' + side, pitch(-3.07 * a));
        world('Foot' + side, pitch(-.25 - 2.62 * a));
      }
    },
    [[0, 'Hang from an overhand grip', 'Bring both thighs to horizontal with your shins hanging straight down.'],
      [1.15, 'Curl your pelvis and lift the shins', 'Straighten the legs as they approach the bar. Lower slowly to the 90-degree tuck.']],
    { framing: 'pull-up-bar', equipment: 'pull-up-bar' }, gripFingers);

  add('Hug_Knees_To_Chest', 'Hug Knees To Chest', back, ['Glutes'],
    stretch('Lie back with knees raised', 'Pull knees toward shoulders'),
    (a) => {
      torso(v(0, .136, 0), pitch(-flat - .07 * a), pitch(-flat), pitch(-flat), pitch(-flat + .09));
      for (const [side, s] of sides) {
        world('Thigh' + side, pitch(-2.91 - .69 * a));
        world('Shin' + side, pitch(-.98 - .16 * a));
        world('Foot' + side, pitch(-.95 - .12 * a));
        const knee = point('Shin' + side);
        arm(side, s, knee.add(v(s * .100, -.137, .041)), v(s * .82, -.86, -.18),
          v(-s * .75, .58, .14), v(0, -.9, -.42));
      }
    },
    [[0, 'Lie back and raise both knees', 'Put your hands behind your thighs, just below the knees.'],
      [1.15, 'Draw your knees toward your shoulders', 'Let the low back and glutes relax as you hold.']]);

  add('Inchworm', 'Inchworm', ['Hamstrings'], [],
    [[0, 'Hinge and plant hands', [0, 0, 0, 0, 0]],
      [.38, 'Walk left hand out', [.15, .31, 0, 0, 0]], [.76, 'Walk right hand out', [.30, .31, .34, 0, 0]],
      [1.14, 'Walk left hand farther', [.53, .64, .34, 0, 0]], [1.52, 'Walk right hand farther', [.68, .64, .68, 0, 0]],
      [1.90, 'Reach with left hand', [.85, .91, .68, 0, 0]], [2.28, 'Reach a high plank', [1, .91, .93, 0, 0]],
      [2.65, 'Step left foot in', [.85, .91, .93, .29, 0]], [3.02, 'Step right foot in', [.68, .91, .93, .29, .32]],
      [3.39, 'Step left foot in', [.51, .91, .93, .58, .32]], [3.76, 'Step right foot in', [.34, .91, .93, .58, .62]],
      [4.13, 'Step left foot close', [.18, .91, .93, .91, .62]], [4.5, 'Feet close to hands', [0, .91, .93, .91, .93]],
      [4.85, '', [0, .91, .93, .91, .93]]],
    (plank, lh, rh, lf, rf, time) => {
      const height = lerp(.876, .490, plank);
      const shift = (lf + rf) / 2;
      torso(v(0, height, shift + lerp(-.143, .755, plank)), pitch(lerp(2.72, 1.45, plank)),
        pitch(lerp(2.86, 1.45, plank)), pitch(lerp(2.74, 1.45, plank)), pitch(lerp(2.56, 1.38, plank)));
      const step = (starts, duration) => starts.reduce((lift, start) => {
        const progress = clamp((time - start) / duration, 0, 1);
        return lift + Math.sin(Math.PI * progress);
      }, 0);
      for (const [side, s] of sides) {
        const foot = pitch(.55 * plank);
        leg(side, s * .105, s > 0 ? lf : rf, foot, .065 * step(s > 0 ? [2.28, 3.02, 3.76] : [2.65, 3.39, 4.13], .37));
        const handClearance = .095 * step(s > 0 ? [0, .76, 1.52] : [.38, 1.14, 1.90], .38);
        palm(side, s, v(s * .195, palmHeight + handClearance, .36 + (s > 0 ? lh : rh)), v(s * .24, -.05, -1));
      }
    },
    [[0, 'Fold at the hips and plant your palms', 'Start with your feet close and keep your legs nearly straight.'],
      [.38, 'Walk your hands into a high plank', 'Move one hand at a time.'],
      [2.28, 'Walk your feet toward your hands', 'Keep the hands in place and take short steps to finish in the fold.']],
    { oneShot: true });

  const transverseBench = (z) => ({ framing: 'bench', equipment: 'bench', benchTransform: { position: [0, 0, z], yaw: flat } });
  const pushFeet = pitch(1.12);

  add('Incline_Push-Up', 'Incline Push-Up', ['Chest'], press,
    stretch('Straight-arm incline plank', 'Chest toward bench', 'Press away'),
    (a) => {
      const tilt = 1.14 + .24 * a;
      torso(v(0, .705 - .202 * a, -.600 + .090 * a), pitch(tilt), pitch(tilt), pitch(tilt), pitch(1.02));
      for (const [side, s] of sides) {
        leg(side, s * .105, -1.238, pushFeet, 0, v(0, -1, .27));
        palm(side, s, v(s * .247, .430 + palmHeight, .015), v(s * .66, -.08, -.90));
      }
    },
    [[0, 'Set your hands on the edge of the bench', 'Step your feet back and brace in a straight line.'],
      [1.15, 'Lower your chest toward the edge', 'Bend your elbows while keeping your hips in line, then press up.']],
    transverseBench(.098));

  add('Kneeling_Arm_Drill', 'Kneeling Arm Drill', ['Shoulders'], core,
    [[0, 'Half kneel', [0, 0]], [.48, 'Long arm swing', [1, 0]], [.96, 'Long arm swing', [-1, 0]],
      [1.4, 'Close the elbow angle', [1, .55]], [1.81, 'Running rhythm', [-1, .66]],
      [2.14, 'Sprint arms', [1, 1]], [2.40, 'Sprint return', [-1, 1]], [2.66, 'Sprint arms', [1, 1]],
      [2.92, 'Sprint return', [-1, 1]], [3.36, '', [0, 0]]],
    (swingAmount, speed) => {
      torso(v(0, .525, -.02), pitch(-.035), yaw(.06 * swingAmount), yaw(.13 * swingAmount).multiply(pitch(.05)), pitch(0));
      leg('L', .142, .45);
      groundKnee('R', .015);
      for (const [side, s] of sides) {
        const swing = -.77 * s * swingAmount;
        const upper = roll(-s * .12).multiply(pitch(swing));
        const lower = roll(-s * .15).multiply(pitch(swing - .22 - 1.03 * speed));
        world('Arm' + side, upper);
        world('Forearm' + side, lower);
        world('Hand' + side, lower);
      }
    },
    [[0, 'Half-kneel with your front heel planted', 'Stay tall with the left foot forward and the right knee down.'],
      [1.4, 'Close the elbows and quicken the swings', 'Accelerate your hands forward as they pass your hips. Switch knees after the drill.']],
    { framing: 'standing' });

  const rightSide = roll(flat).multiply(pitch(flat));
  add('On_Your_Side_Quad_Stretch', 'On Your Side Quad Stretch', quads, [],
    stretch('Lie on right side', 'Press left hip forward'),
    (a) => {
      const hip = pitch(-.13 * a).multiply(rightSide);
      torso(v(0, .227, 0), hip, rightSide,
        pitch(-.06).multiply(rightSide), pitch(-.11).multiply(rightSide));
      const baseFoot = roll(flat);
      leg('R', .445, -.36, baseFoot, 0, v(1, -.10, -.05));
      palm('R', -1, v(.237, palmHeight, .53), v(.7, .25, -.7), v(.31, 0, .95));
      const topFrame = pitch(.10).multiply(rightSide);
      world('ThighL', turn(up, -.50 * a).multiply(topFrame));
      world('ShinL', turn(up, -2.26 - .39 * a).multiply(topFrame));
      world('FootL', turn(up, -2.05 - .42 * a).multiply(topFrame));
      holdFoot('L', 1, v(-1, .57, -.62), true);
    },
    [[0, 'Lie on your right side and bend your bottom knee', 'Bring that knee forward to stabilize you. Take your top foot in your left hand.'],
      [1.15, 'Press your top hip forward', 'Gently push the foot back into your hand, then repeat on the other side.']]);

  add('One_Half_Locust', 'One Half Locust', quads, ['Core', 'Biceps', 'Chest'],
    stretch('Lie face down and take right foot', 'Lift foot and shoulders'),
    (a) => {
      torso(v(0, .158, 0), pitch(1.62), pitch(1.56 - .34 * a), pitch(1.52 - .70 * a), pitch(1.44 - .86 * a));
      leg('L', .11, -.823, pitch(2.44), 0, v(0, -.35, .86));
      palm('L', 1, v(.248, palmHeight, .09), v(.7, -.11, .15), v(-.98, 0, -.24));
      world('ThighR', pitch(1.57 + .47 * a));
      world('ShinR', pitch(4.04 + .17 * a));
      world('FootR', pitch(4.10 + .24 * a));
      holdFoot('R', -1, v(-1, -.15, -.65));
    },
    [[0, 'Set your left hand beneath the left hip', 'Bend the right knee and reach back for your foot.'],
      [1.15, 'Lift the right foot and both shoulders', 'Keep the left leg grounded and switch sides after the hold.']]);

  add('Push-Ups_With_Feet_Elevated', 'Push-Ups With Feet Elevated', ['Chest'], press,
    stretch('High plank with feet elevated', 'Chest near floor', 'Press up'),
    (a) => {
      const tilt = 1.74 + .24 * a;
      torso(v(0, .465 - .100 * a, -.019 - .030 * a), pitch(tilt), pitch(tilt), pitch(tilt), pitch(1.24));
      for (const [side, s] of sides) {
        leg(side, s * .104, -.819, pushFeet, .430, v(0, -1, .19));
        palm(side, s, v(s * .345, palmHeight, .43), v(s * .80, .05, -.65));
      }
    },
    [[0, 'Place both toes on the bench', 'Set your palms wider than your shoulders and brace your trunk.'],
      [1.15, 'Lower your chest close to the floor', 'Keep your hips in line as you press back up.']],
    transverseBench(-.905));

  add('Seated_Floor_Hamstring_Stretch', 'Seated Floor Hamstring Stretch', ['Hamstrings'], ['Calves'],
    stretch('Sit with right leg straight', 'Hinge toward right ankle'),
    (a) => {
      torso(v(0, .142, 0), pitch(.11 + .84 * a), pitch(.12 + .89 * a), pitch(.13 + .97 * a), pitch(.11 + .89 * a));
      leg('R', -.102, .824, pitch(-.51), 0, up);
      leg('L', .047, .335, yaw(-1.22).multiply(roll(.76)), .038, v(.90, -.17, .14));
      for (const [side, s] of sides) {
        const wrist = v(lerp(s * .16, -.106 + s * .073, a), .230 - .103 * a, .292 + .442 * a);
        arm(side, s, wrist, v(s * .80, -.50, -.16), v(-s * .20, -.10, .98), v(s * .36, .90, -.20));
      }
    },
    [[0, 'Extend the right leg and fold the left in', 'Rest your left foot against the inside of your right thigh.'],
      [1.15, 'Hinge from the hips and reach', 'Reach for the right ankle. Hold for 15 seconds, then repeat on the other side.']]);

  const shoulderSockets = sides.map(([side]) => bone('Arm' + side).position.clone());
  add('Seated_Leg_Tucks', 'Seated Leg Tucks', core, [],
    stretch('Lean back with legs extended', 'Bring knees and chest together', 'Extend again'),
    (a) => {
      torso(v(0, .556 - .036 * a, .150 - .170 * a), pitch(-.39 + .48 * a), pitch(-.63 + .95 * a),
        pitch(-.76 + 1.26 * a), pitch(-.48 + .41 * a));
      const chestInverse = bone('Chest').getWorldQuaternion(new THREE.Quaternion()).invert();
      // The rig has no clavicles, so lower the shoulder sockets slightly to keep the palms loaded.
      const shoulderDrop = v(0, -.007 - .200 * a * (1 - a), 0).applyQuaternion(chestInverse);
      for (const [side, s] of sides) {
        bone('Arm' + side).position.copy(shoulderSockets[s > 0 ? 0 : 1]).add(shoulderDrop);
        palm(side, s, v(s * .227, .430 + palmHeight, .019), v(s * .24, -.32, -.83), v(s * .08, 0, 1));
        world('Thigh' + side, pitch(-1.38 - 1.12 * a));
        world('Shin' + side, pitch(-1.39 + 1.07 * a));
        world('Foot' + side, pitch(-1.28 + .81 * a));
      }
    },
    [[0, 'Sit on the edge and hold the bench', 'Lean back about 45 degrees and keep both heels off the floor.'],
      [1.15, 'Bring your chest and knees together', 'Pause briefly, then lean back and extend the legs with control.']],
    transverseBench(.050), [], ['ArmL', 'ArmR']);

  add('Side_Wrist_Pull', 'Side Wrist Pull', ['Shoulders'], ['Forearms', 'Upper back'],
    stretch('Take left wrist at hip height', 'Straighten and lift across body'),
    (a) => {
      torso(v(0, .868, 0), pitch(0), yaw(-.06 * a), yaw(-.23 * a), yaw(-.16 * a));
      for (const [side, s] of sides) leg(side, s * .13, 0);
      const wrist = v(-.108 - .264 * a, .990 + .365 * a, .218 + .009 * a);
      arm('L', 1, wrist, v(.24, -.74, .64), v(-.93, .16 - .34 * a, .04), v(0, .2, .9));
      const contact = point('HandL').add(v(-.074, -.065, .052));
      arm('R', -1, contact, v(-.52, -.93, .25), v(.85, .35, -.22), v(-.16, -.50, .85));
    },
    [[0, 'Hold the left wrist with your right hand', 'Keep your left elbow bent and bring both hands across the hips.'],
      [1.15, 'Draw the arm across and up', 'Gently straighten it toward shoulder height, then repeat on the other side.']],
    { framing: 'standing' });

  add('Worlds_Greatest_Stretch', "World's Greatest Stretch", ['Hamstrings'], ['Calves', 'Glutes', 'Quadriceps'],
    [[0, 'Upright low lunge', [0, 0]], [.65, 'Hold the lunge', [0, 0]], [1.62, 'Left elbow inside left foot', [1, 0]],
      [2.65, 'Hold the low reach', [1, 0]], [3.62, 'Straighten front leg and lift toes', [1, 1]],
      [4.8, 'Return to lunge', [1, 1]], [5.85, '', [0, 0]]],
    (lower, hinge) => {
      torso(v(-.018, .486 - .112 * lower + .205 * hinge, .085 - .083 * lower - .092 * hinge),
        pitch(.10 + 1.25 * lower + .29 * hinge), pitch(.07 + 1.45 * lower + .38 * hinge),
        pitch(.07 + 1.58 * lower + .30 * hinge), pitch(.03 + 1.31 * lower + .42 * hinge));
      leg('L', .224, .578, pitch(-.51 * hinge), 0, v(.10, 0, 1), true);
      leg('R', -.175, -.648, pitch(1.15), 0, v(-.14, -.88, .34));
      for (const [side, s] of sides) {
        const hand = v(s > 0 ? lerp(.050, .424, hinge) : -.093, palmHeight, s > 0 ? lerp(.602, .43, hinge) : lerp(.515, .40, hinge));
        const loose = point('Arm' + side).add(v(s * .10, -.341, .15));
        palm(side, s, loose.lerp(hand, lower), v(s * (.22 + .4 * hinge), -.4, s > 0 ? -.97 : -.55));
      }
    },
    [[0, 'Set up in a low lunge', 'Plant your left foot and keep the ball of your back foot on the floor.'],
      [1.62, 'Lower the left elbow inside the left foot', 'Support yourself with the other palm.'],
      [3.62, 'Straighten the front leg', 'Put both hands beside the foot and lift the toes while keeping the heel grounded. Switch sides after the sequence.']]);

  return entries;
}
