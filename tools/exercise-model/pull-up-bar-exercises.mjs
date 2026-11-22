import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const xAxis = v(1, 0, 0);
const turn = (angle) => new THREE.Quaternion().setFromAxisAngle(xAxis, angle);
const swing = (from, to) => new THREE.Quaternion().setFromUnitVectors(
  from.clone().normalize(), to.clone().normalize());
const rad = THREE.MathUtils.degToRad;
const lerp = THREE.MathUtils.lerp;
const easy = (t, start, end) => THREE.MathUtils.smoothstep(t, start, end);
const back = ['Upper back'];
const core = ['Core'];
const armSupport = ['Biceps', 'Forearms'];

const specs = [
  { id: 'Pullups', name: 'Pullups', width: .191, primary: back, supporting: armSupport,
    top: [1.869, .012, -31.5], hang: [-.068, -21.8], bodyArc: -.157,
    overhand: { pole: [.035, -.421, -.151], roll: [.104, .20, -.193] },
    grip: 'Grip the bar directly above the centers of your shoulders with your palms facing away.',
    action: 'Draw your elbows down and back and pull your upper chest toward the bar.' },
  { id: 'Chin-Up', name: 'Chin-Up', width: .131, under: ['L', 'R'], primary: back, supporting: armSupport,
    top: [1.72, -.140, -8], grip: 'Set your hands inside shoulder width with your palms facing you.',
    action: 'Keep your elbows close to your sides and raise your head to bar height.' },
  { id: 'Mixed_Grip_Chin', name: 'Mixed Grip Chin', width: .206, under: ['R'], primary: back, supporting: armSupport,
    top: [1.76, -.119, -9.5], hang: [-.119, -10.1], bodyArc: -.13, shift: .04,
    overhand: { pole: [.102, -1, -.085], roll: [-.118, -.142, -.065] },
    underhand: { pole: [-.051, -1, .079], roll: [.62, .631] },
    grip: 'Place your hands just outside the centers of your shoulders, with one palm facing away and the other facing you.',
    action: 'Keep the underhand elbow tucked and let the overhand elbow travel farther out. Switch grips on the next set.' },
  { id: 'Wide-Grip_Rear_Pull-Up', name: 'Wide-Grip Rear Pull-Up', width: .290, rear: true,
    primary: back, supporting: [...armSupport, 'Shoulders'],
    top: [1.74, .103, 5], grip: 'Take a wide overhand grip and align the back of your neck with the bar.',
    action: 'Draw your elbows down and back and raise the back of your neck toward the bar.' },
  { id: 'Scapular_Pull-Up', name: 'Scapular Pull-Up', width: .185, mode: 'scapula',
    primary: back, supporting: ['Forearms'], grip: 'Take an overhand grip and hang with your elbows straight.',
    action: 'Draw your shoulder blades down to lift your body a few inches. Keep your elbows straight.' },
  { id: 'Hanging_Leg_Raise', name: 'Hanging Leg Raise', width: .192, mode: 'legs',
    primary: core, supporting: ['Forearms'], grip: 'Hang with your legs together and roll your pelvis slightly back.',
    action: 'Raise both straight legs to a right angle with your torso. Pause, then lower without swinging.' },
  { id: 'Wind_Sprints', name: 'Wind Sprints', width: .182, mode: 'alternating',
    primary: core, supporting: ['Forearms'], grip: 'Hang from an overhand grip with arms and legs extended.',
    action: 'Drive one knee high, then lower it as you raise the opposite knee. Keep your torso steady.' },
  { id: 'Gorilla_Chin_Crunch', name: 'Gorilla Chin/Crunch', width: .220, under: ['L', 'R'], mode: 'crunch',
    primary: core, supporting: [...back, ...armSupport], top: [1.634, -.144, -6],
    grip: 'Space your hands a little farther apart than the centers of your shoulders, with your palms facing you. Hang with your knees bent at a right angle.',
    action: 'Pull until your nose is level with the bar while crunching your knees toward your chest.' },
];

function gripPose(sign, underhand, gripTransform) {
  const along = v(sign * .025, -.137, .065).normalize();
  const { position: seat, quaternion } = gripTransform(sign);
  const handle = xAxis.clone().applyQuaternion(quaternion);
  const align = swing(handle, v(underhand ? 1 : -1, 0, 0));
  const tangent = along.applyQuaternion(align);
  const roll = Math.atan2(-tangent.z, tangent.y);
  const hand = turn(roll + (underhand ? -.28 : .28)).multiply(align);
  return { hand, seat: seat.applyQuaternion(hand) };
}

