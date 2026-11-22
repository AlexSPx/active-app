import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const { degToRad, lerp, smoothstep } = THREE.MathUtils;
const pitch = (degrees) => new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), degToRad(degrees));
const swing = (from, to) => new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());

const specs = [
  { id: 'Dips_-_Chest_Version', name: 'Dips - Chest Version', lean: 30, bend: 89, flare: .75, shift: .015,
    primary: ['Chest'], supporting: ['Triceps', 'Shoulders'],
    lower: 'Lean forward about 30 degrees and let your elbows flare slightly as you lower.',
    press: 'Press back to straight-arm support and squeeze your chest for one second.' },
  { id: 'Dips_-_Triceps_Version', name: 'Dips - Triceps Version', lean: 0, bend: 90, flare: .34, shift: .245,
    primary: ['Triceps'], supporting: ['Chest', 'Shoulders'],
    lower: 'Keep your torso upright and your elbows close. Lower until your elbows reach 90 degrees.',
    press: 'Extend your elbows to return to support.' },
  { id: 'Parallel_Bar_Dip', name: 'Parallel Bar Dip', lean: 12, bend: 108, flare: .42, shift: .207,
    primary: ['Triceps'], supporting: ['Chest', 'Shoulders'],
    lower: 'Lower in control until your elbows bend past 90 degrees. Keep your legs steady.',
    press: 'Push back up to straight-arm support without swinging.' },
];

function armRig(scene, side, sign, gripTransform) {
  const along = v(sign * .025, -.137, .065).normalize();
  const { position: seat, quaternion } = gripTransform(sign);
  const shaft = v(1, 0, 0).applyQuaternion(quaternion);
  const axis = v(0, 0, sign);
  const align = swing(shaft, axis);
  const tangent = along.applyQuaternion(align);
  const hand = new THREE.Quaternion().setFromAxisAngle(axis,
    sign * (-Math.atan2(tangent.x, -tangent.y) + sign * .30)).multiply(align);
  return {
    side, sign, hand,
    wrist: v(sign * .260, 1.150, .100).sub(seat.applyQuaternion(hand)),
    shoulder: scene.getObjectByName('Arm' + side).position.clone()
      .add(scene.getObjectByName('Chest').position).add(scene.getObjectByName('Lumbar').position),
    upper: scene.getObjectByName('Forearm' + side).position,
    lower: scene.getObjectByName('Hand' + side).position,
  };
}

function build(scene, spec, fingers, gripTransform) {
  const arms = [armRig(scene, 'L', 1, gripTransform), armRig(scene, 'R', -1, gripTransform)];
  const duration = 4;
  const times = Array.from({ length: duration * 120 + 1 }, (_, i) => i / 120);
  const tracks = new Map();
  const write = (name, value, Track = THREE.QuaternionKeyframeTrack) => {
    if (!tracks.has(name)) tracks.set(name, { Track, values: [] });
    tracks.get(name).values.push(...value.toArray());
  };

  for (const time of times) {
    const depth = smoothstep(time, .2, 1.55) * (1 - smoothstep(time, 1.8, 3));
    const torso = pitch(lerp(2, spec.lean, depth));
    const z = lerp(.015, spec.shift, depth ** 1.35);
    const bend = degToRad(lerp(4, spec.bend, depth));
    const { shoulder, wrist, upper, lower } = arms[0];
    const offset = shoulder.clone().applyQuaternion(torso);
    const reachSquared = upper.lengthSq() + lower.lengthSq() + 2 * upper.length() * lower.length() * Math.cos(bend);
    const pelvis = v(0, wrist.y - offset.y + Math.sqrt(reachSquared - (wrist.x - offset.x) ** 2
      - (wrist.z - z - offset.z) ** 2), z);
    write('Pelvis.position', pelvis, THREE.VectorKeyframeTrack);
    write('Pelvis.quaternion', torso);
    write('Head.quaternion', pitch(-spec.lean * depth * .36));

    for (const { side, sign, hand, wrist, shoulder, upper, lower } of arms) {
      const target = wrist.clone().sub(shoulder.clone().applyQuaternion(torso).add(pelvis));
      const distance = target.length();
      const axis = target.clone().divideScalar(distance);
      const pole = v(sign * lerp(.36, spec.flare, depth), 0, -1);
      pole.addScaledVector(axis, -pole.dot(axis)).normalize();
      const along = (upper.lengthSq() - lower.lengthSq() + distance ** 2) / (2 * distance);
      const elbow = axis.multiplyScalar(along).addScaledVector(pole, Math.sqrt(upper.lengthSq() - along ** 2));
      const arm = swing(upper, elbow);
      // Carry the grip's twist up the forearm instead of concentrating it at the wrist.
      const handWorld = hand;
      const forearm = swing(lower.clone().applyQuaternion(handWorld), target.sub(elbow)).multiply(handWorld);
      write('Arm' + side + '.quaternion', torso.clone().invert().multiply(arm));
      write('Forearm' + side + '.quaternion', arm.invert().multiply(forearm));
      write('Hand' + side + '.quaternion', forearm.invert().multiply(handWorld));

      const thigh = lerp(12, spec.lean ? -spec.lean * .50 : 1, depth);
      const shin = lerp(30, 36, depth);
      const adduction = new THREE.Quaternion().setFromAxisAngle(v(0, 0, 1), degToRad(-sign * 4));
      const thighWorld = adduction.multiply(pitch(thigh));
      write('Thigh' + side + '.quaternion', torso.clone().invert().multiply(thighWorld));
      write('Shin' + side + '.quaternion', thighWorld.invert().multiply(pitch(shin)));
      write('Foot' + side + '.quaternion', pitch(14 - shin));
    }
  }
  return new THREE.AnimationClip(spec.name, duration,
    [...Array.from(tracks, ([name, { Track, values }]) => new Track(name, times, values)), ...fingers]);
}

export function createEntries({ scene, onlyExercises }, { createDumbbellGripTracks, dumbbellGripTransform: gripTransform }) {
  const fingers = createDumbbellGripTracks(scene);
  const selected = specs.filter((spec) => !onlyExercises || onlyExercises.includes(spec.id));
  return Object.fromEntries(selected.map((spec) => {
    const { id, name, primary, supporting, lower, press } = spec;
    return ['local:exercise:' + id, {
      name, primary, supporting, equipment: 'dip-station', framing: 'standing',
      phases: [[0, 'Support'], [.2, 'Lower'], [1.55, 'Pause'], [1.8, 'Press'], [3, 'Hold support']],
      cues: [[0, 'Set your grip', 'Grip both rails and start in straight-arm support with your feet off the floor.'],
        [.2, 'Lower with control', lower], [1.8, 'Press to support', press]],
      clip: build(scene, spec, fingers, gripTransform),
    }];
  }));
}
