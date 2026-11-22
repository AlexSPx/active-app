import * as THREE from 'three';
import { forearmRoll, openHand, relaxedFingerTracks } from './hand-frame.mjs';
import * as finalConditioning from './final-conditioning.mjs';
import * as finalStrength from './final-strength.mjs';
import * as finalApparatus from './final-apparatus.mjs';
import * as machineGuided from './machine-guided.mjs';
import * as machineStrength from './machine-strength.mjs';
import * as mobilityBall from './mobility-ball.mjs';
import * as supplementalBarbell from './supplemental-barbell.mjs';
import * as supplementalCable from './supplemental-cable.mjs';
import * as supplementalBench from './supplemental-bench.mjs';
import * as supplementalBall from './supplemental-ball.mjs';
import * as supplementalAccessories from './supplemental-accessories.mjs';
import * as bodyweightCatalog from './bodyweight-catalog-more.mjs';
import * as dumbbellCatalog from './dumbbell-catalog-more.mjs';
import * as barbellCatalog from './barbell-catalog-more.mjs';
import * as kettlebellCatalog from './kettlebell-catalog-more.mjs';
import * as cableTraining from './cable-training.mjs';
import * as bandTraining from './band-training.mjs';
import * as declineBenchTraining from './decline-bench-training.mjs';
import * as bodyweightSupport from './bodyweight-support.mjs';

import { createEntries as createConditioningExercises } from './bodyweight-conditioning.mjs';
import { createEntries as createSupineCore } from './supine-core.mjs';
import { createEntries as createUprightBodyweight } from './bodyweight-upright-extra.mjs';
import { createEntries as createAdditionalDumbbell } from './dumbbell-extra.mjs';
import { createEntries as createAdditionalFloorBodyweight } from './bodyweight-floor-extra.mjs';
import { createEntries as createStandingBodyweight } from './bodyweight-standing.mjs';
import { createEntries as createFloorBodyweight } from './bodyweight-floor.mjs';
import { createEntries as createStandingDumbbell } from './dumbbell-standing.mjs';
import { createEntries as createStandingBarbell } from './barbell-standing.mjs';
import { createEntries as createBenchExercises } from './flat-bench-exercises.mjs';
import { createEntries as createMobilityExercises } from './mobility-exercises.mjs';
import { createEntries as createDumbbellCompound } from './dumbbell-compound.mjs';
import { createEntries as createPullUpExercises } from './pull-up-bar-exercises.mjs';
import { createEntries as createKettlebellExercises } from './kettlebell-exercises.mjs';
import { createEntries as createRackExercises } from './rack-exercises.mjs';
import { createEntries as createInclineBenchExercises } from './incline-bench-exercises.mjs';
import { createEntries as createDipStationExercises } from './dip-station-exercises.mjs';
import { createEntries as createEzCurlExercises } from './ez-curl-exercises.mjs';
import { createEntries as createFloorCoreExercises } from './floor-core-next.mjs';
import { createEntries as createStandingMobilityExercises } from './upright-next.mjs';
import { createEntries as createFreeWeightExercises } from './dumbbell-next.mjs';
import { createEntries as createBarbellExpansion } from './barbell-expansion.mjs';
import { createEntries as createBodyweightExpansion, groupLabel as bodyweightExpansionLabel } from './bodyweight-expansion.mjs';
import { createEntries as createDumbbellExpansion, groupLabel as dumbbellExpansionLabel } from './dumbbell-expansion.mjs';
import { createEntries as createBodyweightMobility, groupLabel as bodyweightMobilityLabel } from './bodyweight-mobility-more.mjs';
import { createEntries as createDumbbellBenchMore, groupLabel as dumbbellBenchMoreLabel } from './dumbbell-bench-more.mjs';
import { createEntries as createBarbellStandingMore, groupLabel as barbellStandingMoreLabel } from './barbell-standing-more.mjs';
import { createEntries as createBarbellSupportedMore, groupLabel as barbellSupportedMoreLabel } from './barbell-supported-more.mjs';
import { createEntries as createKettlebellMore, groupLabel as kettlebellMoreLabel } from './kettlebell-more.mjs';