function elbowFor(target, pole, upper, lower) {
  const distance = target.length();
  if (distance >= upper + lower || distance <= Math.abs(upper - lower)) return null;
  const axis = target.clone().divideScalar(distance);
  const along = (upper ** 2 - lower ** 2 + distance ** 2) / (2 * distance);
  const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
  return axis.multiplyScalar(along).addScaledVector(bend, Math.sqrt(upper ** 2 - along ** 2));
}

function build(scene, spec, fingers, gripTransform) {
  const bone = (name) => scene.getObjectByName(name);
  const lumbar = bone('Lumbar').position;
  const chest = bone('Chest').position;
  const chestOffset = lumbar.clone().add(chest);
  const scapula = spec.mode === 'scapula';
  const crunch = spec.mode === 'crunch';
  const arms = ['L', 'R'].map((side, i) => {
    const sign = i === 0 ? 1 : -1;
    const under = spec.under?.includes(side);
    const fit = under ? spec.underhand : spec.overhand;
    const { hand, seat } = gripPose(sign, under, gripTransform);
    return { side, sign, under, fit, hand, seat, gripCenter: v(sign * spec.width, 2.300, 0),
      shoulder: bone('Arm' + side).position.clone(),
      upper: bone('Forearm' + side).position, lower: bone('Hand' + side).position };
  });
  const duration = spec.mode === 'alternating' ? 3.2 : 3.6;
  const times = Array.from({ length: Math.round(duration * 120) + 1 }, (_, i) => i / 120);
  const tracks = new Map();
  const write = (name, value, Track = THREE.QuaternionKeyframeTrack) => {
    if (!tracks.has(name)) tracks.set(name, { Track, values: [] });
    tracks.get(name).values.push(...value.toArray());
  };

  const [hangZ, hangPitch] = spec.hang ?? (spec.rear ? [.088, 5] : [-.06, -3]);
  const pitch = rad(hangPitch);
  const torsoAtRest = turn(pitch);
  function gripRoll(under, fit, amount) {
    if (fit) {
      const [start, end, arc = 0] = fit.roll;
      return lerp(start, end, amount) + 4 * amount * (1 - amount) * arc;
    }
    return (under ? .52 : spec.rear ? -.78 : 0) * (spec.top ? amount : 0);
  }

  // Derive the hanging height from the loaded wrist and shoulder positions.
  const hangY = Math.max(...arms.map(({ shoulder, gripCenter, seat, upper, lower, under, fit }) => {
    const loadedWrist = gripCenter.clone().sub(seat.clone().applyQuaternion(turn(gripRoll(under, fit, 0))));
    const offset = chestOffset.clone().add(shoulder).applyQuaternion(torsoAtRest);
    const reach = upper.length() + lower.length() - (scapula ? .00025 : .0008);
    return loadedWrist.y - offset.y - Math.sqrt(reach ** 2 - (loadedWrist.x - offset.x) ** 2
      - (loadedWrist.z - hangZ - offset.z) ** 2);
  }));

  for (const time of times) {
    const amount = easy(time, .22, 1.45) * (1 - easy(time, 1.95, 3.35));
    const torso = turn(lerp(pitch, spec.top ? rad(spec.top[2]) : pitch, amount));
    const lift = scapula ? .044 * amount : 0;
    // Keep space between the upper body and shaft during the middle of the pull.
    const bodyArc = 4 * amount * (1 - amount) * (spec.bodyArc ?? 0);
    const torsoBase = v((spec.shift ?? 0) * amount, lerp(hangY, spec.top?.[0] ?? hangY, amount) + lift,
      lerp(hangZ, spec.top?.[1] ?? hangZ, amount) + bodyArc);
    const pelvis = torsoBase.clone();
    let pelvisRotation = torso;
    if (crunch) {
      // Curl the pelvis under the fixed upper torso as the knees come in.
      const tuck = turn(rad(-17 * amount));
      pelvisRotation = torso.clone().multiply(tuck);
      pelvis.add(lumbar.clone().applyQuaternion(torso).sub(lumbar.clone().applyQuaternion(pelvisRotation)));
      write('Lumbar.quaternion', tuck.invert());
    }
    const spineDrop = v(0, -lift * .30, 0).applyQuaternion(torso.clone().invert());
    const socketDrop = v(0, -lift * .40, 0).applyQuaternion(torso.clone().invert());
    if (scapula) {
      // Spread the lift across the upper trunk and shoulder girdle on the clavicle-free rig.
      write('Lumbar.position', lumbar.clone().add(spineDrop), THREE.VectorKeyframeTrack);
      write('Chest.position', chest.clone().add(spineDrop), THREE.VectorKeyframeTrack);
    }
    write('Pelvis.position', pelvis, THREE.VectorKeyframeTrack);
    write('Pelvis.quaternion', pelvisRotation);
    write('Head.quaternion', turn(rad(spec.rear ? 11 * amount : spec.top ? -5 * amount : 0)));
    for (const { side, sign, under, fit, hand, seat, gripCenter, shoulder, upper, lower } of arms) {
      const socket = shoulder.clone().add(socketDrop);
      // Let the hand roll around the shaft while keeping the grip center fixed.
      const roll = turn(gripRoll(under, fit, amount));
      const shoulderWorld = chestOffset.clone().add(socket).addScaledVector(spineDrop, 2)
        .applyQuaternion(torso).add(torsoBase);
      const target = gripCenter.clone().sub(seat.clone().applyQuaternion(roll)).sub(shoulderWorld);
      const [poleX, poleY, poleZ] = fit?.pole
        ?? (under ? [-.08, -.95, .65] : spec.rear ? [.65, -.95, .28] : [.40, -.95, -.20]);
      const pole = v(sign * poleX, poleY, poleZ);
      const handWorld = roll.multiply(hand);
      const elbow = elbowFor(target, pole, upper.length(), lower.length());
      if (!elbow) throw new Error(spec.id + ' wrist beyond reach at ' + time + ' (' + target.length() + ')');
      const arm = swing(upper, elbow);
      // Carry the grip's twist up the forearm instead of concentrating it at the wrist.
      const forearm = swing(lower.clone().applyQuaternion(handWorld), target.sub(elbow)).multiply(handWorld);
      if (scapula) write('Arm' + side + '.position', socket, THREE.VectorKeyframeTrack);
      write('Arm' + side + '.quaternion', torso.clone().invert().multiply(arm));
      write('Forearm' + side + '.quaternion', arm.invert().multiply(forearm));
      write('Hand' + side + '.quaternion', forearm.invert().multiply(handWorld));

      const sprint = spec.mode === 'alternating'
        ? easy(time, sign > 0 ? .12 : .85, sign > 0 ? .75 : 1.56)
          * (1 - easy(time, sign > 0 ? .85 : 1.65, sign > 0 ? 1.56 : 2.45))
        : 0;
      const hip = spec.mode === 'legs' ? lerp(0, -90, amount) : crunch ? -130 * amount : -104 * sprint;
      const knee = crunch ? lerp(90, 135, amount) : 121 * sprint;
      write('Thigh' + side + '.quaternion', turn(rad(hip)));
      write('Shin' + side + '.quaternion', turn(rad(knee)));
    }
  }
  return new THREE.AnimationClip(spec.name, duration,
    [...Array.from(tracks, ([name, { Track, values }]) => new Track(name, times, values)), ...fingers]);
}

export function createEntries({ scene, onlyExercises }, { createDumbbellGripTracks, dumbbellGripTransform: gripTransform }) {
  const fingers = createDumbbellGripTracks(scene);
  const selected = specs.filter((spec) => !onlyExercises || onlyExercises.includes(spec.id));
  return Object.fromEntries(selected.map((spec) => {
    const { id, name, primary, supporting, grip, action } = spec;
    const alternating = spec.mode === 'alternating';
    const phases = alternating
      ? [[0, 'Hang'], [.12, 'Raise left knee'], [.85, 'Switch knees'], [1.65, 'Lower right knee'], [2.45, 'Hang']]
      : [[0, 'Hang'], [.22, 'Lift'], [1.45, 'Hold'], [1.95, 'Lower'], [3.35, 'Hang']];
    return ['local:exercise:' + id, { name, primary, supporting, phases,
      cues: [[0, 'Set your grip', grip], [alternating ? .12 : .22, 'Lift with control', action]],
      equipment: 'pull-up-bar', framing: 'pull-up-bar', clip: build(scene, spec, fingers, gripTransform) }];
  }));
}
