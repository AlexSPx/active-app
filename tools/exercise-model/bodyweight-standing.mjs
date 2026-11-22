import * as THREE from 'three';
import { forearmRoll, openHand, relaxedFingerTracks } from './hand-frame.mjs';

const vec = (x, y, z) => new THREE.Vector3(x, y, z);
const pitch = (angle) => new THREE.Quaternion().setFromAxisAngle(vec(1, 0, 0), angle);
const aim = (from, to) => new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
const relative = (parent, world) => parent.clone().invert().multiply(world);
const mix = (a, b, t) => a.map((value, i) => THREE.MathUtils.lerp(value, b[i], t));

function bend(origin, target, upper, lower, pole) {
  const axis = target.clone().sub(origin);
  const distance = axis.length();
  if (distance >= upper + lower || distance <= Math.abs(upper - lower)) {
    throw new Error('Unreachable joint target: ' + target.toArray().join(', '));
  }
  axis.divideScalar(distance);
  pole.addScaledVector(axis, -pole.dot(axis)).normalize();
  const along = (upper ** 2 - lower ** 2 + distance ** 2) / (2 * distance);
  return origin.clone().addScaledVector(axis, along).addScaledVector(pole, Math.sqrt(upper ** 2 - along ** 2));
}

// The rear foot rolls around its forefoot and uses the actual rigid sole for the floor height.
function solePoints(scene, foot) {
  const inverse = foot.matrixWorld.clone().invert();
  const points = [];
  scene.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    const joint = mesh.skeleton.bones.indexOf(foot);
    for (let i = 0; i < position.count; i++) {
      if (skinIndex.getX(i) === joint && skinWeight.getX(i) > .999) {
        points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
          .applyMatrix4(inverse));
      }
    }
  });
  if (!points.length) throw new Error('Missing rigid sole for ' + foot.name);
  return points;
}

const left = (z = 0, y = 0, roll = 0, x = .145) => [x, z, y, roll];
const right = (z = 0, y = 0, roll = 0, x = -.145) => [x, z, y, roll];
const both = (z = 0, y = 0, roll = 0, width = .145) => [left(z, y, roll, width), right(z, y, roll, -width)];
// A pose specifies pelvis position, two foot contacts, torso lean and twist, arm swing, and lateral knee bend.
const pose = (y, z = 0, feet = both(), lean = .04, twist = 0, arms = 0, x = 0, kneeSweep = 0) =>
  [[x, y, z], ...feet, [lean, twist, arms, kneeSweep]];
const stand = pose(.879);
const quadChain = ['Calves', 'Glutes', 'Hamstrings'];
const jumpEnd = (t, landed, end = stand) => [
  [t, 'Absorb landing', landed], [t + .58, 'Stand', end],
];

function samplePose(keys, time) {
  const end = keys.findIndex(([at]) => at >= time);
  if (end <= 0) return keys[0][2];
  const [startTime, , from] = keys[end - 1];
  const [endTime, , to] = keys[end];
  const u = (time - startTime) / (endTime - startTime);
  const weight = u * u * (3 - 2 * u);
  return from.map((values, i) => mix(values, to[i], weight));
}

