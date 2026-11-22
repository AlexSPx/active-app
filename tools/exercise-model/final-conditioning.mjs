import * as THREE from 'three';
import { createAuthor, ankleHeight, lerp, pitch, q, roll, sides, smoothstep, v, yaw } from './barbell-standing-more.mjs';
import { createSupportHands, openHand, palmHeight, supportFingerNames } from './hand-frame.mjs';

export const groupLabel = 'Conditioning and agility';

const metadata = {
  Backward_Drag: ['Backward Drag', ['Quadriceps'], ['Calves', 'Forearms', 'Glutes', 'Hamstrings', 'Upper back']],
  Battling_Ropes: ['Battling Ropes', ['Shoulders'], ['Chest', 'Forearms']],
  Bear_Crawl_Sled_Drags: ['Bear Crawl Sled Drags', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings']],
  Bench_Sprint: ['Bench Sprint', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings']],
  Bicycling: ['Bicycling', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings']],
  Box_Jump_Multiple_Response: ['Box Jump (Multiple Response)', ['Hamstrings'], ['Glutes', 'Adductors', 'Calves', 'Quadriceps']],
  Box_Skip: ['Box Skip', ['Hamstrings'], ['Glutes', 'Adductors', 'Calves', 'Quadriceps']],
  Depth_Jump_Leap: ['Depth Jump Leap', ['Quadriceps'], ['Glutes', 'Adductors', 'Calves', 'Hamstrings']],
  Drop_Push: ['Drop Push', ['Chest'], ['Shoulders', 'Triceps']],
  Forward_Drag_with_Press: ['Forward Drag with Press', ['Chest'], ['Calves', 'Glutes', 'Hamstrings', 'Quadriceps', 'Shoulders', 'Triceps']],
  Front_Cone_Hops_or_hurdle_hops: ['Front Cone Hops (or hurdle hops)', ['Quadriceps'], ['Glutes', 'Adductors', 'Calves', 'Hamstrings']],
  Heavy_Bag_Thrust: ['Heavy Bag Thrust', ['Chest'], ['Core', 'Shoulders', 'Triceps']],
  Hurdle_Hops: ['Hurdle Hops', ['Hamstrings'], ['Glutes', 'Adductors', 'Calves']],
  'Incline_Push-Up_Depth_Jump': ['Incline Push-Up Depth Jump', ['Chest'], ['Shoulders', 'Triceps']],
  Lateral_Box_Jump: ['Lateral Box Jump', ['Adductors'], ['Glutes', 'Calves', 'Hamstrings', 'Quadriceps']],
  Lateral_Cone_Hops: ['Lateral Cone Hops', ['Adductors'], ['Glutes', 'Calves', 'Hamstrings', 'Quadriceps']],
  Linear_Depth_Jump: ['Linear Depth Jump', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings']],
  Prowler_Sprint: ['Prowler Sprint', ['Hamstrings'], ['Calves', 'Chest', 'Glutes', 'Quadriceps', 'Shoulders']],
  Quick_Leap: ['Quick Leap', ['Quadriceps'], ['Calves', 'Hamstrings']],
  Rope_Jumping: ['Rope Jumping', ['Quadriceps'], ['Calves', 'Hamstrings']],
  'Side_Hop-Sprint': ['Side Hop-Sprint', ['Quadriceps'], ['Glutes', 'Adductors', 'Calves', 'Hamstrings']],
  Side_to_Side_Box_Shuffle: ['Side to Side Box Shuffle', ['Quadriceps'], ['Glutes', 'Adductors', 'Calves', 'Hamstrings']],
  'Single-Cone_Sprint_Drill': ['Single-Cone Sprint Drill', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings']],
  'Single-Leg_High_Box_Squat': ['Single-Leg High Box Squat', ['Quadriceps'], ['Glutes', 'Hamstrings']],
  'Single-Leg_Hop_Progression': ['Single-Leg Hop Progression', ['Quadriceps'], ['Glutes', 'Adductors', 'Calves', 'Hamstrings']],
  'Single-Leg_Stride_Jump': ['Single-Leg Stride Jump', ['Quadriceps'], ['Glutes', 'Adductors', 'Calves', 'Hamstrings']],
  'Single_Leg_Push-off': ['Single Leg Push-off', ['Quadriceps'], ['Calves', 'Hamstrings']],
  Skating: ['Skating', ['Quadriceps'], ['Glutes', 'Adductors', 'Calves', 'Hamstrings']],
  'Sled_Drag_-_Harness': ['Sled Drag - Harness', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings']],
  Sled_Overhead_Backward_Walk: ['Sled Overhead Backward Walk', ['Shoulders'], ['Calves', 'Upper back', 'Quadriceps']],
  Sled_Overhead_Triceps_Extension: ['Sled Overhead Triceps Extension', ['Triceps'], []],
  Sled_Push: ['Sled Push', ['Quadriceps'], ['Calves', 'Chest', 'Glutes', 'Hamstrings', 'Triceps']],
  Sled_Reverse_Flye: ['Sled Reverse Flye', ['Shoulders'], []],
  Sled_Row: ['Sled Row', ['Upper back'], ['Biceps']],
  Stride_Jump_Crossover: ['Stride Jump Crossover', ['Quadriceps'], ['Glutes', 'Adductors', 'Calves', 'Hamstrings']],
  'Linear_3-Part_Start_Technique': ['Linear 3-Part Start Technique', ['Hamstrings'], ['Calves', 'Quadriceps']],
  Linear_Acceleration_Wall_Drill: ['Linear Acceleration Wall Drill', ['Hamstrings'], ['Calves', 'Glutes', 'Quadriceps']],
  Trail_Running_Walking: ['Trail Running/Walking', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings']],
};

const tau = 2 * Math.PI;
const cycle = (n) => n - Math.floor(n);
const unit = (t, start, finish) => THREE.MathUtils.clamp((t - start) / (finish - start), 0, 1);
const step = (t, start, finish) => smoothstep(t, start, finish);
const arc = (u) => 4 * u * (1 - u);
const box = (x, z, height, width = .64, depth = .54) => ({ kind: 'box', x, z, height, width, depth });
const marker = (kind, x, z, height) => ({ kind, x, z, height });
const foot = (x, z, y = 0) => [x, y, z];

export function createEntries(asset, helpers) {
  const { add, entries, bone, leg, arm, point, torso, world, free, grip } = createAuthor(asset, helpers, metadata);
  const gripFrames = sides.map(([, sign]) => {
    const { position, quaternion } = helpers.dumbbellGripTransform(sign);
    return { position: position.toArray(), quaternion: quaternion.toArray() };
  });

  function exercise(id, duration, beats, instructions, pose, options = {}) {
    const { fixture, fingers = '', framing = 'standing', oneShot = false } = options;
    add(id, [...beats.map(([at, label]) => [at, label]), [duration, oneShot ? 'Finish' : 'Repeat']],
      instructions.map(([beat, title, detail]) => [beats[beat][0], title, detail]), pose, {
        duration, fingers, framing, equipment: '', oneShot,
        ...(fixture && { finalConditioningFixture: { ...fixture, gripFrames } }),
      });
  }

  function body(x, y, z, lean = 0, heading = 0, bank = 0, twist = 0) {
    const headingFrame = yaw(heading);
    torso(v(x, y, z), headingFrame.clone().multiply(roll(bank)).multiply(pitch(lean)),
      headingFrame.multiply(pitch(lean * .35)));
    if (twist) {
      const frame = yaw(heading + twist).multiply(roll(bank)).multiply(pitch(lean));
      world('Chest', frame);
    }
  }

  function plant(side, target, heading = 0, toe = .10, bend = null) {
    const sign = side === 'L' ? 1 : -1;
    const turn = yaw(heading);
    leg(side, v(...target).add(v(0, ankleHeight, 0)), yaw(heading + sign * toe),
      bend ?? v(sign * .12, 0, 1).applyQuaternion(turn));
  }

  function swingArm(side, sign, angle, heading = 0, running = false, startAngle = 0, blend = 1) {
    const turn = yaw(heading);
    const offset = running
      ? v(sign * .075, -.39 * Math.cos(startAngle), .39 * Math.sin(startAngle)).lerp(
        v(sign * .055, -.22 + .17 * Math.sin(angle), .16 + .32 * Math.sin(angle)), blend)
      : v(sign * .075, -.39 * Math.cos(angle), .39 * Math.sin(angle));
    const lateral = v(sign, 0, 0).applyQuaternion(turn);
    const start = running ? startAngle : angle;
    const hand = openHand(sign,
      v(sign * .025, -Math.cos(start), Math.sin(start)).applyQuaternion(turn), lateral);
    if (running) {
      hand.slerp(openHand(sign, v(sign * .025, .1, .95).applyQuaternion(turn), lateral), blend);
    }
    arm(side, point('Arm' + side).add(offset.applyQuaternion(turn)), v(sign * .65, -.62, -.85).applyQuaternion(turn),
      hand, running);
  }

  function reachOverhead(side, sign, angle) {
    const along = v(0, -Math.cos(angle), Math.sin(angle));
    const reach = lerp(.39, .51, step(angle, 1.08, 2.52));
    const wrist = point('Arm' + side).add(v(sign * .075, 0, 0)).addScaledVector(along, reach);
    arm(side, wrist, v(sign * .22, -Math.sin(angle), -Math.cos(angle)),
      openHand(sign, along, v(sign, 0, 0)), false, v(1, 0, 0));
  }

  function take(side, center, axis, direction, pole) {
    const { hand, offset } = grip(side, axis, direction);
    arm(side, center.clone().sub(offset), pole, hand);
  }

  function palm(side, sign, at, along = v(0, 0, 1), dorsal = v(0, 1, 0), outward = .55) {
    arm(side, at, v(sign * outward, .16, -.88), support.pose(sign, along, dorsal));
  }


  const support = createSupportHands(bone);
  function supported(id, duration, beats, instructions, pose, options) {
    support.reset();
    exercise(id, duration, beats, instructions, pose, options);
    entries['local:exercise:' + id]?.clip.tracks.push(...supportFingerNames.map((name) =>
      new THREE.QuaternionKeyframeTrack(name + '.quaternion', [0], bone(name).quaternion.toArray())));
    support.reset();
  }

  // Each segment carries its own flight clearance. Consecutive grounded keys keep
  // the same foot positions while the hips load or absorb the landing.
  function keyPose(t, keys) {
    let i = 1;
    while (i < keys.length - 1 && t > keys[i][0]) i++;
    const a = keys[i - 1];
    const b = keys[i];
    const u = unit(t, a[0], b[0]);
    return [a, b, a.at(-1) ? u : step(t, a[0], b[0]), arc(u) * a.at(-1)];
  }

  function bound(id, keys, instructions, obstacles, { single = false, oneShot = true, armsAt = swingArm } = {}) {
    const duration = keys.at(-1)[0];
    exercise(id, duration, keys.slice(0, -1).filter((key) => key[1]), instructions, (t) => {
      const [a, b, u, lift] = keyPose(t, keys);
      const [x, z, level, hips, arms, turn] = a.slice(2, 8).map((n, i) => lerp(n, b[i + 2], u));
      const yawFrame = yaw(turn);
      body(x + (single ? .085 * Math.cos(turn) ** 2 : 0), level + hips + lift * .66, z,
        .08 + .75 * (.83 - hips), turn);
      for (const [side, sign] of sides) {
        const lifted = single ? Math.max(0, -sign * Math.cos(turn)) : 0;
        const stride = v(sign * (single ? .11 : .145), 0, .22 * lifted).applyQuaternion(yawFrame);
        plant(side, foot(x + stride.x, z + stride.z, level + lift + .31 * lifted), turn);
        armsAt(side, sign, arms - .32 * lifted, turn);
      }
    }, { fixture: { parts: obstacles }, oneShot });
  }

  // time, phase, x, z, surface, hip height, arm swing, heading, flight to the next key
  const j = (t, phase, x, z, level, hips, arms, flight = 0) => [t, phase, x, z, level, hips, arms, 0, flight];
  bound('Box_Jump_Multiple_Response', [
    j(0, 'Load on the floor', 0, -.70, 0, .67, -.52),
    j(.23, 'Jump up and forward', 0, -.70, 0, .86, 1.35, .39),
    j(.76, 'Land with both feet', 0, .16, .39, .73, .90),
    j(.88, 'Rebound off the box', 0, .16, .39, .82, .58, .41),
    j(1.40, 'Land back on the floor', 0, -.70, 0, .78, .40),
    j(1.56, '', 0, -.70, 0, .67, -.52),
  ], [[0, 'Load both legs', 'Face the box and swing your arms back.'],
    [2, 'Land together on the box', 'Drive up and forward, then immediately rebound back to the floor.']],
  [box(0, .16, .39)], { oneShot: false });

  bound('Quick_Leap', [
    j(0, 'Load', 0, -.72, 0, .67, -.40),
    j(.22, 'Hop onto the box', 0, -.72, 0, .85, .76, .38),
    j(.71, 'Land flat on the box', 0, .10, .27, .69, .96),
    j(.92, 'Explode off the box', 0, .10, .27, .85, 2.65, .65),
    j(1.57, 'Land on the floor', 0, 1.06, 0, .76, 1.10),
    j(1.79, '', 0, 1.06, 0, .66, .12),
  ], [[0, 'Hop onto the box', 'Land on both feet with your knees bent.'],
    [3, 'Drive up immediately', 'Reach overhead and absorb the final landing through both legs.']],
  [box(0, .10, .27)], { armsAt: reachOverhead });

  for (const [id, low, high, gap, flight] of [
    ['Depth_Jump_Leap', .34, .61, 1.20, .62], ['Linear_Depth_Jump', .35, .40, 1.38, .47],
  ]) {
    bound(id, [
      j(0, 'Stand near the edge', 0, -.77, low, .84, .04),
      j(.17, 'Drop off the box', 0, -.72, low, .85, .10, .25),
      j(.66, 'Contact the floor', 0, 0, 0, .77, -.26),
      j(.77, 'Absorb and rebound', 0, 0, 0, .62, -.52),
      j(.92, 'Drive up and forward', 0, 0, 0, .855, 1.50, flight),
      j(1.51, 'Land on the second box', 0, gap - .25, high, .77, .92),
      j(1.77, '', 0, gap - .25, high, .68, .36),
    ], [[0, 'Drop into the gap', 'Step off the edge and prepare to land on both feet.'],
      [3, 'Rebound onto the next box', 'Bend at the hips and knees, then swing your arms to drive upward.'],
      [5, 'Absorb the landing', 'Let your hips and knees soften as both feet contact the platform.']],
    [box(0, -.95, low, .66, .63), box(0, gap - .25, high, .66, .70)]);
  }

  bound('Lateral_Box_Jump', [
    j(0, 'Dip beside box', -.78, 0, 0, .68, -.42),
    j(.22, 'Jump sideways', -.78, 0, 0, .85, 1.18, .35),
    j(.68, 'Land in the middle', 0, 0, .28, .70, .72),
    j(.86, 'Jump down opposite side', 0, 0, .28, .83, .53, .40),
    j(1.32, 'Absorb landing', .78, 0, 0, .70, -.40),
    j(1.55, 'Jump back onto the box', .78, 0, 0, .85, 1.18, .35),
    j(2.01, 'Land in the middle', 0, 0, .28, .70, .72),
    j(2.19, 'Jump back down', 0, 0, .28, .83, .53, .40),
    j(2.65, 'Absorb landing', -.78, 0, 0, .74, .24),
    j(2.81, '', -.78, 0, 0, .68, -.42),
  ], [[0, 'Face forward beside the box', 'Dip into a quarter squat and swing your arms.'],
    [2, 'Land on the center of the box', 'Bring your knees up to clear the edge and land softly.'],
    [3, 'Jump down to the far side', 'Absorb the landing and reverse direction.']],
  [box(0, .05, .28, .56)], { oneShot: false });

  for (const [id, kind, lateral, single, spacing, obstacleHeight, rise] of [
    ['Front_Cone_Hops_or_hurdle_hops', 'cone', false, false, .86, .20, .38],
    ['Hurdle_Hops', 'hurdle', false, false, 1.08, .34, .54],
    ['Lateral_Cone_Hops', 'cone', true, false, .92, .18, .37],
    ['Single-Leg_Hop_Progression', 'cone', false, true, .84, .16, .33],
  ]) {
    const place = (distance) => lateral ? [distance, 0] : [0, distance];
    const keys = [];
    const props = [];
    const turnAt = 2.80;
    const put = (t, label, distance, hips, arms, height = 0, heading = 0) =>
      keys.push([t, label, ...place(distance), 0, hips, arms, heading, height]);
    for (let i = 0; i < (single ? 6 : 3); i++) {
      const returning = i >= 3;
      const from = (returning ? 6 - i : i) * spacing;
      const to = from + (returning ? -spacing : spacing);
      const t = returning ? turnAt + (i - 3) * .76 : i * .76;
      const heading = returning ? Math.PI : 0;
      put(t, i === 0 ? 'Load at the first obstacle' : '', from, .69, -.52, 0, heading);
      put(t + .16, 'Take off', from, .85, 1.24, rise, heading);
      put(t + .63, 'Land and absorb', to, .74, .82, 0, heading);
      if (!returning) props.push(marker(kind, ...place((i + .5) * spacing), obstacleHeight));
      if (single && i === 2) put(t + 1.15, 'Turn and switch legs', to, .71, .22, 0, Math.PI);
    }
    const finish = single ? turnAt + 3 * .76 : 3 * .76;
    put(finish, '', single ? 0 : 3 * spacing, .69, -.52, 0, single ? Math.PI : 0);
    bound(id, keys, [[0, lateral ? 'Face across the row' : 'Face the row',
      single ? 'Balance on one leg and lift the opposite knee.' : 'Start with both feet down and your knees soft.'],
    [1, 'Clear the obstacle', lateral ? 'Jump sideways while keeping your chest forward.' : 'Swing your arms to jump over the obstacle.'],
    [2, 'Rebound out of the landing', single ? 'Land on the same leg. Turn at the end and come back on the other leg.'
      : 'Bend both knees on contact and spring over the next obstacle.']], props, { single });
  }

  // Separate foot paths keep the support foot on the top and the recovery foot
  // outside the box, even when the athletes' hips travel across it.
  function splitJump(id, mode) {
    const across = mode === 'shuffle' || mode === 'crossover';
    const sideBox = across || mode === 'stride';
    const height = mode === 'bench' ? .28 : .32;
    const outside = .62;
    const air = mode === 'shuffle' ? .28 : mode === 'bench' ? .29 : .45;
    const half = mode === 'shuffle' || mode === 'bench' ? .66 : .90;
    const duration = half * (across || mode === 'bench' ? 2 : 1);
    const at = (side, alternate) => {
      if (sideBox) {
        const on = side === (alternate ? -1 : 1);
        return foot(on ? side * -.08 : alternate ? outside : -outside, on ? .03 : -.03, on ? height : 0);
      }
      return side === (alternate ? -1 : 1) ? foot(side * .135, .10, height) : foot(side * .135, -.66);
    };
    const beats = [[0, 'Load the foot on the box'], [half * .24, 'Drive up'],
      [half * .81, 'Catch the landing']];
    if (duration > half) beats.push([half, 'Load for the return'], [half * 1.24, 'Drive back'],
      [half * 1.81, 'Land back at setup']);
    exercise(id, duration, beats, [[0, 'Load the foot on the box', 'Set your top foot securely near the edge.'],
      [1, mode === 'stride' || mode === 'crossover' ? 'Drive the free knee up' : 'Drive through the top leg',
        sideBox ? 'Swing your arms and keep looking forward.' : 'Extend the hip and knee of the top leg.'],
      [2, across || mode === 'bench' ? 'Switch feet on landing' : 'Land with the same foot on top',
        'Bend the supporting knee to absorb the landing.']], (t) => {
      const second = t > half;
      const time = (t - (second ? half : 0)) / half;
      const u = unit(time, .23, .81);
      const lift = arc(u);
      const load = Math.sin(Math.PI * unit(time, 0, .24)) * .065;
      const catchLoad = Math.sin(Math.PI * unit(time, .81, 1)) * .055;
      const fromX = sideBox ? (second ? .33 : -.33) : 0;
      const toX = across ? -fromX : fromX;
      body(lerp(fromX, toX, u), .83 - load - catchLoad + air * lift * .77,
        sideBox ? .02 : -.31 + .07 * lift, .14, 0, (sideBox ? (second ? 1 : -1) : 0) * .08 * lift);
      for (const [side, sign] of sides) {
        const from = at(sign, second);
        const to = at(sign, across || mode === 'bench' ? !second : second);
        const target = from.map((n, i) => lerp(n, to[i], u));
        const freeKnee = mode === 'stride' || mode === 'crossover' ? (sign === (second ? 1 : -1) ? .27 : .02) : 0;
        target[1] += (air + freeKnee) * lift;
        if (mode === 'stride' && sign === -1) target[2] += .28 * lift;
        if (mode === 'crossover' && freeKnee > .1) target[2] += .20 * lift;
        swingArm(side, sign, .12 + lift * (mode === 'shuffle' || mode === 'bench' ? sign * (second ? -1 : 1) : 1.77));
        plant(side, target);
      }
    }, { fixture: { parts: [box(0, sideBox ? .07 : .19, height, .54, .51)] } });
  }
  splitJump('Bench_Sprint', 'bench');
  splitJump('Single_Leg_Push-off', 'push');
  splitJump('Single-Leg_Stride_Jump', 'stride');
  splitJump('Side_to_Side_Box_Shuffle', 'shuffle');
  splitJump('Stride_Jump_Crossover', 'crossover');

  function splitPath(id, keys, instructions, fixture, hold = false) {
    exercise(id, keys.at(-1)[0], keys.slice(0, -1).filter((key) => key[1]), instructions, (t) => {
      const [a, b, u, lift] = keyPose(t, keys);
      const root = a[2].map((n, i) => lerp(n, b[2][i], u));
      root[1] += lift * .74;
      body(...root, hold ? .12 : .13 - .10 * lift);
      for (const [i, [side, sign]] of sides.entries()) {
        const target = a[3][i].map((n, axis) => lerp(n, b[3][i][axis], u));
        target[1] += lift;
        plant(side, target);
        if (hold) {
          const center = v(sign * .15, 1.75 + .69 * (root[1] - .80), .23);
          const { hand, offset } = grip(side, v(1, 0, 0), v(0, .55, 1));
          arm(side, center.sub(offset), v(sign * .22, -.30, -.65), hand, false, v(1, 0, 0));
        } else {
          swingArm(side, sign, lerp(a[4], b[4], u) * sign);
        }
      }
    }, { fixture, fingers: hold ? 'LR' : '', oneShot: !hold });
  }

  const split = (t, label, hip, left, right, arms, lift = 0) => [t, label, hip, [left, right], arms, lift];
  splitPath('Box_Skip', [
    split(0, 'Staggered stance', [-.03, .76, -.77], foot(.11, -.62), foot(-.11, -.99), -.46),
    split(.17, 'Drive off the rear leg', [-.02, .85, -.70], foot(.11, -.54, .11), foot(-.11, -.99), -.15, .44),
    split(.66, 'Land on the first box', [.055, 1.10, .13], foot(.11, .16, .30), foot(-.11, .11, .48), 1.16),
    split(.79, 'Drive the opposite knee', [.075, 1.13, .20], foot(.11, .16, .30), foot(-.11, .40, .59), .95, .45),
    split(1.31, 'Land between the boxes', [.07, .76, 1.17], foot(.13, 1.24), foot(-.11, 1.43, .21), -.52),
    split(1.55, 'Step toward the next box', [0, .80, 1.39], foot(.13, 1.24), foot(-.11, 1.67), -.38),
    split(1.78, 'Load for the second box', [-.04, .76, 1.67], foot(.13, 1.55), foot(-.11, 1.83), -.46),
    split(1.95, 'Drive off the rear leg again', [-.03, .85, 1.74], foot(.13, 1.55), foot(-.11, 1.91, .11), -.15, .44),
    split(2.44, 'Land on the second box', [-.055, 1.10, 2.57], foot(.11, 2.55, .48), foot(-.11, 2.60, .30), 1.16),
    split(2.57, 'Drive the opposite knee', [-.075, 1.13, 2.64], foot(.11, 2.84, .59), foot(-.11, 2.60, .30), .95, .45),
    split(3.09, 'Land past the second box', [-.07, .76, 3.61], foot(.11, 3.87, .21), foot(-.13, 3.68), -.52),
    split(3.30, '', [-.04, .75, 3.76], foot(.11, 3.91), foot(-.13, 3.68), -.35),
  ], [[0, 'Start with one foot back', 'Drive off the rear foot and aim for height at the hip.'],
    [2, 'Rebound from the box', 'Drive the free knee forward and up.'],
    [4, 'Land on the same leg', 'Take a step to prepare for the next box.']],
  { parts: [box(0, .18, .30), box(0, 2.62, .30)] });

  splitPath('Single-Leg_High_Box_Squat', [
    split(0, 'Hold the overhead support', [0, .80, -.40], foot(.12, -.43), foot(-.12, -.53), 0),
    split(.31, 'Lift the lead foot', [.025, .80, -.44], foot(.12, -.42, .56), foot(-.12, -.53), 0),
    split(.68, 'Place lead foot on box', [.05, .84, -.24], foot(.12, .20, .51), foot(-.12, -.53), 0),
    split(1.28, 'Stand on the lead leg', [.10, 1.34, .18], foot(.12, .20, .51), foot(-.13, -.27, .59), 0),
    split(1.63, 'Balance at the top', [.10, 1.34, .18], foot(.12, .20, .51), foot(-.13, -.27, .59), 0),
    split(2.30, 'Lower under control', [.05, .84, -.24], foot(.12, .20, .51), foot(-.12, -.53), 0),
    split(2.60, '', [.025, .80, -.44], foot(.12, -.42, .56), foot(-.12, -.53), 0),
    split(2.92, 'Step down', [0, .80, -.40], foot(.12, -.43), foot(-.12, -.53), 0),
    split(3.08, '', [0, .80, -.40], foot(.12, -.43), foot(-.12, -.53), 0),
  ], [[0, 'Hold the band for balance', 'Place one foot fully on the high box.'],
    [3, 'Stand fully on one leg', 'Keep the other foot unsupported, then step down on the same side.']],
  { kind: 'rackBand', parts: [box(0, .26, .51, .64, .58)] }, true);

  for (const [id, feetLevel, outsideLevel, insideLevel] of [
    ['Drop_Push', 0, .24, 0], ['Incline_Push-Up_Depth_Jump', .31, .14, 0],
  ]) {
    const drop = id === 'Drop_Push';
    const keys = drop
      ? [[0, 'Support on the platforms', 1, .06, 0], [.29, 'Press up and release', 1, .06, .28],
        [.67, 'Catch at shoulder width', 0, .10, 0], [.85, 'Absorb the landing', 0, .22, 0],
        [1.25, '', 0, .15, 0]]
      : [[0, 'Feet up, hands inside the steps', 0, .08, 0], [.33, 'Lower your chest', 0, .25, 0],
        [.58, 'Press off the floor', 0, .02, .26], [.92, 'Catch on the steps', 1, .12, 0],
        [1.17, 'Absorb on the steps', 1, .22, 0], [1.40, 'Rebound inward', 1, .02, .28],
        [1.80, 'Catch on the floor', 0, .16, 0], [2.05, '', 0, .08, 0]];
    const handZ = .58;
    const parts = sides.map(([, sign]) => box(sign * .48, .65, outsideLevel, .27, .39));
    if (feetLevel) parts.push(box(0, -.69, feetLevel, .65, .55));
    supported(id, keys.at(-1)[0], keys.slice(0, -1), [[0, drop ? 'Start with hands on the boxes' : 'Elevate your feet',
      drop ? 'Keep your hips and shoulders aligned as you set up.' : 'Place your palms on the floor just inside the steps.'],
    [drop ? 1 : 2, 'Push off and move your hands', drop
      ? 'Bring your palms inward to shoulder width.' : 'Move your palms outward onto the steps.'],
    [drop ? 3 : 4, 'Absorb the landing', 'Bend your elbows without letting your hips sag.']], (t) => {
      const [a, b, u, lift] = keyPose(t, keys);
      const spread = lerp(a[2], b[2], u);
      const flex = lerp(a[3], b[3], u);
      const handY = lerp(insideLevel, outsideLevel, spread);
      const angle = 1.19 - .64 * (handY - feetLevel) + .70 * flex - .30 * lift;
      body(0, feetLevel + .35 + (handY - feetLevel) * .37 - .31 * flex + .34 * lift, .05, angle);
      for (const [side, sign] of sides) {
        const toe = pitch(1.14);
        leg(side, v(sign * .13, feetLevel + .207, -.69), toe, v(sign * .16, -.84, .18));
        palm(side, sign, v(sign * lerp(.26, .48, spread), handY + palmHeight + .009 + lift, handZ),
          v(0, 0, 1), v(0, 1, 0), .14 + .41 * spread);
      }
    }, { fixture: { parts }, oneShot: drop, framing: 'floor' });
  }

  const stride = (phase, reach, rise, duty = .57) => {
    const p = cycle(phase);
    const stance = p < duty;
    const swing = (p - duty) / (1 - duty);
    return [stance ? lerp(reach, -reach, p / duty) : lerp(-reach, reach, smoothstep(swing, 0, 1)),
      stance ? 0 : rise * Math.sin(Math.PI * swing)];
  };

  function runPose(x, z, phase, { heading = 0, lean = .19, speed = .28, rise = .18, duty = .48,
    level = () => 0, stanceWidth = .117, pelvisY = .82, armStart, blend = 1 } = {}) {
    const turn = yaw(heading);
    body(x, level(z) + pelvisY + .026 * Math.cos(tau * (2 * phase - .25)), z,
      lean, heading, .04 * Math.cos(tau * phase) * blend, .09 * Math.sin(tau * phase) * blend);
    for (const [i, [side, sign]] of sides.entries()) {
      const p = phase + i / 2;
      const [forward, lift] = stride(p, speed, rise, duty);
      const offset = v(sign * stanceWidth, 0, forward).applyQuaternion(turn);
      plant(side, foot(x + offset.x, z + offset.z, level(z + offset.z) + lift), heading);
      swingArm(side, sign, -.88 * Math.cos(tau * (p - duty / 2)), heading, true, armStart?.[i], blend);
    }
  }

  const trail = [[-.85, 0], [.1, .10], [1.30, .35], [1.62, .35], [2.44, .16], [3.30, .04]];
  function terrain(z) {
    let i = 1;
    while (i < trail.length - 1 && z > trail[i][0]) i++;
    const [start, low] = trail[i - 1];
    const [end, high] = trail[i];
    return lerp(low, high, unit(z, start, end));
  }
  exercise('Trail_Running_Walking', 4.15, [[0, 'Run uphill'], [1.45, 'Crest the rise'], [2.20, 'Walk downhill']],
    [[0, 'Lean gently into the climb', 'Use short strides as you run uphill.'],
      [2, 'Shorten your steps downhill', 'Keep your knees bent and descend at a controlled walk.']], (t) => {
      const first = Math.min(t, 1.65);
      const last = Math.max(0, t - 1.65);
      const downhill = step(t, 1.42, 2.16);
      runPose(0, -.35 + first * .95 + last * .66, first * 1.72 + last * 1.12, {
        level: terrain, lean: lerp(.27, -.035, downhill), speed: lerp(.22, .18, downhill),
        rise: lerp(.15, .083, downhill), duty: lerp(.49, .66, downhill), pelvisY: lerp(.81, .78, downhill),
      });
    }, { fixture: { kind: 'trail', trail }, oneShot: true });

  exercise('Single-Cone_Sprint_Drill', 5.4, [[0, 'Chop your feet'], [1.80, 'Second lap'], [3.60, 'Third lap']],
    [[0, 'Start next to the cone', 'Block with the arms and use quick, short steps.'],
      [1, 'Circle the marker', 'Keep your knees up and stay close to the cone for three laps.']], (t) => {
      const speed = tau / 1.8;
      const period = .36;
      const duty = .50;
      const a = speed * t;
      const heading = Math.PI / 2 + a;
      const phase = t / period;
      body(.64 * Math.sin(a), .79 + .027 * Math.sin(2 * tau * phase), .64 * Math.cos(a),
        .24, heading, -.23, .09 * Math.sin(tau * phase));
      for (const [side, sign] of sides) {
        const stridePhase = phase + (sign > 0 ? 0 : .5);
        const p = cycle(stridePhase);
        const swing = unit(p, duty, 1);
        const landing = a + speed * period * (duty / 2 - p + step(p, duty, 1));
        const radius = .64 - sign * .115;
        plant(side, foot(radius * Math.sin(landing), radius * Math.cos(landing), .19 * Math.sin(Math.PI * swing)),
          Math.PI / 2 + landing);
        swingArm(side, sign, -.88 * Math.cos(tau * (stridePhase - duty / 2)), heading, true);
      }
    }, { fixture: { parts: [marker('cone', 0, 0, .30)] }, oneShot: true });

  exercise('Side_Hop-Sprint', 2.50, [[0, 'Hop sideways'], [.59, 'Rebound back'], [1.19, 'Accelerate out']],
    [[0, 'Clear the cone sideways', 'Start beside the marker and rebound back on the next landing.'],
      [2, 'Sprint forward', 'Drive out as soon as you land from the last hop.']], (t) => {
      if (t >= 1.19) {
        const s = t - 1.19;
        const blend = step(s, 0, .23);
        runPose(-.57, 1.60 * s - .15 * (1 - Math.exp(-8 * s)), s * 2.45, {
          speed: .26 * blend, rise: .18 * blend, lean: lerp(.23, .27, blend),
          stanceWidth: lerp(.13, .117, blend), pelvisY: lerp(.74, .78, blend), armStart: [-.32, -.32], blend,
        });
      } else {
        const first = t < .59;
        const u = unit(t, first ? .10 : .69, first ? .59 : 1.19);
        const x = (first ? 1 : -1) * lerp(-.57, .57, u);
        const lift = .35 * arc(u);
        body(x, .74 + .72 * lift, 0, .23);
        for (const [side, sign] of sides) {
          plant(side, foot(x + sign * .13, 0, lift));
          swingArm(side, sign, 1.25 * arc(u) - .32);
        }
      }
    }, { fixture: { parts: [marker('cone', 0, 0, .21)] }, oneShot: true });

  supported('Linear_3-Part_Start_Technique', 2.20, [[0, 'Set the feet and right hand'], [.53, 'Load the lead leg'],
    [1.05, 'Release the hand'], [1.37, 'Sprint out']], [[0, 'Set the three-point stance',
    'Put your right hand on the line with your left foot forward and your weight low.'],
  [1, 'Bring your nose toward the lead knee', 'Reach your left arm back while keeping your hips high.'],
  [2, 'Drive out of the start', 'Push through the lead foot and accelerate with short steps.']], (t) => {
    if (t >= 1.37) {
      const s = t - 1.37;
      const blend = step(s, 0, .28);
      runPose(.015, .29 + 1.92 * s, .22 + 2.4 * s, {
        lean: .70 - .46 * step(s, 0, .75), pelvisY: .74 + .065 * step(s, 0, .55),
        armStart: [1.06, -.61], blend,
      });
      return;
    }
    const load = step(t, 0, .53);
    const drive = step(t, 1.03, 1.37);
    body(.015, .61 + .13 * drive, -.44 + .73 * drive, 1.69 + .13 * load - 1.12 * drive);
    for (const [side, sign] of sides) {
      const left = sign === 1;
      const [forward, rise] = stride(.22 + (left ? 0 : .5), .28, .18, .48);
      plant(side, foot(sign * lerp(.115, .117, drive), lerp(left ? -.37 : -.62, .29 + forward, drive),
        (left ? .06 : .15) * arc(drive) + drive * rise));
      if (left) swingArm(side, sign, lerp(-1.49 * load, 1.06, drive));
      else if (drive === 0) palm(side, sign, v(-.215, palmHeight + .019, -.015));
      else {
        const from = v(-.215, palmHeight + .019, -.015);
        const to = point('ArmR').add(v(-.075, -.39 * Math.cos(.61), -.39 * Math.sin(.61)));
        const planted = support.pose(sign, v(0, 0, 1), v(0, 1, 0));
        const swung = openHand(sign, v(-.025, -Math.cos(.61), -Math.sin(.61)), v(-1, 0, 0));
        arm(side, from.lerp(to, drive), v(-.55, .16, -.88).lerp(v(-.65, -.62, -.85), drive),
          planted.slerp(swung, drive), true);
      }
    }
  }, { fixture: { parts: [{ kind: 'line', x: 0, z: .06 }] }, oneShot: true });

  const wallZ = .55;
  supported('Linear_Acceleration_Wall_Drill', 3.48, [[0, 'Brace against the wall'], [.30, 'Right knee drive'],
    [1.05, 'Left knee drive'], [1.78, 'Right knee drive'], [2.29, 'Rapid switches']],
  [[0, 'Lean into the wall', 'Brace with both palms and bring your feet together.'],
    [1, 'Drive the knee up, then down', 'Pause briefly at the top and drive straight down before switching legs.'],
    [4, 'Switch quickly', 'Keep your hips braced as you alternate knee drives.']], (t) => {
    const switches = [[.14, .34, .65, .87, -1], [.88, 1.06, 1.38, 1.59, 1], [1.61, 1.80, 2.04, 2.27, -1],
      [2.27, 2.38, 2.44, 2.56, 1], [2.56, 2.66, 2.72, 2.84, -1],
      [2.84, 2.95, 3.01, 3.12, 1], [3.12, 3.22, 3.27, 3.39, -1]];
    body(0, .74, -.34, .74);
    for (const [side, sign] of sides) {
      const lift = switches.filter((beat) => beat[4] === sign).reduce((n, [a, b, c, d]) =>
        n + step(t, a, b) * (1 - step(t, c, d)), 0);
      plant(side, foot(sign * .11, -.60 + .85 * lift, .39 * lift), 0, .10, v(sign * .42, 0, 1));
      palm(side, sign, v(sign * .25, 1.17, wallZ - palmHeight - .005), v(0, 1, 0), v(0, 0, -1));
    }
  }, { fixture: { kind: 'wall', z: wallZ } });

  const bike = { kind: 'bike', crank: [.46, .16], radius: .175, period: 1.2 };
  exercise('Bicycling', bike.period * 2, [[0, 'Seated pedal stroke'], [.60, 'Drive the other pedal'], [1.20, 'Continue pedaling']],
    [[0, 'Adjust the saddle and sit', 'Keep your hips steady and rest your hands on the handlebar.'],
      [1, 'Pedal smoothly', 'Keep each foot on its pedal through the full rotation.']], (t) => {
      body(0, .99, -.19, .48);
      for (const [side, sign] of sides) {
        const a = tau * t / bike.period + (sign === 1 ? 0 : Math.PI);
        const [y, z] = bike.crank;
        plant(side, foot(sign * .145, z + bike.radius * Math.sin(a) - .069,
          y + bike.radius * Math.cos(a) + .017), 0, 0);
        take(side, v(sign * .247, 1.20, .564), v(1, 0, 0), v(0, -1, .28), v(sign * .50, -.86, -.3));
      }
    }, { fixture: bike, fingers: 'LR' });

  exercise('Skating', 2.88, [[0, 'Glide on the left skate'], [.72, 'Glide on the right skate'], [1.44, 'Glide on the left skate'],
    [2.16, 'Glide on the right skate']], [[0, 'Glide on one skate', 'Stay low and balance over your supporting foot.'],
    [1, 'Push out to the side', 'Bring the free skate back under you as the other foot takes your weight.']], (t) => {
    const period = 1.44;
    const duty = .60;
    const a = tau * t / period;
    const shift = .14 * Math.cos(a);
    body(shift, .79 + .024 * Math.cos(2 * a), .72 * t, .32, 0, -.75 * shift);
    for (const [side, sign] of sides) {
      const p = cycle(t / period + (sign > 0 ? 0 : .5));
      const drive = unit(p, 0, duty);
      const recovery = unit(p, duty, 1);
      const push = step(drive, 0, 1) * (1 - step(recovery, 0, 1));
      const outwardSpeed = .26 * 6 * drive * (1 - drive) / (period * duty);
      const forwardSpeed = .72 - .25 * 6 * drive * (1 - drive) / (period * duty);
      plant(side, foot(sign * (.15 + .26 * push), .72 * t + .16 - .25 * push,
        .10 + .17 * Math.sin(Math.PI * recovery) ** 2), Math.atan2(sign * outwardSpeed, forwardSpeed), 0);
      swingArm(side, sign, .55 * sign * Math.cos(a), 0, true);
    }
  }, { fixture: { kind: 'skates' }, oneShot: true });

  const jumpRope = { kind: 'jumpRope', period: .76 };
  exercise('Rope_Jumping', 2.28, [[0, 'Turn the rope'], [.24, 'Hop as it passes underfoot'], [.60, 'Land softly']],
    [[0, 'Circle the rope with your wrists', 'Hold one handle in each hand and keep your elbows close to your sides.'],
    [1, 'Hop as the rope reaches your feet', 'Clear the rope with a small two-foot jump and land softly.']], (t) => {
    const a = tau * (t / jumpRope.period - .40);
    const lift = .17 * Math.max(0, (Math.cos(a) - .19) / .81);
    body(0, .81 + .81 * lift - .035 * Math.max(0, -Math.cos(a)), 0, .06);
    for (const [side, sign] of sides) {
      plant(side, foot(sign * .126, 0, lift));
      take(side, v(sign * .38, .92 - .055 * Math.cos(a), .16 - .055 * Math.sin(a)), v(sign, 0, 0),
        v(0, -.3 - .44 * Math.cos(a), .86 + .26 * Math.sin(a)), v(sign * .38, -.8, -.78));
    }
  }, { fixture: jumpRope, fingers: 'LR' });

  const ropes = { kind: 'battleRopes', anchor: [0, .12, 4.80], period: .55 };
  exercise('Battling_Ropes', 2.20, [[0, 'Alternate the waves'], [.275, 'Switch arms'], [1.1, 'Keep the waves moving']],
    [[0, 'Hold an end in each hand', 'Face the anchor and soften your knees.'],
      [1, 'Whip one rope up as the other drops', 'Bring each hand to shoulder height in alternation.']], (t) => {
      const a = tau * t / ropes.period;
      body(0, .78 + .016 * Math.sin(2 * a), -.075, .12);
      for (const [side, sign] of sides) {
        const high = .5 + sign * .5 * Math.cos(a);
        plant(side, foot(sign * .22, 0));
        take(side, v(sign * .31, .85 + .51 * high, lerp(.19, .44, high)), v(1, 0, 0),
          v(0, -.58, .8), v(sign * .44, -.71, -.63));
      }
    }, { fixture: ropes, fingers: 'LR' });

  const bag = { kind: 'bag', pivot: [.37, 2.28, .59], radius: .21 };
  supported('Heavy_Bag_Thrust', 2.40, [[0, 'Set one hand on the bag'], [.37, 'Turn and press'],
    [.62, 'Let the bag swing'], [1.62, 'Receive the returning bag']],
  [[0, 'Stagger your stance', 'Set one palm on the heavy bag at chest height.'],
    [1, 'Rotate and drive the palm forward', 'Transfer weight as you extend your arm.'],
    [3, 'Receive the bag on the return', 'Reverse the motion and absorb the swing.']], (t) => {
    const drive = step(t, .24, .61) * (1 - step(t, .94, 1.68));
    const angle = -.47 * Math.sin(Math.PI * unit(t, .28, 1.94));
    const rotation = pitch(angle);
    const pivot = v(...bag.pivot);
    const tangent = v(0, 0, -1).applyQuaternion(rotation);
    const contact = v(0, -.86, -bag.radius - palmHeight).applyQuaternion(rotation).add(pivot);
    const meet = step(t, .57, .86) * (1 - step(t, 1.42, 1.97));
    body(.15 + .06 * drive, .80, .10 * drive, .08, .12, -.08, .35 * drive);
    plant('L', foot(.34, .14));
    plant('R', foot(-.08, -.33));
    const chamber = point('ArmL').add(v(.11, -.20, .18));
    palm('L', 1, contact.lerp(chamber, .79 * meet), v(0, 1, 0), tangent);
    support.pose(-1, v(0, 1, 0), v(0, 0, -1));
    swingArm('R', -1, -.49 * drive);
    return [pivot, rotation];
  }, { fixture: bag });

  for (const [id, mode] of [['Backward_Drag', 'backward'], ['Forward_Drag_with_Press', 'press'],
    ['Sled_Drag_-_Harness', 'harness'], ['Bear_Crawl_Sled_Drags', 'crawl'],
    ['Prowler_Sprint', 'prowler'], ['Sled_Push', 'push'], ['Sled_Overhead_Backward_Walk', 'overhead'],
    ['Sled_Overhead_Triceps_Extension', 'triceps'], ['Sled_Reverse_Flye', 'flye'], ['Sled_Row', 'row']]) {
    const pusher = mode === 'prowler' || mode === 'push';
    const harness = mode === 'harness' || mode === 'crawl';
    const crawling = mode === 'crawl';
    const resistedRep = ['press', 'triceps', 'flye', 'row'].includes(mode);
    const backward = ['backward', 'overhead', 'flye', 'row'].includes(mode);
    const ahead = backward || pusher;
    const model = { kind: 'sled', pusher, harness, ahead, handleHeight: mode === 'push' ? 1.12 : .83 };
    const duration = resistedRep ? 3.2 : 2.48;
    const first = resistedRep ? .77 : .46;
    const last = resistedRep ? 2.07 : 1.62;
    const pace = pusher ? (mode === 'prowler' ? 1.32 : .94) : mode === 'overhead' ? .67 : crawling ? .60 : .84;
    const stepRate = mode === 'prowler' ? 2.18 : pusher ? 1.65 : crawling ? 1.36 : 1.42;
    const poses = {
      backward: ['Face the sled', 'Hold the straps under tension and lean back.', 'Take short backward steps',
        'Extend through your legs to pull the sled.'],
      press: ['Face away with both handles', 'Step forward and brace in a split stance.', 'Press forward',
        'Extend your elbows, then bring the handles back for the next step.'],
      harness: ['Take up tension in the harness', 'Face away and lean slightly into the pull.', 'March forward',
        'Drive through the hips and knees to move the sled.'],
      crawl: ['Set up on your hands and feet', 'Attach the tether at the back of your belt and keep your back flat.',
        'Crawl forward', 'Alternate your hands and feet while driving through the legs.'],
      prowler: ['Take the low handles', 'Lean into the prowler with your arms extended.', 'Accelerate',
        'Drive through the floor with quick alternating steps.'],
      push: ['Lean into the upright handles', 'Keep both elbows extended.', 'Push the sled forward',
        'Extend through your hips and knees on each step.'],
      overhead: ['Reach above your head', 'Face the sled and straighten your elbows.', 'Walk backward',
        'Use steady steps and keep the handles overhead.'],
      triceps: ['Set your upper arms overhead', 'Face away from the sled, with the handles close and elbows flexed.',
        'Straighten your elbows', 'Keep the upper arms still. Step forward to take up slack.'],
      flye: ['Start with hands out in front', 'Keep your knees soft and elbows nearly straight.', 'Sweep your arms up and apart',
        'Turn the palms forward and step back to reset the straps.'],
      row: ['Start with arms extended', 'Face the sled and bend your knees slightly.', 'Row toward your ribs',
        'Bend your elbows and retract your shoulder blades, then step back to reset.'],
    }[mode];
    const beats = [[0, poses[0]], [first, poses[2]], [last, resistedRep ? 'Reset tension' : 'Continue the drive']];
    const author = crawling ? supported : exercise;
    author(id, duration, beats, [[0, poses[0], poses[1]], [1, poses[2], poses[3]]], (t) => {
      const effort = step(t, first, 1.49) * (1 - step(t, 1.80, 2.51));
      const travel = (backward ? -1 : 1) * (resistedRep
        ? (mode === 'press' ? .47 * step(t, 0, .70) + .27 * step(t, 2.28, duration)
          : .52 * step(t, 1.95, duration))
        : t * pace);
      const sledZ = travel + (pusher ? (mode === 'push' ? 1.02 : 1.08) : ahead ? 1.75 : crawling ? -1.88 : -1.67) +
        (resistedRep ? (ahead ? -.34 : .29) * effort : 0);
      const headForGrip = (side, sign) => {
        if (pusher) {
          take(side, v(sign * .33, model.handleHeight, sledZ - .30), v(0, 1, 0),
            v(0, -.11, 1), v(sign * .20, -.84, -.45));
          return;
        }
        if (mode === 'triceps') {
          const upper = v(-sign * .17, 1, .12).setLength(bone('Forearm' + side).position.length());
          const lower = v(0, -Math.cos(.48 + 2.51 * effort), -Math.sin(.48 + 2.51 * effort))
            .setLength(bone('Hand' + side).position.length() - .001);
          const hand = grip(side, v(1, 0, 0), lower).hand;
          arm(side, point('Arm' + side).add(upper).add(lower), upper, hand);
          return;
        }
        const [width, y, f] = mode === 'overhead' ? [.24, 1.89, .035]
          : mode === 'backward' ? [.26, .99, .36]
          : mode === 'press' ? [.26, 1.15 + .05 * effort, .34 + .43 * effort]
          : mode === 'flye' ? [.23 + .46 * effort, 1.04 + .30 * effort, .47 - .49 * effort]
          : [.24 + .048 * effort, 1.09 + .035 * effort, .56 - .46 * effort];
        const pole = v(sign * .42, -.78, -.64);
        const handAxis = mode === 'flye' ? v(Math.cos(effort * 1.2), Math.sin(effort * 1.2), 0) : v(1, 0, 0);
        take(side, v(sign * width, y, travel + f), handAxis,
          v(0, mode === 'overhead' ? 1 : -.42, mode === 'overhead' ? .25 : 1), pole);
      };
      if (crawling) {
        const phase = t * stepRate;
        const reach = pace * .62 / (2 * stepRate);
        body(0, .52 + .016 * Math.cos(tau * phase * 2), travel, 1.54, 0, .032 * Math.sin(tau * phase));
        for (const [i, [side, sign]] of sides.entries()) {
          const [f, h] = stride(phase + i * .5, reach, .15, .62);
          const [a, b] = stride(phase + (1 - i) * .5, reach, .095, .62);
          leg(side, v(sign * .14, .188 + h, travel - .53 + f), pitch(.88), v(sign * .18, -.81, .55));
          palm(side, sign, v(sign * .215, palmHeight + .010 + b, travel + .45 + a));
        }
      } else {
        const progress = resistedRep
          ? (mode === 'press' ? .50 * step(t, 0, .70) : 0) + step(t, 1.95, duration)
          : t * stepRate;
        const heading = backward ? Math.PI : 0;
        const lean = pusher ? (mode === 'prowler' ? .83 : .49)
          : mode === 'harness' ? .46 : mode === 'press' ? .29 : mode === 'backward' ? -.15 : -.04;
        const reach = resistedRep ? .21 : pace * .57 / (2 * stepRate);
        body(0, (pusher ? .77 : .81) + .02 * Math.sin(tau * 2 * progress), travel, lean);
        for (const [i, [side, sign]] of sides.entries()) {
          const p = progress + .5 * i;
          const [f, h] = stride(p, reach, pusher ? .18 : .12, .57);
          plant(side, foot(sign * .13, travel + Math.cos(heading) * f - (pusher ? .13 : 0), h));
          if (mode === 'harness') swingArm(side, sign, -.74 * Math.cos(tau * (p - .25)), 0, true);
          else headForGrip(side, sign);
        }
      }
      return [v(0, 0, sledZ), q()];
    }, { fixture: model, fingers: harness ? '' : 'LR', oneShot: true, framing: crawling ? 'floor' : 'standing' });
  }

  return entries;
}