const squatPhases = [[0, 'Setup'], [.48, 'Descent'], [1.88, 'Bottom'], [2.28, 'Ascent'], [3.52, 'Reset']];
const jumpPhases = [[0, 'Setup'], [.18, 'Descent'], [.87, 'Drive'], [1.26, 'Flight'],
  [1.76, 'Landing'], [2.09, 'Stand'], [2.86, 'Reset']];
const support = ['Glutes', 'Hamstrings'];

export const exercises = {
  'local:exercise:Bodyweight_Squat': {
    name: 'Bodyweight Squat', primary: ['Quadriceps'], phases: squatPhases, supporting: support,
    cues: [[0, 'Set your stance', 'Stand with feet about shoulder-width apart.'],
      [1.15, 'Lower with control', 'Bend at the hips and knees.'],
      [2, 'Reach the bottom', 'Keep your whole foot planted.'],
      [2.9, 'Stand back up', 'Extend your hips and knees together.']],
  },
  'local:exercise:Freehand_Jump_Squat': {
    name: 'Freehand Jump Squat', primary: ['Quadriceps'], phases: jumpPhases, supporting: [...support, 'Calves'],
    cues: [[0, 'Cross your arms', 'Keep your forearms crossed over your chest.'],
      [.65, 'Lower into the squat', 'Bend at the hips and knees.'],
      [.87, 'Jump straight up', 'Drive through the balls of your feet.'],
      [1.76, 'Absorb the landing', 'Bend your hips and knees as you land.']],
  },
  'local:exercise:Dumbbell_Squat': {
    name: 'Dumbbell Squat', primary: ['Quadriceps'], equipment: 'dumbbells', phases: squatPhases, supporting: [...support, 'Calves', 'Upper back'],
    cues: [[0, 'Set your stance', 'Hold a dumbbell at each side with palms facing in.'],
      [1.15, 'Lower with control', 'Keep the dumbbells at your sides.'],
      [2, 'Reach the bottom', 'Keep your whole foot planted.'],
      [2.9, 'Stand back up', 'Extend your hips and knees together.']],
  },
};

const vector = (x, y, z) => new THREE.Vector3(x, y, z);
const rotation = (from, to) => new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());

const powerGrip = {
  Thumb: [[0, 10, -.1], [35.5, 0, 0], [30, 0, 0]],
  Index: [[19.5, 0, 12.4], [46.5, 0, 0], [33.2, 0, 0]],
  Middle: [[10, 0, 18], [44.3, 0, 0], [36.3, 0, 0]],
  Ring: [[53, 0, -18], [49.9, 0, 0], [32, 0, 0]],
  Little: [[12.1, 0, 17.7], [23.7, 0, 0], [19, 0, 0]],
};

const dumbbellGrip = {
  Thumb: [[-31.6, -2, -15.3], [60.2, 13.8, 44.1], [41.5, 5.3, -19.2]],
  Index: [[29, 4.2, -23.3], [47.1, 7.5, 8.3], [33.6, -.2, 3.4]],
  Middle: [[32.5, -4.3, -4.5], [63.7, -5.6, -8.3], [31.3, -.3, -2]],
  Ring: [[33.8, -5, 4], [36.6, -6, -3], [39, -1.2, -3.2]],
  Little: [[17.3, -5.1, 11.1], [14.1, -9.3, -1.1], [46.4, -14, -13.3]],
};

