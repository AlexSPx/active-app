import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { forearmRoll, handAlong, openHand } from './hand-frame.mjs';

export const groupLabel = 'Standing barbell techniques';
export const v = (x, y, z) => new THREE.Vector3(x, y, z);
export const q = () => new THREE.Quaternion();
export const X = v(1, 0, 0);
export const Y = v(0, 1, 0);
export const Z = v(0, 0, 1);
export const sides = [['L', 1], ['R', -1]];
export const { lerp, smoothstep } = THREE.MathUtils;
const turn = (axis, angle) => q().setFromAxisAngle(axis, angle);
export const pitch = (angle) => turn(X, angle);
export const yaw = (angle) => turn(Y, angle);
export const roll = (angle) => turn(Z, angle);
export const mix = (a, b, t) => a.clone().lerp(b, t);
export const ankleHeight = .074;
const swing = (from, to) => q().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
const plane = (direction, axis) => direction.clone().addScaledVector(axis, -direction.dot(axis)).normalize();
const basis = (axis, along) => q().setFromRotationMatrix(new THREE.Matrix4()
  .makeBasis(axis, along, axis.clone().cross(along)));

export function frameFromDown(axis, down) {
  return basis(axis, plane(down, axis).negate());
}

export function motion(times, values, t) {
  let i = 1;
  while (i < times.length - 1 && t > times[i]) i++;
  return lerp(values[i - 1], values[i], smoothstep(t, times[i - 1], times[i]));
}

