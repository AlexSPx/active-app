import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const xAxis = v(1, 0, 0);
const up = v(0, 1, 0);
const forward = v(0, 0, 1);
const swing = (from, to) => new THREE.Quaternion().setFromUnitVectors(
  from.clone().normalize(), to.clone().normalize());
const rotation = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const ease = (value) => THREE.MathUtils.smoothstep(value, 0, 1);
const effort = (time) => ease(time / .95) * ease((2.6 - time) / 1.15);

function orient(from, direction, normal, target) {
  const attitude = swing(from, direction);
  const axis = direction.clone().normalize();
  const actual = normal.clone().applyQuaternion(attitude);
  const twist = Math.atan2(axis.dot(actual.clone().cross(target)), actual.dot(target));
  return attitude.premultiply(rotation(axis, twist));
}

const hanging = (sign) => v(sign * .25, -1, .06).normalize();
const neutral = (sign) => v(-sign, 0, 0);

function curl(grip, direction = 0) {
  return (sign, amount, time) => {
    const reverse = grip === 'reverse';
    const crossBody = direction < 0;
    const outward = crossBody ? THREE.MathUtils.lerp(.33, -.76, amount) : reverse ? .39 : .25;
    const forward = crossBody ? THREE.MathUtils.lerp(.27, .90, amount) : reverse ? .38 : .16;
    const upper = v(sign * outward, -1, forward).normalize();
    const start = v(sign * (reverse ? .30 : .15), -1, reverse ? .48 : grip === 'zottman' ? .40 : .15).normalize();
    const plane = v(sign * (crossBody ? direction * ease((amount - .12) / .62) : direction), 0, 1);
    const axis = start.clone().cross(plane).normalize();
    const lift = rotation(axis, amount * (crossBody ? 2.48 : grip === 'reverse' || grip === 'zottman' ? 2.03 : 2.21));
    const lower = start.clone().applyQuaternion(lift);
    let turn = { neutral: 0, straight: 1, reverse: -1, turning: ease(amount * 1.45) }[grip];
    if (grip === 'zottman') {
      turn = (1 - 2 * ease((time - 1.02) / .42))
        * Math.max(ease(amount * 2.5), ease(time / .65) * ease((2.65 - time) / .3));
    }
    const palm = neutral(sign).applyAxisAngle(start, -sign * turn * Math.PI / 2).applyQuaternion(lift);
    return { upper, lower, palm };
  };
}

function raise(lateral) {
  return (sign, amount) => {
    const start = (lateral ? hanging(sign) : v(sign * .04, -1, .30)).normalize();
    const end = (lateral ? v(sign, .01, .16) : v(sign * .05, .18, 1)).normalize();
    const axis = start.clone().cross(end).normalize();
    const lift = rotation(axis, start.angleTo(end) * amount);
    const upper = start.clone().applyQuaternion(lift);
    const lower = start.clone().applyAxisAngle(axis, .13).applyQuaternion(lift);
    const palm = (lateral ? neutral(sign) : forward.clone().negate()).applyQuaternion(lift);
    return { upper, lower, palm };
  };
}

function press(sign, amount) {
  const wrist = v(sign * THREE.MathUtils.lerp(.276, .061, amount),
    THREE.MathUtils.lerp(.217, .507, amount), .105);
  return { wrist, pole: v(sign, -.55, -.15), palm: forward };
}

const hang = (sign) => ({ upper: v(sign * .32, -1, .16), lower: v(sign * .25, -1, .14), palm: neutral(sign) });

function pressDirections(wrist, pole, upperLength, lowerLength) {
  const distance = wrist.length();
  const axis = wrist.clone().normalize();
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
  const upper = axis.multiplyScalar(along).addScaledVector(bend, Math.sqrt(upperLength ** 2 - along ** 2));
  return { upper, lower: wrist.clone().sub(upper) };
}

