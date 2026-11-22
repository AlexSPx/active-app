import * as THREE from 'three';
import { legacyBarGripTransform } from './barbell-standing.mjs';

const vector = (x, y, z) => new THREE.Vector3(x, y, z);
const xAxis = vector(1, 0, 0);
const yAxis = vector(0, 1, 0);
const turn = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const swing = (from, to) => new THREE.Quaternion().setFromUnitVectors(
  from.clone().normalize(), to.clone().normalize());
// Work on the open +Z side and face the hooks as after a normal walkout.
const facingRack = turn(yAxis, Math.PI);
const walkout = vector(0, 0, .65);
const duration = 3.6;
const times = Array.from({ length: 217 }, (_, i) => i / 60);
const squatSupport = ['Glutes', 'Hamstrings', 'Upper back'];

const specs = [
  { id: 'Barbell_Squat', name: 'Barbell Squat', bottom: [.614, .45],
    cue: ['Squat to depth', 'Bend your hips and knees together until the angle behind your knees is just under 90 degrees. Drive up through your whole foot.'] },
  { id: 'Barbell_Full_Squat', name: 'Barbell Full Squat', bottom: [.252, .72],
    cue: ['Sit into the full squat', 'Keep your heels down as you descend until the backs of your thighs approach your calves.'] },
  { id: 'Wide_Stance_Barbell_Squat', name: 'Wide Stance Barbell Squat', bottom: [.302, .52],
    stance: [.290, .48, .60], supporting: [...squatSupport, 'Adductors'],
    cue: ['Set a wide stance', 'Set your feet wider than your shoulders and let your knees follow the direction of your toes.'] },
  { id: 'Speed_Squats', name: 'Speed Squats', bottom: [.298, .65], fast: true,
    cue: ['Stand up fast', 'Use a load you can move quickly. Lower under control, then drive up fast while keeping your feet planted.'] },
  { id: 'Good_Morning', name: 'Good Morning', hinge: 1.33,
    primary: ['Hamstrings'], supporting: ['Glutes', 'Upper back'],
    cue: ['Hinge at your hips', 'Keep a small bend in your knees, send your hips back, then extend at the hips to stand tall.'] },
];

function solveJoint(target, pole, first, second) {
  const distance = target.length();
  if (distance > first + second || distance < Math.abs(first - second)) {
    throw new RangeError('Rack pose outside limb reach: ' + distance.toFixed(4));
  }
  const axis = target.clone().normalize();
  const along = (distance ** 2 + first ** 2 - second ** 2) / (2 * distance);
  const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
  return axis.multiplyScalar(along).addScaledVector(bend, Math.sqrt(Math.max(0, first ** 2 - along ** 2)));
}

function backGrip(sign, gripTransform, hinge) {
  const { position: seat, quaternion: seatRotation } = gripTransform(sign);
  const handle = xAxis.clone().applyQuaternion(seatRotation);
  const roll = gripTransform === legacyBarGripTransform ? -1.20 : hinge ? -.40 : .20;
  const quaternion = turn(xAxis, roll).multiply(swing(handle, xAxis.clone().negate()));
  return { quaternion, offset: seat.applyQuaternion(quaternion) };
}