export function createAuthor({ scene, onlyExercises }, { createDumbbellGripTracks, dumbbellGripTransform }, metadata) {
  const figure = clone(scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const rotation = (name) => bone(name).getWorldQuaternion(q());
  const pelvis = bone('Pelvis');
  const entries = {};
  const grips = createDumbbellGripTracks(figure);
  const digits = grips.map((track) => {
    const name = track.name.split('.')[0];
    return { name, rest: bone(name).quaternion.clone(), closed: q().fromArray(track.values) };
  });
  const seats = new Map(sides.map(([side, sign]) => [side, dumbbellGripTransform(sign)]));
  const armLength = bone('ForearmL').position.length() + bone('HandL').position.length();
  const shoulders = sides.map(([side]) => bone('Arm' + side).position.clone());
  const joints = ['Pelvis', 'Lumbar', 'Chest', 'Head', ...sides.flatMap(([side]) =>
    ['Thigh', 'Shin', 'Foot', 'Arm', 'Forearm', 'Hand'].map((part) => part + side))];

  function world(name, orientation) {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(q()).invert().multiply(orientation));
  }

  function torso(position, orientation = q(), head = orientation) {
    pelvis.position.copy(position);
    world('Pelvis', orientation);
    bone('Lumbar').quaternion.identity();
    bone('Chest').quaternion.identity();
    world('Head', head);
  }

  function reach(names, target, pole, end, side, followWrist, rollGuide) {
    const [first, middle, last] = names;
    const start = point(first);
    const offset = target.clone().sub(start);
    const a = bone(middle).position.length();
    const b = bone(last).position.length();
    const distance = THREE.MathUtils.clamp(offset.length(), Math.abs(a - b) + .0001, a + b - .0001);
    const axis = offset.normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const upper = axis.clone().multiplyScalar(along)
      .addScaledVector(plane(pole, axis), Math.sqrt(Math.max(0, a * a - along * along)));
    const lower = axis.multiplyScalar(distance).sub(upper);
    const endRotation = typeof end === 'function' ? end(lower.clone().normalize()) : end;
    // A lateral guide keeps the segment roll stable when the swing passes vertical.
    const guidedSwing = (rest, direction) => frameFromDown(direction.clone().normalize(), rollGuide)
      .multiply(frameFromDown(rest.clone().normalize(), X).invert());
    const upperRotation = rollGuide ? guidedSwing(bone(middle).position, upper) : swing(bone(middle).position, upper);
    world(first, upperRotation);
    if (followWrist) {
      // Use the wrist frame where projecting its cross axis would flip at a deep bend.
      world(middle, swing(bone(last).position.clone().applyQuaternion(endRotation), lower).multiply(endRotation));
    } else if (side && rollGuide) {
      world(middle, guidedSwing(bone(last).position, lower));
    } else {
      const orientation = swing(bone(last).position, lower);
      world(middle, side ? forearmRoll(side, orientation, lower, endRotation) : orientation);
    }
    world(last, endRotation);
  }

  function leg(side, target, foot = q(), pole = v(side === 'L' ? .15 : -.15, 0, 1), upperGuide) {
    reach(['Thigh', 'Shin', 'Foot'].map((part) => part + side), target, pole, foot, undefined, false, upperGuide);
  }

  function stance(width = .16, z = 0, toe = .17, height = 0) {
    for (const [side, sign] of sides) leg(side, v(sign * width, ankleHeight + height, z), yaw(sign * toe));
  }

  function arm(side, target, pole, hand, followWrist = false, armGuide) {
    reach(['Arm', 'Forearm', 'Hand'].map((part) => part + side), target, pole, hand, side, followWrist, armGuide);
  }

  function free(side, target, direction, pole = v(side === 'L' ? 1 : -1, -1, -.3)) {
    const sign = side === 'L' ? 1 : -1;
    arm(side, target, pole, openHand(sign, direction, v(sign, 0, 0)));
  }

  function grip(side, axis, direction) {
    const { position, quaternion } = seats.get(side);
    const localAxis = X.clone().applyQuaternion(quaternion);
    const along = handAlong(side === 'L' ? 1 : -1);
    const hand = basis(axis, plane(direction, axis)).multiply(basis(localAxis, plane(along, localAxis)).invert());
    return { hand, offset: position.clone().applyQuaternion(hand) };
  }

  function bar(center, width, direction, pole, options = {}) {
    const { frame = q(), underhand = false, hands = 'LR', lanes, directions } = options;
    const axis = X.clone().applyQuaternion(frame);
    const anchors = sides.filter(([side]) => hands.includes(side)).map(([side, sign]) => {
      const { hand, offset } = grip(side, axis.clone().multiplyScalar(underhand ? 1 : -1),
        directions?.[side] ?? direction);
      const delta = axis.clone().multiplyScalar(lanes?.[side] ?? sign * width).sub(offset);
      return { side, sign, hand, delta, origin: point('Arm' + side).sub(delta) };
    });
    const fitted = center.clone();
    // Project the common shaft onto both wrist reach limits so neither hand slides off.
    for (let pass = 0; pass < 8; pass++) {
      for (const { origin } of anchors) {
        const offset = fitted.clone().sub(origin);
        if (offset.length() > armLength - .001) fitted.copy(origin).add(offset.setLength(armLength - .001));
      }
    }
    for (const { side, sign, hand, delta } of anchors) arm(side, fitted.clone().add(delta), pole(sign), hand);
    return [fitted, frame];
  }

  function hangY(z, width, direction, underhand = false) {
    const { offset } = grip('L', v(underhand ? 1 : -1, 0, 0), direction);
    const shoulder = point('ArmL');
    const radial = (width - offset.x - shoulder.x) ** 2 + (z - offset.z - shoulder.z) ** 2;
    return shoulder.y + offset.y - Math.sqrt(Math.max(0, (armLength - .004) ** 2 - radial));
  }

  function backRack() {
    const frame = rotation('Chest');
    const center = v(0, .231, -.074).applyQuaternion(frame).add(point('Chest'));
    return bar(center, .310, v(0, 1, -.36).applyQuaternion(frame),
      (sign) => v(sign * .65, -1, -.25).applyQuaternion(frame), { frame });
  }

  function crossedFrontRack() {
    const frame = rotation('Chest');
    const center = v(0, .226, .105).applyQuaternion(frame).add(point('Chest'));
    return bar(center, 0, v(0, -.35, -1).applyQuaternion(frame), (sign) => v(-sign * .17, .35, 1),
      { frame, lanes: { L: -.162, R: .162 } });
  }

  function add(id, phases, cues, pose, options = {}) {
    if (onlyExercises && !onlyExercises.includes(id)) return;
    const [name, primary, supporting] = metadata[id];
    const { duration = 3.6, fingers = 'LR', equipment = 'barbell', framing = 'standing', ...fixture } = options;
    const last = Math.ceil(duration * 60);
    const times = Array.from({ length: last + 1 }, (_, i) => i * duration / last);
    const body = joints.map(() => []);
    const positions = [];
    const sockets = [[], []];
    const fingerValues = digits.map(() => []);
    const propPositions = [];
    const propRotations = [];
    const secondPositions = [];
    const secondRotations = [];
    function record(values, orientation) {
      const flip = values.length && orientation.dot(q().fromArray(values, values.length - 4)) < 0;
      values.push(...orientation.toArray().map((value) => flip ? -value : value));
    }
    for (const t of times) {
      sides.forEach(([side], i) => bone('Arm' + side).position.copy(shoulders[i]));
      try {
        const [center, frame = q(), weights, second] = pose(t) ?? [];
        if (center && ![...center, ...frame, ...(second ?? []).flatMap((value) => [...value])].every(Number.isFinite)) {
          throw new Error('invalid prop transform');
        }
        positions.push(...pelvis.position);
        sides.forEach(([side], i) => sockets[i].push(...bone('Arm' + side).position));
        joints.forEach((joint, i) => record(body[i], bone(joint).quaternion));
        if (fingers === 'dynamic') digits.forEach(({ name, rest, closed }, i) =>
          record(fingerValues[i], rest.clone().slerp(closed, weights[name.at(-1)])));
        if (center) {
          propPositions.push(...center);
          record(propRotations, frame);
        }
        if (second) {
          secondPositions.push(...second[0]);
          record(secondRotations, second[1]);
        }
      } catch (error) {
        throw new Error(name + ' at ' + t.toFixed(3) + ' s', { cause: error });
      }
    }
    const prop = (label, locations, rotations) => new THREE.AnimationClip(name + label, duration, [
      new THREE.VectorKeyframeTrack('.position', times, locations),
      new THREE.QuaternionKeyframeTrack('.quaternion', times, rotations),
    ]);
    entries['local:exercise:' + id] = {
      name, primary, supporting, equipment, framing, phases, cues, ...fixture,
      clip: new THREE.AnimationClip(name, duration, [
        new THREE.VectorKeyframeTrack('Pelvis.position', times, positions),
        ...joints.map((joint, i) => new THREE.QuaternionKeyframeTrack(joint + '.quaternion', times, body[i])),
        ...sides.flatMap(([side], i) => sockets[i].some((value, j) => value !== sockets[i][j % 3])
          ? [new THREE.VectorKeyframeTrack('Arm' + side + '.position', times, sockets[i])] : []),
        ...(fingers === 'dynamic'
          ? digits.map(({ name }, i) => new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, fingerValues[i]))
          : grips.filter((track) => fingers.includes(track.name.split('.')[0].at(-1)))),
      ]),
      ...(propPositions.length && { propClip: prop(' prop', propPositions, propRotations) }),
      ...(secondPositions.length && { secondPropClip: prop(' second prop', secondPositions, secondRotations) }),
    };
  }

  return { entries, add, bone, point, rotation, pelvis, torso, world, arm, leg, stance, free, grip, bar, hangY,
    backRack, crossedFrontRack, armLength };
}

