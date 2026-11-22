import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { legacyBarGripTransform } from './barbell-standing.mjs';
import { createEntries as createBenchEntries } from './flat-bench-exercises.mjs';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const xAxis = v(1, 0, 0);
const turn = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const swing = (from, to) => new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
const { lerp, smoothstep } = THREE.MathUtils;
const duration = 3.6;
const times = Array.from({ length: 217 }, (_, frame) => frame / 60);

const specs = [
  ['EZ-Bar_Curl', 'EZ-Bar Curl', 'curl', false, 'Use the wide outer bends',
    'Keep your elbows at your sides and curl the bar to shoulder height.'],
  ['Close-Grip_EZ_Bar_Curl', 'Close-Grip EZ Bar Curl', 'curl', true, 'Use the narrow inner bends',
    'Keep your palms up and upper arms stationary as you curl.'],
  ['Close-Grip_EZ-Bar_Press', 'Close-Grip EZ-Bar Press', 'press', true, 'Keep your elbows tucked',
    'Lower the narrow overhand grip to your lower chest, then press back over your shoulders.'],
  ['EZ-Bar_Skullcrusher', 'EZ-Bar Skullcrusher', 'extension', true, 'Keep your upper arms vertical',
    'Bend your elbows to lower the bar just above your forehead, then straighten your arms.'],
];

export function gripFrame(sign, narrow, underhand, gripTransform) {
  const along = v(sign * .025, -.137, .065).normalize();
  const { position: seat, quaternion } = gripTransform(sign);
  const handle = xAxis.clone().applyQuaternion(quaternion);
  // These points and tangents lie on the straight sections between the rounded bends.
  const center = narrow ? v(sign * .105, 0, .030) : v(sign * .245, 0, .020);
  const barAxis = v(2, 0, sign * (narrow ? 1 : -1)).normalize()
    .multiplyScalar(underhand ? 1 : -1);
  return (roll, direction) => {
    const axis = barAxis.clone().applyQuaternion(roll);
    const rotation = swing(handle, axis);
    const tangent = along.clone().applyQuaternion(rotation);
    const angle = Math.atan2(axis.dot(tangent.clone().cross(direction)),
      tangent.dot(direction) - tangent.dot(axis) * direction.dot(axis));
    rotation.premultiply(turn(axis, angle));
    return { rotation, offset: center.clone().applyQuaternion(roll).sub(seat.clone().applyQuaternion(rotation)) };
  };
}

function elbowIK(target, pole, upper, lower) {
  const distance = target.length();
  const along = (upper ** 2 - lower ** 2 + distance ** 2) / (2 * distance);
  if (Math.abs(along) > upper || distance > upper + lower) throw new Error('EZ bar target outside arm reach');
  const axis = target.clone().normalize();
  return axis.clone().multiplyScalar(along)
    .addScaledVector(pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize(),
      Math.sqrt(upper ** 2 - along ** 2));
}

