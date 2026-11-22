import { createAuthor, lerp, motion, pitch, q, rep, roll, sides, smoothstep, up, v, X, Y, Z, yaw } from './barbell-standing-more.mjs';
import { openHand, palmHeight } from './hand-frame.mjs';
export { createMobilityBallFixture } from './mobility-ball-fixtures.mjs';

export const groupLabel = 'Foam rolling, mobility and medicine ball';

const metadata = {
  Adductor: ['Adductor', ['Adductors'], []],
  'Brachialis-SMR': ['Brachialis-SMR', ['Biceps'], []],
  'Calves-SMR': ['Calves-SMR', ['Calves'], []],
  'Hamstring-SMR': ['Hamstring-SMR', ['Hamstrings'], []],
  'Iliotibial_Tract-SMR': ['Iliotibial Tract-SMR', ['Glutes'], []],
  'Latissimus_Dorsi-SMR': ['Latissimus Dorsi-SMR', ['Upper back'], []],
  'Lower_Back-SMR': ['Lower Back-SMR', ['Upper back'], []],
  'Peroneals-SMR': ['Peroneals-SMR', ['Calves'], []],
  'Piriformis-SMR': ['Piriformis-SMR', ['Glutes'], []],
  'Quadriceps-SMR': ['Quadriceps-SMR', ['Quadriceps'], []],
  'Rhomboids-SMR': ['Rhomboids-SMR', ['Upper back'], []],
  Adductor_Groin: ['Adductor/Groin', ['Adductors'], []],
  Calf_Stretch_Elbows_Against_Wall: ['Calf Stretch Elbows Against Wall', ['Calves'], []],
  Calf_Stretch_Hands_Against_Wall: ['Calf Stretch Hands Against Wall', ['Calves'], []],
  One_Arm_Against_Wall: ['One Arm Against Wall', ['Upper back'], []],
  Peroneals_Stretch: ['Peroneals Stretch', ['Calves'], []],
  Posterior_Tibialis_Stretch: ['Posterior Tibialis Stretch', ['Calves'], []],
  Backward_Medicine_Ball_Throw: ['Backward Medicine Ball Throw', ['Shoulders'], []],
  Catch_and_Overhead_Throw: ['Catch and Overhead Throw', ['Upper back'], ['Core', 'Chest', 'Shoulders']],
  Chest_Push_from_3_point_stance: ['Chest Push from 3 point stance', ['Chest'], ['Core', 'Shoulders', 'Triceps']],
  Chest_Push_multiple_response: ['Chest Push (multiple response)', ['Chest'], ['Core', 'Shoulders', 'Triceps']],
  Chest_Push_single_response: ['Chest Push (single response)', ['Chest'], ['Core', 'Shoulders', 'Triceps']],
  Chest_Push_with_Run_Release: ['Chest Push with Run Release', ['Chest'], ['Core', 'Shoulders', 'Triceps']],
  Medicine_Ball_Chest_Pass: ['Medicine Ball Chest Pass', ['Chest'], ['Shoulders', 'Triceps']],
  Medicine_Ball_Full_Twist: ['Medicine Ball Full Twist', ['Core'], ['Shoulders']],
  Medicine_Ball_Scoop_Throw: ['Medicine Ball Scoop Throw', ['Shoulders'], ['Core', 'Hamstrings', 'Quadriceps']],
  'One-Arm_Medicine_Ball_Slam': ['One-Arm Medicine Ball Slam', ['Core'], ['Upper back', 'Shoulders']],
  Overhead_Slam: ['Overhead Slam', ['Upper back'], []],
  Return_Push_from_Stance: ['Return Push from Stance', ['Shoulders'], ['Chest', 'Triceps']],
  'Standing_Two-Arm_Overhead_Throw': ['Standing Two-Arm Overhead Throw', ['Shoulders'], ['Chest', 'Upper back']],
  Supine_Chest_Throw: ['Supine Chest Throw', ['Triceps'], ['Chest', 'Shoulders']],
  'Supine_One-Arm_Overhead_Throw': ['Supine One-Arm Overhead Throw', ['Core'], ['Chest', 'Upper back', 'Shoulders']],
  'Supine_Two-Arm_Overhead_Throw': ['Supine Two-Arm Overhead Throw', ['Core'], ['Chest', 'Upper back', 'Shoulders']],
};

const flat = Math.PI / 2;
const floor = .074;
const rollerRadius = .062;
const ballRadius = .105;
const roller = { kind: 'roller', radius: rollerRadius };
const ball = { kind: 'ball', radius: ballRadius };
const feetForward = v(0, .85, .5);
const elbowOut = (s) => v(s, -.52, -.28);
const hold = [[0, 'Set up'], [.35, 'Ease in'], [1.45, 'Hold'], [4.1, 'Release'], [5, 'Reset']];
const scan = [[0, 'Set pressure'], [.25, 'Roll slowly'], [1.85, 'Pause'], [2.6, 'Roll back'], [4.2, 'Reset']];
const axial = (angle) => q().setFromAxisAngle(Y, angle);
const tracks = (keys, t) => motion(keys.map(([at]) => at), keys.map(([, value]) => value), t);

function position(keys, t) {
  let i = 1;
  while (i < keys.length - 1 && t > keys[i][0]) i++;
  const [start, from] = keys[i - 1];
  const [end, to] = keys[i];
  const p = Math.max(0, Math.min(1, (t - start) / (end - start)));
  return v(...from).lerp(v(...to), p * p * (3 - 2 * p));
}

function flight(start, end, duration, elapsed, gravity = 9.81) {
  const t = Math.max(0, Math.min(duration, elapsed));
  const center = start.clone().lerp(end, t / duration);
  center.y += .5 * gravity * t * (duration - t);
  return center;
}

function toss(start, velocity, t, rebound = 0) {
  const g = 9.81;
  const hit = (velocity.y + Math.sqrt(velocity.y ** 2 + 2 * g * (start.y - ballRadius))) / g;
  const travel = Math.min(t, hit);
  const point = start.clone().addScaledVector(velocity, travel);
  point.y -= .5 * g * travel ** 2;
  if (t > hit) {
    const after = t - hit;
    const bounce = Math.min(after, 2 * rebound / g);
    point.x += velocity.x * .16 * (1 - Math.exp(-4 * after));
    point.z += velocity.z * .16 * (1 - Math.exp(-4 * after));
    point.y = ballRadius + rebound * bounce - .5 * g * bounce ** 2;
  }
  return point;
}