export const down = [[0, 'Setup'], [.25, 'Lower'], [1.65, 'Bottom'], [2.05, 'Rise'], [3.35, 'Reset']];
export const up = [[0, 'Setup'], [.25, 'Lift'], [1.4, 'Peak'], [1.85, 'Return'], [3.35, 'Reset']];
export const rep = (phases, t) => motion(phases.map(([time]) => time), [0, 0, 1, 1, 0], t);
export const cues = (phases, setup, peak, reset) => [setup, peak, reset].map(([title, detail], i) =>
  [phases[[0, 2, 3][i]][0], title, detail]);

export function createEntries(asset, helpers) {
  const rig = createAuthor(asset, helpers, metadata);
  const { add, entries, torso, world, point, rotation, stance, leg, arm, free, grip, bar, hangY,
    backRack, crossedFrontRack, pelvis, bone } = rig;
  const elbowsOut = (sign) => v(sign, -.6, -.2);
  const hangPole = (sign) => v(sign * .25, 0, -1);
  const squatPose = (a, width, depth, drift, lean, toe = .18) => {
    torso(v(0, lerp(.868, depth, a), drift * a), pitch(lean * a + .04), pitch(.15 * a));
    stance(width, 0, toe);
  };

  const lunge = [[0, 'Stand'], [.72, 'Plant right foot'], [1.55, 'Lower rear knee'], [2.08, 'Drive up'], [3.35, 'Feet together']];
  add('Barbell_Lunge', lunge, cues(lunge, ['Set the bar on your upper back', 'Start with both feet under your hips.'],
    ['Keep your front foot planted', 'Lower the rear knee while keeping your torso tall.'],
    ['Drive through the lead heel', 'Bring the lead foot back under your hips.']), (t) => {
    const step = motion([0, .72, 2.45, 3.35], [0, 1, 1, 0], t);
    const a = motion([0, .72, 1.55, 2.08, 2.45], [0, 0, 1, 1, 0], t);
    const swingHeight = .10 * Math.sin(Math.PI * step);
    torso(v(-.045 * step, .867 - .065 * step - .265 * a, .24 * step + .12 * a), pitch(.04 + .14 * a));
    leg('R', v(-.14, ankleHeight + swingHeight, .66 * step), yaw(-.12));
    leg('L', v(.14, ankleHeight + .09 * a + .025 * step, -.075 * a), yaw(.14).multiply(pitch(.55 * a + .12 * step)));
    return backRack();
  });

  const sideBend = [[0, 'Stand tall'], [.3, 'Bend right'], [1.05, 'Right limit'], [1.8, 'Center'],
    [2.55, 'Left limit'], [3.35, 'Center']];
  add('Barbell_Side_Bend', sideBend, cues(sideBend, ['Brace under the bar', 'Set your feet and keep your hips square.'],
    ['Bend at the waist', 'Keep the shaft across your shoulders as you tilt.'],
    ['Pass through center', 'Repeat the same range to the other side.']), (t) => {
    const a = motion(sideBend.map(([time]) => time), [0, 0, 1, 0, -1, 0], t);
    torso(v(0, .872, 0));
    world('Lumbar', roll(.16 * a));
    world('Chest', roll(.32 * a));
    world('Head', roll(.13 * a));
    stance(.19);
    return backRack();
  });

  for (const [id, width, style, startLean] of [
    ['Clean_Deadlift', .243, 'deadlift', 1.02], ['Snatch_Deadlift', .425, 'deadlift', 1.06],
    ['Snatch_Pull', .425, 'pull', 1.03], ['Wide_Stance_Stiff_Legs', .245, 'stiff', 1.48],
  ]) {
    const isPull = style === 'pull';
    const stiff = style === 'stiff';
    const phases = [[0, 'Floor setup'], [.25, 'First pull'], [1.08, 'Pass knees'],
      [1.48, isPull ? 'Accelerate' : 'Stand tall'], [1.75, isPull ? 'Full extension' : 'Hold'], [2.02, 'Lower'], [3.35, 'Reset']];
    add(id, phases, [[0, width > .3 ? 'Take a wide snatch grip' : 'Set your grip',
      stiff ? 'Set the feet wide and send your hips back with soft knees.' : 'Set the shaft close to your shins and brace your back.'],
    [1.08, 'Clear the knees', stiff ? 'Keep your arms long and drive your hips forward.' : 'Push through both feet and keep your back angle steady through the first pull.'],
    [1.75, isPull ? 'Finish through the ankles' : 'Extend the hips', isPull
      ? 'Drive through your hips, knees and ankles and finish with a shrug.' : 'Stand tall with the bar near your thighs.']], (t) => {
      const lift = motion([0, .25, 1.08, 1.75, 2.02, 3.35], [0, 0, .46, 1, 1, 0], t);
      const drive = motion([0, 1.36, 1.72, 2.02, 2.23, 3.35], [0, 0, 1, .68, 0, 0], t) * Number(isPull);
      const straight = stiff ? lift : smoothstep(lift, .24, 1);
      const direction = v(0, -1, -.12 + .2 * drive);
      const z = lerp(stiff ? .18 : .247, .153, lift) + .028 * drive;
      const hipZ = lerp(stiff ? -.37 : -.24, -.015, lift);
      const hipY = stiff ? ankleHeight + Math.sqrt(.806 ** 2 - (.34 - .102) ** 2 - hipZ ** 2) : .72;
      torso(v(0, hipY, hipZ), pitch(lerp(startLean, .04, straight)), pitch(.32 * (1 - lift)));
      for (const [side] of sides) bone('Arm' + side).position.y += .037 * drive;
      const standingY = .790 + (width - .243) * .15;
      const reachY = hangY(z, width, direction);
      const y = stiff ? Math.max(.225, reachY) : lerp(.225, standingY, lift) + .10 * drive;
      if (!stiff) pelvis.position.y += y - reachY;
      for (const [side, sign] of sides) {
        leg(side, v(sign * (stiff ? .34 : .15), ankleHeight + .071 * drive, -.02 * drive),
          yaw(sign * (stiff ? .39 : .16)).multiply(pitch(.39 * drive)));
      }
      return bar(v(0, y, z), width, direction, hangPole);
    });
  }

  for (const [id, width] of [['Clean_Shrug', .242], ['Snatch_Shrug', .435]]) {
    add(id, up, cues(up, ['Set the hang', 'Take an overhand grip and incline slightly forward.'],
      ['Shrug straight up', 'Bring your shoulders toward your ears with long arms.'],
      ['Let the shoulders settle', 'Keep your hips and knees still.']), (t) => {
      const a = rep(up, t);
      torso(v(0, .850, -.05), pitch(.17), pitch(.06));
      stance(.153);
      for (const [side] of sides) bone('Arm' + side).position.y += .074 * a;
      const direction = v(0, -1, -.12);
      return bar(v(0, hangY(.164, width, direction), .164), width, direction, hangPole);
    });
  }

  for (const [id, width, label] of [
    ['Close-Grip_Standing_Barbell_Curl', .092, 'close'], ['Wide-Grip_Standing_Barbell_Curl', .355, 'wide'],
  ]) {
    add(id, up, cues(up, ['Set a ' + label + ' palms-up grip', 'Stand tall with your upper arms still.'],
      ['Curl toward your shoulders', 'Flex the elbows without rocking the torso.'],
      ['Lower the shaft slowly', 'Straighten the elbows back to the hang.']), (t) => {
      const a = rep(up, t);
      torso(v(0, .865, 0));
      stance(.15);
      const angle = lerp(.20, 2.43, a);
      const direction = v(0, -Math.cos(angle), Math.sin(angle));
      const { offset } = grip('L', X, direction);
      const upper = (sign) => v(sign * .09, -1, .26).normalize();
      const elbow = point('ArmL').addScaledVector(upper(1), bone('ForearmL').position.length());
      const length = bone('HandL').position.length();
      const across = width - offset.x - elbow.x;
      const contact = elbow.addScaledVector(direction, Math.sqrt(length ** 2 - across ** 2)).add(offset);
      return bar(v(0, contact.y, contact.z), width, direction, upper, { underhand: true });
    });
  }

  for (const [id, width, depth, drift, lean, toe] of [
    ['Frankenstein_Squat', .19, .372, -.086, .21, .24],
    ['Front_Barbell_Squat', .187, .406, -.108, .23, .23],
    ['Narrow_Stance_Squats', .094, .442, -.134, .39, .09],
    ['Olympic_Squat', .177, .351, -.103, .28, .27],
  ]) {
    const frankenstein = id.startsWith('Frankenstein');
    const front = id.startsWith('Front');
    add(id, down, cues(down, [frankenstein ? 'Reach both arms straight ahead' : front ? 'Cross your arms at the front rack' : 'Set the bar on your traps',
      frankenstein ? 'Balance the bar on the front of your shoulders with open hands.' : 'Brace before bending your hips and knees.'],
    ['Keep your chest lifted', 'Sit between your legs and keep the knees tracking with your toes.'],
    ['Drive back to standing', 'Keep the bar at the same place on your shoulders.']), (t) => {
      squatPose(rep(down, t), width, depth, drift, lean, toe);
      if (front) return crossedFrontRack();
      if (!frankenstein) return backRack();
      const frame = rotation('Chest');
      const forward = Z.clone().applyQuaternion(frame);
      const center = v(0, .226, .105).applyQuaternion(frame).add(point('Chest'));
      for (const [side] of sides) free(side, point('Arm' + side).addScaledVector(forward, .513), forward);
      return [center, frame];
    }, { fingers: frankenstein ? '' : 'LR' });
  }

  add('Jefferson_Squats', down, cues(down, ['Straddle the shaft', 'Grip with one hand in front and one behind.'],
    ['Sit between your feet', 'Keep your arms long and the bar level.'],
    ['Stand without twisting', 'Drive through both feet.']), (t) => {
    const a = rep(down, t);
    torso(v(0, lerp(.852, .56, a), -.035), pitch(.10 + .26 * a).multiply(yaw(-.28)));
    leg('L', v(.243, ankleHeight, -.155), yaw(.43));
    leg('R', v(-.244, ankleHeight, .13), yaw(-.25));
    return bar(v(0, lerp(.713, .316, a), .032), .240, v(0, -1, .08), hangPole,
      { frame: yaw(-Math.PI / 2), lanes: { L: -.24, R: .24 } });
  });

  const push = [[0, 'Rack'], [.36, 'Dip'], [.66, 'Drive'], [1.25, 'Lockout'], [1.86, 'Lower'], [3.35, 'Rack']];
  add('Push_Press', push, [[0, 'Start at the collarbone', 'Set your feet under your hips and keep your ribs down.'],
    [.36, 'Dip straight down', 'Bend your knees a little, then drive hard through both feet.'],
    [1.25, 'Finish overhead', 'Extend your elbows and lower the bar to the rack.']], (t) => {
    const dip = motion([0, .36, .68, 3.35], [0, 1, 0, 0], t);
    const a = motion([0, .36, .70, 1.25, 1.86, 3.35], [0, 0, .47, 1, 1, 0], t);
    torso(v(0, .865 - .118 * dip, -.028 * dip), pitch(.05 * dip));
    stance(.16);
    const shoulder = point('ArmL');
    return bar(v(0, shoulder.y + lerp(.039, .595, a), lerp(.219, .044, a) + .04 * Math.sin(Math.PI * a)),
      .249, v(0, 1, lerp(-.35, 0, a)), elbowsOut);
  });

  add('Standing_Front_Barbell_Raise_Over_Head', up, cues(up, ['Start with the bar at your thighs', 'Use a close overhand grip.'],
    ['Trace a long forward arc', 'Lift overhead with a small bend in your elbows.'],
    ['Reverse the arc', 'Lower without leaning back.']), (t) => {
    torso(v(0, .865, 0));
    stance(.157);
    const angle = lerp(.30, Math.PI - .08, rep(up, t));
    const direction = v(0, -Math.cos(angle), Math.sin(angle));
    const center = point('ArmL').addScaledVector(direction, .585);
    return bar(v(0, center.y, center.z), .162, direction, (sign) => v(sign * .3, -1, -.4));
  });

  add('Stiff_Leg_Barbell_Good_Morning', down, cues(down, ['Brace the bar across your back', 'Keep a slight bend in both knees.'],
    ['Send your hips back', 'Hinge until your torso approaches parallel.'],
    ['Stand by extending your hips', 'Keep your back steady and your feet planted.']), (t) => {
    const a = rep(down, t);
    torso(v(0, .863 - .085 * a, -.31 * a), pitch(.05 + 1.36 * a), pitch(.30 * a));
    stance(.162);
    return backRack();
  });

  add('Upright_Barbell_Row', up, cues(up, ['Grip the bar overhand', 'Start with the shaft in front of your thighs.'],
    ['Lead with your elbows', 'Pull the shaft close and keep the elbows higher than the wrists.'],
    ['Extend your arms', 'Lower along the same path without leaning.']), (t) => {
    const a = rep(up, t);
    torso(v(0, .865, 0));
    stance(.162);
    return bar(v(0, lerp(.82, 1.22, a), lerp(.144, .212, a)), .219,
      v(0, -1, .12 + .50 * a), (sign) => v(sign * .76, lerp(-.2, .64, a), -.16));
  });

  const wrist = [[0, 'Neutral'], [.62, 'Right wrist extends'], [1.37, 'Left wrist extends'],
    [2.18, 'Right wrist flexes'], [2.90, 'Left wrist flexes'], [3.35, 'Neutral']];
  add('Wrist_Rotations_with_Straight_Bar', wrist, [[0, 'Take an overhand grip', 'Keep your elbows bent and close to your sides.'],
    [.62, 'Roll with alternating hands', 'Extend one wrist at a time as if rolling a newspaper.'],
    [2.18, 'Reverse the roll', 'Alternate wrist flexion while keeping the upper arms still.']], (t) => {
    torso(v(0, .865, 0));
    stance(.162);
    const rotate = motion(wrist.map(([time]) => time), [0, .8, 1.35, -.62, -1.18, 0], t);
    const stagger = motion(wrist.map(([time]) => time), [0, .3, -.3, -.3, .3, 0], t);
    return bar(v(0, 1.04 + .015 * rotate, .342), .199, Z, hangPole, {
      frame: pitch(rotate), directions: { L: v(0, .38 * rotate - stagger, 1), R: v(0, .38 * rotate + stagger, 1) },
    });
  });

  return entries;
}