const biceps = ['Biceps'];
const forearms = ['Forearms'];
const shoulders = ['Shoulders'];
const triceps = ['Triceps'];
const entries = [
  ['Alternate_Hammer_Curl', 'Alternate Hammer Curl', biceps, forearms, curl('neutral'), 'Alternate right and left with palms facing in.', 'alternate'],
  ['Hammer_Curls', 'Hammer Curls', biceps, [], curl('neutral'), 'Curl both weights with palms facing in.'],
  ['Cross_Body_Hammer_Curl', 'Cross Body Hammer Curl', biceps, forearms, curl('neutral', -2.5), 'Curl each weight toward the opposite shoulder without turning your wrist.', 'alternate'],
  ['Dumbbell_Bicep_Curl', 'Dumbbell Bicep Curl', biceps, forearms, curl('straight'), 'Curl both weights with palms up and elbows still.'],
  ['Dumbbell_Alternate_Bicep_Curl', 'Dumbbell Alternate Bicep Curl', biceps, forearms, curl('turning'), 'Turn your palm up as you curl, then alternate arms.', 'alternate'],
  ['Standing_Dumbbell_Reverse_Curl', 'Standing Dumbbell Reverse Curl', biceps, forearms, curl('reverse'), 'Keep an overhand grip and fold only at your elbows.'],
  ['Standing_Inner-Biceps_Curl', 'Standing Inner-Biceps Curl', biceps, [], curl('turning', .68), 'Curl outward toward your outer shoulders as you turn your palms up.'],
  ['Zottman_Curl', 'Zottman Curl', biceps, forearms, curl('zottman'), 'Curl palms up, then turn palms down at the top before lowering.'],
  ['Front_Dumbbell_Raise', 'Front Dumbbell Raise', shoulders, [], raise(false), 'Lift one weight just above shoulder height with your palm down.', 'alternate-left'],
  ['Front_Two-Dumbbell_Raise', 'Front Two-Dumbbell Raise', shoulders, [], raise(false), 'Lift both weights just above shoulder height with palms down.'],
  ['Side_Lateral_Raise', 'Side Lateral Raise', shoulders, [], raise(true), 'Raise the weights out to shoulder height with soft elbows.'],
  ['Standing_Dumbbell_Press', 'Standing Dumbbell Press', shoulders, triceps, press, 'Press both weights overhead with quiet knees.'],
  ['Standing_Alternating_Dumbbell_Press', 'Standing Alternating Dumbbell Press', shoulders, triceps, press, 'Press one weight overhead while holding the other at shoulder height.', 'alternate'],
  ['Dumbbell_One-Arm_Shoulder_Press', 'Dumbbell One-Arm Shoulder Press', shoulders, triceps, press, 'Press overhead with your palm forward and your free arm down.', 'right'],
  ['Dumbbell_Shrug', 'Dumbbell Shrug', ['Upper back'], [], hang, 'Elevate your shoulders while keeping your elbows straight.', 'shrug'],
  ['Stiff-Legged_Dumbbell_Deadlift', 'Stiff-Legged Dumbbell Deadlift', ['Hamstrings'], ['Glutes', 'Upper back'],
    (sign, amount) => ({ upper: v(sign * (.35 - .13 * amount), -1, .16 - .39 * amount),
      lower: v(sign * (.11 - .05 * amount), -1, .14 - .37 * amount), palm: neutral(sign) }),
    'Push your hips back with soft knees and lower the weights over your feet.', 'hinge'],
];