export function createEntries(asset, helpers) {
  const { add, entries, bone, torso, world, point, arm, leg, free, stance, armLength } =
    createAuthor(asset, helpers, metadata);

  function exercise(id, phases, cues, pose, fixture, options = {}) {
    add(id, phases, cues.map(([step, ...cue]) => [phases[step][0], ...cue]), pose, {
      equipment: '', fingers: '', framing: 'floor', duration: phases.at(-1)[0],
      ...(fixture && { mobilityBallFixture: fixture }), ...options,
    });
  }

  function palm(side, s, x, z, direction = Z) {
    arm(side, v(x, palmHeight, z), v(s * .65, .2, -.65), openHand(s, direction, Y));
  }

  function resting(side, s) {
    const shoulder = point('Arm' + side);
    free(side, shoulder.add(v(s * .13, -.47, .06)), v(s * .24, -.96, .13));
  }

  function crossed(side, s, tilt) {
    const close = point('Arm' + side).lerp(point('Arm' + (s > 0 ? 'R' : 'L')), .73);
    free(side, close.add(v(0, .015 + .045 * s, .125).applyQuaternion(tilt)),
      v(-s, .46, .11).applyQuaternion(tilt), elbowOut(s).applyQuaternion(tilt));
  }

  function planted(side, s, z, x = s * .15) {
    leg(side, v(x, floor, z), yaw(s * .10), Z);
  }

  function rollerAt(center, along, stroke = 0) {
    const axis = v(along.z, 0, -along.x).normalize();
    return [v(center.x, rollerRadius, center.z),
      q().setFromUnitVectors(Y, axis).multiply(axial(stroke / rollerRadius))];
  }

  function rollerUnder(start, end, fraction, stroke, offset = v(0, 0, 0)) {
    const proximal = point(start);
    const distal = point(end);
    return rollerAt(proximal.clone().lerp(distal, fraction).add(offset), distal.sub(proximal), stroke);
  }

  exercise('Adductor', scan, [
    [0, 'Open one knee out to the side', 'Lie face down and place the roll under the inside of your thigh.'],
    [2, 'Move between the hip and knee', 'Support yourself with your arms and pause on the muscle. Switch sides.'],
  ], (t) => {
    const a = rep(scan, t);
    torso(v(-.10 + .085 * a, .229, -.29 - .050 * a), pitch(1.46));
    leg('L', v(.60, .171, -.50 - .035 * a), pitch(.64).multiply(yaw(-.48)), v(.93, .03, .48));
    leg('R', v(-.22, .171, -1.087), pitch(.93), v(-.91, -.18, .21));
    for (const [side, s] of sides) palm(side, s, s * .25, .408);
    return rollerUnder('ThighL', 'ShinL', lerp(.31, .77, a), .095 * a);
  }, roller);

  exercise('Quadriceps-SMR', scan, [
    [0, 'Set one thigh on the roll', 'Lie face down, brace on your arms and keep the working foot off the floor.'],
    [2, 'Roll the front of your thigh', 'Move from just above the knee to below the hip. Switch sides.'],
  ], (t) => {
    const a = rep(scan, t);
    torso(v(.07, .262 - .032 * a, -.25 + .16 * a), pitch(1.37 + .13 * a));
    const upper = v(.137, -.149 - .014 * a, -.98).setLength(.4467);
    const ankle = point('ThighL').add(upper).add(v(-.08, .16, -.98).setLength(.377));
    leg('L', ankle, pitch(.79), upper);
    leg('R', v(-.38, .179, -.738), pitch(1.04), v(-.91, -.22, -.1));
    for (const [side, s] of sides) palm(side, s, s * .263, .415);
    return rollerUnder('ThighL', 'ShinL', lerp(.23, .78, a), .09 * a);
  }, roller);

  for (const [id, calf] of [['Calves-SMR', true], ['Hamstring-SMR', false]]) {
    exercise(id, scan, [
      [0, calf ? 'Set the roller under one calf' : 'Set the roller beneath one upper leg',
        'Set your palms behind you and bend the other knee for support.'],
      [2, calf ? 'Roll between the knee and ankle' : 'Roll between the hip and back of the knee',
        'Press through your palms to keep pressure on the muscle. Switch sides.'],
    ], (t) => {
      const a = rep(scan, t);
      const slide = -.17 * a;
      torso(v(.025 + .047 * a, calf ? .226 + .039 * a : .182 + .010 * a, -.34 + slide), pitch(-.34 + .24 * a));
      leg('L', v(.16, calf ? .137 : .098, .44 + slide), pitch(calf ? -.41 : -.54), feetForward);
      planted('R', -1, .125, -.26);
      for (const [side, s] of sides) palm(side, s, s * .30, -.49, v(s * .25, 0, -.96));
      return rollerUnder(calf ? 'ShinL' : 'ThighL', calf ? 'FootL' : 'ShinL', lerp(.22, .78, a), .06 * a);
    }, roller);
  }

  for (const [id, lowerLeg] of [['Iliotibial_Tract-SMR', false], ['Peroneals-SMR', true]]) {
    exercise(id, scan, [
      [0, lowerLeg ? 'Support the outside of the lower leg' : 'Support the outside of your bottom thigh',
        'Lie on one side and stabilize yourself with the upper foot in front.'],
      [2, lowerLeg ? 'Roll the side of the calf' : 'Roll along the outside of the thigh',
        'Use your lower forearm for control. Stay clear of the knee and switch sides.'],
    ], (t) => {
      const a = rep(scan, t);
      const x = .14 + .14 * a;
      const tilt = roll(lowerLeg ? -1.32 : -1.24);
      torso(v(x, lowerLeg ? .204 + .032 * a : .261 - .024 * a, -.01), tilt);
      leg('L', v(x - .70, lowerLeg ? .143 : .199, -.045), roll(-1.38), v(0, .78, .62));
      planted('R', -1, .286, x - .41);
      const elbow = v(.47, .049, -.045);
      const shoulder = point('ArmL');
      const bent = elbow.clone().sub(shoulder).normalize();
      arm('L', elbow.clone().add(v(.017, .026, .233)), bent, openHand(1, Z, Y));
      palm('R', -1, .44, .29);
      return rollerUnder(lowerLeg ? 'ShinL' : 'ThighL', lowerLeg ? 'FootL' : 'ShinL',
        lerp(.24, .78, a), -.08 * a);
    }, roller);
  }

  for (const [id, lat] of [['Brachialis-SMR', false], ['Latissimus_Dorsi-SMR', true]]) {
    exercise(id, hold, [
      [0, lat ? 'Set the roll just behind the armpit' : 'Rest the outside of your upper arm on the roll',
        'Lie on your side with the working arm extended in line with your body.'],
      [2, lat ? 'Shift your weight toward your lat' : 'Lift your hips and settle onto the upper arm',
        'Breathe in the hold and ease off before switching sides.'],
    ], (t) => {
      const a = rep(hold, t);
      const tilt = roll(lerp(lat ? -1.24 : -1.31, lat ? -1.35 : -1.43, a));
      torso(v(-.23 + (lat ? .054 : 0) * a, (lat ? .192 : .194) + (lat ? .036 : .065) * a, -.01), tilt);
      leg('L', v(-1.01, .113, -.063), roll(-1.11), v(0, .54, .82));
      leg('R', lat ? v(-.87, .14, .06) : v(-.938, .102, .15), roll(-1.1), v(0, .73, .62));
      const shoulder = point('ArmL');
      arm('L', shoulder.clone().add(v(.45, lat ? .066 : .065, lat ? -.145 : .040)), v(.06, .40, .90),
        openHand(1, v(1, .19, -.15), v(0, .35, -1)));
      palm('R', -1, .21, .33);
      if (!lat) return rollerUnder('ArmL', 'ForearmL', .51, .022 * a);
      return rollerUnder('Chest', 'ArmL', .52, .023 * a, v(-.055, 0, -.084));
    }, roller);
  }

  for (const [id, upper] of [['Lower_Back-SMR', false], ['Rhomboids-SMR', true]]) {
    exercise(id, scan, [
      [0, upper ? 'Set the roller beneath the shoulder blades' : 'Set the roller beneath the low back',
        'Cross your arms and let your shoulder blades spread. Plant both feet.'],
      [2, upper ? 'Shift onto one shoulder blade' : 'Shift a little to one side of the spine',
        'Lift your hips and make a short controlled pass. Ease off any bony spot.'],
    ], (t) => {
      const a = rep(scan, t);
      const tilt = pitch(upper ? -1.51 - .025 * a : -1.44 - .045 * a).multiply(roll(.20 * a));
      torso(v(.072 * a, (upper ? .178 : .149) + (upper ? .017 : .023) * a, .18 + .092 * a), tilt, pitch(upper ? -1.42 : -1.28));
      for (const [side, s] of sides) {
        planted(side, s, .73, s * .205);
        crossed(side, s, tilt);
      }
      return rollerUnder(upper ? 'Chest' : 'Pelvis', upper ? 'Head' : 'Chest',
        upper ? lerp(.14, .49, a) : lerp(.35, .61, a), .07 * a, v(.048 * a, 0, .022));
    }, roller);
  }

  exercise('Piriformis-SMR', hold, [
    [0, 'Cross one ankle over the other knee', 'Sit on the roll with one palm behind you for balance.'],
    [2, 'Lean toward the crossed leg', 'Shift pressure onto the upper glute and keep the working leg relaxed. Switch sides.'],
  ], (t) => {
    const a = rep(hold, t);
    torso(v(.12 * a, .226, -.18 + .052 * a), roll(-.23 * a).multiply(pitch(-.16)));
    planted('R', -1, .44, -.20);
    const knee = point('ShinR');
    leg('L', knee.clone().add(v(.037, .081, .027)), yaw(-1.28).multiply(roll(1.02)), v(.96, .04, .12));
    const target = point('ShinL').add(v(-.014, .081, -.069));
    free('L', target, v(.10, -.58, .81), v(1, .12, -.16));
    palm('R', -1, -.28, -.40, v(-.20, 0, -.98));
    return rollerAt(v(.051 * a, 0, -.225 + .083 * a), v(.23 * a, 0, 1), .083 * a);
  }, roller);

  const partnerStretch = [[0, 'Partner supports ankles'], [.65, 'Press inward and hold'], [2.4, 'Relax and widen'],
    [3.55, 'Hold stretch'], [5.45, 'Return to setup']];
  exercise('Adductor_Groin', partnerStretch, [
    [0, 'Lie back and raise both legs', 'Have a partner support your ankles as you open the legs.'],
    [1, 'Squeeze gently against their hands', 'Keep the legs still during the contraction. Hold for about 10 seconds.'],
    [2, 'Relax and let the partner widen the stretch', 'Tell them when you feel a comfortable stretch in the inner thighs.'],
  ], (t) => {
    const widen = tracks([[0, 0], [2.4, 0], [3.55, 1], [4.75, 1], [5.45, 0]], t);
    const effort = tracks([[0, 0], [.65, 1], [2.32, 1], [2.4, 0]], t);
    torso(v(0, .109, -.03), pitch(-flat), pitch(-1.65));
    for (const [side, s] of sides) {
      const angle = .39 + .40 * widen;
      leg(side, v(s * (.105 + .79 * Math.sin(angle)), .117 + .79 * Math.cos(angle), .031 - .018 * effort),
        roll(-s * angle).multiply(pitch(-1.95 + .13 * effort)), v(s * .25, .10, .97));
      palm(side, s, s * .316, -.247);
    }
  });

  for (const [id, elbows] of [['Calf_Stretch_Elbows_Against_Wall', true], ['Calf_Stretch_Hands_Against_Wall', false]]) {
    const face = elbows ? .496 : .725;
    exercise(id, hold, [
      [0, elbows ? 'Set both forearms on the wall' : 'Stagger your feet and place both hands on the wall',
        elbows ? 'Stand with the feet parallel, about two feet from the wall.' : 'Keep the rear leg long and the rear foot pointing forward.'],
      [2, elbows ? 'Lean forward without lifting either heel' : 'Reach your rear heel into the floor',
        'Breathe and hold the stretch for 10–20 seconds.'],
    ], (t) => {
      const a = rep(hold, t);
      torso(v(elbows ? 0 : .025, (elbows ? .811 : .794) - .039 * a,
        (elbows ? .04 : .054) + .071 * a), pitch((elbows ? .36 : .26) + .115 * a), pitch(.08));
      for (const [side, s] of sides) {
        planted(side, s, elbows ? -.23 : s > 0 ? .26 : -.30);
        const wallHand = openHand(s, Y, v(0, 0, -1));
        if (elbows) {
          const shoulder = point('Arm' + side);
          const reach = v(s * .038, 0, face - .035 - shoulder.z);
          reach.y = -Math.sqrt(.279 ** 2 - reach.lengthSq());
          const wrist = shoulder.clone().add(reach).add(v(-s * .035, .239, -.017));
          arm(side, wrist, reach, wallHand);
        } else {
          arm(side, v(s * .232, 1.28, face - .062), v(s * .38, -.52, -.15), wallHand);
        }
      }
    }, { kind: 'wall', position: [-.08, .81, face + .027], size: [.70, 1.62, .054] }, { framing: 'standing' });
  }

  exercise('One_Arm_Against_Wall', hold, [
    [0, 'Set one bent arm against a doorway', 'Rest the forearm above shoulder height and keep the opposite arm relaxed.'],
    [2, 'Lean toward the supported arm', 'Let your side lengthen until you feel a gentle stretch below the armpit. Switch sides.'],
  ], (t) => {
    const a = rep(hold, t);
    torso(v(.062 * a, .837 - .032 * a, .022), roll(-.08 - .30 * a), pitch(.05));
    stance(.18);
    arm('L', v(.552, 1.679, .073), v(.96, -.26, .04), openHand(1, Y, v(-1, 0, 0)));
    resting('R', -1);
  }, { kind: 'wall', position: [.628, .947, .073], size: [.065, 1.894, .22] }, { framing: 'standing' });

  for (const [id, direction] of [['Peroneals_Stretch', -1], ['Posterior_Tibialis_Stretch', 1]]) {
    exercise(id, hold, [
      [0, 'Loop a strap around the ball of one foot', 'Sit tall and keep the working leg extended with the heel lifted.'],
      [2, direction < 0 ? 'Tilt the sole inward' : 'Tilt the sole outward',
        'Draw the strap gently with your hands and hold for 10–20 seconds. Switch sides.'],
    ], (t) => {
      const a = rep(hold, t);
      torso(v(0, .122, -.295), pitch(.16 + .06 * a));
      leg('L', v(.19, .194 + .012 * a, .50), roll(direction * .51 * a).multiply(pitch(-.25 - .19 * a)), feetForward);
      planted('R', -1, .289, -.27);
      for (const [side, s] of sides) {
        const wrist = v(.16 + s * .139 + direction * .135 * a, .389 + .062 * a, .096 - .058 * a);
        free(side, wrist, v(.013, -.36, .93), elbowOut(s));
      }
    }, { kind: 'strap', side: 'L' }, { fingers: 'LR' });
  }

  function holdBall(center, direction, hands = 'LR', spread = 1, hang = v(0, 0, 0), frame = q(), guide,
    elbow = elbowOut) {
    const seats = sides.filter(([side]) => hands.includes(side)).map(([side, s]) => {
      const shoulder = point('Arm' + side);
      const outward = v(s * spread, hang.y, hang.z).normalize().applyQuaternion(frame);
      // For swings without a fixed finger direction, use the tangent closest to the arm's reach.
      const approach = direction ?? center.clone().sub(shoulder).normalize();
      const tangent = approach.clone().addScaledVector(outward, -approach.dot(outward)).normalize();
      const offset = outward.clone().multiplyScalar(ballRadius + .022).addScaledVector(tangent, -.086);
      return { side, s, offset, tangent, outward, shoulder };
    });
    const fitted = center.clone();
    for (let pass = 0; pass < 4; pass++) {
      for (const { shoulder, offset } of seats) {
        const wrist = fitted.clone().add(offset).sub(shoulder);
        if (wrist.length() > armLength - .004) fitted.copy(shoulder).sub(offset).add(wrist.setLength(armLength - .004));
      }
    }
    for (const { side, s, offset, tangent, outward } of seats) {
      arm(side, fitted.clone().add(offset), elbow(s).applyQuaternion(frame), openHand(s, tangent, outward), Boolean(guide), guide);
    }
    return fitted;
  }

  function easeGrip(side, wrist, hand, amount, pole = elbowOut(side === 'L' ? 1 : -1), guide) {
    const target = point('Hand' + side).lerp(wrist, amount);
    const start = bone('Hand' + side).getWorldQuaternion(q());
    arm(side, target, pole, start.slerp(hand, amount), Boolean(guide), guide);
  }

  function follow(center, direction, distance, hands, amount, guide) {
    for (const [side, s] of sides) {
      if (hands.includes(side)) {
        easeGrip(side, center.clone().addScaledVector(direction, distance).add(v(s * .174, 0, 0)),
          openHand(s, direction, v(s, 0, 0)), amount, elbowOut(s).lerp(v(s, -.46, -.48), amount), guide);
      }
    }
  }

  const frontWall = (z, width = .9) =>
    ({ position: [0, .9, z + .026], size: [width, 1.8, .052] });
  const wallBall = (z) => ({ ...ball, wall: frontWall(z) });
  const standing = { framing: 'standing' };
  const standingThrow = { ...standing, oneShot: true };
  const returnArc = (from, target, t, total, impact, wallZ, impactY) => {
    const away = v(lerp(from.x, target.x, impact / total), impactY, wallZ - ballRadius);
    return t <= impact ? flight(from, away, impact, t) : flight(away, target, total - impact, t - impact);
  };

  for (const [id, scoop] of [['Backward_Medicine_Ball_Throw', false], ['Medicine_Ball_Scoop_Throw', true]]) {
    const phases = [[0, 'Set stance'], [.36, 'Load the legs'], [.83, 'Drive and swing'], [1.21, 'Release behind'],
      [1.61, 'Land and balance'], [2.56, 'Ball lands']];
    exercise(id, phases, [
      [0, 'Hold the ball low between your legs', 'Set your feet apart and keep the area behind you clear.'],
      [2, scoop ? 'Jump as you scoop overhead' : 'Drive through your feet and stand tall',
        scoop ? 'Swing with long arms and let the ball go as you peak.' : 'Swing the ball up and release it over your head to your partner.'],
      [4, 'Stabilize before retrieving the ball', scoop ? 'Land softly through both feet.' : 'Let your arms finish the swing, then regain balance.'],
    ], (t) => {
      const release = phases[3][0];
      function wind(at) {
        const load = tracks([[0, .42], [.83, 1], [release, 0], [1.61, .23], [1.89, 0]], at);
        const lift = scoop ? tracks([[0, 0], [.93, 0], [release, .17], [1.56, 0]], at) : 0;
        torso(v(0, .866 - (scoop ? .16 : .27) * load + lift, -.11 * load), pitch(.52 * load - .13 * (1 - load)));
        stance(scoop ? .198 : .229, -.026 * load, .175, lift);
        const a = tracks([[0, .04], [.83, 0], [.98, .46], [release, 1], [1.49, 1.19], [2.05, .13]], at);
        const theta = -1.26 + 2.93 * a;
        return v(0, point('ArmL').y + .59 * Math.sin(theta), .52 * Math.cos(theta) + .19 * (1 - Math.min(1, a)));
      }
      const gripAt = (center) => holdBall(center, undefined, 'LR', 1, v(0, -.18, 0), q(), X);
      const initial = t > release ? gripAt(wind(release)) : null;
      const center = wind(t);
      if (!initial) return [gripAt(center)];
      gripAt(center);
      for (const [side, s] of sides) {
        const wrist = center.clone().add(v(s * .21, -.01, .02));
        const along = wrist.clone().sub(point('Arm' + side));
        easeGrip(side, wrist, openHand(s, along, v(s, 0, 0)), smoothstep(t, release, release + .19), elbowOut(s), X);
      }
      return [toss(initial, v(0, scoop ? 1.63 : 1.25, scoop ? -2.96 : -2.45), t - release, .46), pitch(-5.6 * (t - release))];
    }, ball, standingThrow);
  }

  for (const [id, caught] of [['Catch_and_Overhead_Throw', true], ['Standing_Two-Arm_Overhead_Throw', false]]) {
    const phases = [[0, 'Ball behind head'], [.55, 'Drive forward'], [.90, 'Release'], [1.30, 'Follow through'],
      [1.70, 'Receive rebound'], [2.28, 'Reset']];
    const wall = caught ? 2.05 : 2.35;
    const release = phases[2][0];
    const receive = phases[4][0];
    exercise(id, phases, [
      [0, 'Load the ball behind your head', caught ? 'Face the wall and aim a little above your hands.' : 'Bend your knees slightly and reach both arms back.'],
      [2, 'Drive the ball forward overhead', 'Bring the hips and ribs forward as your arms accelerate.'],
      [4, 'Receive with both hands', 'Soften the elbows as the ball returns.'],
    ], (t) => {
      function body(at) {
        const hinge = tracks([[0, -.23], [.55, -.27], [release, .20], [1.25, .37], [receive, .045], [2.28, -.23]], at);
        torso(v(0, .826 - (caught ? .064 : .112) * Math.max(hinge, 0), .06 * hinge), pitch(hinge));
        if (caught) stance(.157);
        else {
          planted('L', 1, .193);
          planted('R', -1, -.168);
        }
        const center = position([[0, [0, 1.697, -.41]], [.55, [0, 1.765, -.35]], [.73, [0, 1.975, -.005]],
          [release, [0, 1.778, .421]], [1.28, [0, 1.385, .57]],
          [receive, [0, 1.395, .488]], [1.91, [0, 1.79, .30]], [2.09, [0, 1.92, -.06]],
          [2.28, [0, 1.697, -.41]]], at);
        const swing = tracks([[0, -1], [.55, -.83], [release, .80], [receive, .95], [1.97, .8], [2.28, -1]], at);
        return [center, v(0, lerp(.95, .49, smoothstep(Math.abs(swing), .55, .90)), swing)];
      }
      const grip = (center, direction) => holdBall(center, direction, 'LR', 1, v(), q(), X);
      let projectile;
      if (t > release && t < receive) {
        const start = grip(...body(release));
        const handoff = grip(...body(receive));
        projectile = returnArc(start, handoff, t - release, receive - release, caught ? .35 : .41, wall, caught ? 1.62 : 1.56);
      }
      const [center, direction] = body(t);
      const held = grip(center, direction);
      if (!projectile) return [held];
      follow(center, direction, 0, 'LR', smoothstep(t, release, release + .13) * (1 - smoothstep(t, receive - .13, receive)), X);
      return [projectile, pitch(2 * Math.PI * (t - release) / (receive - release))];
    }, wallBall(wall), standing);
  }

  for (const [id, run] of [['Chest_Push_from_3_point_stance', false], ['Chest_Push_with_Run_Release', true]]) {
    const phases = [[0, run ? 'Athletic stance' : 'Three-point stance'], [.49, 'Step and lift the ball'],
      [1.02, 'Second step and release'], [1.51, run ? 'Sprint after release' : 'Finish the second step'],
      [run ? 2.36 : 2.16, 'Ball lands']];
    const chestElbows = (s) => v(s * .56, -.88, -.80);
    const take = (center) => holdBall(center, undefined, 'LR', 1, v(0, -.26, 0), q(), undefined, chestElbows);
    exercise(id, phases, [
      [0, run ? 'Hold the ball low in an athletic stance' : 'Set one hand down with the ball in front',
        'Keep your back flat and start with your weight forward.'],
      [1, 'Bring the ball up on the first step', 'Gather it with both hands against your chest.'],
      [2, 'Push from the chest as the second foot lands', run ? 'Accelerate into a sprint after release.' : 'Extend both arms and let your momentum carry you forward.'],
    ], (t) => {
      const release = phases[2][0];
      function body(at) {
        const x = tracks([[0, -.035], [.5, .043], [release, -.018], [1.42, .049], [1.74, -.046], [2.36, .018]], at);
        const rise = tracks([[0, 0], [.19, 0], [release, 1]], at);
        const stride = tracks([[0, 0], [.49, .36], [release, .85], [1.51, run ? 1.49 : 1.12], [2.36, run ? 2.53 : 1.12]], at);
        const tilt = (run ? .45 : 1.24) * (1 - rise) + .25 * rise;
        torso(v(x, lerp(run ? .677 : .424, .844, rise) + (run && at > release ? .039 * Math.sin((at - release) * 14) ** 2 : 0),
          stride), pitch(tilt), pitch(.09));
        function step(keys, s) {
          const target = position(keys, at);
          const pole = !run && s < 0 ? v(-.88, .54, .2).lerp(Z, tracks([[0, 0], [.34, 1]], at)) : Z;
          leg(s > 0 ? 'L' : 'R', v(s * .128, floor + target.y, target.z), yaw(s * .08).multiply(pitch(.65 * target.y)), pole);
        }
        step([[0, [0, 0, .07]], [.49, [0, 0, .07]], [.72, [0, .14, .58]], [release, [0, 0, 1.03]],
          [1.45, [0, 0, 1.03]], [1.65, [0, run ? .18 : 0, run ? 1.70 : 1.03]], [1.92, [0, 0, run ? 2.15 : 1.03]],
          [2.14, [0, 0, run ? 2.15 : 1.03]], [2.26, [0, run ? .17 : 0, run ? 2.45 : 1.03]],
          [2.36, [0, 0, run ? 2.73 : 1.03]]], 1);
        step([[0, [0, 0, run ? -.37 : -.30]], [.25, [0, .16, .04]], [.49, [0, 0, .51]], [release, [0, 0, .51]],
          [1.25, [0, run ? .19 : .09, run ? .93 : .82]], [1.48, [0, 0, run ? 1.69 : 1.24]],
          [1.82, [0, run ? .23 : 0, run ? 2.14 : 1.24]], [2.05, [0, 0, run ? 2.48 : 1.24]]], -1);
        const shoulder = point('ArmL');
        return v(0, shoulder.y - .12, shoulder.z + tracks([[0, .28], [.49, .33], [.78, .29], [release, .47]], at));
      }
      const from = t > release ? take(body(release)) : null;
      const center = body(t);
      if (from) {
        take(center);
        const followThrough = smoothstep(t, release, release + .19);
        if (run) for (const [side, s] of sides) {
          const swing = s * Math.cos((t - release) * 10);
          const shoulder = point('Arm' + side);
          const wrist = shoulder.clone().add(v(s * .058, -.31 + .095 * swing, .32 * swing));
          const hand = openHand(s, v(s * .06, -.64 + .50 * swing, .64 + .52 * swing), v(s, 0, 0));
          easeGrip(side, wrist, hand, followThrough, chestElbows(s));
        } else follow(center, Z, -.043, 'LR', followThrough);
        return [toss(from, v(0, .62, run ? 2.98 : 2.36), t - release, .35), pitch(6 * (t - release))];
      }
      if (run) {
        const lift = tracks([[0, 0], [.49, 1]], t);
        return [take(center.clone().lerp(v(0, .47, .437), 1 - lift))];
      }
      const p = tracks([[0, 0], [.14, 0], [.49, 1]], t);
      const pickup = v(.09, ballRadius, .587).lerp(center, p);
      const grip = take(pickup);
      if (p < 1) {
        const grounded = 1 - smoothstep(t, .08, .49);
        easeGrip('R', v(-.234, palmHeight + .012, .484), openHand(-1, Z, Y), grounded, chestElbows(-1));
      }
      return [grip];
    }, ball, standingThrow);
  }

  for (const [id, multiple] of [['Chest_Push_single_response', false], ['Chest_Push_multiple_response', true]]) {
    const phases = [[0, 'Kneel with ball close'], [.40, 'Drive hips forward'], [.73, 'Release from chest'],
      [1.18, 'Land on both hands']];
    if (multiple) phases.push([1.65, 'Push back upright'], [2, 'Receive rebound'], [2.46, 'Drive again'],
      [2.79, 'Release again'], [3.24, 'Land on both hands'], [3.71, 'Push back upright'], [4.06, 'Receive rebound'],
      [4.12, 'Reset']);
    else phases.push([2.18, 'Finish supported']);
    const release = .73;
    const receive = 2.0;
    const wall = 2.22;
    exercise(id, phases, [
      [0, 'Kneel and hold the ball close to your sternum', 'Brace before driving forward.'],
      [2, 'Extend the hips and push the ball away', 'Release before you reach for the floor.'],
      [3, 'Catch yourself on both hands', multiple ? 'Push back upright to receive the return and repeat immediately.' : 'Bend the elbows to absorb the landing.'],
    ], (t) => {
      const at = multiple && t >= 2.06 ? t - 2.06 : t;
      function body(moment) {
        const drop = tracks([[0, 0], [.40, 0], [release, .24], [1.18, 1], [1.42, 1], [1.78, multiple ? 0 : 1]], moment);
        const lean = .02 + 1.26 * drop;
        const angle = lerp(.03, .93, drop);
        torso(v(0, .080 + .444 * Math.cos(angle), -.176 + .444 * Math.sin(angle)), pitch(lean), pitch(.75 * lean));
        for (const [side, s] of sides) leg(side, v(s * .119, .097, -.552), pitch(2.94), v(0, -.85, .53));
        const shoulder = point('ArmL');
        return v(0, shoulder.y - .106, shoulder.z + tracks([[0, .31], [.40, .31], [release, .49], [receive, .31]], moment));
      }
      const start = at > release ? holdBall(body(release), Z) : null;
      const end = at > release && multiple ? holdBall(body(receive), Z) : null;
      const center = body(at);
      const held = holdBall(center, Z);
      if (!start || (multiple && at >= receive)) return [held];
      const drop = tracks([[release, 0], [1.18, 1], [1.42, 1], [1.79, multiple ? 0 : 1]], at);
      for (const [side, s] of sides) {
        easeGrip(side, v(s * .251, palmHeight + .012, .820), openHand(s, Z, Y), drop);
      }
      const turn = pitch((at - release) * (multiple ? 2 * Math.PI / (receive - release) : 5));
      return [multiple ? returnArc(start, end, at - release, receive - release, .63, wall, .94)
        : toss(start, v(0, .41, 2.67), at - release, .38), turn];
    }, multiple ? wallBall(wall) : ball, { oneShot: !multiple });
  }

  for (const [id, reactive] of [['Medicine_Ball_Chest_Pass', false], ['Return_Push_from_Stance', true]]) {
    const phases = reactive
      ? [[0, 'Ball incoming'], [.49, 'Catch'], [.68, 'Compress'], [.91, 'Return pass'], [1.32, 'Follow through'], [2, 'Pass reaches partner']]
      : [[0, 'Ball at torso'], [.45, 'Load at chest'], [.74, 'Release'], [1.20, 'Ball hits wall'], [1.68, 'Catch rebound'], [2.18, 'Reset']];
    const release = reactive ? .91 : .74;
    const receive = 1.68;
    const wall = 2.55;
    exercise(id, phases, [
      [0, reactive ? 'Get ready to receive an incoming pass' : 'Face the target with the ball at your torso',
        reactive ? 'Start low and show both hands as you move up to meet the pass.' : 'Draw the ball in toward your sternum.'],
      [reactive ? 1 : 2, reactive ? 'Catch the ball with soft elbows' : 'Snap both arms forward',
        reactive ? 'Gather it close and push it back immediately.' : 'Finish with both hands pointed toward your target.'],
      [reactive ? 3 : 4, reactive ? 'Return the pass at chest height' : 'Receive the rebound at chest height',
        reactive ? 'Drive the ball straight out in front.' : 'Let the elbows bend to absorb the catch.'],
    ], (t) => {
      function body(at) {
        const load = reactive ? tracks([[0, 1], [.49, .32], [.68, .59], [release, .20], [2, .43]], at)
          : tracks([[0, .13], [.45, .42], [release, 0], [1.68, .21], [2.18, .13]], at);
        torso(v(reactive ? -.035 * load : 0, .86 - (reactive ? .21 : .085) * load, .035 + (reactive ? .025 : 0) * load),
          pitch(.035 + (reactive ? .28 : .14) * load));
        planted('L', 1, reactive ? .20 : .11);
        planted('R', -1, reactive ? -.29 : -.10);
        const z = reactive
          ? tracks([[0, .35], [.49, .51], [.68, .405], [release, .61], [1.35, .52], [2, .26]], at)
          : tracks([[0, .34], [.45, .336], [release, .55], [1.20, .44], [receive, .46], [2.18, .34]], at);
        return v(0, point('ArmL').y - .118, z);
      }
      let projectile;
      if (reactive && t < .49) {
        const catchAt = holdBall(body(.49), Z);
        projectile = flight(v(0, 1.43, 2.32), catchAt, .49, t);
      } else if (t > release && (reactive || t < receive)) {
        const start = holdBall(body(release), Z);
        projectile = reactive ? flight(start, v(0, 1.27, 2.52), .58, t - release)
          : returnArc(start, holdBall(body(receive), Z), t - release, receive - release, .46, wall, 1.29);
      }
      const center = body(t);
      const held = holdBall(center, Z);
      if (!projectile) return [held];
      const weight = t < .49 && reactive ? 1 - smoothstep(t, .34, .49) :
        smoothstep(t, release, release + .14) * (reactive ? 1 : 1 - smoothstep(t, receive - .14, receive));
      follow(center, Z, -.062, 'LR', weight);
      const spin = reactive ? (t < .49 ? (t - .49) * 5.4 : (t - release) * 5.4) :
        2 * Math.PI * (t - release) / (receive - release);
      return [projectile, pitch(spin)];
    }, reactive ? ball : wallBall(wall), { ...standing, oneShot: reactive });
  }

  const twistPhases = [[0, 'Ball in front'], [.30, 'Open right hip'], [1.14, 'Hand off behind'],
    [1.70, 'Turn through center'], [2.54, 'Receive on left'], [3.42, 'Finish centered']];
  exercise('Medicine_Ball_Full_Twist', twistPhases, [
    [0, 'Stand back to back with your partner', 'Leave enough space to pass the ball behind both hips.'],
    [2, 'Pivot the feet and turn the ribs', 'Hand the ball off behind you with both hands.'],
    [4, 'Turn the other way to receive it', 'Bring the ball back in front under control.'],
  ], (t) => {
    const handoff = 1.14;
    const receive = 2.54;
    const a = tracks([[0, 0], [.30, .03], [handoff, -1.93], [1.31, -1.86], [1.70, 0],
      [receive, 1.93], [2.75, 1.64], [3.42, 0]], t);
    const rotate = yaw(a);
    torso(v(.027 * Math.sin(a), .842, 0), yaw(.60 * a));
    world('Lumbar', yaw(.74 * a));
    world('Chest', rotate);
    world('Head', yaw(a * 1.03));
    for (const [side, s] of sides) leg(side, v(s * .20, floor + .027 * Math.abs(Math.sin(a)), .018 * s),
      yaw(.65 * a + .19 * s), v(0, .15, 1).applyQuaternion(yaw(.63 * a)));
    const center = v(0, 1.217, .442 + .025 * Math.abs(Math.sin(a))).applyQuaternion(rotate);
    const gripCenter = holdBall(center, Z.clone().applyQuaternion(rotate), 'LR', 1, v(0, -.24, 0), rotate);
    const outside = .535;
    if (t > handoff && t < receive) {
      const angle = lerp(-1.93, 1.93 - 2 * Math.PI, (t - handoff) / (receive - handoff));
      const reach = Math.sin(Math.PI * (t - handoff) / (receive - handoff));
      const letGo = smoothstep(t, handoff, handoff + .18) * (1 - smoothstep(t, receive - .18, receive));
      const endpoint = v(0, 1.217, .442 + .025 * Math.abs(Math.sin(1.93))).applyQuaternion(yaw(angle));
      endpoint.z -= outside * reach;
      endpoint.y -= .03 * reach;
      for (const [side, s] of sides) {
        const loose = point('Arm' + side).add(v(s * .10, -.35, .23).applyQuaternion(rotate));
        easeGrip(side, loose, openHand(s, v(0, -.73, .68).applyQuaternion(rotate), v(s, 0, 0).applyQuaternion(rotate)),
          letGo, elbowOut(s).applyQuaternion(rotate));
      }
      return [gripCenter.lerp(endpoint, letGo), rotate.clone().slerp(yaw(angle), letGo)];
    }
    return [gripCenter, rotate];
  }, ball, standing);

  for (const [id, single] of [['One-Arm_Medicine_Ball_Slam', true], ['Overhead_Slam', false]]) {
    const phases = [[0, 'Set stance'], [.36, 'Reach overhead'], [.98, 'Drive ball down'],
      [1.21, 'Release'], [1.62, 'Catch the bounce'], [2.3, 'Reset']];
    const release = phases[3][0];
    const receive = phases[4][0];
    const floorImpact = 82 / 60;
    const hands = single ? 'L' : 'LR';
    const slamElbow = (s) => v(s * .68, -.52, -.90);
    exercise(id, phases, [
      [0, single ? 'Hold the ball on the rear-leg side' : 'Stand with feet shoulder-width apart',
        single ? 'Set a staggered stance and hold the ball in one hand.' : 'Grip the ball with both hands.'],
      [2, 'Drive the ball hard into the floor', 'Reach tall first. Then fold at the hips as the arm or arms drive down.'],
      [4, 'Catch the ball as it bounces', 'Bend your knees and keep the catch in front of you.'],
    ], (t) => {
      function body(at) {
        const hinge = tracks([[0, .15], [.98, -.07], [release, .68], [1.35, .86], [receive, .56], [2.3, .15]], at);
        const lift = tracks([[0, 0], [.60, 0], [.98, .07], [release, 0]], at);
        const turn = yaw(single ? -.23 + .43 * hinge : 0).multiply(pitch(hinge));
        torso(v(single ? .054 : 0, .86 - .29 * Math.max(hinge, 0) + lift, -.091 * Math.max(hinge, 0)), turn, pitch(.6 * hinge));
        if (single) {
          leg('L', v(.174, floor + lift, -.259), pitch(.55 * lift).multiply(yaw(.16)), Z);
          planted('R', -1, .211);
          const reach = v(-.124, -.29, -.11 + .38 * hinge);
          free('R', point('ArmR').add(reach), v(-.14, .18, .94), v(-.7, -1, -.8));
        } else stance(.186, 0, .15, lift);
        const x = single ? .265 : 0;
        const center = position([[0, [1.55 * x, single ? 1.21 : 1.33, .35]],
          [.58, [1.2 * x, 1.72, .32]], [.91, [x, 1.985, -.066]], [1.10, [x, 1.702, .455]],
          [release, [x, 1.02, .672]], [1.34, [x, .43, .68]], [receive, [x, .68, .75]],
          [2.3, [1.55 * x, single ? 1.21 : 1.33, .35]]], at);
        const down = tracks([[0, 0], [.91, 0], [release, 1], [1.37, 1], [receive, .75], [2.3, 0]], at);
        return [center, undefined, hands, single ? .68 : 1,
          v(0, single ? -.42 : -.11, -.22 * down)];
      }
      let projectile;
      if (t > release && t < receive) {
        const start = holdBall(...body(release));
        const end = holdBall(...body(receive));
        const impact = v(end.x, ballRadius, lerp(start.z, end.z, .64));
        const dt = t - release;
        const fall = floorImpact - release;
        projectile = dt <= fall ? flight(start, impact, fall, dt) : flight(impact, end, receive - floorImpact, dt - fall);
      }
      const pose = body(t);
      const held = holdBall(...pose);
      if (!projectile) return [held];
      const followThrough = smoothstep(t, release, release + .11) *
        (1 - smoothstep(t, receive - .17, receive));
      for (const [side, sign] of sides) {
        if (!hands.includes(side)) continue;
        const wrist = point('Arm' + side).add(v(sign * .085, -.33, .30));
        easeGrip(side, wrist, openHand(sign, v(0, -.65, .76), v(sign, 0, 0)), followThrough, slamElbow(sign));
      }
      return [projectile, pitch(2 * Math.PI * (t - release) / (receive - release))];
    }, ball, standing);
  }

  const chestThrow = [[0, 'Ball at chest'], [.43, 'Brace'], [.73, 'Throw straight up'], [1.17, 'Ball peaks'],
    [1.61, 'Catch'], [2.21, 'Return to chest']];
  exercise('Supine_Chest_Throw', chestThrow, [
    [0, 'Lie back with the knees bent', 'Hold both hands under the ball over your chest.'],
    [2, 'Throw straight up', 'Extend both elbows quickly while keeping your upper back down.'],
    [4, 'Catch with both hands', 'Bend the elbows to bring the ball back toward your chest.'],
  ], (t) => {
    const release = chestThrow[2][0];
    const receive = chestThrow[4][0];
    const body = (at) => {
      torso(v(0, .111, .172), pitch(-1.51), pitch(-1.68));
      for (const [side, s] of sides) planted(side, s, .663, s * .176);
      return position([[0, [0, .391, -.282]], [.43, [0, .367, -.282]], [release, [0, .700, -.282]],
        [receive, [0, .641, -.282]], [2.21, [0, .391, -.282]]], at);
    };
    const cradleElbow = (s) => v(s * .36, -1, 0);
    const cradle = (center) => holdBall(center, Y, 'LR', 1, v(0, -.32, 0), q(), undefined, cradleElbow);
    if (t > release && t < receive) {
      const start = cradle(body(release));
      const end = cradle(body(receive));
      const center = body(t);
      cradle(center);
      const extension = smoothstep(t, release, release + .13) * (1 - smoothstep(t, receive - .13, receive));
      for (const [side, s] of sides) {
        const wrist = point('Hand' + side).add(v(s * .025, .042, .015));
        easeGrip(side, wrist, openHand(s, Y, v(s, 0, 0)), extension, cradleElbow(s));
      }
      return [flight(start, end, receive - release, t - release), roll(2 * Math.PI * (t - release) / (receive - release))];
    }
    return [cradle(body(t))];
  }, ball);

  for (const [id, single] of [['Supine_One-Arm_Overhead_Throw', true], ['Supine_Two-Arm_Overhead_Throw', false]]) {
    const phases = [[0, 'Ball behind head'], [.38, 'Start the swing'], [.91, 'Sit up and release'],
      [1.44, 'Finish the reach'], [2.33, 'Ball lands']];
    const release = phases[2][0];
    const hands = single ? 'L' : 'LR';
    exercise(id, phases, [
      [0, single ? 'Extend one arm behind your head' : 'Extend both arms behind your head',
        'Lie on your back with bent knees and both feet planted.'],
      [2, 'Swing the ball forward as you sit up', 'Release in front of you and let the reach finish the motion.'],
      [3, 'Stay balanced through the finish', single ? 'Keep the opposite arm free for balance. Switch sides.' : 'Keep both feet planted and finish with your chest tall.'],
    ], (t) => {
      function body(at) {
        const a = tracks([[0, 0], [.38, .09], [release, .76], [1.38, 1], [2.33, single ? .57 : .75]], at);
        const tilt = pitch(lerp(-1.53, -.15, a));
        torso(v(0, .112 + .029 * a, .172), tilt, pitch(lerp(-1.62, -.03, a)));
        if (single) world('Chest', tilt.clone().multiply(yaw(.19 * a)));
        for (const [side, s] of sides) planted(side, s, .696, s * .179);
        if (single) {
          const releaseSupport = smoothstep(a, .43, .85);
          const support = v(-.245, palmHeight + .15 * releaseSupport, lerp(-.036, .107, releaseSupport));
          const along = Z.clone().lerp(v(0, -.62, .78), releaseSupport);
          const elbow = v(-.65, .2, -.65).lerp(elbowOut(-1), releaseSupport);
          arm('R', support, elbow, openHand(-1, along, Y));
        }
        const x = single ? .22 : 0;
        const center = position([[0, [x, .189, -.852]], [.38, [x, .249, -.822]], [.62, [x, .796, -.550]], [.74, [x, .973, -.185]],
          [release, [x, .919, .420]], [1.44, [x, .667, .567]], [2.33, [x, .61, .38]]], at);
        const y = tracks([[0, .14], [.62, .83], [release, .48], [1.44, -.12]], at);
        const z = tracks([[0, -.98], [.62, .08], [release, .90]], at);
        return [center, v(0, y, z), hands, single ? .40 : 1, v(0, -.37, 0), q(), X];
      }
      const start = t > release ? holdBall(...body(release)) : null;
      const pose = body(t);
      const held = holdBall(...pose);
      if (!start) return [held];
      follow(pose[0], pose[1], -.06, hands, smoothstep(t, release, release + .16), X);
      return [toss(start, v(single ? .23 : 0, .85, single ? 2.49 : 2.95), t - release, .42),
        pitch((t - release) * 6.5)];
    }, ball, { oneShot: true });
  }
  return entries;
}
