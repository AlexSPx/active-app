import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createEntries as createFlatEntries } from './flat-bench-exercises.mjs';
import { createEntries as createInclineEntries } from './incline-bench-exercises.mjs';
import { createEntries as createCompoundEntries } from './dumbbell-compound.mjs';
import { forearmRoll, handAlong, handDorsal, openHand } from './hand-frame.mjs';

export const groupLabel = 'Dumbbell bench and step';
export const stepPlatformHeight = .30;

export function createStepPlatform() {
  const platform = new THREE.Mesh(new THREE.BoxGeometry(.60, stepPlatformHeight, .52),
    new THREE.MeshStandardMaterial({ color: 0x434343, roughness: .9 }));
  platform.name = 'Step platform';
  platform.geometry.translate(0, stepPlatformHeight / 2, .48);
  return platform;
}

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const { lerp, smoothstep } = THREE.MathUtils;
const x = v(1), y = v(0, 1), z = v(0, 0, 1);
const rotation = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const pitch = (angle) => rotation(x, angle);
const flat = Math.PI / 2;
const reverse = rotation(y, Math.PI);
const sides = [['L', 1], ['R', -1]];
const prefix = 'local:exercise:';
const shoulders = ['Shoulders'];
const triceps = ['Triceps'];
const quads = ['Quadriceps'];
const lift = [[0, 'Setup'], [.25, 'Lift'], [1.35, 'Hold'], [2, 'Lower'], [3.35, 'Reset']];
const lower = [[0, 'Setup'], [.25, 'Lower'], [1.8, 'Pause'], [2.1, 'Lift'], [3.35, 'Reset']];
const duration = 3.6;

function orient(from, to, reference, facing) {
  const axis = to.clone().normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), axis);
  const actual = reference.clone().applyQuaternion(turn);
  const twist = Math.atan2(axis.dot(actual.clone().cross(facing)), actual.dot(facing));
  return turn.premultiply(rotation(axis, twist));
}

