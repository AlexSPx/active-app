import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const xAxis = v(1, 0, 0);
const identity = new THREE.Quaternion();
const pitch = (angle) => new THREE.Quaternion().setFromAxisAngle(xAxis, angle);
const swing = (from, to) => new THREE.Quaternion().setFromUnitVectors(
  from.clone().normalize(), to.clone().normalize());
const lerp = THREE.MathUtils.lerp;
const ease = (x) => THREE.MathUtils.smoothstep(x, 0, 1);
const duration = 3.6;
const times = Array.from({ length: 217 }, (_, i) => i / 60);

function joint(target, pole, first, second) {
  const distance = target.length();
  if (distance > first + second + 1e-6 || distance < Math.abs(first - second)) {
    throw new Error('Barbell pose target is outside limb reach: ' + distance.toFixed(4));
  }
  const axis = target.clone().normalize();
  const along = (first ** 2 - second ** 2 + distance ** 2) / (2 * distance);
  const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
  return axis.multiplyScalar(along).addScaledVector(bend, Math.sqrt(Math.max(0, first ** 2 - along ** 2)));
}

export function legacyBarGripTransform(sign) {
  const along = v(sign * .025, -.137, .065).normalize();
  const across = xAxis.clone().addScaledVector(along, -along.x).normalize();
  const inward = across.clone().cross(along);
  const seat = along.clone().multiplyScalar(.10654)
    .addScaledVector(inward, -.03918).addScaledVector(across, sign * .05364);
  const handle = across.applyAxisAngle(inward, -sign * .5);
  return { position: seat, quaternion: swing(xAxis, handle) };
}

function handSeat(sign, underhand, gripTransform) {
  const { position: seat, quaternion } = gripTransform(sign);
  const handle = xAxis.clone().applyQuaternion(quaternion);
  const along = v(sign * .025, -.137, .065).normalize();
  const axis = v(underhand ? 1 : -1, 0, 0);
  const align = swing(handle, axis);
  const tangent = along.applyQuaternion(align);
  return (direction) => {
    const angle = Math.atan2(tangent.y * direction.z - tangent.z * direction.y,
      tangent.y * direction.y + tangent.z * direction.z);
    const hand = pitch(angle).multiply(align);
    return { hand, offset: seat.clone().applyQuaternion(hand) };
  };
}

// The planted ankles are fixed. The knee pole controls the stance plane.
function legPose(bones, sign, pelvis, torso, stance) {
  const [thigh, shin, foot] = bones;
  const [width, toe, kneeOut] = stance;
  const restAnkle = thigh.position.clone().add(shin.position).add(foot.position);
  const ankle = v(sign * width, .897 + restAnkle.y, restAnkle.z);
  const hip = thigh.position.clone().applyQuaternion(torso).add(pelvis);
  const target = ankle.sub(hip);
  const knee = joint(target, v(sign * kneeOut, 0, 1), shin.position.length(), foot.position.length());
  const thighWorld = swing(shin.position, knee);
  const shinWorld = swing(foot.position, target.sub(knee));
  const toeOut = new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), sign * toe);
  return [torso.clone().invert().multiply(thighWorld), thighWorld.invert().multiply(shinWorld),
    shinWorld.invert().multiply(toeOut)];
}

