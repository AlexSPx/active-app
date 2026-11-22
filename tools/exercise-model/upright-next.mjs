import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSupportHands, forearmRoll, supportFingerNames } from './hand-frame.mjs';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const q = () => new THREE.Quaternion();
const rotation = (x = 0, y = 0, z = 0) => q().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
const sides = ['L', 'R'];
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

export function createEntries({ scene, onlyExercises }, { createDumbbellGripTracks, dumbbellGripTransform }) {
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
    const ground = Math.min(...points.map((p) => p.y));
    return { points, toe, ground };
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
  // Keep the hip hands with the torso through the breath cycle.
  const chestArm = (side, sign, target, pole, along, dorsal) => {
    const chest = bone('Chest');
    const turn = chest.getWorldQuaternion(q());
    arm(side, chest.localToWorld(target), pole.applyQuaternion(turn),
      turn.multiply(openHand(sign, along, dorsal)));
  };
  const hipHand = (side, sign) => chestArm(side, sign, v(sign * .168, -.207, .039),
    v(sign, 0, -.5), v(-sign * .48, -.82, .21), v(sign, .02, 0));

  const lumbar = bone('Lumbar');
  const chest = bone('Chest');
  const lumbarRest = lumbar.position.clone();
  const chestRest = chest.position.clone();
  function torso(x = 0, y = .870, z = 0, pitch = 0) {
    pelvis.position.set(x, y, z);
    pelvis.quaternion.copy(rotation(pitch));
    lumbar.position.copy(lumbarRest);
    chest.position.copy(chestRest);
    lumbar.quaternion.identity();
    chest.quaternion.identity();
    bone('Head').quaternion.copy(rotation(-pitch * .70));
  }
  const leg = (side, ankle, orientation, pole = v(side === 'L' ? .09 : -.09, 0, 1)) =>
    limb(['Thigh', 'Shin', 'Foot'].map((name) => name + side), ankle, pole, orientation);
  function planted(i, x, z, surface = 0, pitch = 0) {
    const { points, toe, ground } = soles[i];
    if (pitch === 0) return v(x, surface - ground, z);
    const sin = Math.sin(pitch);
    const cos = Math.cos(pitch);
    const low = points.reduce((height, p) => Math.min(height, p.y * cos - p.z * sin), Infinity);
    return v(x, surface - low, z + toe.z - (toe.y * sin + toe.z * cos));
  }
  function stand() {
    torso();
    eachSide((side, sign, i) => leg(side, planted(i, sign * .143, 0), q()));
  }

  const entries = {};
  function add(key, name, primary, supporting, keys, pose, cues, options = {}) {
    if (onlyExercises && !onlyExercises.includes(key)) return;
    const { breathing, closedGrip, ...metadata } = options;
    const duration = keys.at(-1)[0];
    const count = Math.ceil(duration * 60);
    const times = [...new Set([...Array.from({ length: count + 1 }, (_, i) => Math.fround(duration * i / count)),
      ...keys.map(([time]) => Math.fround(time))])].sort((a, b) => a - b);
    const movingJoints = breathing ? [pelvis, lumbar, chest] : [pelvis];
    const positions = movingJoints.map(() => []);
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
      movingJoints.forEach((joint, i) => positions[i].push(...joint.position.toArray()));
      joints.forEach((joint, i) => rotations[i].push(...joint.quaternion.toArray()));
    }
    const tracks = joints.flatMap((joint, i) => includeTrack(joint.name, rotations[i])
      ? [new THREE.QuaternionKeyframeTrack(joint.name + '.quaternion', times, rotations[i])] : []);
    movingJoints.forEach((joint, i) => tracks.push(new THREE.VectorKeyframeTrack(joint.name + '.position', times, positions[i])));
    if (closedGrip) tracks.push(...createDumbbellGripTracks(scene));
    entries['local:exercise:' + key] = {
      name, primary, supporting, framing: 'standing', ...metadata, cues,
      phases: keys.flatMap(([time, label]) => label ? [[time, label]] : []),
      clip: new THREE.AnimationClip(name, duration, tracks).optimize(),
    };
  }
  const rail = { equipment: 'dip-station' };
  function railHand(side, sign, release) {
    const wrist = v(sign * .268, 1.201, .115)
      .lerp(point('Arm' + side).add(v(sign * .072, -.484, .04)), release);
    wrist.x -= sign * .09 * Math.sin(Math.PI * release);
    arm(side, wrist, v(sign, -.30, -.70),
      openHand(sign, v(-sign * .38, -.03, 1).lerp(v(0, -1, .16), release),
        up.clone().lerp(v(sign, 0, 0), release), .65 * (1 - release)));
  }

  const { lerp, smoothstep } = THREE.MathUtils;
  const sweep = (angle, lateral = 0) => v(lateral, -Math.cos(angle), Math.sin(angle)).normalize();
  const unilateralKeys = (label, cycle, repetitions) => {
    const span = 2 + cycle * repetitions;
    return [[0, 'Set support', []], [1, label, []], [span, 'Switch sides', []],
      [span + 1, label, []], [2 * span, null, []]];
  };
  function swings(cycle, repetitions, movement, bothHands = false) {
    return (_, time) => {
      const span = 2 + cycle * repetitions;
      const moving = time < span ? 1 : -1;
      const local = time - (moving === 1 ? 0 : span);
      const lift = smoothstep(local, 0, 1) * (1 - smoothstep(local, span - 1, span));
      const elapsed = Math.max(0, Math.min(cycle * repetitions, local - 1));
      const angle = 2 * Math.PI * elapsed / cycle;
      torso(-moving * .102 * lift, .878 - .003 * lift, .045);
      eachSide((side, sign, i) => {
        const ankle = planted(i, sign * .125, .035);
        const working = sign === moving;
        const pole = v(sign * .09, 0, 1);
        const workingLift = working ? lift : 0;
        const { upper, lower, pitch, clearance = .018 } = movement(angle, sign, elapsed / (cycle * repetitions));
        const hip = point('Thigh' + side);
        const thighLength = bone('Shin' + side).position.length();
        const shinLength = bone('Foot' + side).position.length();
        const raised = hip.clone().addScaledVector(upper, thighLength * .995)
          .addScaledVector(lower, shinLength * .995);
        ankle.lerp(raised, workingLift);
        ankle.y = Math.max(ankle.y, planted(i, 0, 0, clearance * workingLift, pitch * workingLift).y);
        if (upper.dot(lower) < .96) pole.lerp(upper, workingLift);
        leg(side, ankle, rotation(pitch * workingLift), pole);
        railHand(side, sign, bothHands ? 0 : workingLift);
      });
    };
  }

  add('Front_Leg_Raises', 'Front Leg Raises', ['Hamstrings'], [],
    unilateralKeys('Swing forward and back', 1.5, 5), swings(1.5, 5, (angle, sign) => {
      const swing = Math.sin(angle);
      const direction = sweep(swing >= 0 ? 1.12 * swing : .50 * swing, .08 * sign);
      return { upper: direction, lower: sweep((swing >= 0 ? 1.12 : .50) * swing - .10, .08 * sign), pitch: -.45 * swing };
    }), [[0, 'Hold a stable support', 'Stand tall with your weight on the inside leg.'],
      [1, 'Swing from the hip', 'Keep the moving leg straight as it swings forward and then behind you.']], rail);

  add('Side_Leg_Raises', 'Side Leg Raises', ['Adductors'], [],
    unilateralKeys('Swing out and across', 1.5, 5), swings(1.5, 5, (angle, sign, progress) => {
      const arc = Math.sin(angle);
      const abduction = arc * (arc >= 0 ? lerp(.53, .98, progress) : lerp(.20, .39, progress));
      const forward = Math.max(0, -arc) * .39 + .10;
      const direction = v(sign * Math.sin(abduction), -Math.cos(abduction), forward).normalize();
      return { upper: direction, lower: direction, pitch: -.14 };
    }), [[0, 'Balance on one leg', 'Use a stable support and face forward.'],
      [1, 'Swing out, then across', 'Keep the moving knee straight and increase the range gradually.']], rail);

  // The atlas colors its gluteus medius and minimus under Glutes.
  add('Standing_Hip_Circles', 'Standing Hip Circles', ['Glutes'], ['Adductors'],
    unilateralKeys('Circle the lifted knee', 2.4, 2), swings(2.4, 2, (angle, sign) => {
      const out = .58 * (1 - Math.cos(angle));
      return { upper: v(sign * (.08 + out), -.12 + .27 * Math.sin(angle), .94 - .62 * out).normalize(),
        lower: v(sign * (.04 + .32 * out), -1, -.27 - .39 * out).normalize(), pitch: .22 };
    }), [[0, 'Hold a stable support', 'Shift onto the planted leg and bring the opposite knee up.'],
      [1, 'Draw a circle with your knee', 'Open from the hip while keeping your pelvis facing forward.']], rail);

  add('Leg_Lift', 'Leg Lift', ['Glutes'], ['Hamstrings'], unilateralKeys('Curl one leg behind', 1.85, 3),
    swings(1.85, 3, (angle, sign) => {
      const bend = (1 - Math.cos(angle)) / 2;
      return { upper: sweep(-.28 * bend, sign * .16), lower: sweep(-.10 - 1.47 * bend, sign * .16),
        pitch: -.51 * bend, clearance: .018 * bend };
    }, true), [[0, 'Brace against a stable surface', 'Keep both hips facing forward and stand tall.'],
      [1, 'Bend your knee and lift behind', 'Keep the supporting leg steady and lower the raised foot with control.']], rail);

  const resistance = (a, b) => [[0, 'Neutral', [0]], [1.2, a, [1]], [4.2, 'Release', [1]],
    [5.4, 'Reset', [0]], [6.6, b, [-1]], [9.6, 'Release', [-1]], [10.8, null, [0]]];
  function headHand(side, sign, amount, target, fingers, dorsal, pole, arc) {
    const reach = Math.abs(amount);
    const wrist = point('Arm' + side).add(v(sign * .072, -.484, .04)).lerp(bone('Head').localToWorld(target), reach);
    wrist.addScaledVector(arc, Math.sin(Math.PI * reach));
    const rest = openHand(sign, v(0, -1, .16), v(sign, 0, 0), 0);
    const ready = openHand(sign, v(0, .5, 1), v(sign, 0, 0), 0);
    const contact = openHand(sign, fingers, dorsal, reach);
    const palm = reach < .5 ? rest.slerp(ready, smoothstep(reach, 0, .5)) : ready.slerp(contact, smoothstep(reach, .5, 1));
    arm(side, wrist, v(sign * .72, -.35, -.7).lerp(pole, reach), palm);
  }

  // The atlas groups its neck muscles under Other anatomy.
  add('Isometric_Neck_Exercise_-_Front_And_Back', 'Isometric Neck Exercise - Front And Back', [], [],
    resistance('Resist forward', 'Resist backward'), ([amount]) => {
      stand();
      const front = amount >= 0;
      eachSide((side, sign) => headHand(side, sign, amount,
        v(sign * .126, front ? .155 : .182, front ? .093 : -.130),
        v(-sign, .13, front ? .02 : .23), v(sign * .28, 0, front ? 1 : -1),
        v(sign, -.38, front ? .45 : -.6), v(sign * .23, .11, front ? .12 : .04)));
    }, [[0, 'Face forward', 'Bring both hands to the front of your head.'],
      [1.2, 'Create gentle forward pressure', 'Resist with your hands so your head stays still. Keep breathing.'],
      [6.6, 'Resist in the other direction', 'Place both hands behind your head and gently press back into them.']]);

  add('Isometric_Neck_Exercise_-_Sides', 'Isometric Neck Exercise - Sides', [], [],
    resistance('Resist left', 'Resist right'), ([amount]) => {
      stand();
      eachSide((side, sign) => headHand(side, sign, Math.max(0, amount * sign),
        v(sign * .154, .105, .007), v(-sign * .76, .65, 0), v(sign, .24, 0),
        v(sign, -.34, .05), v(sign * .165, .07, .08)));
    }, [[0, 'Keep your head neutral', 'Place one palm against the side of your head.'],
      [1.2, 'Gently press into your hand', 'Match the pressure with your hand and keep the head still.'],
      [6.6, 'Repeat on the other side', 'Keep your shoulders relaxed.']]);

  add('Stomach_Vacuum', 'Stomach Vacuum', ['Core'], [],
    [[0, 'Set up', [0]], [1.7, 'Finish inhaling', [-1]], [4, 'Begin hold', [1]],
      [24, 'Inhale to release', [1]], [26, null, [0]]], ([breath]) => {
      stand();
      const drawingIn = breath * (breath < 0 ? .016 : .049);
      lumbar.position.z -= drawingIn;
      chest.position.z += drawingIn;
      chest.position.y -= .012 * breath;
      eachSide(hipHand);
    }, [[0, 'Stand tall with hands on hips', 'Inhale deeply.'],
      [1.7, 'Exhale and draw your abdomen in', 'Draw your navel toward your spine.'],
      [4, 'Hold for 20 seconds', 'Keep the abdomen drawn in while breathing gently.'],
      [24, 'Release on an inhale', 'Let the abdomen return to its starting position.']], { breathing: true });

  const step = [
    [0, 'Stand facing the bench', [.870, -.27, 0, 0, 0, 0]],
    [.25, null, [.863, -.27, .49, 0, 0, 0]],
    [.65, 'Plant lead foot on the bench', [.813, -.17, .43, .55, 0, 0]],
    [1.05, 'Drive through lead foot', [.998, .015, .43, .55, .17, .08]],
    [1.28, null, [1.142, .123, .43, .55, .52, .28]],
    [1.62, 'Lift opposite knee', [1.307, .282, .43, .55, .87, .88]],
    [1.90, 'Lower with control', [1.307, .282, .43, .55, .87, .88]],
    [2.16, null, [1.125, .120, .43, .55, .51, .335]],
    [2.41, 'Land the trailing foot', [.813, -.17, .43, .55, 0, 0]],
    [2.67, null, [.854, -.253, .49, .26, 0, 0]],
    [2.87, null, [.865, -.27, .49, 0, 0, 0]],
    [3.2, 'Switch legs', [.870, -.27, 0, 0, 0, 0]],
  ];
  add('Step-up_with_Knee_Raise', 'Step-up with Knee Raise', ['Glutes'], ['Hamstrings', 'Quadriceps'],
    [...step, ...step.slice(1).map(([time, phase, pose]) =>
      [time + 3.2, phase === 'Switch legs' ? null : phase, pose])],
    ([height, z, leadY, leadTravel, trailY, trailTravel], time) => {
      const leader = time < 3.2 ? 1 : -1;
      const drive = (height - .813) / .481;
      const shift = smoothstep(leadTravel, .14, .55) * smoothstep(drive, .10, 1);
      torso(leader * .08 * shift, height, z, .26 * (1 - Math.abs(2 * drive - 1)));
      eachSide((side, sign, i) => {
        const leading = sign === leader;
        const ankle = planted(i, sign * .125, -.27 + (leading ? leadTravel : trailTravel), leading ? leadY : trailY);
        leg(side, ankle, q());
        const counter = (leading ? 1 : -1) * shift;
        const wrist = point('Arm' + side).add(v(sign * .086, -.46 + .160 * Math.abs(counter), .05 + .24 * counter));
        arm(side, wrist, v(sign * .20, -.55, -.78), (distal) => openHand(sign, distal, v(sign, 0, 0), 0));
      });
    }, [[0, 'Face a stable bench', 'Plant your entire lead foot before transferring weight.'],
      [1.05, 'Stand on the lead leg', 'Drive your opposite knee up without pushing off the ground.'],
      [1.90, 'Reverse the step', 'Lower your trailing foot first, then bring the lead foot down.']],
    { equipment: 'bench', benchTransform: { position: [0, 0, .337], yaw: Math.PI / 2 } });

  const barHeight = 1.13;
  const barZ = .100;
  add('Body_Tricep_Press', 'Body Tricep Press', ['Triceps'], [],
    [[0, 'Arms extended', [0]], [1.35, 'Lower toward the bar', [1]], [1.58, 'Press away', [1]], [2.9, null, [0]]],
    ([depth]) => {
      const angle = lerp(.40, .70, depth);
      const heelPitch = .33;
      const footZ = -.991;
      const ankle = planted(0, .105, footZ, 0, heelPitch);
      torso(0, ankle.y + .794 * Math.cos(angle), ankle.z + .794 * Math.sin(angle), angle);
      world(bone('Head'), rotation(.34 * depth));
      eachSide((side, sign, i) => {
        leg(side, planted(i, sign * .105, footZ, 0, heelPitch), rotation(heelPitch));
        const seat = dumbbellGripTransform(sign);
        const fingers = v(0, -.36 + 1.24 * depth, .93 - .48 * depth);
        const hand = openHand(sign, fingers, v(0, fingers.z, -fingers.y), 0);
        const shaft = v(1, 0, 0).applyQuaternion(seat.quaternion).applyQuaternion(hand);
        hand.premultiply(aim(shaft, v(Math.sign(shaft.x), 0, 0)));
        const wrist = v(sign * .201, barHeight, barZ).sub(seat.position.applyQuaternion(hand));
        arm(side, wrist, v(sign * .21, -.88, -.47), hand);
      });
    }, [[0, 'Take a shoulder-width grip', 'Use a secured bar at chest height and step back into a straight-body lean.'],
      [1.35, 'Bend at the elbows', 'Bring your forehead toward the bar while holding your body straight.'],
      [1.58, 'Straighten your elbows', 'Press back to the starting position without bending at the hips.']],
    { closedGrip: true, equipment: 'rack-barbell', rackTransform: { hookHeight: barHeight },
      propClip: new THREE.AnimationClip('Fixed bar', 2.9,
        [new THREE.VectorKeyframeTrack('.position', [0], [0, barHeight, barZ])]) });

  add('Standing_Towel_Triceps_Extension', 'Standing Towel Triceps Extension', ['Triceps'], [],
    [[0, 'Arms overhead', [0]], [1.30, 'Bend the elbows', [1]], [1.49, 'Extend overhead', [1]], [2.75, null, [0]]],
    ([depth]) => {
      stand();
      eachSide((side, sign) => {
        const upper = bone('Arm' + side);
        const lower = bone('Forearm' + side);
        const hand = bone('Hand' + side);
        const upperDirection = v(-sign * .29, .96, .02);
        const bend = lerp(.18, 2.48, depth);
        const forearmDirection = v(-sign * .16, Math.cos(bend), -Math.sin(bend));
        const grip = openHand(sign, forearmDirection, v(sign, 0, 0), 0);
        const distal = aim(hand.position, forearmDirection);
        world(upper, aim(lower.position, upperDirection));
        world(lower, forearmRoll(side, distal, forearmDirection, grip));
        world(hand, grip);
      });
    }, [[0, 'Hold the towel overhead with both hands', 'Have a partner hold the other end behind you and apply tension.'],
      [1.30, 'Bend your elbows behind your head', 'Keep your upper arms beside your ears and your elbows close.'],
      [1.49, 'Extend your elbows', 'Raise the towel back overhead against your partner’s resistance.']], {
      closedGrip: true,
      resistance: { mode: 'towel', anchors: [], links: [['L', 'R'], ['R', [0, 1.12, -.48]]] },
    });

  return entries;
}
