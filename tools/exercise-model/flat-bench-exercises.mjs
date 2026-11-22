import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const up = v(0, 1, 0);
const forward = v(0, 0, 1);
const pitch = (angle) => new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), angle);
const flat = Math.PI / 2;
const lerp = THREE.MathUtils.lerp;
const supportFlexion = {
  Thumb: [-24, -8, 0],
  Index: [-8, -5, 0],
  Middle: [-6, -3, 0],
  Ring: [-3, -2, 0],
  Little: [-6, -3, 0],
};
const sides = [['L', 1], ['R', -1]];

function orient(from, direction, facing, target) {
  const axis = direction.clone().normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), axis);
  const actual = facing.clone().applyQuaternion(turn);
  const planar = target.clone().addScaledVector(axis, -target.dot(axis));
  const twist = Math.atan2(axis.dot(actual.clone().cross(planar)), actual.dot(planar));
  return turn.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, twist));
}

export function createEntries({ scene, onlyExercises }, { createPowerGripTracks }) {
  const figure = clone(scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const pelvis = bone('Pelvis');
  const joints = ['Pelvis', 'Lumbar', 'Chest', 'Head', ...sides.flatMap(([side]) =>
    ['Arm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot'].map((name) => name + side))];
  const grip = createPowerGripTracks(figure);
  const support = Object.fromEntries(sides.map(([side]) => [side,
    Object.entries(supportFlexion).flatMap(([digit, angles]) => angles.map((angle, index) => {
      const name = digit + (index + 1) + side;
      const relaxed = bone(name).quaternion.clone().multiply(pitch(THREE.MathUtils.degToRad(angle)));
      return new THREE.QuaternionKeyframeTrack(name + '.quaternion', [0], relaxed.toArray());
    }))]));
  const entries = {};

  function world(name, rotation) {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  }

  function torso(position, angle) {
    pelvis.position.copy(position);
    for (const name of ['Pelvis', 'Lumbar', 'Chest', 'Head']) world(name, pitch(angle));
  }

  function segments(first, second, third, upper, lower, bend, endRotation, lowerRotation) {
    world(first, orient(bone(second).position, upper, forward, bend));
    world(second, lowerRotation ?? orient(bone(third).position, lower, forward, bend));
    world(third, endRotation);
  }

  function reach(first, second, third, end, pole) {
    const axis = end.clone().sub(point(first));
    const upper = bone(second).position.length();
    const lower = bone(third).position.length();
    const length = THREE.MathUtils.clamp(axis.length(), Math.abs(upper - lower) + .0001, upper + lower - .0001);
    axis.normalize();
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length);
    const firstSegment = axis.clone().multiplyScalar(along)
      .addScaledVector(bend, Math.sqrt(upper ** 2 - along ** 2));
    return [firstSegment, axis.multiplyScalar(length).sub(firstSegment)];
  }

  function arm(side, sign, wrist, pole, palm, openAlong) {
    const names = ['Arm' + side, 'Forearm' + side, 'Hand' + side];
    const [upper, lower] = reach(...names, wrist, pole);
    const along = v(sign * .025, -.137, .065).normalize();
    const across = v(1, 0, 0).addScaledVector(along, -along.x).normalize();
    // The skinned hand's dorsal axis matches the frame in build_model.py.
    const facingRest = openAlong ? across.clone().cross(along) : along.clone().cross(across);
    const facing = openAlong ? up : palm;
    const hand = orient(along, openAlong ?? lower, facingRest, facing);
    const forearm = orient(bone(names[2]).position, lower, facingRest, facing);
    segments(...names, upper, lower, pole.clone().negate(), hand, forearm);
  }

  function leg(side, ankle, pole, angle, facing = pole) {
    const names = ['Thigh' + side, 'Shin' + side, 'Foot' + side];
    segments(...names, ...reach(...names, ankle, pole), facing, pitch(angle));
  }

  function add(id, name, primary, supporting, equipment, pose, phases, cues) {
    if (onlyExercises && !onlyExercises.includes(id)) return;
    const duration = 3.6;
    const times = Array.from({ length: 181 }, (_, frame) => frame / 50);
    const [, [begin], [pause], [resume], [reset]] = phases;
    const rotations = joints.map(() => []);
    const positions = [];
    for (const time of times) {
      const amount = THREE.MathUtils.smoothstep(time, begin, pause) *
        (1 - THREE.MathUtils.smoothstep(time, resume, reset));
      pose(amount);
      positions.push(...pelvis.position.toArray());
      joints.forEach((name, i) => bone(name).quaternion.toArray(rotations[i], rotations[i].length));
    }
    const tracks = joints.map((name, i) =>
      new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, rotations[i]));
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions));
    if (equipment === 'bench-dumbbells') tracks.push(...grip);
    if (equipment === 'bench-dumbbell-left') tracks.push(...grip.filter((track) => track.name.endsWith('L.quaternion')));
    if (equipment !== 'bench-dumbbells') tracks.push(...support.R);
    if (equipment === 'bench') tracks.push(...support.L);
    entries['local:exercise:' + id] = {
      name, primary, supporting, equipment, framing: 'bench', phases, cues,
      clip: new THREE.AnimationClip(name, duration, tracks),
    };
  }

  function supine(z, planted = true) {
    torso(v(0, .56, z), -flat);
    world('Lumbar', pitch(-flat - .041));
    world('Head', pitch(-flat - .245));
    if (planted) for (const [side, sign] of sides) {
      leg(side, v(sign * .245, .074, .725), v(sign * .06, 1, -.1), 0);
    }
  }

  function braceAtEdge(side, sign, z) {
    arm(side, sign, v(sign * .150, .473, z), v(sign * .65, .25, -1),
      null, v(-sign * .80, -.11, .57));
  }

  const liftPhases = [[0, 'Setup'], [.25, 'Lift'], [1.25, 'Hold'], [2.2, 'Lower'], [3.35, 'Reset']];
  const pressPhases = [[0, 'Setup'], [.25, 'Lower'], [1.65, 'Pause'], [2, 'Press'], [3.35, 'Reset']];
  const chest = ['Chest'];
  const pressSupport = ['Shoulders', 'Triceps'];
  for (const [id, name, neutral, single] of [
    ['Dumbbell_Bench_Press', 'Dumbbell Bench Press', false, false],
    ['Dumbbell_Bench_Press_with_Neutral_Grip', 'Dumbbell Bench Press with Neutral Grip', true, false],
    ['One_Arm_Dumbbell_Bench_Press', 'One Arm Dumbbell Bench Press', false, true],
  ]) {
    const startLow = !neutral && !single;
    add(id, name, chest, pressSupport, single ? 'bench-dumbbell-left' : 'bench-dumbbells', (progress) => {
      const amount = startLow ? 1 - progress : progress;
      supine(.38);
      for (const [side, sign] of sides) {
        if (single && side === 'R') {
          braceAtEdge(side, sign, .115);
          continue;
        }
        const wrist = v(sign * lerp(.224, neutral ? .300 : .438, amount),
          lerp(1.073, .793, amount), lerp(-.113, neutral ? .167 : .026, amount));
        arm(side, sign, wrist, v(sign * (neutral ? .37 : .92), -.25, neutral ? 1 : .48),
          neutral ? v(-sign, 0, 0) : v(0, 0, 1));
      }
    }, startLow ? liftPhases : pressPhases, [
      [0, 'Plant your feet', 'Keep your head, upper back and hips supported on the pad.'],
      [startLow ? .25 : 2, 'Press over your shoulders', single ? 'Keep your torso steady. Switch arms after the set.'
        : 'Drive both weights up smoothly and keep your shoulders on the pad.'],
      [startLow ? 2.2 : .35, neutral ? 'Keep palms facing in' : 'Turn your palms toward your feet',
        neutral ? 'Lower the weights beside your torso, keeping elbows closer to your sides.'
          : 'Lower beside your chest with wrists above elbows.'],
    ].sort(([a], [b]) => a - b));
  }

  for (const [id, name, single] of [
    ['Dumbbell_Flyes', 'Dumbbell Flyes', false],
    ['One-Arm_Flat_Bench_Dumbbell_Flye', 'One-Arm Flat Bench Dumbbell Flye', true],
  ]) {
    add(id, name, chest, [], single ? 'bench-dumbbell-left' : 'bench-dumbbells', (amount) => {
      supine(.38);
      for (const [side, sign] of sides) {
        if (single && side === 'R') {
          braceAtEdge(side, sign, .115);
          continue;
        }
        const shoulder = point('Arm' + side);
        const angle = lerp(.035, 1.55, amount);
        const wrist = shoulder.add(v(sign * Math.sin(angle), Math.cos(angle),
          lerp(.015, -.12, amount)).normalize().multiplyScalar(.508));
        arm(side, sign, wrist, v(sign * .12, -.3, -.9),
          v(-sign * Math.cos(angle), Math.sin(angle), 0));
      }
    }, [[0, 'Setup'], [.25, 'Open'], [1.65, 'Stretch'], [2, 'Close'], [3.35, 'Reset']],
    [[0, 'Set a soft elbow bend', single ? 'Brace your free hand on the pad edge and keep your palm facing in.'
      : 'Start with palms facing each other and weights above your chest.'],
    [.35, 'Open in a wide arc', 'Keep your elbow angle steady and stop at a comfortable stretch.'],
    [2, 'Reverse the arc', single ? 'Bring the weight back over your chest. Switch arms after the set.'
      : 'Bring both weights back above your chest.']]);
  }

  for (const [id, name, tuck] of [
    ['Flat_Bench_Lying_Leg_Raise', 'Flat Bench Lying Leg Raise', false],
    ['Flat_Bench_Leg_Pull-In', 'Flat Bench Leg Pull-In', true],
  ]) {
    add(id, name, ['Core'], [], 'bench', (amount) => {
      supine(.48, false);
      for (const [side, sign] of sides) {
        braceAtEdge(side, sign, .215);
        const thigh = pitch(lerp(-flat + .04, tuck ? -3.78 : -Math.PI, amount));
        const shin = pitch(lerp(-flat + .16, tuck ? -1.65 : -Math.PI + .12, amount));
        world('Thigh' + side, thigh);
        world('Shin' + side, shin);
        world('Foot' + side, shin);
      }
    }, liftPhases, [[0, 'Brace your hands on the pad edges', 'Lie back with your legs extended off the end.'],
      [.35, tuck ? 'Draw your knees in' : 'Raise both legs',
        tuck ? 'Bend at your hips and knees and draw your thighs toward your chest.'
          : 'Keep the same slight bend in your knees as your legs rise toward vertical.'],
      [2.2, 'Lower with control', 'Return your legs off the end while keeping your back supported.']]);
  }

  add('One-Arm_Dumbbell_Row', 'One-Arm Dumbbell Row', ['Upper back'], ['Biceps', 'Shoulders'],
    'bench-dumbbell-left', (amount) => {
      torso(v(.195, .826, -.363), flat);
      leg('L', v(.47, .074, -.655), v(.45, .2, 1), 0);
      segments('ThighR', 'ShinR', 'FootR', v(0, -.787, .617), v(0, .065, -1),
        v(0, -.8, 1), pitch(-1.17));
      arm('R', -1, v(-.012, .473, .35), v(-.15, -.1, -.8), null, v(0, -.11, 1));
      arm('L', 1, v(lerp(.455, .458, amount), lerp(.308, .635, amount), lerp(.118, .018, amount)),
        v(.02, .28, -1), v(-1, 0, 0));
    }, liftPhases, [[0, 'Brace on the bench', 'Rest your right hand and knee on the pad. Plant your left foot.'],
      [.35, 'Row toward your ribs', 'Drive your left elbow back close to your side and keep your torso still.'],
      [2.2, 'Lower the weight', 'Extend your arm under control. Switch sides after the set.']]);

  return entries;
}