const hinge = ['Hamstrings', 'Glutes', 'Upper back'];
const pull = ['Glutes', 'Hamstrings', 'Quadriceps', 'Forearms'];
const rows = ['Upper back'];
const rowSupport = ['Biceps', 'Forearms', 'Shoulders'];
const entries = [
  { id: 'Barbell_Deadlift', name: 'Barbell Deadlift', primary: ['Upper back'], supporting: pull,
    mode: 'floor', width: .228, high: [.896, -.012, 0], stance: [.125, .12, .10], low: [.578, -.232, 1.01], floorZ: .246,
    cue: ['Push through the floor', 'Extend your knees and hips together. Keep the bar close and return the plates to the floor.'] },
  { id: 'Sumo_Deadlift', name: 'Sumo Deadlift', primary: ['Hamstrings'], supporting: [...pull.filter((muscle) => muscle !== 'Hamstrings'), 'Adductors', 'Upper back'],
    mode: 'floor', width: .145, high: [.851, -.015, 0], stance: [.370, .51, 1.1], low: [.505, -.145, .80], floorZ: .211,
    cue: ['Drive your knees out', 'Set your feet wide with your hands inside your knees. Push through the floor and extend your hips and knees.'] },
  { id: 'Romanian_Deadlift', name: 'Romanian Deadlift', primary: [hinge[0]], supporting: hinge.slice(1),
    mode: 'hinge', width: .252, stance: [.121, .10, .08], low: [.842, -.181, 1.20],
    cue: ['Push your hips back', 'Keep your shins nearly vertical and your arms straight. Guide the bar past your knees as your hips move back.'] },
  { id: 'Stiff-Legged_Barbell_Deadlift', name: 'Stiff-Legged Barbell Deadlift', primary: [hinge[0]], supporting: hinge.slice(1),
    mode: 'hinge', width: .227, stance: [.104, .10, .08], low: [.877, -.046, 1.23], high: [.877, -.046, 0], fixedKnees: true,
    cue: ['Keep your knee angle fixed', 'Soften your knees, then hinge at the hips to lower the bar over your feet until your hamstrings stretch.'] },
  { id: 'Bent_Over_Barbell_Row', name: 'Bent Over Barbell Row', primary: rows, supporting: rowSupport,
    mode: 'row', width: .247, stance: [.121, .10, .08], low: [.825, -.206, 1.23],
    cue: ['Pull toward your lower ribs', 'Hold your torso steady and draw your elbows back close to your sides. Pause, then lower to a full hang.'] },
  { id: 'Barbell_Rear_Delt_Row', name: 'Barbell Rear Delt Row', primary: ['Shoulders'], supporting: ['Upper back', 'Forearms'],
    mode: 'row', width: .392, stance: [.121, .10, .08], low: [.825, -.206, 1.27], flare: true,
    cue: ['Lead with wide elbows', 'Keep your torso hinged and pull the bar toward your upper chest with your elbows flared.'] },
  { id: 'Barbell_Shrug', name: 'Barbell Shrug', primary: rows, supporting: [],
    mode: 'shrug', width: .259,
    cue: ['Lift your shoulders', 'Hold the bar in front of your thighs with an overhand grip. Raise your shoulders straight up while keeping your elbows extended.'] },
  { id: 'Barbell_Shrug_Behind_The_Back', name: 'Barbell Shrug Behind The Back', primary: rows, supporting: ['Forearms'],
    mode: 'shrug', width: .259, behind: true,
    cue: ['Lift your shoulders', 'Hold the bar behind you with your palms facing back. Raise your shoulders while keeping your arms extended.'] },
  { id: 'Barbell_Curl', name: 'Barbell Curl', primary: ['Biceps'], supporting: ['Forearms'],
    mode: 'curl', width: .225, underhand: true,
    cue: ['Keep your elbows still', 'Use a shoulder-width palms-up grip and curl the bar toward your shoulders without swinging your torso.'] },
  { id: 'Reverse_Barbell_Curl', name: 'Reverse Barbell Curl', primary: ['Biceps'], supporting: ['Forearms'],
    mode: 'curl', width: .225,
    cue: ['Keep your palms down', 'Hold an overhand grip and curl toward shoulder height with your upper arms still.'] },
];

