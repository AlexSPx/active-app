import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createEntries as createFlatEntries } from './flat-bench-exercises.mjs';
import { createEntries as createInclineEntries } from './incline-bench-exercises.mjs';
import { createEntries as createExpansionEntries } from './dumbbell-expansion.mjs';
import { createSupportHands, supportFingerNames, forearmRoll, handAlong, handDorsal, openHand } from './hand-frame.mjs';

export const groupLabel = 'Dumbbell bench and seated';

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const x = v(1), y = v(0, 1), z = v(0, 0, 1);
const rotation = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const pitch = (angle) => rotation(x, angle);
const reverse = rotation(y, Math.PI);
const flat = Math.PI / 2;
const sides = [['L', 1], ['R', -1]];
const { clamp, lerp, smoothstep } = THREE.MathUtils;
const prefix = 'local:exercise:';
const duration = 3.6;
const lift = [[0, 'Setup'], [.25, 'Lift'], [1.4, 'Hold'], [2.05, 'Lower'], [3.35, 'Reset']];
const lower = [[0, 'Setup'], [.25, 'Lower'], [1.8, 'Pause'], [2.05, 'Lift'], [3.35, 'Reset']];
const low = { angle: Math.PI / 6 };
const steep = { angle: Math.PI / 4 };
const upright = { angle: Math.PI / 3 };
const crossPad = { position: [0, 0, -.043], yaw: flat };
const wristPad = { yaw: flat };

function orient(from, to, reference, facing) {
  const axis = to.clone().normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), axis);
  const actual = reference.clone().applyQuaternion(turn);
  return turn.premultiply(rotation(axis, Math.atan2(axis.dot(actual.clone().cross(facing)), actual.dot(facing))));
}