export function createEntries({ scene, onlyExercises }, { createPowerGripTracks,
  createDumbbellGripTracks = createPowerGripTracks, dumbbellGripTransform = legacyBarGripTransform }) {
  const grip = createDumbbellGripTracks(scene);
  const calibrated = dumbbellGripTransform !== legacyBarGripTransform;
  const bench = createBenchEntries({ scene, onlyExercises: ['Dumbbell_Bench_Press'] },
    { createPowerGripTracks: createDumbbellGripTracks })['local:exercise:Dumbbell_Bench_Press'];
  const supportTracks = bench.clip.tracks.filter((track) => /^(Pelvis|Lumbar|Chest|Head|Thigh|Shin|Foot)/.test(track.name));
  const selected = specs.filter(([id]) => !onlyExercises || onlyExercises.includes(id));
  return Object.fromEntries(selected.map(([id, name, movement, narrow, title, cue]) => {
    const standing = movement === 'curl';
    const press = movement === 'press';
    const barIndex = calibrated
      ? (standing ? (narrow ? .50 : 0) : press ? -.15 : -.65)
      : (standing ? (narrow ? 0 : 1.45) : -1.45);
    const figure = clone(scene);
    if (!standing) for (const track of supportTracks) {
      const [bone, property] = track.name.split('.');
      figure.getObjectByName(bone)[property].fromArray(track.values);
    }
    figure.updateMatrixWorld(true);

    const arms = ['L', 'R'].map((side, i) => {
      const sign = i === 0 ? 1 : -1;
      const [arm, forearm, hand] = ['Arm', 'Forearm', 'Hand'].map((part) => figure.getObjectByName(part + side));
      const shoulder = arm.getWorldPosition(v());
      const upper = forearm.position.length();
      const lower = hand.position.length();
      const fixed = (standing ? v(sign * (narrow ? -.018 : .03), -1, -.015) : v(0, 1, 0)).setLength(upper);
      return { arm, forearm, hand, shoulder, upper, lower, fixed, sign,
        frame: gripFrame(sign, narrow, standing, dumbbellGripTransform), samples: [[], [], []] };
    });
    const phases = [[0, 'Setup'], [.2, standing ? 'Curl' : 'Lower'], [1.3, 'Pause'],
      [1.85, standing ? 'Lower' : press ? 'Press' : 'Extend'], [3.4, 'Reset']];
    const positions = [];
    const rotations = [];
    for (const time of times) {
      const amount = smoothstep(time, .2, 1.3) * (1 - smoothstep(time, 1.85, 3.4));
      const angle = standing ? lerp(.40, 2.60, amount)
        : press ? lerp(.18, .32, amount) + .24 * Math.sin(Math.PI * amount) : lerp(.18, 2.16, amount);
      const direction = standing ? v(0, -Math.cos(angle), Math.sin(angle))
        : v(0, Math.cos(angle), -Math.sin(angle));
      // Keep the bends indexed to the forearm as the shaft rolls through the arc.
      const roll = turn(xAxis, barIndex - angle);
      const left = arms[0];
      const leftGrip = left.frame(roll, direction);
      const elbow = left.shoulder.clone().add(left.fixed);
      const lateral = leftGrip.offset.x - elbow.x;
      const center = elbow.clone().addScaledVector(direction, Math.sqrt(left.lower ** 2 - lateral ** 2))
        .sub(leftGrip.offset);
      center.x = 0;
      if (press) {
        center.y = lerp(center.y, .742, amount);
        center.z = lerp(center.z, .107, amount);
      }
      positions.push(...center.toArray());
      rotations.push(...roll.toArray());

      for (const { arm, forearm, hand, shoulder, upper, lower, fixed, sign, frame, samples } of arms) {
        const { rotation, offset } = frame(roll, direction);
        const target = center.clone().add(offset).sub(shoulder);
        const first = press ? elbowIK(target, v(sign * .10, -.55, 1), upper, lower) : fixed;
        const upperWorld = swing(forearm.position, first);
        if (!standing) {
          const axis = first.clone().normalize();
          const front = v(0, 0, 1).applyQuaternion(upperWorld);
          const flexion = press ? target.clone().sub(first) : v(0, 0, -1);
          upperWorld.premultiply(turn(axis, Math.atan2(axis.dot(front.clone().cross(flexion)),
            front.dot(flexion) - front.dot(axis) * flexion.dot(axis))));
        }
        const lowerWorld = swing(hand.position.clone().applyQuaternion(rotation), target.sub(first)).multiply(rotation);
        const poses = [
          arm.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(upperWorld),
          upperWorld.clone().invert().multiply(lowerWorld),
          lowerWorld.invert().multiply(rotation),
        ];
        poses.forEach((pose, i) => samples[i].push(...pose.toArray()));
      }
    }

    const armTracks = arms.flatMap(({ arm, forearm, hand, samples }) =>
      [arm, forearm, hand].map((bone, i) => new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', times, samples[i])));
    return ['local:exercise:' + id, {
      name, phases, cues: [[0, title, cue]],
      primary: [standing ? 'Biceps' : 'Triceps'],
      supporting: standing ? ['Forearms'] : press ? ['Chest', 'Shoulders'] : [],
      equipment: standing ? 'ez-curl-bar' : 'bench-ez-curl-bar',
      framing: standing ? 'standing' : 'bench',
      clip: new THREE.AnimationClip(name, duration, [...(standing ? [] : supportTracks), ...armTracks, ...grip]),
      propClip: new THREE.AnimationClip(name + ' bar', duration, [
        new THREE.VectorKeyframeTrack('.position', times, positions),
        new THREE.QuaternionKeyframeTrack('.quaternion', times, rotations),
      ]),
    }];
  }));
}