function build(scene, spec, grip, gripTransform) {
  const bone = (name) => scene.getObjectByName(name);
  const pelvisBone = bone('Pelvis');
  const shoulderBase = bone('Lumbar').position.clone().add(bone('Chest').position);
  const arms = ['L', 'R'].map((side) => ['Arm', 'Forearm', 'Hand'].map((part) => bone(part + side)));
  const legs = ['L', 'R'].map((side) => ['Thigh', 'Shin', 'Foot'].map((part) => bone(part + side)));
  const calibrated = gripTransform !== legacyBarGripTransform;
  const width = calibrated && spec.flare ? .380 : spec.width;
  const seat = [1, -1].map((sign) => handSeat(sign, spec.underhand, gripTransform));
  const channels = new Map();
  const bar = [];
  const sample = (object, property, value) => {
    const key = object.name + '.' + property;
    if (!channels.has(key)) channels.set(key, []);
    const channel = channels.get(key);
    if (value.isQuaternion && channel.length) {
      const previous = new THREE.Quaternion().fromArray(channel, channel.length - 4);
      if (previous.dot(value) < 0) value = value.clone().set(-value.x, -value.y, -value.z, -value.w);
    }
    channel.push(...value.toArray());
  };
  const [arm, forearm, hand] = arms[0];
  const upperLength = forearm.position.length();
  const lowerLength = hand.position.length();
  const high = spec.high ?? [.890, -.012, 0];
  let floorAdjustment = 0;
  for (const time of times) {
    const amount = ease((time - .20) / 1.02) * ease((3.40 - time) / 1.62);
    const depth = { floor: 1 - amount, hinge: amount, row: 1 }[spec.mode] ?? 0;
    const [height, back, lean] = high.map((value, i) => lerp(value, spec.low?.[i] ?? value, depth));
    const torso = pitch(lean);
    const pelvis = v(0, height, back);
    const shoulderLift = spec.mode === 'shrug' ? .058 * amount : 0;
    const shoulder = (bone) => bone.position.clone().add(v(0, shoulderLift, 0))
      .add(shoulderBase).applyQuaternion(torso).add(pelvis);
    const left = shoulder(arm);
    let barCenter;
    let direction;
    let pole = (sign) => v(sign * .25, 0, -1);
    if (spec.mode === 'curl') {
      const upper = v(.030, -upperLength, spec.underhand ? -.006 : .020).setLength(upperLength);
      const elbow = left.clone().add(upper);
      const angle = lerp(spec.underhand ? .39 : .52, 2.48, amount);
      direction = v(0, -Math.cos(angle), Math.sin(angle));
      const offset = seat[0](direction).offset;
      const lateral = width - elbow.x - offset.x;
      const wrist = elbow.clone().addScaledVector(direction, Math.sqrt(lowerLength ** 2 - lateral ** 2));
      barCenter = wrist.add(offset);
      barCenter.x = 0;
      pole = (sign) => v(sign * upper.x, upper.y, upper.z);
    } else if (spec.mode === 'row') {
      const startPitch = calibrated ? .22 : .04;
      const finishPitch = calibrated && !spec.flare ? .66 : .46;
      direction = v(0, -1, lerp(startPitch, finishPitch, amount));
      const z = (spec.flare ? -.021 : -.113) * amount;
      const offset = seat[0](v(0, -1, startPitch)).offset;
      const reach = upperLength + lowerLength - .0006;
      const dx = width - offset.x - left.x;
      const hang = offset.y - Math.sqrt(reach ** 2 - dx ** 2 - offset.z ** 2);
      // Keep the pull endpoint and leave enough arm reach at the hang.
      const start = Math.max(hang, spec.flare ? (calibrated ? -.550 : -.570) : -.622);
      barCenter = v(0, left.y + lerp(start, spec.flare ? -.234 : -.297, amount), left.z + z);
      pole = (sign) => v(sign * (spec.flare ? 1 : -.14), .65, -1);
    } else {
      const z = spec.mode === 'floor' ? lerp(.154, spec.floorZ, ease(depth * 1.5))
        : spec.behind ? -.173 : spec.mode === 'hinge' ? lerp(.157, spec.fixedKnees ? .237 : .155, depth) : .158;
      direction = v(0, -1, THREE.MathUtils.clamp((z - left.z) * 2.2, -.46, .48));
      const offset = seat[0](direction).offset;
      const dx = width - offset.x - left.x;
      const dz = z - offset.z - left.z;
      const hang = left.y + offset.y - Math.sqrt((upperLength + lowerLength - .0006) ** 2 - dx ** 2 - dz ** 2);
      if (spec.mode === 'floor' && time === 0) floorAdjustment = .225 - hang;
      pelvis.y += floorAdjustment * depth;
      barCenter = v(0, hang + floorAdjustment * depth, z);
    }
    if (!Number.isFinite(barCenter.y) || barCenter.y < .225 - 1e-6) {
      throw new Error(spec.name + ' bar is below the floor at ' + time);
    }
    bar.push(...barCenter.toArray());
    sample(pelvisBone, 'position', pelvis);
    sample(pelvisBone, 'quaternion', torso);
    sample(bone('Head'), 'quaternion', pitch(-lean * .35));
    for (const [i, sign] of [1, -1].entries()) {
      const leg = legPose(legs[i], sign, pelvis, torso, spec.stance ?? [.121, .10, .08]);
      legs[i].forEach((bone, j) => sample(bone, 'quaternion', leg[j]));
      const [upper, lower, wrist] = arms[i];
      const frame = seat[i](direction);
      const target = barCenter.clone().add(v(sign * width, 0, 0)).sub(frame.offset).sub(shoulder(upper));
      let elbow;
      try {
        elbow = joint(target, pole(sign), upperLength, lowerLength);
      } catch (error) {
        throw new Error(spec.name + ' at ' + time + ': ' + error.message);
      }
      const upperWorld = swing(lower.position, elbow);
      const lowerWorld = swing(wrist.position.clone().applyQuaternion(frame.hand), target.sub(elbow)).multiply(frame.hand);
      sample(upper, 'position', upper.position.clone().add(v(0, shoulderLift, 0)));
      sample(upper, 'quaternion', torso.clone().invert().multiply(upperWorld));
      sample(lower, 'quaternion', upperWorld.invert().multiply(lowerWorld));
      sample(wrist, 'quaternion', lowerWorld.invert().multiply(frame.hand));
    }
  }
  const tracks = [...channels].map(([name, values]) => {
    const Track = name.endsWith('.position') ? THREE.VectorKeyframeTrack : THREE.QuaternionKeyframeTrack;
    return new Track(name, times, values);
  });
  const phases = spec.mode === 'floor'
    ? [[0, 'Set up on the floor'], [.2, 'Lift'], [1.22, 'Lockout'], [1.78, 'Lower'], [3.4, 'Reset on the floor']]
    : spec.mode === 'hinge'
      ? [[0, 'Stand tall'], [.2, 'Hinge'], [1.22, 'Bottom'], [1.78, 'Stand'], [3.4, 'Reset']]
      : [[0, 'Setup'], [.2, 'Lift'], [1.22, 'Pause'], [1.78, 'Lower'], [3.4, 'Reset']];
  return {
    name: spec.name,
    clip: new THREE.AnimationClip(spec.name, duration, [...tracks, ...grip]),
    primary: spec.primary,
    supporting: spec.supporting,
    phases,
    cues: [[.2, ...spec.cue]],
    equipment: 'barbell',
    framing: 'standing',
    propClip: new THREE.AnimationClip(spec.name + ' barbell', duration, [
      new THREE.VectorKeyframeTrack('.position', times, bar),
      new THREE.QuaternionKeyframeTrack('.quaternion', [0], identity.toArray()),
    ]),
  };
}

export function createEntries({ scene, onlyExercises }, { createPowerGripTracks,
  createDumbbellGripTracks = createPowerGripTracks, dumbbellGripTransform = legacyBarGripTransform }) {
  const grip = createDumbbellGripTracks(scene);
  const selected = entries.filter((spec) => !onlyExercises || onlyExercises.includes(spec.id));
  return Object.fromEntries(selected.map((spec) => ['local:exercise:' + spec.id, build(scene, spec, grip, dumbbellGripTransform)]));
}