export function createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform }) {
  const { onlyExercises } = asset;
  const figure = clone(asset.scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const worldTurn = (name) => bone(name).getWorldQuaternion(new THREE.Quaternion());
  const pelvis = bone('Pelvis');
  const joints = ['Pelvis', 'Lumbar', 'Chest', 'Head', ...sides.flatMap(([side]) =>
    ['Arm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot'].map((name) => name + side))];
  const rest = joints.map((name) => bone(name).quaternion.clone());
  const supportHands = createSupportHands(bone);
  const gripTracks = createDumbbellGripTracks(figure);
  const helpers = { createPowerGripTracks: createDumbbellGripTracks };

  function basePose(entry) {
    const tracks = entry.clip.tracks.map((track) => [track.name.split('.'), track.values.slice(0, track.getValueSize())])
      .filter(([[name]]) => joints.includes(name));
    return () => {
      for (const [[name, property], value] of tracks) bone(name)[property].fromArray(value);
    };
  }
  const { scene } = asset;
  const flatEntries = createFlatEntries({ scene, onlyExercises: ['Dumbbell_Bench_Press'] }, helpers);
  const inclineEntries = createInclineEntries({ scene, onlyExercises: ['Incline_Dumbbell_Press', 'Incline_Dumbbell_Curl'] }, helpers);
  const expansion = createExpansionEntries({ scene, onlyExercises: [
    'External_Rotation', 'Reverse_Flyes_With_External_Rotation', 'Seated_Dumbbell_Press',
    'Seated_Dumbbell_Palms-Down_Wrist_Curl', 'Seated_Triceps_Press',
  ] }, { createDumbbellGripTracks, dumbbellGripTransform });
  const supine = basePose(flatEntries[prefix + 'Dumbbell_Bench_Press']);
  const lowIncline = basePose(inclineEntries[prefix + 'Incline_Dumbbell_Press']);
  const curlIncline = basePose(inclineEntries[prefix + 'Incline_Dumbbell_Curl']);
  const sideLying = basePose(expansion[prefix + 'External_Rotation']);
  const proneIncline = basePose(expansion[prefix + 'Reverse_Flyes_With_External_Rotation']);
  const supportedShoulderPress = basePose(expansion[prefix + 'Seated_Dumbbell_Press']);
  const thighBrace = basePose(expansion[prefix + 'Seated_Dumbbell_Palms-Down_Wrist_Curl']);

  const cradle = expansion[prefix + 'Seated_Triceps_Press'];
  basePose(cradle)();
  const [positionTrack, turnTrack] = cradle.propClip.tracks;
  const cradlePosition = v().fromArray(positionTrack.values);
  const cradleTurn = new THREE.Quaternion().fromArray(turnTrack.values);
  // Turn the calibrated seated cradle to face the supine rig's shoulders.
  const cradleHands = sides.map(([side]) => ({
    position: point('Hand' + side).sub(cradlePosition).applyQuaternion(reverse),
    turn: worldTurn('Hand' + side).premultiply(reverse),
  }));
  cradleTurn.premultiply(reverse);
  const cradleFingers = cradle.clip.tracks.filter(({ name }) => /^(Thumb|Index|Middle|Ring|Little)/.test(name));

  function world(name, turn) {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(turn));
  }

  function torso(position, turn, head = turn) {
    pelvis.position.copy(position);
    for (const name of ['Pelvis', 'Lumbar', 'Chest']) world(name, turn);
    world('Head', head);
  }

  function reach(names, end, pole) {
    const [first, second, third] = names;
    const axis = end.clone().sub(point(first));
    const a = bone(second).position.length();
    const b = bone(third).position.length();
    const distance = clamp(axis.length(), Math.abs(a - b) + .0001, a + b - .0001);
    axis.normalize();
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const upper = axis.clone().multiplyScalar(along).addScaledVector(bend, Math.sqrt(a * a - along * along));
    return [upper, axis.multiplyScalar(distance).sub(upper)];
  }

  const armNames = (side) => ['Arm' + side, 'Forearm' + side, 'Hand' + side];
  function arm(side, sign, upper, distal, palm, { along = distal, elbow = z, hand } = {}) {
    const [first, second, third] = armNames(side);
    const turn = hand ?? openHand(sign, along, palm.clone().negate());
    world(first, orient(bone(second).position, upper, z, elbow));
    world(second, forearmRoll(side, orient(bone(third).position, distal, handDorsal(),
      handDorsal().applyQuaternion(turn)), distal, turn));
    world(third, turn);
  }

  function armTo(side, sign, end, pole, palm, options) {
    arm(side, sign, ...reach(armNames(side), end, pole), palm, options);
  }

  function leg(side, ankle, pole, foot = new THREE.Quaternion()) {
    const names = ['Thigh' + side, 'Shin' + side, 'Foot' + side];
    const [upper, distal] = reach(names, ankle, pole);
    const forward = z.clone().applyQuaternion(foot);
    world(names[0], orient(bone(names[1]).position, upper, z, forward));
    world(names[1], orient(bone(names[2]).position, distal, z, forward));
    world(names[2], foot);
  }

  function seated(hinge = 0, spread = .213, front = .790, depth = .415) {
    torso(v(0, .565, depth), pitch(hinge), pitch(hinge * .68));
    for (const [side, sign] of sides) leg(side, v(sign * spread, .074, front), v(sign * .14, 1, .55));
  }

  function crossBench() {
    torso(v(0, .429, .365), pitch(-1.255), pitch(-1.54));
    for (const [side, sign] of sides) leg(side, v(sign * .255, .074, .835), v(sign * .12, 1, .08));
  }

  const entries = {};
  function add(id, name, primary, supporting, equipment, pose, setup, motion, { phases = lift, benchTransform, dumbbellOffsets } = {}) {
    if (onlyExercises && !onlyExercises.includes(id)) return;
    const times = Array.from({ length: 181 }, (_, frame) => frame / 50);
    const [, [begin], [pause], [resume], [reset]] = phases;
    const turns = joints.map(() => []);
    const pelvisPositions = [], propPositions = [], propTurns = [];
    const freeSide = equipment.endsWith('-right') ? 'L' : equipment.endsWith('-left') ? 'R' : null;
    const standalone = equipment === 'bench-cradle-dumbbell';
    const freeFingers = [];
    for (const time of times) {
      joints.forEach((name, i) => bone(name).quaternion.copy(rest[i]));
      supportHands.reset();
      const amount = smoothstep(time, begin, pause) * (1 - smoothstep(time, resume, reset));
      const prop = pose(amount);
      pelvisPositions.push(...pelvis.position.toArray());
      joints.forEach((name, i) => turns[i].push(...bone(name).quaternion.toArray()));
      if (freeSide && time === 0) {
        for (const name of supportFingerNames.filter((name) => name.endsWith(freeSide))) {
          const value = bone(name).quaternion.toArray();
          if (supportHands.includeTrack(name, value)) {
            freeFingers.push(new THREE.QuaternionKeyframeTrack(name + '.quaternion', [0], value));
          }
        }
      }
      if (standalone) {
        propPositions.push(...prop.position.toArray());
        propTurns.push(...prop.turn.toArray());
      }
    }
    const fingers = standalone ? cradleFingers : gripTracks.filter(({ name }) =>
      !freeSide || !name.endsWith(freeSide + '.quaternion'));
    entries[prefix + id] = {
      name, primary: [primary], supporting, equipment, framing: 'bench', benchTransform, phases,
      cues: [[0, ...setup], [begin, ...motion]],
      clip: new THREE.AnimationClip(name, duration, [
        new THREE.VectorKeyframeTrack('Pelvis.position', times, pelvisPositions),
        ...joints.map((name, i) => new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, turns[i])),
        ...fingers, ...freeFingers,
      ]),
      ...(dumbbellOffsets && { dumbbellOffsets }),
      ...(standalone && {
        grip: 'two-hand-head-cradle',
        propClip: new THREE.AnimationClip(name + ' dumbbell', duration, [
          new THREE.VectorKeyframeTrack('.position', times, propPositions),
          new THREE.QuaternionKeyframeTrack('.quaternion', times, propTurns),
        ]),
      }),
    };
  }

  function cradleRep(amount, style) {
    crossBench();
    const press = style === 'press';
    const bent = style === 'bent';
    const shoulder = point('ArmL').add(point('ArmR')).multiplyScalar(.5);
    const swing = pitch(press ? .12 * amount : -lerp(.05, bent ? 1.60 : 1.79, amount));
    const distance = press ? lerp(.502, .228, amount) : bent ? .428 : .502;
    const wristCenter = shoulder.add(v(0, distance, .045).applyQuaternion(swing));
    const wristOffset = cradleHands[0].position.clone().add(cradleHands[1].position).multiplyScalar(.5);
    const position = wristCenter.sub(wristOffset.applyQuaternion(swing));
    sides.forEach(([side, sign], i) => {
      const grip = cradleHands[i];
      const wrist = grip.position.clone().applyQuaternion(swing).add(position);
      const pole = press ? v(sign, -.25, -.60) : v(sign * (bent ? .63 : .50), -.20, -.70).applyQuaternion(swing);
      armTo(side, sign, wrist, pole, null, { hand: swing.clone().multiply(grip.turn), elbow: pole });
    });
    return { position, turn: swing.multiply(cradleTurn) };
  }

  for (const [id, name, style] of [
    ['Bent-Arm_Dumbbell_Pullover', 'Bent-Arm Dumbbell Pullover', 'bent'],
    ['Straight-Arm_Dumbbell_Pullover', 'Straight-Arm Dumbbell Pullover', 'straight'],
    ['Close-Grip_Dumbbell_Press', 'Close-Grip Dumbbell Press', 'press'],
  ]) {
    const press = style === 'press';
    add(id, name, press ? 'Triceps' : 'Chest', press ? ['Chest', 'Shoulders'] : ['Upper back', 'Shoulders', 'Triceps'],
      'bench-cradle-dumbbell', (a) => cradleRep(a, style),
      ['Set your shoulders across the bench', 'Plant your feet, lower your hips, and support one head of the dumbbell with both palms.'],
      press ? ['Lower the weight toward your chest', 'Bend both elbows, then press straight back up.']
        : ['Arc the weight behind your head', style === 'bent' ? 'Keep the same bend in your elbows throughout the arc.'
          : 'Keep your arms nearly straight throughout the arc.'],
      { benchTransform: crossPad, phases: lower });
  }

  add('Dumbbell_Lying_Supination', 'Dumbbell Lying Supination', 'Forearms', [], 'bench-dumbbell-left', (a) => {
    sideLying();
    const angle = flat * a;
    const upper = v(.025, -.07, -1).normalize();
    const direction = v(Math.cos(angle), Math.sin(angle), 0);
    const distal = direction.clone().addScaledVector(upper, -direction.dot(upper));
    arm('L', 1, upper, distal, v(-Math.sin(angle), Math.cos(angle), .08), { elbow: x });
  }, ['Set up on your side', 'Rest your head on the lower arm and tuck the working elbow against your torso.'],
  ['Rotate the forearm toward the ceiling', 'Keep a right angle at the elbow and bring the forearm back to horizontal.']);

  add('Dumbbell_Shoulder_Press', 'Dumbbell Shoulder Press', 'Shoulders', ['Triceps'], 'incline-bench-dumbbells', (a) => {
    supportedShoulderPress();
    for (const [side, sign] of sides) {
      const wrist = point('Arm' + side).add(v(-sign * lerp(.270, -.011, a), lerp(.106, .502, a), lerp(-.090, -.060, a)));
      armTo(side, sign, wrist, v(-sign, -.50, .28), v(0, 0, -1));
    }
  }, ['Start with the weights at shoulder height', 'Brace against the backrest and face your palms forward.'],
  ['Press up and bring the weights together', 'Finish with both weights above your shoulders, then lower evenly.'],
  { benchTransform: upright });

  add('Hammer_Grip_Incline_DB_Bench_Press', 'Hammer Grip Incline DB Bench Press', 'Chest', ['Shoulders', 'Triceps'],
    'incline-bench-dumbbells', (a) => {
      lowIncline();
      for (const [side, sign] of sides) {
        const wrist = point('Arm' + side).add(v(-sign * lerp(.054, .224, a), lerp(.517, .244, a), lerp(-.085, -.100, a)));
        armTo(side, sign, wrist, v(-sign, -.35, -.39), v(sign, 0, 0));
      }
    }, ['Set up with a neutral grip', 'Keep your hips and back on the bench and face your palms toward each other.'],
    ['Lower slowly and press back up', 'Keep the weights over your elbows as they descend beside your chest.'],
    { benchTransform: low, phases: [[0, 'Setup'], [.25, 'Lower'], [2.05, 'Pause'], [2.4, 'Press'], [3.26, 'Reset']] });

  add('Incline_Dumbbell_Flyes', 'Incline Dumbbell Flyes', 'Chest', ['Shoulders'], 'incline-bench-dumbbells', (a) => {
    lowIncline();
    const sweep = lerp(-.11, 1.44, a);
    for (const [side, sign] of sides) {
      const upper = v(-sign * Math.sin(sweep), Math.cos(sweep), -.19).normalize();
      const bend = v(sign * .14, .14, -.95);
      bend.addScaledVector(upper, -bend.dot(upper)).normalize();
      const distal = upper.clone().multiplyScalar(Math.cos(.31)).addScaledVector(bend, Math.sin(.31));
      arm(side, sign, upper, distal, z.clone().lerp(y, a), { elbow: bend });
    }
  }, ['Start above the chest', 'Set the pad to 30 degrees, keep a soft bend in your elbows, and face the palms toward you.'],
  ['Open at the shoulders and turn the palms up', 'Keep the same elbow bend as you open wide and reverse the arc.'],
  { benchTransform: low, phases: lower });

  function curl(side, sign, upper, path, amount, { top = 2.24, bottom = .10, supinated = false, extension = 0 } = {}) {
    upper.normalize();
    path.addScaledVector(upper, -path.dot(upper)).normalize();
    const bend = lerp(bottom, top, amount);
    const distal = upper.clone().multiplyScalar(Math.cos(bend)).addScaledVector(path, Math.sin(bend));
    const palmUp = path.clone().multiplyScalar(Math.cos(bend)).addScaledVector(upper, -Math.sin(bend));
    const outward = upper.clone().cross(path).normalize();
    if (outward.x * sign > 0) outward.negate();
    const palm = supinated ? palmUp : outward.lerp(palmUp, smoothstep(amount, .08, .76));
    arm(side, sign, upper, distal, palm, { along: distal.clone().addScaledVector(palmUp, -extension), elbow: path });
  }

  add('Flexor_Incline_Dumbbell_Curls', 'Flexor Incline Dumbbell Curls', 'Biceps', [], 'incline-bench-dumbbells', (a) => {
    curlIncline();
    for (const [side, sign] of sides) {
      curl(side, sign, v(-sign * .47, -1, .045), v(-sign * .18, 0, -1), a, { supinated: true, extension: .38 });
    }
  }, ['Set the bench to 45 degrees', 'Hold each shaft off center with the longer end toward you. Keep your palms forward and wrists extended.'],
  ['Curl both weights together', 'Keep the palms turned up and hold the wrist angle through the curl.'],
  { benchTransform: steep, dumbbellOffsets: [-.008, .008] });

  add('Lying_Supine_Dumbbell_Curl', 'Lying Supine Dumbbell Curl', 'Biceps', [], 'bench-dumbbells', (a) => {
    supine();
    for (const [side, sign] of sides) {
      curl(side, sign, v(sign * .67, -.60, .39), v(sign * .40, .47, .82), a, { top: 2.27 });
    }
  }, ['Lie flat and lower your arms beside the pad', 'Start with palms facing in and keep your upper arms low.'],
  ['Curl and turn the palms up', 'Keep the elbows still and squeeze at the top.']);

  add('Seated_Dumbbell_Inner_Biceps_Curl', 'Seated Dumbbell Inner Biceps Curl', 'Biceps', [], 'bench-dumbbells', (a) => {
    seated();
    for (const [side, sign] of sides) curl(side, sign, v(sign * .34, -1, -.07), v(sign * .90, .18, .73), a);
  }, ['Sit tall with your palms in', 'Keep the elbows near your ribs and let the arms hang.'],
  ['Curl out and up', 'Turn the palms out as the dumbbells rise toward the outer shoulders.']);

  function wristCurl(side, sign, upper, distal, amount, palmsUp) {
    const bend = lerp(.58, -.58, amount);
    const hand = openHand(sign, distal, palmsUp ? y.clone().negate() : y);
    const hinge = handDorsal().cross(handAlong(sign)).applyQuaternion(hand);
    hand.premultiply(rotation(hinge, Math.sign(hinge.x) * bend));
    arm(side, sign, upper, distal, null, { hand });
  }

  function kneel() {
    torso(v(0, .498, -.496), pitch(1.05), pitch(.39));
    for (const [side, sign] of sides) leg(side, v(sign * .215, .129, -.706), v(sign * .10, -.65, 1), pitch(-1.35));
  }

  for (const [id, name, palmsUp, surface] of [
    ['Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench', 'Palms-Down Dumbbell Wrist Curl Over A Bench', false, 'bench'],
    ['Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench', 'Palms-Up Dumbbell Wrist Curl Over A Bench', true, 'bench'],
    ['Seated_Dumbbell_Palms-Up_Wrist_Curl', 'Seated Dumbbell Palms-Up Wrist Curl', true, 'thighs'],
    ['Seated_One-Arm_Dumbbell_Palms-Down_Wrist_Curl', 'Seated One-Arm Dumbbell Palms-Down Wrist Curl', false, 'thigh'],
    ['Seated_One-Arm_Dumbbell_Palms-Up_Wrist_Curl', 'Seated One-Arm Dumbbell Palms-Up Wrist Curl', true, 'thigh'],
  ]) {
    const kneeling = surface === 'bench';
    const single = surface === 'thigh';
    add(id, name, 'Forearms', [], single ? 'bench-dumbbell-right' : 'bench-dumbbells', (a) => {
      if (kneeling) kneel();
      else thighBrace();
      for (const [side, sign] of sides) {
        if (single && side === 'L') {
          const hand = supportHands.pose(sign, v(-.16, -.09, -1), y);
          armTo(side, sign, v(.223, .563, .764), v(.16, -1, .15), null, { hand });
          continue;
        }
        const wrist = point('Hand' + side);
        const segments = kneeling ? [v(sign * .205, palmsUp ? .488 : .479, -.014).sub(point('Arm' + side)), z]
          : [point('Forearm' + side).sub(point('Arm' + side)), wrist.clone().sub(point('Forearm' + side))];
        wristCurl(side, sign, ...segments, a, palmsUp);
      }
    }, [kneeling ? 'Kneel facing the side of the bench' : 'Sit with both feet flat',
      'Rest ' + (single ? 'your right forearm' : 'both forearms') + ' on ' +
      (kneeling ? 'the pad' : single ? 'the right thigh' : 'your thighs') + ' with the wrists over the edge and palms ' +
      (palmsUp ? 'up.' : 'down.')],
    ['Curl the weight' + (single ? '' : 's') + ' upward', 'Keep the forearms supported and move only at the wrists.'],
    { benchTransform: kneeling ? wristPad : undefined });
  }

  add('Reverse_Flyes', 'Reverse Flyes', 'Shoulders', [], 'incline-bench-dumbbells', (a) => {
    proneIncline();
    const sweep = lerp(.27, flat, a);
    for (const [side, sign] of sides) {
      const upper = v(sign * Math.sin(sweep), -Math.cos(sweep), .45 * (1 - a)).normalize();
      const bend = z.clone().addScaledVector(upper, -upper.z).normalize();
      const distal = upper.clone().multiplyScalar(Math.cos(.22)).addScaledVector(bend, Math.sin(.22));
      const palm = v(-sign * Math.cos(sweep), -Math.sin(sweep), .05);
      arm(side, sign, upper, distal, palm, { elbow: bend });
    }
  }, ['Lie face down on the incline', 'Brace through the balls of your feet and start with the weights below your shoulders.'],
  ['Sweep both weights out to the sides', 'Keep the elbow bend and neutral grip as you raise the arms to horizontal.'],
  { benchTransform: low });

  for (const [id, name, single] of [
    ['Seated_Bent-Over_One-Arm_Dumbbell_Triceps_Extension', 'Seated Bent-Over One-Arm Dumbbell Triceps Extension', true],
    ['Seated_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension', 'Seated Bent-Over Two-Arm Dumbbell Triceps Extension', false],
  ]) {
    add(id, name, 'Triceps', [], single ? 'bench-dumbbell-left' : 'bench-dumbbells', (a) => {
      seated(1.34, .158, .907, .412);
      for (const [side, sign] of sides) {
        if (single && side === 'R') {
          const hand = supportHands.pose(sign, v(-.10, -.10, .98), y);
          armTo(side, sign, v(-.213, .532, .879), v(-.31, -.85, -.30), null, { hand });
          continue;
        }
        const upper = v(sign * .60, -.11, -1).normalize();
        const down = y.clone().negate().addScaledVector(upper, upper.y).normalize();
        const bend = lerp(1.43, .08, a);
        const distal = upper.clone().multiplyScalar(Math.cos(bend)).addScaledVector(down, Math.sin(bend));
        arm(side, sign, upper, distal, v(-sign, 0, 0), { elbow: down });
      }
    }, ['Sit at the end of the bench and hinge forward', 'Hold the upper arms alongside your torso and let the working forearms point down.'],
    ['Extend behind you', 'Keep the upper arm still while straightening the elbow.']);
  }

  add('Seated_Side_Lateral_Raise', 'Seated Side Lateral Raise', 'Shoulders', [], 'bench-dumbbells', (a) => {
    seated(.055);
    const sweep = lerp(.30, flat, a);
    for (const [side, sign] of sides) {
      const upper = v(sign * Math.sin(sweep), -Math.cos(sweep), .07).normalize();
      const distal = upper.clone().add(v(0, -.095, .115));
      arm(side, sign, upper, distal, v(-sign * Math.cos(sweep), -Math.sin(sweep), .20 * a));
    }
  }, ['Sit with your weights beside your legs', 'Plant both feet and start with palms facing inward.'],
  ['Lift out to shoulder height', 'Keep the torso still and tip the front ends of the weights slightly down.']);

  add('Standing_One-Arm_Dumbbell_Curl_Over_Incline_Bench', 'Standing One-Arm Dumbbell Curl Over Incline Bench',
    'Biceps', [], 'incline-bench-dumbbell-left', (a) => {
      const turn = pitch(-.27).multiply(reverse);
      torso(v(.257, .868, .673), turn, pitch(-.07).multiply(reverse));
      for (const [side, sign] of sides) leg(side, v(.257 - sign * .273, .074, .815), v(-sign * .15, 0, -1), reverse);
      const hand = supportHands.pose(-1, v(-.30, -.60, -.55), v(0, .50, -.866));
      armTo('R', -1, v(.118, 1.101, .329), v(.86, -.32, .20), null, { hand });
      curl('L', 1, v(.045, -.70, -.714), v(0, .714, -.70), a, { top: 2.34, bottom: .35, supinated: true });
    }, ['Stand behind the high end of the incline', 'Set your feet wide, rest the working upper arm along the pad, and brace the other hand at the corner.'],
    ['Curl toward your shoulder', 'Keep the working upper arm planted and lower the weight slowly.'],
    { benchTransform: upright });

  return entries;
}
