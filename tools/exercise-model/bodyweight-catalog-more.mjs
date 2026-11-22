import { QuaternionKeyframeTrack } from 'three';
import { createAuthor, cues, down, lerp, motion, pitch, rep, roll, sides, up, v, yaw } from './barbell-standing-more.mjs';
import { metadata } from './catalog-more.mjs';
import { createSupportHands, openHand, palmHeight, supportFingerNames } from './hand-frame.mjs';

export const groupLabel = 'Bodyweight skills and stretches';
const floor = { equipment: '', framing: 'floor', fingers: '' };
const upright = { ...floor, framing: 'standing' };
const bench = { ...floor, equipment: 'bench' };
const alternating = [[0, 'Setup'], [.85, 'First side'], [1.62, 'Center'], [2.45, 'Other side'], [3.35, 'Reset']];
const handPole = (s) => v(s, -.65, -.28);

export function createEntries(asset, helpers) {
  const { add, entries, torso, stance, leg, arm, free, point, grip, bone, world } = createAuthor(asset, helpers, metadata);
  const reach = (side, target, direction) => free(side, target, direction);
  const palms = (side, s, target, direction) => {
    const hand = openHand(s, direction, v(0, 1, 0));
    arm(side, target, v(s * .7, .1, -.7), hand);
  };
  const support = createSupportHands(bone);
  const handAdd = (id, direction) => {
    for (const [, s] of sides) support.pose(s, direction(s), v(0, 1, 0));
    entries['local:exercise:' + id]?.clip.tracks.push(...supportFingerNames.map((name) =>
      new QuaternionKeyframeTrack(name + '.quaternion', [0], bone(name).quaternion.toArray())));
    support.reset();
  };
  const exerciseCues = (phases, setup, form) => cues(phases, setup, form,
    ['Return slowly', 'Keep breathing and reverse the motion under control.']);

  for (const [id, width, angle, detail] of [
    ['Incline_Push-Up_Close-Grip', .095, .34, 'Set your hands close and tuck your elbows.'],
    ['Incline_Push-Up_Medium', .205, 0, 'Set your hands just wider than your shoulders.'],
    ['Incline_Push-Up_Wide', .365, -.16, 'Set your hands wider than your shoulders.'],
    ['Incline_Push-Up_Reverse_Grip', .214, 0, 'Use a shoulder-width, palms-up grip on the fixed bar.'],
  ]) {
    const reversed = id === 'Incline_Push-Up_Reverse_Grip';
    const shaft = v(0, .520, .490);
    const topTilt = reversed ? .983 : width > .30 ? 1.023 : 1.000;
    const bottomTilt = reversed ? 1.140 : 1.175;
    const ankleY = .204;
    const ankleZ = -1.040;
    const direction = (s) => v(0, 0, 1).applyQuaternion(yaw(s * angle));
    add(id, down, exerciseCues(down, [reversed ? 'Set your hands on the fixed bar' : 'Plant your hands on the bench', detail],
      [reversed ? 'Lower your chest toward the bar' : 'Lower your chest toward the bench',
        'Keep your shoulders, hips, and ankles in line.']), (t) => {
      const a = rep(down, t);
      const tilt = lerp(topTilt, bottomTilt, a);
      const hip = v(0, ankleY + .820 * Math.cos(tilt), ankleZ + .820 * Math.sin(tilt));
      torso(hip, pitch(tilt), pitch(.88 + a * .13));
      for (const [side, s] of sides) {
        leg(side, v(s * .115, ankleY, ankleZ), pitch(1.11), v(s * .1, -.6, .9));
        if (reversed) {
          const along = v(0, -.68, .73);
          const { hand, offset } = grip(side, v(1, 0, 0), along);
          arm(side, shaft.clone().add(v(s * width, 0, 0)).sub(offset), v(s * .28, -.32, -.90), hand);
        } else {
          palms(side, s, v(s * width, .430 + palmHeight, .317), direction(s).add(v(0, -.09, 0)));
        }
      }
      if (reversed) return [shaft];
    }, reversed
      ? { ...floor, equipment: 'barbell', fingers: 'LR', machineGuidedFixture: { kind: 'smith', z: shaft.z } }
      : { ...bench, benchTransform: { position: [0, 0, .39], yaw: Math.PI / 2 } });
    if (!reversed) handAdd(id, direction);
  }

  for (const [id, mode] of [
    ['Lying_Crossover', 'cross'], ['Lying_Glute', 'glute'], ['Lying_Bent_Leg_Groin', 'groin'],
    ['Lying_Hamstring', 'hamstring'], ['Hamstring_Stretch', 'strap-hamstring'],
    ['Intermediate_Groin_Stretch', 'strap-groin'], ['On-Your-Back_Quad_Stretch', 'quad'],
    ['Flutter_Kicks', 'flutter'], ['Lying_Prone_Quadriceps', 'prone'],
  ]) {
    const flutter = mode === 'flutter';
    const prone = flutter || mode === 'prone';
    const bend = mode === 'glute' || mode === 'groin';
    const strapped = mode.startsWith('strap-');
    const phases = flutter ? alternating : up;
    const name = { cross: 'Cross your top knee over your body', glute: 'Draw the bent knee toward your trunk',
      groin: 'Open the bent knee out to the side', hamstring: 'Lift and straighten the working leg',
      'strap-hamstring': 'Draw one straight leg upward', 'strap-groin': 'Lower the raised leg out to the side',
      quad: 'Draw the heel back next to your hip', flutter: 'Alternate small kicks above the floor',
      prone: 'Draw your heel toward your glutes' }[mode];
    add(id, phases, exerciseCues(phases, [prone ? 'Lie face down' : 'Lie on your back',
      flutter ? 'Support your hips at the end of the bench and lengthen both legs.' : 'This solo demonstration shows the working leg’s path without partner pressure.'],
    [name, flutter ? 'Move from your hips with soft knees.' : 'Stop at a comfortable stretch.']), (t) => {
      const a = flutter ? motion([0, .85, 1.62, 2.45, 3.35], [0, 1, 0, -1, 0], t) : rep(up, t);
      const tilt = prone ? 1.57 : -1.57;
      const overEdge = mode === 'quad';
      torso(v(0, flutter || overEdge ? .561 : prone ? .175 : .142, 0), pitch(tilt).multiply(roll(mode === 'cross' ? .47 * a : 0)), pitch(tilt));
      for (const [side, s] of sides) {
        const working = s > 0;
        if (mode === 'prone') {
          world('Thigh' + side, pitch(1.47));
          world('Shin' + side, pitch(1.56 + (working ? 1.77 * a : 0)));
          world('Foot' + side, pitch(.41 + (working ? 1.28 * a : 0)));
          continue;
        }
        if (strapped) {
          const lift = mode === 'strap-hamstring' ? lerp(-2.06, -3.08, a) : -2.85;
          const thigh = working ? roll(mode === 'strap-groin' ? -.87 * a : 0).multiply(pitch(lift)) : pitch(-1.53);
          world('Thigh' + side, thigh);
          world('Shin' + side, thigh);
          world('Foot' + side, pitch(working ? -.42 : -.26));
          continue;
        }
        if (overEdge) {
          world('Thigh' + side, pitch(working ? -.85 + .12 * a : -1.47).multiply(roll(working ? .37 : 0)));
          world('Shin' + side, pitch(working ? 1.36 + .26 * a : -1.37));
          world('Foot' + side, pitch(working ? .82 + .32 * a : -.63));
          continue;
        }
        const x = s * .118 + (working && mode === 'cross' ? -.54 * a : working && mode === 'groin' ? .38 * a : 0);
        const height = flutter ? .465 + s * .136 * a : working ? .074 +
          ({ hamstring: .75, glute: .455, cross: .27, groin: .17 }[mode] * a) : .074;
        const z = working && !flutter ? lerp(.79, {
          cross: .245, glute: .19, groin: .33, hamstring: .12,
        }[mode], a) : flutter ? .795 - .051 * Math.abs(a) : .81;
        leg(side, v(x, height, (prone ? -1 : 1) * z),
          pitch(prone ? 1.5 : -.27 - (working ? .65 * a : 0)),
          v(s * (mode === 'groin' ? .89 : mode === 'cross' ? -.75 : .30), 1, -.17));
      }
      for (const [side, s] of sides) {
        const foot = point('FootL');
        const knee = point('ShinL');
        const target = flutter ? v(s * .153, .446, .88)
          : prone ? (s > 0 ? foot.add(v(.04, .09, -.05)) : v(-.25, .123, .29))
            : overEdge ? (s > 0 ? foot.add(v(.047, .053, -.109)) : v(-.26, .458, -.035))
              : strapped ? knee.clone().lerp(foot, .21).add(v(s * .095, .03, -.075))
                : bend || mode === 'hamstring' ? knee.add(v(s * .09, -.058, -.05))
                : v(s * .62, .089, -.36);
        const along = target.clone().sub(point('Arm' + side));
        if (overEdge) arm(side, target, v(s, -.28, -.15), (forearm) =>
          openHand(s, s > 0 ? forearm.lerp(v(-.20, -.76, .68).normalize(), .5) : forearm, v(s, .17, 0)));
        else if (mode === 'cross' || prone) arm(side, target, v(s * .43, .55, -.1), openHand(s, along, v(0, 1, 0)));
        else reach(side, target, along);
      }
    }, flutter || mode === 'quad' ? { ...bench, benchTransform: { position: [0, 0, flutter ? .366 : -.42] } } : floor);
  }

  for (const [id, mode] of [
    ['Seated_Glute', 'glute'], ['Seated_Biceps', 'biceps'],
    ['Seated_Front_Deltoid', 'deltoid'], ['Seated_Hamstring', 'hamstring'],
    ['Seated_Hamstring_and_Calf_Stretch', 'calf'],
  ]) {
    const behind = mode === 'biceps' || mode === 'deltoid';
    const deltoid = mode === 'deltoid';
    const twist = mode === 'glute';
    add(id, down, exerciseCues(down, ['Sit tall on the floor',
      deltoid ? 'Reach both arms out and slightly behind you, with your palms facing down.'
        : behind ? 'Set your hands behind you.' : 'Set your working leg in front of you.'],
    [behind ? 'Ease your torso away from your hands' : twist ? 'Turn your chest with control' : 'Lead the fold with your hips',
      'Keep the movement within a comfortable range.']), (t) => {
      const a = rep(down, t);
      const bend = behind ? (mode === 'biceps' ? .11 : .29) * a : twist ? .06 : .15 + .67 * a;
      torso(v(0, .135, behind ? .13 * a : .027), yaw(twist ? .65 * a : 0).multiply(pitch(bend)));
      for (const [side, s] of sides) {
        const x = s * (mode === 'glute' && s > 0 ? -.20 : .12);
        const z = twist && s > 0 ? .34 : .76;
        leg(side, v(x, .074, z), pitch(mode === 'calf' ? -.35 * a : 0), v(0, 1, .04));
        const target = behind ? v(s * .214, palmHeight, mode === 'biceps' ? -.32 : -.43) :
          twist ? (s > 0 ? v(.28, .175, -.15) : point('ShinL').add(v(-.08, .17, .01))) :
            v(x + s * .035, lerp(.165, .128, a), lerp(.27, z - .08, a));
        if (deltoid) {
          const along = v(s * (.481 - .047 * a), -.018, -.141 - .115 * a);
          arm(side, point('Arm' + side).add(along), v(0, -1, .20), openHand(s, along, v(0, 1, 0)));
        } else if (behind) palms(side, s, target, v(0, 0, -1));
        else reach(side, target, target.clone().sub(point('Arm' + side)));
      }
    }, floor);
  }

  const spinal = [[0, 'Sit tall'], [.35, 'Twist left three times'], [2.75, 'Fold toward the left knee'],
    [4.50, 'Twist right three times'], [6.90, 'Fold toward the right knee'], [8.65, 'Reset']];
  add('Spinal_Stretch', spinal, [
    [0, 'Sit tall with both feet planted', 'Bring your hands together behind your head with your elbows out.'],
    [.35, 'Turn your chest three times', 'Move through a comfortable range and keep your hips on the chair.'],
    [2.75, 'Lean forward and turn', 'Reach the elbow toward the inside of the knee. Rise and repeat on the other side.'],
  ], (t) => {
    const sign = t < 4.50 ? 1 : -1;
    const at = t - (sign > 0 ? .35 : 4.50);
    const twist = sign * motion([0, .38, .80, 1.18, 1.60, 1.98, 2.40, 3.31, 3.62, 4.15],
      [0, .63, 0, .70, 0, .73, 0, .67, .68, 0], at);
    const fold = motion([2.40, 3.31, 3.62, 4.15], [0, 1, 1, 0], at);
    const frame = pitch(.07 + .97 * fold).multiply(yaw(twist));
    const head = frame.clone().multiply(pitch(.17));
    torso(v(0, .55, -.125), pitch(.04 + .62 * fold));
    world('Lumbar', pitch(.06 + .79 * fold).multiply(yaw(.36 * twist)));
    world('Chest', frame);
    world('Head', head);
    for (const [side, s] of sides) {
      leg(side, v(s * .171, .074, .353), yaw(s * .12), v(s * .14, .88, .42));
      const wrist = point('Head').add(v(s * .105, .077 + s * .009, -.097).applyQuaternion(head));
      arm(side, wrist, v(s, .12, .02).applyQuaternion(frame),
        openHand(s, v(-s, .13, -.25).applyQuaternion(head), v(0, 0, -1).applyQuaternion(head)), true);
    }
  }, { ...upright, bodyweightSupport: 'chair', duration: 8.65 });

  for (const [id, mode] of [
    ['Overhead_Triceps', 'triceps'], ['Overhead_Lat', 'lat'], ['Standing_Biceps_Stretch', 'biceps'],
    ['Standing_Gastrocnemius_Calf_Stretch', 'calf'],
    ['Standing_Hamstring_and_Calf_Stretch', 'heel'],
  ]) {
    const seated = mode === 'triceps' || mode === 'lat';
    const upper = seated || mode === 'biceps';
    const target = { triceps: 'Bend one elbow behind your head', lat: 'Reach overhead and lean sideways',
      biceps: 'Open your chest and reach your arms back',
      calf: 'Reach toward the toes of your elevated foot', heel: 'Hinge over a forward heel' }[mode];
    add(id, down, exerciseCues(down, [seated ? 'Sit upright and raise one arm overhead' : upper ? 'Stand with your ribs stacked' : 'Start with a staggered stance',
      upper ? 'Relax your shoulders before reaching.' : 'Keep your balance over both feet.'],
    [target, 'Stay within a comfortable range and breathe steadily.']), (t) => {
      const a = rep(down, t);
      const calf = mode === 'calf';
      const lean = upper ? .03 : .10 + .77 * a;
      torso(v(mode === 'lat' ? -.066 * a : 0, seated ? .14 : upper ? .862 : .818 - .069 * a,
        upper ? 0 : -.155), pitch(lean).multiply(roll(mode === 'lat' ? .38 * a : 0)));
      if (seated) {
        for (const [side, s] of sides) leg(side, v(s * .16, .074, .72));
      } else if (upper) {
        stance(.157);
      } else {
        leg('L', v(.14, calf ? .407 : .123, calf ? .49 : .36), pitch(-.41 - .16 * a));
        leg('R', v(-.15, .074, calf ? -.14 : -.20), yaw(-.12));
      }
      for (const [side, s] of sides) {
        const shoulder = point('Arm' + side);
        if (mode === 'triceps' && s > 0) {
          const upper = v(-.11, 1, .025).setLength(bone('ForearmL').position.length());
          const lower = v(-.08, -.64 - .54 * a, -.81 + .24 * a).setLength(bone('HandL').position.length());
          const wrist = shoulder.add(upper).add(lower);
          arm(side, wrist, upper, openHand(s, lower, v(.60, 0, -.80)));
          continue;
        }
        const wrist = mode === 'triceps' ? point('ShinR').add(v(-.035, .065, -.052))
          : mode === 'lat' ? shoulder.clone().add(s > 0 ? v(-.13 * a, .39 - .08 * a, -.12 * a)
            : v(.02, -.33, .205))
            : mode === 'biceps' ? shoulder.clone().add(v(s * (.23 + .12 * a), -.37 + .10 * a, -.14 - .12 * a))
              : s > 0 ? point('ShinL').lerp(point('FootL'), .35 + .64 * a).add(v(.08, .11, .055))
                : point('ShinR').add(v(-.04, .185, -.02));
        reach(side, wrist, wrist.clone().sub(shoulder));
      }
    }, seated ? floor : mode === 'calf' ? { ...upright, equipment: 'step-platform-bodyweight' } : upright);
  }

  const jumping = [[0, 'Ready'], [.43, 'Load'], [.74, 'Flight'], [1.08, 'Land softly'], [1.69, 'Stand'], [2.4, 'Reset']];
  for (const [id, mode] of [
    ['Bench_Jump', 'bench'], ['Front_Box_Jump', 'box'], ['Single-Leg_Lateral_Hop', 'side'],
  ]) {
    const box = mode === 'box';
    const sideHop = mode === 'side';
    const height = box ? .30 : 0;
    const overBench = mode === 'bench';
    const equipment = sideHop ? '' : box ? 'step-platform-bodyweight' : 'bench';
    const phases = sideHop ? [[0, 'Balance'], [.43, 'Load'], [.74, 'Hop across'],
      [1.08, 'Land'], [1.58, 'Hop back'], [1.92, 'Land'], [2.4, 'Reset']] : jumping;
    const options = { ...upright, equipment, oneShot: !sideHop,
      ...(box ? { platformTransform: { position: [0, 0, .48] } } :
        sideHop ? {} : { benchTransform: { position: [0, 0, .72], yaw: Math.PI / 2 } }) };
    add(id, phases, [[0, 'Set your feet and look ahead', sideHop ? 'Balance on the left foot.' : 'Stand facing the landing surface.'],
      [.43, 'Load and drive', 'Bend at the hips and knees, then use an arm swing.'],
      [1.08, 'Absorb the landing', sideHop ? 'Land on the same foot with the knee soft.' : overBench ? 'Clear the bench and land beyond it.' : 'Land with both feet fully supported.']], (t) => {
      const times = sideHop ? [0, .43, .58, .75, 1.08, 1.42, 1.58, 1.92, 2.4]
        : [0, .43, .58, .75, 1.08, 1.69, 2.4];
      const a = motion(times, sideHop ? [0, 0, .06, .51, 1, .92, .53, 0, 0] : [0, 0, .06, .51, 1, 1, 1], t);
      const y = motion(times, sideHop ? [0, 0, .075, .21, 0, .06, .22, 0, 0]
        : [0, 0, .075, height + (overBench ? .62 : .24), height, height, height], t);
      const crouch = motion(times, sideHop ? [0, .19, .01, .095, .21, .02, .10, .18, 0] : [0, .20, .01, .095, .21, 0, 0], t);
      const swing = motion(times, sideHop ? [0, -.5, .15, .76, -.44, .10, .75, -.29, 0] : [0, -.5, .15, 1.15, .67, 0, 0], t);
      torso(v(sideHop ? .42 * a : 0, .851 + y - crouch, sideHop ? 0 : (overBench ? 1.16 : .89) * a), pitch(.04 + .76 * crouch));
      for (const [side, s] of sides) {
        leg(side, v(.15 * s + (sideHop ? .42 * a : 0), .074 + y + (sideHop && s < 0 ? .18 : 0),
          sideHop ? (s < 0 ? -.19 : 0) : (overBench ? 1.16 : .89) * a));
        const wrist = point('Arm' + side).add(v(s * .10, -.48 * Math.cos(swing), .44 * Math.sin(swing)));
        reach(side, wrist, v(s * .2, -Math.cos(swing), Math.sin(swing)));
      }
    }, { ...options, duration: 2.4 });
  }

  for (const [id, working] of [['Gironda_Sternum_Chins', 'sternum'], ['Side_To_Side_Chins', 'LR']]) {
    const sternum = working === 'sternum';
    const phases = sternum ? up : alternating;
    add(id, phases, exerciseCues(phases, ['Take a secure grip on the shaft',
      sternum ? 'Use an overhand grip and lift your chest.' : 'Set both hands wider than your shoulders.'],
    [sternum ? 'Lean back and pull your sternum toward the bar' : 'Pull toward each hand in turn',
      'Lift without kicking and lower all the way between efforts.']), (t) => {
      const a = sternum ? rep(up, t) : motion([0, .85, 1.62, 2.45, 3.35], [0, 1, 0, -1, 0], t);
      const b = Math.abs(a);
      torso(v(sternum ? 0 : .27 * a, 1.245 + .405 * b, .057 + (sternum ? .24 : .08) * b), pitch(-.08 - (sternum ? .62 : .13) * b));
      for (const [side, s] of sides) {
        leg(side, v(s * .113, .395 + .45 * b, -.11 - .06 * b), pitch(.19));
      }
      for (const [side, s] of sides) {
        const { hand, offset } = grip(side, v(-1, 0, 0), v(0, 1, -.10));
        arm(side, v(s * (sternum ? .27 : .38), 2.30, 0).sub(offset), handPole(s), hand);
      }
    }, { ...upright, equipment: 'pull-up-bar', fingers: 'LR' });
  }
  add("Moving_Claw_Series", alternating, [[0, "Start in a tall running stance", "Bring the working heel quickly toward your glutes."],
    [.85, "Recover the leg and drive the foot down", "Strike underneath the hips and switch sides."]], (t) => {
    const cycle = 2 * Math.PI * t / 1.8;
    torso(v(0, .85 + .043 * (1 - Math.cos(2 * cycle)), .43 * t), pitch(.14));
    for (const [side, s] of sides) {
      const step = s * Math.sin(cycle);
      const lift = Math.max(0, s * Math.cos(cycle));
      leg(side, v(s * .109, .074 + .34 * lift, .43 * t + .33 * step), pitch(.42 * lift));
      const shoulder = point("Arm" + side);
      reach(side, shoulder.clone().add(v(s * .065, -.36 + .11 * step, -.29 * step)), v(0, -.6, -step));
    }
  }, { ...upright, oneShot: true });
  return entries;
}