function makeClip(scene, name, pose, mode, gripTracks) {
  const alternating = mode === 'alternate' || mode === 'alternate-left';
  const duration = alternating ? 5.6 : 2.8;
  const times = Array.from({ length: Math.round(duration * 50) + 1 }, (_, frame) => frame / 50);
  const tracks = [];
  const samples = (bone, property, values) => {
    const Track = property === 'position' ? THREE.VectorKeyframeTrack : THREE.QuaternionKeyframeTrack;
    tracks.push(new Track(bone.name + '.' + property, times, values.flatMap((value) => value.toArray())));
  };
  const pelvis = scene.getObjectByName('Pelvis');
  const amounts = times.map(effort);
  const hinge = amounts.map((amount) => rotation(xAxis, mode === 'hinge' ? amount * .98 : 0));
  if (mode === 'hinge') {
    const [thigh, shin, foot] = ['ThighL', 'ShinL', 'FootL'].map((part) => scene.getObjectByName(part));
    const thighAngles = amounts.map((amount) => -.10 - .26 * amount);
    const shinAngles = amounts.map((amount) => .04 - .10 * amount);
    // Counter the pelvis and leg rotations so both ankle anchors stay fixed.
    samples(pelvis, 'position', hinge.map((tilt, index) => pelvis.position.clone()
      .add(thigh.position).sub(thigh.position.clone().applyQuaternion(tilt))
      .add(shin.position).sub(shin.position.clone().applyAxisAngle(xAxis, thighAngles[index]))
      .add(foot.position).sub(foot.position.clone().applyAxisAngle(xAxis, shinAngles[index]))));
    samples(pelvis, 'quaternion', hinge);
    for (const side of ['L', 'R']) {
      samples(scene.getObjectByName('Thigh' + side), 'quaternion', hinge.map((tilt, index) =>
        tilt.clone().invert().multiply(rotation(xAxis, thighAngles[index]))));
      samples(scene.getObjectByName('Shin' + side), 'quaternion', thighAngles.map((angle, index) =>
        rotation(xAxis, shinAngles[index] - angle)));
      samples(scene.getObjectByName('Foot' + side), 'quaternion', shinAngles.map((angle) => rotation(xAxis, -angle)));
    }
  }
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const [arm, forearm, hand] = ['Arm', 'Forearm', 'Hand'].map((part) => scene.getObjectByName(part + side));
    // Use the same hand frame as attachDumbbells so roll preserves the handle seat.
    const along = v(sign * .025, -.137, .065).normalize();
    const across = xAxis.clone().addScaledVector(along, -along.x).normalize();
    const palmRest = along.clone().cross(across);
    const values = [[], [], []];
    for (const [index, time] of times.entries()) {
      const first = mode === 'alternate-left' ? 1 : -1;
      const localTime = time - (alternating && sign !== first ? 2.8 : 0);
      const spec = mode === 'right' && sign === 1 ? hang(sign) : pose(sign, effort(localTime), localTime);
      const { upper, lower } = spec.wrist
        ? pressDirections(spec.wrist, spec.pole, forearm.position.length(), hand.position.length()) : spec;
      const upperRotation = swing(forearm.position, upper);
      const handRotation = orient(along, lower, palmRest, spec.palm);
      const lowerRotation = orient(hand.position, lower, palmRest, spec.palm);
      values[0].push(hinge[index].clone().invert().multiply(upperRotation));
      values[1].push(upperRotation.clone().invert().multiply(lowerRotation));
      values[2].push(lowerRotation.invert().multiply(handRotation));
    }
    // shortcut: translate the shoulder joint, upgrade when the rig has clavicle bones.
    if (mode === 'shrug') samples(arm, 'position', times.map((time) =>
      arm.position.clone().add(v(0, .045 * effort(time), 0))));
    [arm, forearm, hand].forEach((bone, index) => samples(bone, 'quaternion', values[index]));
  }
  return new THREE.AnimationClip(name, duration, [
    ...tracks, ...gripTracks.filter((track) => mode !== 'right' || track.name.endsWith('R.quaternion')),
  ]);
}

export function createEntries({ scene, onlyExercises }, { createPowerGripTracks }) {
  const grip = createPowerGripTracks(scene);
  const selected = entries.filter(([id]) => !onlyExercises || onlyExercises.includes(id));
  return Object.fromEntries(selected.map(([id, name, primary, supporting, pose, cue, mode]) => {
    const clip = makeClip(scene, name, pose, mode, grip);
    const hinge = mode === 'hinge';
    const peakLabel = id === 'Zottman_Curl' ? 'Rotate grip' : 'Pause';
    const phases = [[0, 'Setup'], [.18, hinge ? 'Hinge' : 'Lift'], [.95, hinge ? 'Bottom' : peakLabel],
      [1.5, hinge ? 'Stand' : 'Lower'], [2.6, 'Reset']];
    if (clip.duration > 3) phases.push([2.98, 'Switch arms'], [3.75, 'Pause'], [4.3, 'Lower'], [5.4, 'Reset']);
    return ['local:exercise:' + id, { name, clip, primary, supporting, phases,
      cues: [[0, 'Set your stance', 'Stand tall with your feet comfortably apart.'],
        [.4, hinge ? 'Hinge at the hips' : 'Move with control', cue]],
      equipment: mode === 'right' ? 'dumbbell-right' : 'dumbbells' }];
  }));
}