// Author these tracks from the rig at rest, before playing any animation.
function createGripTracks(figure, pose) {
  return ['L', 'R'].flatMap((side) => {
    const sign = side === 'L' ? 1 : -1;
    const rad = THREE.MathUtils.degToRad;
    return Object.entries(pose).flatMap(([digit, angles]) =>
      angles.map(([x, y, z], joint) => {
        const name = digit + (joint + 1) + side;
        const bone = figure.getObjectByName(name);
        if (!bone?.isBone) throw new Error('Missing grip joint ' + name);
        const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(x), rad(sign * y), rad(sign * z), 'ZXY'));
        return new THREE.QuaternionKeyframeTrack(name + '.quaternion', [0],
          bone.quaternion.clone().multiply(delta).toArray());
      }));
  });
}

export function createPowerGripTracks(figure) {
  return createGripTracks(figure, powerGrip);
}

export function createDumbbellGripTracks(figure) {
  return createGripTracks(figure, dumbbellGrip);
}

function gripFrame(sign) {
  const along = vector(sign * .025, -.137, .065).normalize();
  const across = vector(1, 0, 0).addScaledVector(along, -along.x).normalize();
  const inward = across.clone().cross(along);
  return { along, across, inward };
}

// The shaft seat and finger pose were fit together against the skinned hands.
export function dumbbellGripTransform(sign) {
  const { along, across, inward } = gripFrame(sign);
  const position = along.multiplyScalar(.093914)
    .addScaledVector(inward, -.040670).addScaledVector(across, sign * .035377);
  const handleAxis = across.applyAxisAngle(inward, sign * .070255);
  return { position, quaternion: rotation(vector(1, 0, 0), handleAxis) };
}

export function attachDumbbells(figure, createDumbbell) {
  return [1, -1].map((sign) => {
    const hand = figure.getObjectByName(sign === 1 ? 'HandL' : 'HandR');
    const prop = createDumbbell();
    const { position, quaternion } = dumbbellGripTransform(sign);
    prop.position.copy(position);
    prop.quaternion.copy(quaternion);
    hand.add(prop);
    prop.visible = false;
    return prop;
  });
}

function orient(from, direction, normal, target) {
  const attitude = rotation(from, direction);
  const axis = direction.clone().normalize();
  const actual = normal.clone().applyQuaternion(attitude);
  const yaw = Math.atan2(axis.dot(actual.clone().cross(target)), actual.dot(target));
  return attitude.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, yaw));
}

function crossedArms(arm, forearm, hand, sign) {
  const wrist = vector(-sign * .078, .142 + sign * .027, .193 + sign * .025).sub(arm.position);
  const distance = wrist.length();
  const axis = wrist.clone().normalize();
  const pole = vector(sign * .68, -.67, .83);
  pole.addScaledVector(axis, -pole.dot(axis)).normalize();
  const upper = forearm.position.length();
  const lower = hand.position.length();
  const along = (upper ** 2 - lower ** 2 + distance ** 2) / (2 * distance);
  const elbow = axis.multiplyScalar(along).addScaledVector(pole, Math.sqrt(upper ** 2 - along ** 2));
  const upperRotation = rotation(forearm.position, elbow);
  const distal = wrist.sub(elbow);
  const lowerRotation = rotation(hand.position, distal);
  const handRotation = openHand(sign, distal.clone().normalize().lerp(vector(-sign, .24, -.22), .38),
    vector(0, .2, 1));
  forearmRoll(hand.name.at(-1), lowerRotation, distal, handRotation);
  return [upperRotation, upperRotation.clone().invert().multiply(lowerRotation),
    lowerRotation.clone().invert().multiply(handRotation)];
}

function hangingArms(forearm, hand, sign, chest) {
  const { along, inward } = gripFrame(sign);
  const palm = inward.negate();
  const towardBody = vector(-sign, 0, 0);
  const upperRotation = rotation(forearm.position, vector(sign * .66, -1, .23));
  const lowerRotation = orient(hand.position, vector(sign * .065, -1, .025), palm, towardBody);
  const handRotation = orient(along, vector(0, -1, 0), palm, towardBody);
  return [chest.clone().invert().multiply(upperRotation),
    upperRotation.clone().invert().multiply(lowerRotation), lowerRotation.clone().invert().multiply(handRotation)];
}