const metadata = {
  'Barbell_Lunge': ['Barbell Lunge', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings']],
  'Barbell_Side_Bend': ['Barbell Side Bend', ['Core'], ['Upper back']],
  'Clean_Deadlift': ['Clean Deadlift', ['Hamstrings'], ['Forearms', 'Glutes', 'Upper back', 'Quadriceps']],
  'Clean_Shrug': ['Clean Shrug', ['Upper back'], ['Forearms', 'Shoulders']],
  'Close-Grip_Standing_Barbell_Curl': ['Close-Grip Standing Barbell Curl', ['Biceps'], ['Forearms']],
  'Frankenstein_Squat': ['Frankenstein Squat', ['Quadriceps'], ['Core', 'Calves', 'Glutes', 'Hamstrings']],
  'Front_Barbell_Squat': ['Front Barbell Squat', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings']],
  'Jefferson_Squats': ['Jefferson Squats', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings', 'Upper back']],
  'Narrow_Stance_Squats': ['Narrow Stance Squats', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings', 'Upper back']],
  'Olympic_Squat': ['Olympic Squat', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings']],
  'Push_Press': ['Push Press', ['Shoulders'], ['Quadriceps', 'Triceps']],
  'Snatch_Deadlift': ['Snatch Deadlift', ['Hamstrings'], ['Forearms', 'Glutes', 'Upper back', 'Quadriceps']],
  'Snatch_Pull': ['Snatch Pull', ['Hamstrings'], ['Calves', 'Glutes', 'Upper back', 'Quadriceps']],
  'Snatch_Shrug': ['Snatch Shrug', ['Upper back'], ['Forearms', 'Shoulders']],
  'Standing_Front_Barbell_Raise_Over_Head': ['Standing Front Barbell Raise Over Head', ['Shoulders'], []],
  'Stiff_Leg_Barbell_Good_Morning': ['Stiff Leg Barbell Good Morning', ['Upper back'], ['Glutes', 'Hamstrings']],
  'Upright_Barbell_Row': ['Upright Barbell Row', ['Shoulders'], ['Upper back']],
  'Wide-Grip_Standing_Barbell_Curl': ['Wide-Grip Standing Barbell Curl', ['Biceps'], []],
  'Wide_Stance_Stiff_Legs': ['Wide Stance Stiff Legs', ['Hamstrings'], ['Adductors', 'Glutes', 'Upper back']],
  'Wrist_Rotations_with_Straight_Bar': ['Wrist Rotations with Straight Bar', ['Forearms'], []],
};