export function createEntries(asset, { createDumbbellGripTracks, dumbbellGripTransform }) {
  const { onlyExercises } = asset;
  const figure = clone(asset.scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const pelvis = bone('Pelvis');
  const joints = ['Pelvis', 'Lumbar', 'Chest', 'Head', ...sides.flatMap(([side]) =>
    ['Arm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot'].map((name) => name + side))];
  const rest = joints.map((name) => bone(name).quaternion.clone());
  const grip = createDumbbellGripTracks(figure);
  const helpers = { createPowerGripTracks: createDumbbellGripTracks };
  const shaft = (sign) => x.clone().applyQuaternion(dumbbellGripTransform(sign).quaternion);
  const entries = {};

  function basePose(createEntries, id) {
    const { clip } = createEntries({ scene: asset.scene, onlyExercises: [id] }, helpers)[prefix + id];
    const tracks = clip.tracks.filter(({ name }) =>
      name === 'Pelvis.position' || joints.includes(name.split('.')[0]));
    const values = tracks.map((track) => [track.createInterpolant().evaluate(0).slice(), track.name.split('.')]);
    return () => {
      for (const [value, [name, property]] of values) bone(name)[property].fromArray(value);
    };
  }

  const supine = basePose(createFlatEntries, 'Dumbbell_Bench_Press');
  const lowIncline = basePose(createInclineEntries, 'Incline_Dumbbell_Press');
  const curlIncline = basePose(createInclineEntries, 'Incline_Dumbbell_Curl');
  const stand = basePose(createCompoundEntries, 'Dumbbell_Lunges');

  function world(name, turn) {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(turn));
  }

  function torso(position, turn, head = turn) {
    pelvis.position.copy(position);
    for (const name of ['Pelvis', 'Lumbar', 'Chest']) world(name, turn);
    world('Head', head);
  }

  function reach(first, second, third, end, pole) {
    const axis = end.clone().sub(point(first));
    const a = bone(second).position.length();
    const b = bone(third).position.length();
    const distance = THREE.MathUtils.clamp(axis.length(), Math.abs(a - b) + .0001, a + b - .0001);
    axis.normalize();
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const upper = axis.clone().multiplyScalar(along).addScaledVector(bend, Math.sqrt(a * a - along * along));
    return [upper, axis.multiplyScalar(distance).sub(upper)];
  }

  function arm(side, sign, upper, lowerArm, palm, { along = lowerArm, axis, hand, elbow } = {}) {
    const [first, second, third] = ['Arm' + side, 'Forearm' + side, 'Hand' + side];
    const turn = hand ?? (axis
      ? orient(handAlong(sign), along, shaft(sign), axis)
      : openHand(sign, along, palm.clone().negate()));
    world(first, orient(bone(second).position, upper, z, elbow ?? lowerArm));
    world(second, forearmRoll(side, orient(bone(third).position, lowerArm, handDorsal(),
      handDorsal().applyQuaternion(turn)), lowerArm, turn));
    world(third, turn);
  }

  function armTo(side, sign, wrist, pole, palm, options) {
    arm(side, sign, ...reach('Arm' + side, 'Forearm' + side, 'Hand' + side, wrist, pole), palm, options);
  }

  function leg(side, ankle, pole, foot = new THREE.Quaternion(), rollReference = z) {
    const [first, second, third] = ['Thigh' + side, 'Shin' + side, 'Foot' + side];
    const [upper, lowerLeg] = reach(first, second, third, ankle, pole);
    const facing = rollReference.clone().applyQuaternion(foot);
    world(first, orient(bone(second).position, upper, rollReference, facing));
    world(second, orient(bone(third).position, lowerLeg, rollReference, facing));
    world(third, foot);
  }

  function hang(side, sign, spread = 0) {
    arm(side, sign, v(sign * (.34 + spread), -1, .03), v(sign * (.13 + spread), -1, .18), v(-sign, 0, 0), { elbow: z });
  }

  function seated({ spread = .18, hinge = 0, seat = .56, front = .59, depth = .39 } = {}) {
    torso(v(0, seat, depth), pitch(hinge), pitch(hinge * .72));
    for (const [side, sign] of sides) leg(side, v(sign * spread, .074, front), v(sign * .16, 1, .35));
  }

  function uprightBench() {
    const turn = pitch(flat - Math.PI / 3 + .075).multiply(reverse);
    torso(v(0, .575, -.104), turn, pitch(.64).multiply(reverse));
    for (const [side, sign] of sides) {
      leg(side, v(-sign * .225, .074, -.44), v(-sign * .10, .80, -1), reverse);
    }
  }

  function proneBench(folded = false) {
    const turn = pitch(1.527);
    torso(v(0, .571, -.38), turn, pitch(folded ? 1.37 : 1.53));
    for (const [side, sign] of sides) leg(side, v(sign * .24, .074, -.72), v(sign * .6, -1, -.4));
    if (folded) {
      armTo('R', -1, v(.032, .499, .350), v(-1, -.6, .8), y.clone().negate(),
        { along: v(1, .08, .06) });
    } else {
      armTo('R', -1, v(-.186, .442, .046), v(-1, -.3, .5), x, { along: v(0, -.65, -.42) });
    }
  }

  function sideBench(angle) {
    const turn = pitch(-angle - .045).multiply(rotation(z, flat)).multiply(pitch(flat));
    const lengthwise = v(0, Math.sin(angle), Math.cos(angle));
    torso(angle ? v(.007, .708, .075) : v(0, .624, -.345), turn,
      pitch(.16).multiply(turn));
    for (const [side, sign] of sides) {
      const ankle = angle ? point('Thigh' + side).addScaledVector(lengthwise, -.56)
        .add(v(.41, .08 + sign * .065, 0)) : v(.090, .495 + (sign === 1 ? .15 : 0), -.460);
      leg(side, ankle, v(1, .27, -.65), turn);
    }
    if (angle) {
      armTo('R', -1, v(.13, .900, .40), v(1, .80, 0), v(-1, .3, 0), { along: v(-.30, .12, -.86) });
    } else {
      armTo('R', -1, v(.025, .503, .393), v(1, .8, .25), y.clone().negate(), { along: v(-1, 0, .10) });
    }
  }

  function proneIncline() {
    const angle = Math.PI / 6;
    torso(v(0, .717, .165), pitch(flat - angle), pitch(1.0));
    for (const [side, sign] of sides) {
      leg(side, v(sign * .36, .143, -.34), v(sign * .48, -.16, -.82), pitch(.43));
    }
  }

  function add(id, name, primary, supporting, equipment, pose, setup, motion, options = {}) {
    if (onlyExercises && !onlyExercises.includes(id)) return;
    const { phases = lift, framing = equipment.includes('bench') ? 'bench' : 'standing',
      benchTransform, customGrip, extraCues = [] } = options;
    const times = Array.from({ length: 181 }, (_, frame) => frame / 50);
    const [, [begin], [pause], [resume], [reset]] = phases;
    const values = joints.map(() => []);
    const positions = [];
    const propPositions = [];
    const propTurns = [];
    for (const time of times) {
      joints.forEach((name, index) => bone(name).quaternion.copy(rest[index]));
      pelvis.position.set(0, .897, 0);
      const amount = smoothstep(time, begin, pause) * (1 - smoothstep(time, resume, reset));
      const prop = pose(amount, time);
      positions.push(...pelvis.position.toArray());
      joints.forEach((name, i) => values[i].push(...bone(name).quaternion.toArray()));
      if (customGrip) {
        propPositions.push(...prop.position.toArray());
        propTurns.push(...prop.quaternion.toArray());
      }
    }
    const fingers = customGrip ?? grip.filter((track) =>
      equipment.endsWith('dumbbells') || track.name.endsWith('L.quaternion'));
    const tracks = joints.map((name, i) => new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, values[i]));
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions), ...fingers);
    const cues = [[0, ...setup], [begin, ...motion], ...extraCues];
    entries[prefix + id] = {
      name, primary, supporting, equipment, framing, benchTransform, phases, cues,
      clip: new THREE.AnimationClip(name, duration, tracks),
      ...(customGrip && {
        grip: 'two-hand-head-cradle',
        propClip: new THREE.AnimationClip(name + ' dumbbell', duration, [
          new THREE.VectorKeyframeTrack('.position', times, propPositions),
          new THREE.QuaternionKeyframeTrack('.quaternion', times, propTurns),
        ]),
      }),
    };
  }

  add('Around_The_Worlds', 'Around The Worlds', ['Chest'], shoulders, 'bench-dumbbells', (a) => {
    supine();
    const sweep = lerp(.24, Math.PI - .34, a);
    for (const [side, sign] of sides) {
      const upper = v(sign * Math.sin(sweep), .015, Math.cos(sweep));
      const lowerArm = v(sign * Math.sin(sweep + .17), .015, Math.cos(sweep + .17));
      arm(side, sign, upper, lowerArm, y, { elbow: y });
    }
  }, ['Lie flat with your palms up', 'Set the weights beside your thighs and soften the elbows.'],
  ['Sweep the weights around your head', 'Keep both arms close to parallel with the floor.']);

  add('Concentration_Curls', 'Concentration Curls', ['Biceps'], ['Forearms'], 'bench-dumbbell-left', (a) => {
    seated({ spread: .31, hinge: .94, front: .73, seat: .547 });
    const elbow = v(.213, .613, .702);
    const upper = elbow.sub(point('ArmL')).normalize();
    const axis = v(-.96, .18, -.08).normalize();
    const bend = lerp(.04, 2.10, a);
    arm('L', 1, upper, v(-.42, -1, .12).applyAxisAngle(axis, bend),
      z.clone().applyAxisAngle(axis, bend));
    armTo('R', -1, v(-.285, .604, .786), v(-.5, -.70, -.52), v(0, -1, 0), { along: v(-.18, -.12, 1) });
  }, ['Brace on the inner thigh', 'Sit with your feet wide and the back of your working upper arm against your thigh.'],
  ['Curl without moving the upper arm', 'Bring the dumbbell toward your shoulder and lower with control.']);

  add('Dumbbell_Incline_Shoulder_Raise', 'Dumbbell Incline Shoulder Raise', shoulders, triceps,
    'incline-bench-dumbbells', (a) => {
      lowIncline();
      world('Chest', pitch(flat - Math.PI / 6 + .07 - .23 * a).multiply(reverse));
      world('Head', pitch(flat - Math.PI / 6 + .15 - .14 * a).multiply(reverse));
      for (const [side, sign] of sides) {
        arm(side, sign, v(-sign * .055, 1, -.03), v(-sign * .025, 1, -.06), v(0, 0, -1),
          { elbow: z });
      }
    }, ['Set the weights over your shoulders', 'Keep your arms vertical and your feet planted.'],
    ['Reach toward the ceiling', 'Raise your shoulders off the pad while keeping the elbows straight.'],
    { benchTransform: { angle: Math.PI / 6 } });

  add('Dumbbell_Lying_Pronation', 'Dumbbell Lying Pronation', ['Forearms'], [], 'bench-dumbbell-left', (a) => {
    proneBench(true);
    const turn = lerp(0, flat, a);
    arm('L', 1, x, v(0, -Math.cos(turn), Math.sin(turn)), v(0, Math.sin(turn), Math.cos(turn)));
  }, ['Lie face down and bend the working elbow', 'Rest your head on the folded arm and hold the other upper arm out at shoulder height.'],
  ['Rotate the forearm forward', 'Keep the elbow at a right angle until the forearm approaches horizontal.']);

  add('Dumbbell_Squat_To_A_Bench', 'Dumbbell Squat To A Bench', quads,
    ['Calves', 'Glutes', 'Hamstrings', 'Upper back'], 'bench-dumbbells', (a) => {
      stand();
      torso(v(0, lerp(.883, .534, a), lerp(.020, -.175, a)), pitch(.27 * a), pitch(.04 * a));
      for (const [side, sign] of sides) {
        leg(side, v(sign * .172, .074, .147), v(sign * .21, .03, 1), rotation(y, sign * .17));
        const armJoints = ['Arm', 'Forearm', 'Hand'].map((name) => bone(name + side));
        const standing = armJoints.map((joint) => joint.quaternion.clone());
        hang(side, sign, .28);
        armJoints.forEach((joint, i) => joint.quaternion.slerp(standing[i], 1 - a));
      }
    }, ['Stand just in front of the bench', 'Set your feet about shoulder width with your toes slightly out.'],
    ['Sit back until you touch the pad', 'Keep the feet planted and drive through them to stand.'],
    { phases: lower, benchTransform: { position: [0, 0, -.332], yaw: flat } });

  const stepPhases = [[0, 'Setup'], [.25, 'Plant the lead foot'], [1, 'Step up'], [1.75, 'Stand tall'],
    [2.05, 'Step down'], [2.8, 'Return the lead foot'], [3.35, 'Reset']];
  add('Dumbbell_Step_Ups', 'Dumbbell Step Ups', quads, ['Calves', 'Glutes', 'Hamstrings'],
    'step-platform-dumbbells', (_, time) => {
      const rise = smoothstep(time, 1, 1.74) * (1 - smoothstep(time, 2.05, 2.8));
      const plant = smoothstep(time, .25, 1) * (1 - smoothstep(time, 2.8, 3.35));
      torso(v(.10 * (plant - rise), .881 + .30 * rise - .066 * (plant - rise), lerp(-.26, .377, rise)),
        pitch(.16 * (plant - rise)), pitch(.05));
      for (const [side, sign] of sides) {
        const step = sign === 1 ? plant : smoothstep(time, 1.18, 1.75) * (1 - smoothstep(time, 2.05, 2.72));
        const arc = Math.sin(Math.PI * step);
        leg(side, v(sign * .15, .074 + stepPlatformHeight * step + .29 * arc, lerp(-.312, .36, step)),
          v(sign * .10, 0, 1), undefined, x);
        hang(side, sign, .20);
      }
    }, ['Face the platform', 'Hold the dumbbells at your sides.'],
    ['Plant the whole lead foot', 'Set your heel on top before you transfer your weight.'], {
      phases: stepPhases,
      extraCues: [[1, 'Drive through the lead heel', 'Straighten the lead knee and hip, then bring the trailing foot up.'],
        [2.05, 'Step down with the trailing foot first', 'Keep your weight on the lead leg until the trailing foot reaches the floor.']],
    });

  add('External_Rotation', 'External Rotation', shoulders, [], 'bench-dumbbell-left', (a) => {
    sideBench(0);
    const angle = flat * a;
    arm('L', 1, v(.025, -.07, -1), v(Math.cos(angle), Math.sin(angle), 0),
      v(-Math.sin(angle), Math.cos(angle), 0), { elbow: x });
  }, ['Lie on your side with the upper elbow tucked', 'Rest your head on the lower arm and bend the working elbow to a right angle.'],
  ['Rotate up around the upper arm', 'Keep the elbow at your side as the forearm turns from in front of you toward the ceiling.']);

  add('Incline_Inner_Biceps_Curl', 'Incline Inner Biceps Curl', ['Biceps'], [], 'incline-bench-dumbbells', (a) => {
    curlIncline();
    for (const [side, sign] of sides) {
      const upper = v(-sign * .64, -1, .03).normalize();
      const direction = v(-sign * .65, .35, -.57).addScaledVector(upper,
        -v(-sign * .65, .35, -.57).dot(upper)).normalize();
      const bend = lerp(.09, 2.24, a);
      const lowerArm = upper.clone().multiplyScalar(Math.cos(bend)).addScaledVector(direction, Math.sin(bend));
      const palm = direction.clone().multiplyScalar(Math.cos(bend)).addScaledVector(upper, -Math.sin(bend));
      arm(side, sign, upper, lowerArm, palm);
    }
  }, ['Lean back with your palms turned out', 'Let your arms hang just outside the pad.'],
  ['Curl out and up', 'Keep your upper arms fixed and bring the weights to the sides of your shoulders.'],
  { benchTransform: { angle: Math.PI / 4 } });

  add('Lying_Dumbbell_Tricep_Extension', 'Lying Dumbbell Tricep Extension', triceps, ['Chest', 'Shoulders'],
    'bench-dumbbells', (a) => {
      supine();
      const bend = lerp(.04, 1.61, a);
      for (const [side, sign] of sides) {
        arm(side, sign, v(sign * .05, 1, -.17), v(sign * .02, Math.cos(bend), -Math.sin(bend)),
          v(-sign, 0, 0), { elbow: v(0, 0, -1) });
      }
    }, ['Stack the weights above your shoulders', 'Keep your palms facing in and your elbows tucked.'],
    ['Bend at the elbows', 'Lower the weights beside your ears, then extend without moving the upper arms.'],
    { phases: lower });

  add('Lying_One-Arm_Lateral_Raise', 'Lying One-Arm Lateral Raise', shoulders, [], 'bench-dumbbell-left', (a) => {
    proneBench();
    const sweep = lerp(.48, flat, a);
    arm('L', 1, v(Math.sin(sweep), -Math.cos(sweep), 0), v(Math.sin(sweep), -Math.cos(sweep) * .58, .19),
      v(-Math.cos(sweep), -Math.sin(sweep), .15), { elbow: z });
  }, ['Lie chest down and brace with your free hand', 'Start with the working arm hanging beside the pad.'],
  ['Lift directly to the side', 'Keep a soft elbow and stop when the arm reaches shoulder height.']);

  const thirty = { benchTransform: { angle: Math.PI / 6 } };
  add('Middle_Back_Shrug', 'Middle Back Shrug', ['Upper back'], [], 'incline-bench-dumbbells', (a) => {
    proneIncline();
    world('Chest', pitch(flat - Math.PI / 6 - .09 * a));
    for (const [side, sign] of sides) {
      arm(side, sign, v(sign * lerp(.19, .32, a), -1, lerp(.08, -.06, a)),
        v(sign * lerp(.12, .22, a), -1, lerp(.03, -.05, a)), v(-sign, 0, 0), { elbow: z });
    }
  }, ['Support your chest and let the weights hang', 'Face your palms toward each other.'],
  ['Squeeze the shoulder blades together', 'Keep the elbows straight and the motion small.'], thirty);

  add('One-Arm_Incline_Lateral_Raise', 'One-Arm Incline Lateral Raise', shoulders, [], 'incline-bench-dumbbell-left', (a) => {
    sideBench(Math.PI / 6);
    const sweep = lerp(.04, 1.46, a);
    const upper = v(Math.cos(sweep), Math.sin(sweep), -.08);
    arm('L', 1, upper, upper.clone().add(v(0, 0, .09)), v(0, 0, 1), { axis: z, elbow: y });
  }, ['Lie sideways with your lower shoulder on the pad', 'Keep the upper arm out in front with a soft elbow.'],
  ['Raise toward the ceiling', 'Keep the dumbbell shaft level through the arc.'], thirty);

  add('Reverse_Flyes_With_External_Rotation', 'Reverse Flyes With External Rotation', shoulders, [],
    'incline-bench-dumbbells', (a) => {
      proneIncline();
      const sweep = lerp(.32, 1.65, a);
      for (const [side, sign] of sides) {
        const upper = v(sign * Math.sin(sweep), -Math.cos(sweep), .18 + .32 * a);
        const forearm = upper.clone().add(v(0, -.06, .20));
        const palm = v(0, -1, -.53).lerp(v(-sign, .20, .55), a);
        arm(side, sign, upper, forearm, palm, { elbow: z });
      }
    }, ['Lie face down on the 30-degree pad', 'Set the balls of your feet on the floor and soften your elbows.'],
    ['Sweep wide and rotate your grip', 'Turn the palms toward each other as the weights reach head level.'], thirty);

  add('Seated_Bent-Over_Rear_Delt_Raise', 'Seated Bent-Over Rear Delt Raise', shoulders, [],
    'bench-dumbbells', (a) => {
      seated({ spread: .115, hinge: 1.22, front: .80, seat: .576, depth: .427 });
      const sweep = lerp(.13, flat, a);
      for (const [side, sign] of sides) {
        const upper = v(sign * Math.sin(sweep), -Math.cos(sweep), -.18);
        arm(side, sign, upper, upper.clone().add(v(sign * .10, -.10, .25)),
          v(-sign * Math.cos(sweep), -Math.sin(sweep), 0), { elbow: z });
      }
    }, ['Sit with your knees together and hinge forward', 'Let the weights hang beside your calves with the palms facing in.'],
    ['Raise the weights straight out', 'Keep the torso still and stop around shoulder height.']);

  add('Seated_Dumbbell_Curl', 'Seated Dumbbell Curl', ['Biceps'], [], 'bench-dumbbells', (a) => {
    seated({ seat: .568, front: .66 });
    const bend = lerp(.10, 2.32, a);
    for (const [side, sign] of sides) {
      const upper = v(sign * .47, -1, -.02);
      const axis = v(-1, -sign * .47, 0).normalize();
      const lowerArm = upper.clone().applyAxisAngle(axis, bend);
      const palm = v(-sign, 0, 0).lerp(z, smoothstep(a, .12, .63)).applyAxisAngle(axis, bend);
      arm(side, sign, upper, lowerArm, palm, { elbow: z });
    }
  }, ['Sit tall with your arms hanging', 'Keep your palms facing your legs and your elbows by your ribs.'],
  ['Curl and turn the palms up', 'Begin turning after the weights clear your thighs.']);

  add('Seated_Dumbbell_Palms-Down_Wrist_Curl', 'Seated Dumbbell Palms-Down Wrist Curl', ['Forearms'],
    [], 'bench-dumbbells', (a) => {
      seated({ spread: .235, hinge: .94, front: .713, seat: .556 });
      for (const [side, sign] of sides) {
        const wrist = v(sign * .235, .577, .933);
        const [upper, lowerArm] = reach('Arm' + side, 'Forearm' + side, 'Hand' + side, wrist, v(sign * .04, -1, .10));
        const along = lowerArm.clone().applyAxisAngle(x, lerp(.39, -.59, a));
        arm(side, sign, upper, lowerArm, v(0, -1, 0), { along, elbow: z });
      }
    }, ['Rest your forearms on your thighs', 'Let your wrists extend past the knees and hold both weights palms down.'],
    ['Lift through the wrists', 'Keep the forearms supported as you raise and lower the dumbbells.']);

  const upright = { benchTransform: { angle: Math.PI / 3 } };
  add('Seated_Dumbbell_Press', 'Seated Dumbbell Press', shoulders, triceps, 'incline-bench-dumbbells', (a) => {
    uprightBench();
    for (const [side, sign] of sides) {
      const shoulder = point('Arm' + side);
      const end = shoulder.add(v(-sign * lerp(.238, -.004, a), lerp(.115, .500, a), lerp(-.075, -.042, a)));
      armTo(side, sign, end, v(-sign * .68, -.59, .28), v(0, 0, -1));
    }
  }, ['Sit against the back pad', 'Start at shoulder height with the palms facing forward.'],
  ['Press up and slightly inward', 'Extend both arms and lower under control.'], upright);

  const cradle = {
    Thumb: [[-26, -10, -12], [18, 5, 12], [10, 0, 0]],
    Index: [[-10, 0, -12], [14, 0, 0], [11, 0, 0]],
    Middle: [[-13, 0, -5], [17, 0, 0], [12, 0, 0]],
    Ring: [[-10, 0, 3], [18, 0, 0], [12, 0, 0]],
    Little: [[-6, 0, 9], [20, 0, 0], [13, 0, 0]],
  };
  const customGrip = sides.flatMap(([side, sign]) => Object.entries(cradle).flatMap(([digit, angles]) =>
    angles.map(([flex, twist, spread], index) => {
      const name = digit + (index + 1) + side;
      const rad = THREE.MathUtils.degToRad;
      const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(flex), rad(sign * twist),
        rad(sign * spread), 'ZXY'));
      return new THREE.QuaternionKeyframeTrack(name + '.quaternion', [0],
        bone(name).quaternion.clone().multiply(offset).toArray());
    })));

  add('Seated_Triceps_Press', 'Seated Triceps Press', triceps, [], 'incline-bench-cradle-dumbbell', (a) => {
    uprightBench();
    const swing = pitch(lerp(.06, 1.58, a));
    const shoulder = point('ArmL').add(point('ArmR')).multiplyScalar(.5);
    const upper = v(.062, .25, .105).normalize().multiplyScalar(bone('ForearmL').position.length());
    const elbowCenter = shoulder.add(v(0, upper.y, upper.z));
    const wristHalfWidth = .06365;
    const elbowHalfWidth = Math.abs(point('ArmL').x) - upper.x;
    const forearmLength = bone('HandL').position.length();
    const sagittalLength = Math.sqrt(forearmLength ** 2 - (elbowHalfWidth - wristHalfWidth) ** 2);
    const lowerArm = v(0, sagittalLength, 0).applyQuaternion(swing);
    const wristCenter = elbowCenter.add(lowerArm);
    // The upper head sits on the palms. This offset was fit against the skinned hands.
    const position = wristCenter.clone().sub(v(0, -.04781, -.04361).applyQuaternion(swing));
    for (const [side, sign] of sides) {
      const hand = swing.clone().multiply(openHand(sign, v(sign * .11164, .99375, -.32612),
        v(-sign * .73836, -.11164, -.25852)));
      arm(side, sign, v(sign * upper.x, upper.y, upper.z),
        lowerArm.clone().add(v(sign * (elbowHalfWidth - wristHalfWidth), 0, 0)), null,
        { hand, elbow: z });
    }
    return { position, quaternion: swing.multiply(rotation(z, flat)) };
  }, ['Cradle one dumbbell overhead', 'Use both palms beneath the upper head with the thumbs wrapped inward.'],
  ['Lower behind the head', 'Keep the elbows high and extend them to return the weight overhead.'],
  { ...upright, phases: lower, customGrip });

  add('Split_Squat_with_Dumbbells', 'Split Squat with Dumbbells', quads, ['Glutes', 'Hamstrings'],
    'bench-dumbbells', (a) => {
      torso(v(.02, lerp(.851, .629, a), lerp(.015, -.035, a)), pitch(lerp(.09, .22, a)), pitch(.04));
      leg('L', v(.135, .074, .268), v(.10, 0, 1));
      // The top of the rear foot rests on the pad with the laces down.
      leg('R', v(-.135, .636, -.560), v(-.08, -.80, .55), pitch(1.43));
      for (const [side, sign] of sides) hang(side, sign);
    }, ['Set your rear foot on the pad', 'Keep the front foot flat and let the weights hang at your sides.'],
    ['Lower between your feet', 'Track the front knee over the foot and drive through the front heel.'],
    { phases: lower, benchTransform: { position: [0, 0, -.613], yaw: flat } });

  add('Tate_Press', 'Tate Press', triceps, ['Chest', 'Shoulders'], 'bench-dumbbells', (a) => {
    supine();
    for (const [side, sign] of sides) {
      const upper = v(sign * .80, .60, -.03);
      const bend = lerp(.77, 1.90, a);
      const lowerArm = upper.clone().applyAxisAngle(z, sign * bend);
      arm(side, sign, upper, lowerArm, v(0, 0, 1), { elbow: v(-sign, 0, 0) });
    }
  }, ['Start above your chest with the palms forward', 'Keep the elbows wide and the weights close together.'],
  ['Fold the weights inward toward the chest', 'Keep the upper arms still and reverse the arc before resting the weights.'],
  { phases: [[0, 'Setup'], [.25, 'Lower'], [2, 'Pause'], [2.45, 'Press'], [3.3, 'Reset']] });

  return entries;
}