// Run the squat ascent backward on landing so the recovery starts at its deepest pose.
const jumpKeys = [[0, 0], [.18, .48], [.87, 1.88], [1.26, 3.19],
  [1.51, 3.52], [1.76, 3.19], [2.09, 2.28], [2.86, 3.52], [3.1, 4]];

function jumpPose(time) {
  const end = jumpKeys.findIndex(([at]) => at >= time);
  if (end === 0) return [0, 0];
  const [startTime, startPose] = jumpKeys[end - 1];
  const [endTime, endPose] = jumpKeys[end];
  const fraction = (time - startTime) / (endTime - startTime);
  const flight = Math.max(0, (time - 1.26) * (1.76 - time));
  return [THREE.MathUtils.lerp(startPose, endPose, fraction), 4.9 * flight];
}

function variant(figure, base, name, jumping) {
  const duration = jumping ? 3.1 : base.duration;
  const frameCount = Math.round(duration * 100);
  const times = Array.from({ length: frameCount + 1 }, (_, frame) => frame / 100);
  const sources = new Map(base.tracks.map((track) => [track.name, track.createInterpolant()]));
  const arms = ['L', 'R'].map((side) => ['Arm', 'Forearm', 'Hand'].map((name) =>
    figure.getObjectByName(name + side)));
  const armTracks = new Map(arms.flat().map((bone) => [bone.name + '.quaternion', []]));
  const tracks = base.tracks.filter((track) => !armTracks.has(track.name))
    .map((track) => ({ track, values: [] }));
  for (const time of times) {
    const [pose, lift] = jumping ? jumpPose(time) : [time, 0];
    const chest = new THREE.Quaternion();
    for (const bone of ['Pelvis', 'Lumbar', 'Chest']) {
      const source = sources.get(bone + '.quaternion');
      if (source) chest.multiply(new THREE.Quaternion().fromArray(source.evaluate(pose)));
    }
    arms.forEach(([arm, forearm, hand], index) => {
      const sign = index === 0 ? 1 : -1;
      const quaternions = jumping ? crossedArms(arm, forearm, hand, sign)
        : hangingArms(forearm, hand, sign, chest);
      [arm, forearm, hand].forEach((bone, i) =>
        armTracks.get(bone.name + '.quaternion').push(...quaternions[i].toArray()));
    });
    for (const { track, values } of tracks) {
      const sample = Array.from(sources.get(track.name).evaluate(pose));
      if (track.name === 'Pelvis.position') sample[1] += lift;
      values.push(...sample);
    }
  }
  return new THREE.AnimationClip(name, duration,
    [...tracks.map(({ track, values }) => new track.constructor(track.name, times, values)),
      ...Array.from(armTracks, ([name, values]) => new THREE.QuaternionKeyframeTrack(name, times, values)),
      ...(jumping ? relaxedFingerTracks(figure, .23) : createDumbbellGripTracks(figure))]);
}

export function createExerciseClips({ scene, animations }, onlyId) {
  const base = THREE.AnimationClip.findByName(animations, 'Bodyweight Squat');
  if (!base) throw new Error('Missing Bodyweight Squat animation');
  const builders = {
    'local:exercise:Bodyweight_Squat': () => base,
    'local:exercise:Freehand_Jump_Squat': () => variant(scene, base, 'Freehand Jump Squat', true),
    'local:exercise:Dumbbell_Squat': () => variant(scene, base, 'Dumbbell Squat', false),
  };
  return Object.fromEntries(Object.entries(builders)
    .filter(([id]) => onlyId === undefined || id === onlyId)
    .map(([id, build]) => [id, build()]));
}