export function createEntries({ scene, onlyExercises }) {
  scene.updateMatrixWorld(true);
  const bone = (name) => {
    const joint = scene.getObjectByName(name);
    if (!joint?.isBone) throw new Error('Missing joint ' + name);
    return joint;
  };
  const limbs = ['L', 'R'].map((side, i) => {
    const [thigh, shin, foot, arm, forearm, hand] =
      ['Thigh', 'Shin', 'Foot', 'Arm', 'Forearm', 'Hand'].map((name) => bone(name + side));
    const sole = solePoints(scene, foot);
    const toe = sole.reduce((front, point) => point.z > front.z ? point : front);
    return { thigh, shin, foot, arm, forearm, hand, sign: 1 - 2 * i, sole, toe };
  });
  const entries = {};
  const lumbarOffset = bone('Lumbar').position;
  const chestOffset = bone('Chest').position;
  function add(id, name, primary, supporting, keys, cues, {
    hips = false, flights = [], spread = false, tuck = false, hinge = .35, trajectory,
    handStyle = 'neutral', fingerCurl = .21,
  } = {}) {
    if (onlyExercises && !onlyExercises.includes(id)) return;
    const duration = keys.at(-1)[0];
    const times = [...new Set([...Array.from({ length: Math.ceil(duration * 60) + 1 },
      (_, i) => Math.min(i / 60, duration)), ...keys.map(([time]) => time)])].sort((a, b) => a - b)
      .filter((time, i, all) => i === 0 || Math.fround(time) > Math.fround(all[i - 1]));
    const tracks = new Map();
    function write(name, value) {
      if (!tracks.has(name)) tracks.set(name, []);
      tracks.get(name).push(...value.toArray());
    }
    for (const time of times) {
      const [root, ...parameters] = trajectory ? trajectory(time) : samplePose(keys, time);
      const [lean, twist, arms, kneeSweep] = parameters[2];
      const lift = flights.reduce((height, [from, to, apex]) =>
        height + Math.max(0, 4 * apex * (time - from) * (to - time) / (to - from) ** 2), 0);
      const pelvis = vec(...root);
      pelvis.y += lift;
      const pelvisRotation = pitch(lean * hinge);
      const lumbar = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean * (1 - hinge) * .55, twist * .55, 0, 'YXZ'));
      const chest = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean * (1 - hinge) * .45, twist * .45, 0, 'YXZ'));
      const waist = pelvisRotation.clone().multiply(lumbar);
      const upperBody = waist.clone().multiply(chest);
      const chestPosition = pelvis.clone().add(lumbarOffset.clone().applyQuaternion(pelvisRotation))
        .add(chestOffset.clone().applyQuaternion(waist));
      write('Pelvis.position', pelvis);
      write('Pelvis.quaternion', pelvisRotation);
      write('Lumbar.quaternion', lumbar);
      write('Chest.quaternion', chest);
      write('Head.quaternion', pitch(-Math.min(lean * .45, .23)));

      for (const [i, { thigh, shin, foot, arm, forearm, hand, sign, sole, toe }] of limbs.entries()) {
        const [x, z, clearance, roll] = parameters[i];
        const footRotation = pitch(roll);
        const shift = toe.clone().applyQuaternion(footRotation);
        let low = Infinity;
        const sine = Math.sin(roll);
        const cosine = Math.cos(roll);
        for (const point of sole) low = Math.min(low, point.y * cosine - point.z * sine);
        const ankle = vec(x, lift + clearance - low, z + toe.z - shift.z);
        const hip = thigh.position.clone().applyQuaternion(pelvisRotation).add(pelvis);
        let knee;
        try {
          knee = bend(hip, ankle, shin.position.length(), foot.position.length(), vec(sign * .09 + kneeSweep, 0, 1));
        } catch (error) {
          throw new Error(name + ' at ' + time.toFixed(3) + 's (' + thigh.name + '): ' + error.message);
        }
        const thighRotation = aim(shin.position, knee.clone().sub(hip));
        const shinRotation = aim(foot.position, ankle.clone().sub(knee));
        write(thigh.name + '.quaternion', relative(pelvisRotation, thighRotation));
        write(shin.name + '.quaternion', relative(thighRotation, shinRotation));
        write(foot.name + '.quaternion', relative(shinRotation, footRotation));

        let upperArm;
        let lowerArm;
        let handRotation;
        if (hips || tuck || handStyle === 'cross') {
          const wrist = handStyle === 'cross' ? vec(sign * .092, .012, .367) :
            tuck ? vec(sign * .123, .15 - arms * .09, .335) :
            vec(sign * .195, .123, -.043).applyQuaternion(pelvisRotation).add(pelvis)
              .sub(chestPosition).applyQuaternion(upperBody.clone().invert());
          const elbow = bend(arm.position, wrist, forearm.position.length(), hand.position.length(),
            hips ? vec(sign, -.2, -.70) : tuck ? vec(sign, -1, 0) : vec(sign * .50, -1, 0));
          upperArm = aim(forearm.position, elbow.clone().sub(arm.position));
          const distal = wrist.sub(elbow);
          lowerArm = aim(hand.position, distal);
          handRotation = handStyle === 'knee-circles'
            ? openHand(sign, distal.clone().normalize().lerp(vec(-sign * .3, -.32, .85), .45), vec(sign, .45, 0))
            : hips ? openHand(sign, vec(-sign * .13, -.57, 1), vec(sign, .30, .29)) :
            tuck ? openHand(sign, distal.clone().setY(0), vec(0, 1, 0)) :
              openHand(sign, distal, vec(sign, .18, 0));
          forearmRoll(hand.name.at(-1), lowerArm, distal, handRotation);
        } else {
          const swing = handStyle === 'lateral' ? arms - sign * twist * 3 : arms;
          const armDirection = spread
            ? vec(sign * Math.sin(swing), -Math.cos(swing), .12)
            : vec(sign * .16, -Math.cos(swing), Math.sin(swing));
          if (handStyle === 'toes') {
            const shoulder = arm.position.clone().applyQuaternion(upperBody).add(chestPosition);
            const target = toe.clone().applyQuaternion(footRotation).add(ankle)
              .add(vec(-sign * .009, .020, -.088));
            const reach = THREE.MathUtils.smoothstep(lean, .82, 1.87);
            armDirection.lerp(target.sub(shoulder).normalize(), reach);
          }
          upperArm = relative(upperBody, aim(forearm.position, armDirection));
          const flex = handStyle === 'toes' ? .035 : handStyle === 'overhead' ? .075 : handStyle === 'athletic' ? .36 : .19;
          const distal = armDirection.clone().applyQuaternion(pitch(-flex));
          const dorsal = spread ? vec(sign * Math.cos(swing), 0, -Math.sin(swing)) :
            vec(sign, handStyle === 'down' ? Math.max(0, Math.sin(swing)) * 2 : 0, 0);
          const worldHand = openHand(sign, distal, dorsal);
          const worldForearm = aim(hand.position, distal);
          forearmRoll(hand.name.at(-1), worldForearm, distal, worldHand);
          lowerArm = relative(upperBody, worldForearm);
          handRotation = relative(upperBody, worldHand);
        }
        write(arm.name + '.quaternion', upperArm);
        write(forearm.name + '.quaternion', relative(upperArm, lowerArm));
        write(hand.name + '.quaternion', relative(lowerArm, handRotation));
      }
    }
    const clip = new THREE.AnimationClip(name, duration, [...Array.from(tracks, ([property, values]) =>
      property === 'Pelvis.position' ? new THREE.VectorKeyframeTrack(property, times, values)
        : new THREE.QuaternionKeyframeTrack(property, times, values)),
      ...relaxedFingerTracks(scene, fingerCurl)]);
    entries['local:exercise:' + id] = {
      name, clip, primary, supporting,
      phases: keys.flatMap(([time, label]) => label ? [[time, label]] : []), cues, framing: 'standing',
    };
  }

  const lunge = (lead, front, back, height, center, twist = 0, arms = 0, rearRoll = .73) => {
    const feet = lead === 'L' ? [left(front), right(back, 0, rearRoll)] : [left(back, 0, rearRoll), right(front)];
    return pose(height, center, feet, .07, twist, arms);
  };
  add('Bodyweight_Walking_Lunge', 'Bodyweight Walking Lunge', ['Quadriceps'], quadChain, [
    [0, 'Setup', pose(.879, -.64, both(-.64))],
    [.32, 'Step forward', pose(.867, -.49, [left(-.30, .085), right(-.64, 0, .19)])],
    [.60, null, lunge('L', -.05, -.64, .793, -.36, 0, 0, .40)],
    [1.07, 'Lower', lunge('L', -.05, -.64, .537, -.31)],
    [1.52, 'Drive through the lead foot', lunge('L', -.05, -.64, .79, -.26, 0, 0, .65)],
    [1.85, 'Step through', pose(.868, -.02, [left(-.05), right(.01, .105)], .04, 0, 0, .08)],
    [2.21, null, lunge('R', .54, -.05, .793, .23, 0, 0, .40)],
    [2.68, 'Lower on the other side', lunge('R', .54, -.05, .537, .28)],
    [3.14, 'Drive through the lead foot', lunge('R', .54, -.05, .79, .34, 0, 0, .65)],
    [3.48, null, pose(.869, .49, [left(.28, .105), right(.54)], .04, 0, 0, -.055)],
    [3.86, 'Finish', pose(.879, .54, both(.54))],
  ], [[0, 'Hands on hips', 'Start with your feet about shoulder-width apart.'],
    [1.07, 'Lower the rear knee', 'Keep your torso upright and your front knee over your foot.'],
    [1.85, 'Step through', 'Drive through the lead heel and bring the trailing leg forward into the next lunge.']], { hips: true });

  const reverse = (lead, height, twist, depth) => lunge(lead, 0, -.57 * depth, height, -.29 * depth,
    twist, .28, .73 * depth);
  add('Crossover_Reverse_Lunge', 'Crossover Reverse Lunge', ['Core', 'Upper back'], ['Glutes', 'Hamstrings', 'Quadriceps'], [
    [0, 'Setup', stand],
    [.31, 'Step back', pose(.852, -.095, [left(), right(-.29, .09, .19)])],
    [.59, null, reverse('L', .783, .21, 1)],
    [1.05, 'Rotate across the front leg', reverse('L', .560, .60, 1)],
    [1.26, null, reverse('L', .560, .60, 1)],
    [1.69, 'Rise', reverse('L', .783, .19, 1)],
    [2.02, null, pose(.853, -.085, [left(), right(-.24, .083, .14)])],
    [2.28, 'Return', stand],
    [2.59, 'Step back on the other side', pose(.852, -.095, [left(-.29, .09, .19), right()])],
    [2.87, null, reverse('R', .783, -.21, 1)],
    [3.33, 'Rotate across the front leg', reverse('R', .560, -.60, 1)],
    [3.54, null, reverse('R', .560, -.60, 1)],
    [3.97, 'Rise', reverse('R', .783, -.19, 1)],
    [4.30, null, pose(.853, -.085, [left(-.24, .083, .14), right()])],
    [4.56, 'Return', stand],
  ], [[.31, 'Step backward', 'Keep the lead foot planted as you move the other foot back.'],
    [1.05, 'Turn over the lead thigh', 'Rotate through the torso as you lower, then unwind as you stand.']],
  { handStyle: 'cross', fingerCurl: .37 });

  const nearSplit = (lead, height, roll) => lunge(lead, .12, -.17, height, -.025, 0, 0, roll);
  add('Standing_Hip_Flexors', 'Standing Hip Flexors', ['Quadriceps'], [], [
    [0, 'Stagger stance', nearSplit('L', .865, .12)],
    [.55, 'Press the rear hip forward', lunge('L', .12, -.17, .802, -.003, 0, 0, .45)],
    [.9, 'Hold the stretch', lunge('L', .12, -.17, .765, .022, 0, 0, .64)],
    [3, null, lunge('L', .12, -.17, .765, .022, 0, 0, .64)],
    [3.85, 'Release', nearSplit('L', .865, .12)],
  ], [[0, 'Stagger your feet', 'Keep your spine vertical.'],
    [.9, 'Lift the rear heel', 'Bend both knees and press the rear hip forward. Repeat on the other side.']], { hips: true });

  add('Standing_Soleus_And_Achilles_Stretch', 'Standing Soleus And Achilles Stretch', ['Calves'], [], [
    [0, 'Stagger stance', nearSplit('L', .864, 0)],
    [.55, 'Bend both knees', lunge('L', .12, -.17, .811, .000, 0, 0, 0)],
    [.9, 'Hold the stretch', lunge('L', .12, -.17, .777, .017, 0, 0, 0)],
    [3, null, lunge('L', .12, -.17, .777, .017, 0, 0, 0)],
    [3.85, 'Release', nearSplit('L', .864, 0)],
  ], [[0, 'Set your stance', 'Place one foot slightly ahead of the other.'],
    [.9, 'Keep the rear heel down', 'Bend both knees until you feel a stretch. Repeat on the other side.']]);

  add('Standing_Toe_Touches', 'Standing Toe Touches', ['Hamstrings'], ['Calves'], [
    [0, 'Setup', stand], [.12, 'Fold forward', stand],
    [1.8, 'Hold the stretch', pose(.88, -.112, both(), 2.185)],
    [11.8, 'Unfold', pose(.88, -.112, both(), 2.185)], [13.5, 'Stand', stand],
  ], [[0, 'Stand tall', 'Leave space in front of you and keep your legs straight.'],
    [1.8, 'Reach toward your toes', 'Let your upper body hang for ten seconds.']],
  { hinge: .80, handStyle: 'toes', fingerCurl: .05 });

  const circleFeet = both(0, 0, 0, .071);
  const circle = (angle) => {
    const side = Math.sin(angle);
    const depth = Math.cos(angle);
    return pose(.795 - .052 * depth, -.039 + .05 * depth,
      circleFeet, .20 + .09 * depth, .05 * side, 0, .09 * side, .45 * side);
  };
  add('Knee_Circles', 'Knee Circles', ['Calves'], ['Hamstrings', 'Quadriceps'], [
    [0, 'Soften the knees', circle(0)],
    [.30, 'Circle the knees', circle(Math.PI / 4)], [2.4, null, circle(2 * Math.PI)],
  ], [[0, 'Bring your feet together', 'Place your hands by your waist.'],
    [.3, 'Circle both knees', 'Keep your feet down and breathe normally.']],
  { hips: true, handStyle: 'knee-circles', fingerCurl: .46, trajectory: (time) => circle(Math.PI * time / 1.2) });

  const load = pose(.721, -.124, both(), .42, 0, -.72);
  const softLand = pose(.756, -.087, both(), .30, 0, .73);
  const toeOff = pose(.94, .008, both(0, 0, .58), .02, 0, 1.47);
  const touchDown = pose(.907, -.005, both(0, 0, .32), .09, 0, .82);
  const flight = [.76, 1.24, .283];

  add('Rocket_Jump', 'Rocket Jump', ['Quadriceps'], ['Calves', 'Hamstrings'], [
    [0, 'Setup', stand], [.27, 'Load', pose(.673, -.144, both(), .47, 0, -.47)],
    [.76, 'Take off', pose(.974, .031, both(0, 0, .58), .015, 0, 2.82)],
    [1, 'Reach overhead', pose(.972, .030, both(0, 0, .52), 0, 0, 3.12)],
    [1.13, null, pose(.969, .027, both(0, 0, .50), .025, 0, 3.04)],
    [1.24, 'Land', pose(.908, .015, both(0, 0, .32), .09, 0, 2.25)], ...jumpEnd(1.49, softLand),
  ], [[.27, 'Squat halfway', 'Bend the knees and hips to prepare for takeoff.'],
    [1, 'Reach overhead', 'Extend through your hips, knees and ankles as you jump.'],
    [1.49, 'Land softly', 'Bend your hips and knees to absorb the landing.']],
  { flights: [flight], handStyle: 'overhead' });

  add('Star_Jump', 'Star Jump', ['Quadriceps'], [...quadChain, 'Shoulders'], [
    [0, 'Setup', stand], [.46, 'Load', load], [.76, 'Take off', pose(.94, .008, both(0, 0, .58), .02, 0, .61)],
    [1, 'Spread arms and legs', pose(.78, .01, both(.01, .095, .16, .567), .03, 0, 1.87)],
    [1.24, 'Bring limbs in', touchDown], ...jumpEnd(1.49, softLand),
  ], [[.46, 'Squat halfway', 'Bend the hips and knees before takeoff.'],
    [1, 'Spread in the air', 'Extend your arms and legs away from your body.'],
    [1.49, 'Absorb landing', 'Bring the limbs back in before your feet meet the floor.']], { flights: [flight], spread: true });

  const heelTuck = pose(.885, .03, both(-.315, .621, 1.45, .108), .17, 0, 1.08);
  add('Double_Leg_Butt_Kick', 'Double Leg Butt Kick', ['Quadriceps'],
    ['Adductors', ...quadChain], [
      [0, 'Setup', stand], [.32, 'Dip', pose(.791, -.087, both(), .20, 0, -.4)],
      [.60, 'Take off', toeOff],
      [.85, 'Tuck both heels', heelTuck], [1, null, heelTuck],
      [1.20, 'Land', touchDown], ...jumpEnd(1.42, softLand),
    ], [[.32, 'Dip quickly', 'Use a short squat to load both legs.'],
      [.90, 'Bring both heels back', 'Bend your knees in flight, bringing your heels toward your buttocks.'],
      [1.42, 'Absorb the landing', 'Extend your feet down and land with the knees bent.']],
    { flights: [[.60, 1.20, .306]], handStyle: 'down', fingerCurl: .59 });

  const raisedKnee = left(.31, .30, .42);
  const singleStand = pose(.874, 0, [raisedKnee, right()], .08, 0, .43, -.115);
  add('Single_Leg_Butt_Kick', 'Single Leg Butt Kick', ['Quadriceps'], ['Calves', 'Hamstrings'], [
    [0, 'Balance on one leg', singleStand],
    [.35, 'Dip on the support leg', pose(.797, -.085, [left(.25, .25, .42), right()], .20, 0, -.36, -.115)],
    [.63, 'Push off', pose(.939, .008, [left(.32, .36, .42), right(0, 0, .58)], .06, 0, 1.12, -.115)],
    [.89, 'Tuck the jumping heel', pose(.889, .02, [left(.33, .31, .42), right(-.39, .58, .93)], .11, 0, .91, -.115)],
    [1.15, 'Land on the takeoff leg', pose(.902, -.005, [left(.31, .33, .42), right(0, 0, .32)], .11, 0, .72, -.115)],
    ...jumpEnd(1.38, pose(.772, -.083, [left(.25, .24, .42), right()], .23, 0, .67, -.115), singleStand),
  ], [[0, 'Raise the free knee', 'Balance on one leg with the other knee bent in front of you.'],
    [.89, 'Tuck the takeoff heel', 'Bring the heel toward your buttocks while keeping the other knee raised.'],
    [1.38, 'Land on the same leg', 'Lower the takeoff foot underneath you and bend that knee to absorb impact.']],
  { flights: [[.63, 1.15, .332]] });

  add('Knee_Tuck_Jump', 'Knee Tuck Jump', ['Hamstrings'], ['Adductors', 'Calves', 'Glutes', 'Quadriceps'], [
    [0, 'Hands in front', pose(.879, 0, both(), .04, 0, 1.06)],
    [.35, 'Dip', pose(.78, -.093, both(), .27, 0, 1.10)],
    [.63, 'Take off', pose(.94, .008, both(0, 0, .58), .02, 0, 1.12)],
    [.90, 'Drive knees up', pose(.88, 0, both(.38, .59, .39, .17), .18, 0, 1.18)],
    [1.17, 'Extend and land', touchDown],
    ...jumpEnd(1.42, softLand, pose(.879, 0, both(), .04, 0, 1.06)),
  ], [[0, 'Hold your hands in front', 'Keep your palms facing down in front of your chest.'],
    [.9, 'Drive your knees up', 'Bring both knees toward your hands in the air.'],
    [1.42, 'Bend on landing', 'Extend the legs before contact and bend your knees to absorb the impact.']],
  { flights: [[.63, 1.17, .357]], tuck: true });

  add('Standing_Long_Jump', 'Standing Long Jump', ['Quadriceps'], quadChain, [
    [0, 'Setup', pose(.824, -.58, both(-.54), .18)],
    [.45, 'Swing arms back', pose(.723, -.66, both(-.54), .43, 0, -.69)],
    [.77, 'Take off', pose(.897, -.37, both(-.54, 0, .46), .35, 0, 1.48)],
    [1.05, 'Reach forward', pose(.86, .022, both(.31, .14, .04), .36, 0, 1.29)],
    [1.33, 'Land ahead of your hips', pose(.844, .44, both(.67), .36, 0, .68)],
    ...jumpEnd(1.60, pose(.68, .53, both(.67), .53, 0, .88), pose(.879, .67, both(.67))),
  ], [[.45, 'Load the jump', 'Swing your arms back while bending your knees and hips.'],
    [1.05, 'Travel forward', 'Drive the arms forward and reach the feet ahead of the hips before landing.'],
    [1.60, 'Absorb the landing', 'Bend your knees and hips after both feet touch down.']],
  { flights: [[.77, 1.33, .385]], handStyle: 'down' });

  const split = (lead, height, arms, roll = .67) => lunge(lead, .30, -.29, height, .012, 0, arms, roll);
  for (const alternate of [false, true]) {
    const id = alternate ? 'Scissors_Jump' : 'Split_Jump';
    const name = alternate ? 'Scissors Jump' : 'Split Jump';
    const land = alternate ? 'R' : 'L';
    const splitKeys = [
      [0, 'Set a deep lunge', split('L', .536, -.46)],
      [.39, 'Drive up', split('L', .811, 1.58)],
      [.64, alternate ? 'Switch legs' : 'Bring feet together', pose(.85, .012, both(.02, .04, .20, .095), .05, 0, 1.29)],
      [.89, 'Land in a split stance', split(land, .811, .56)],
      [1.18, 'Absorb the landing', split(land, .536, -.46)],
    ];
    if (alternate) splitKeys.push(
      [1.57, 'Drive up', split('R', .811, 1.58)],
      [1.82, 'Switch legs again', pose(.85, .012, both(.02, .04, .20, .095), .05, 0, 1.29)],
      [2.07, 'Land in a split stance', split('L', .811, .56)],
      [2.36, 'Absorb the landing', split('L', .536, -.46)],
    );
    add(id, name, ['Quadriceps'], alternate ? ['Glutes', 'Hamstrings'] : quadChain, splitKeys,
      [[0, 'Set up low', 'Start with one foot forward and the rear knee close to the floor.'],
        [.64, alternate ? 'Switch the lead leg' : 'Bring your feet together',
          alternate ? 'Move the front foot back and the rear foot forward in flight.'
            : 'Close your stance in the air, then reopen it with the same foot forward.'],
        [1.18, 'Lower into the lunge', 'Bend both knees to absorb the landing.']],
      { flights: alternate ? [[.39, .89, .37], [1.57, 2.07, .37]] : [[.39, .89, .37]],
        handStyle: 'athletic', fingerCurl: .32 });
  }

  const bound = (direction, height, loaded) => {
    const x = direction * .49;
    return pose(height, -.11, [
      left(direction < 0 ? -.25 : 0, direction < 0 ? .11 : 0, 0, x + .10),
      right(direction > 0 ? -.25 : 0, direction > 0 ? .11 : 0, 0, x - .10),
    ], loaded ? .34 : .18, -.20 * direction, loaded ? -.31 : .63, x + direction * .065);
  };
  add('Lateral_Bound', 'Lateral Bound', ['Adductors'], quadChain.concat('Quadriceps'), [
    [0, 'Load the outside leg', bound(-1, .752, true)],
    [.32, 'Push sideways', bound(-1, .86, false)],
    [.56, 'Bound to the side', pose(.86, -.10, [left(.02, .085, .16, .27), right(-.18, .11, .23, -.26)], .18, -.15, .67)],
    [.80, 'Land on the lead leg', bound(1, .86, false)],
    [1.05, 'Shift weight', bound(1, .752, true)],
    [1.31, 'Push back', bound(1, .86, false)],
    [1.55, 'Bound back', pose(.86, -.10, [left(-.18, .11, .23, .26), right(.02, .085, .16, -.27)], .18, .15, .67)],
    [1.79, 'Land on the lead leg', bound(-1, .86, false)],
    [2.04, 'Shift weight', bound(-1, .752, true)],
  ], [[0, 'Face across the direction of travel', 'Load the outside leg in a half squat.'],
    [.56, 'Travel sideways', 'Push off the outside leg and land on the lead leg.'],
    [1.31, 'Reverse direction', 'Absorb the landing and push back the other way.']],
  { flights: [[.32, .80, .245], [1.31, 1.79, .245]], handStyle: 'lateral', fingerCurl: .35 });

  return entries;
}