function build(scene, spec, grip, gripTransform) {
  const bone = (name) => scene.getObjectByName(name);
  const shoulderBase = bone('Lumbar').position.clone().add(bone('Chest').position);
  const barSeat = spec.hinge ? vector(0, .455, -.123) : vector(0, .540, -.100);
  const [width, toe, kneeOut] = spec.stance ?? [.174, .22, .22];
  const sides = [1, -1].map((sign) => {
    const suffix = sign === 1 ? 'L' : 'R';
    const [thigh, shin, foot, arm, forearm, hand] =
      ['Thigh', 'Shin', 'Foot', 'Arm', 'Forearm', 'Hand'].map((name) => bone(name + suffix));
    const restAnkle = thigh.position.clone().add(shin.position).add(foot.position);
    const ankle = vector(sign * width, .897 + restAnkle.y, restAnkle.z);
    return { sign, thigh, shin, foot, arm, forearm, hand, ankle, gripFrame: backGrip(sign, gripTransform, spec.hinge) };
  });
  const channels = new Map();
  const bar = [];
  const sample = (name, value) => {
    if (!channels.has(name)) channels.set(name, []);
    channels.get(name).push(...value.toArray());
  };
  const descent = .30;
  const bottom = spec.fast ? 1.80 : 1.85;
  const ascent = spec.fast ? bottom : 2.05;
  const finish = spec.fast ? 2.45 : 3.30;
  const ease = (value, from, to) => THREE.MathUtils.smoothstep(value, from, to);

  for (const time of times) {
    const depth = ease(time, descent, bottom) * (1 - ease(time, ascent, finish));
    const lean = THREE.MathUtils.lerp(.13, spec.hinge ?? spec.bottom[1], depth);
    const torso = turn(xAxis, lean);
    const barOffset = barSeat.clone().applyQuaternion(torso);
    const barZ = THREE.MathUtils.lerp(-.018, spec.hinge ? .128 : .056, depth);
    const back = barZ - barOffset.z;
    // With planted ankles and symmetric hips, constant sagittal hip-to-ankle
    // distance keeps the knee bend fixed during the good morning.
    const height = spec.hinge ? .074 + Math.sqrt(.799 ** 2 - back ** 2)
      : THREE.MathUtils.lerp(spec.stance ? .867 : .883, spec.bottom[0], depth);
    const pelvis = vector(0, height, back);
    const barCenter = pelvis.clone().add(barOffset);
    bar.push(...barCenter.clone().applyQuaternion(facingRack).add(walkout).toArray());
    sample('Pelvis.position', pelvis.clone().applyQuaternion(facingRack).add(walkout));
    sample('Pelvis.quaternion', facingRack.clone().multiply(torso));
    sample('Head.quaternion', turn(xAxis, -lean * (spec.hinge ? .10 : .52)));

    for (const { sign, thigh, shin, foot, ankle } of sides) {
      const hip = thigh.position.clone().applyQuaternion(torso).add(pelvis);
      const legTarget = ankle.clone().sub(hip);
      const knee = solveJoint(legTarget, vector(sign * kneeOut, 0, 1), shin.position.length(), foot.position.length());
      const thighWorld = swing(shin.position, knee);
      const shinWorld = swing(foot.position, legTarget.sub(knee));
      sample(thigh.name + '.quaternion', torso.clone().invert().multiply(thighWorld));
      sample(shin.name + '.quaternion', thighWorld.clone().invert().multiply(shinWorld));
      sample(foot.name + '.quaternion', shinWorld.invert().multiply(turn(yAxis, sign * toe)));
    }
  }

  const calibrated = gripTransform !== legacyBarGripTransform;
  const gripWidth = calibrated ? .310 : .405;
  const elbowZ = calibrated ? (spec.hinge ? .45 : 0) : -.55;
  const armTracks = sides.flatMap(({ sign, arm, forearm, hand, gripFrame }) => {
    const shoulder = arm.position.clone().add(shoulderBase);
    const armTarget = barSeat.clone().add(vector(sign * gripWidth, 0, 0)).sub(gripFrame.offset).sub(shoulder);
    const elbow = solveJoint(armTarget, vector(sign * .50, -1, elbowZ), forearm.position.length(), hand.position.length());
    const upper = swing(forearm.position, elbow);
    const lower = swing(hand.position.clone().applyQuaternion(gripFrame.quaternion), armTarget.sub(elbow))
      .multiply(gripFrame.quaternion);
    return [[arm, upper.clone()], [forearm, upper.invert().multiply(lower)],
      [hand, lower.invert().multiply(gripFrame.quaternion)]].map(([bone, rotation]) =>
      new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', [0], rotation.toArray()));
  });
  const tracks = [...channels].map(([name, values]) => name.endsWith('.position')
    ? new THREE.VectorKeyframeTrack(name, times, values)
    : new THREE.QuaternionKeyframeTrack(name, times, values));
  return {
    name: spec.name,
    clip: new THREE.AnimationClip(spec.name, duration, [...tracks, ...armTracks, ...grip]),
    primary: spec.primary ?? ['Quadriceps'],
    supporting: spec.supporting ?? squatSupport,
    phases: [[0, 'Working stance'], [descent, spec.hinge ? 'Hinge' : 'Descent'],
      [bottom, spec.fast ? 'Drive' : 'Bottom'], ...(spec.fast ? [] : [[ascent, 'Ascent']]), [finish, 'Working stance']],
    cues: [[0, 'Brace in your working stance', 'Start each rep with the bar across your upper back and both feet planted after the walkout.'],
      [spec.fast ? ascent : bottom, ...spec.cue],
      [finish, 'Finish in your working stance', 'Stand with both feet planted and the bar steady on your upper back.']],
    equipment: 'rack-barbell',
    framing: 'standing',
    rackTransform: { position: [0, 0, 0], hookHeight: spec.hinge ? 1.30 : spec.stance ? 1.36 : 1.38 },
    propClip: new THREE.AnimationClip(spec.name + ' barbell', duration, [
      new THREE.VectorKeyframeTrack('.position', times, bar),
    ]),
  };
}

export function createEntries({ scene, onlyExercises }, { createPowerGripTracks,
  createDumbbellGripTracks = createPowerGripTracks, dumbbellGripTransform = legacyBarGripTransform }) {
  const grip = createDumbbellGripTracks(scene);
  const selected = specs.filter((spec) => !onlyExercises || onlyExercises.includes(spec.id));
  return Object.fromEntries(selected.map((spec) => ['local:exercise:' + spec.id, build(scene, spec, grip, dumbbellGripTransform)]));
}