export function createExerciseGroups(model, onlyGroup, onlyId) {
  const asset = { ...model, onlyExercises: onlyId === undefined ? undefined : [onlyId.slice('local:exercise:'.length)] };
  let clips;
  const legacy = (...ids) => Object.fromEntries(ids
    .filter((id) => onlyId === undefined || onlyId === id)
    .map((id) => [id, { ...exercises[id], clip: (clips ??= createExerciseClips(asset, onlyId))[id] }]));
  const [squat, jump, weightedSquat] = Object.keys(exercises);
  const calibratedGrip = { createDumbbellGripTracks, dumbbellGripTransform };
  const dumbbellHelpers = { createPowerGripTracks: createDumbbellGripTracks };
  return [
    ['Standing bodyweight', () => ({
      ...legacy(squat, jump), ...createStandingBodyweight(asset),
    })],
    ['Floor bodyweight', () => createFloorBodyweight(asset)],
    ['Standing dumbbell', () => ({
      ...legacy(weightedSquat), ...createStandingDumbbell(asset, dumbbellHelpers),
    })],
    ['Standing barbell', () => createStandingBarbell(asset, calibratedGrip)],
    ['Flat bench', () => createBenchExercises(asset, dumbbellHelpers)],
    ['Mobility', () => createMobilityExercises(asset)],
    ['Compound dumbbell', () => createDumbbellCompound(asset, dumbbellHelpers)],
    ['Pull-up bar', () => createPullUpExercises(asset, calibratedGrip)],
    ['Kettlebell', () => createKettlebellExercises(asset, calibratedGrip)],
    ['Squat rack', () => createRackExercises(asset, calibratedGrip)],
    ['Incline bench', () => createInclineBenchExercises(asset, dumbbellHelpers)],
    ['EZ curl bar', () => createEzCurlExercises(asset, calibratedGrip)],
    ['Dip station', () => createDipStationExercises(asset, calibratedGrip)],
    ['Bodyweight conditioning', () => createConditioningExercises(asset)],
    ['Supine core', () => createSupineCore(asset)],
    ['Upright bodyweight', () => createUprightBodyweight(asset)],
    ['Additional dumbbell', () => createAdditionalDumbbell(asset, calibratedGrip)],
    ['Floor bodyweight extra', () => createAdditionalFloorBodyweight(asset)],
    ['Floor and core', () => createFloorCoreExercises(asset)],
    ['Standing mobility', () => createStandingMobilityExercises(asset, calibratedGrip)],
    ['Dumbbell strength', () => createFreeWeightExercises(asset, calibratedGrip)],
    ['Barbell strength', () => createBarbellExpansion(asset, calibratedGrip)],
    [bodyweightExpansionLabel, () => createBodyweightExpansion(asset, calibratedGrip)],
    [dumbbellExpansionLabel, () => createDumbbellExpansion(asset, calibratedGrip)],
    [bodyweightMobilityLabel, () => createBodyweightMobility(asset)],
    [dumbbellBenchMoreLabel, () => createDumbbellBenchMore(asset, calibratedGrip)],
    [barbellStandingMoreLabel, () => createBarbellStandingMore(asset, calibratedGrip)],
    [barbellSupportedMoreLabel, () => createBarbellSupportedMore(asset, calibratedGrip)],
    [kettlebellMoreLabel, () => createKettlebellMore(asset, calibratedGrip)],
    ...[bodyweightCatalog, dumbbellCatalog, barbellCatalog, kettlebellCatalog,
      cableTraining, bandTraining, declineBenchTraining, bodyweightSupport, supplementalBarbell,
      supplementalCable, supplementalBench, supplementalBall, supplementalAccessories, machineGuided, machineStrength, mobilityBall,
      finalConditioning, finalStrength, finalApparatus]
      .map(({ groupLabel, createEntries }) =>
      [groupLabel, () => createEntries(asset, calibratedGrip)]),
  ].filter(([label]) => onlyGroup === undefined || label === onlyGroup)
    .map(([label, createEntries]) => [label, createEntries()]);
}
