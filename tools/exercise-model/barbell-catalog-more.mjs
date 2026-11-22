import { createAuthor, cues, down, lerp, motion, pitch, rep, sides, smoothstep, up, v, yaw } from './barbell-standing-more.mjs';
import { metadata } from './catalog-more.mjs';

export const groupLabel = 'Barbell lifts and support work';
const out = (s) => v(s, -.70, -.2);
const pullPole = (s) => v(s * .3, 0, -1);

export function createEntries(asset, helpers) {
  const { add, entries, torso, stance, leg, bar, backRack, crossedFrontRack, point, hangY, pelvis, grip, armLength } =
    createAuthor(asset, helpers, metadata);
  const feet = (width = .16, raise = 0) => stance(width, 0, .16, raise);
  const key = (times, values, t) => motion(times, values, t);
  const bench = { equipment: 'bench-barbell', framing: 'floor', benchTransform: { position: [0, 0, -.19] } };
  const supine = () => {
    torso(v(0, .55, .12), pitch(-Math.PI / 2), pitch(-1.47));
    for (const [side, s] of sides) leg(side, v(s * .23, .074, .49));
  };
  const lower = (start, end) => cues(down, start, end,
    ['Return to the start', 'Keep the same grip and control the weight.']);
  const lift = (start, end) => cues(up, start, end,
    ['Lower under control', 'Reverse the movement without bouncing.']);

  // Pull from the floor or hang, receive at the prescribed depth, then return the bar.
  const olympic = [
    ['Clean', 'clean', 'floor', 'squat'], ['Power_Clean', 'clean', 'floor', 'power'],
    ['Hang_Clean', 'clean', 'high', 'squat'], ['Hang_Clean_-_Below_the_Knees', 'clean', 'low', 'squat'],
    ['Split_Clean', 'clean', 'floor', 'split'], ['Clean_and_Press', 'press', 'floor', 'squat'],
    ['Clean_and_Jerk', 'jerk', 'floor', 'squat'], ['Snatch', 'snatch', 'floor', 'squat'],
    ['Power_Snatch', 'snatch', 'floor', 'power'], ['Muscle_Snatch', 'snatch', 'floor', 'tall'],
    ['Hang_Snatch', 'snatch', 'high', 'squat'], ['Hang_Snatch_-_Below_Knees', 'snatch', 'low', 'squat'],
    ['Split_Snatch', 'snatch', 'floor', 'split'],
  ];
  const catchHeight = { squat: .49, power: .70, split: .66, tall: .865 };
  const setHeight = { floor: .467, high: .819, low: .708 };
  const shaftHeight = { floor: .226, high: .755, low: .49 };
  for (const [id, finish, start, receive] of olympic) {
    const overhead = finish === 'snatch';
    const combo = finish === 'press' || finish === 'jerk';
    const jerk = finish === 'jerk';
    const width = overhead ? .445 : .23;
    const times = [0, .23, .68, .94, 1.23, 1.81, 2.06, 2.28, 2.60, 3.15, 3.40, 4.15, 4.5];
    const phases = [[0, start === 'floor' ? 'Set on the floor' : 'Set the hang'], [.23, 'Pull'], [.68, 'Extend'],
      [.94, receive === 'tall' ? 'Turn over' : 'Move under the bar'], [1.23, overhead ? 'Receive overhead' : 'Receive at shoulders'],
      [1.81, 'Stand'], ...(combo ? [[2.06, jerk ? 'Dip and drive' : 'Press'], [2.60, 'Stand at lockout']] : []),
      [3.40, 'Lower to the start']];
    add(id, phases, [[0, start === 'floor' ? 'Set the bar over midfoot' : 'Hinge into the hang',
      overhead ? 'Use a wide snatch grip.' : 'Grip just outside your legs and brace.'],
    [.68, 'Drive through your legs', 'Keep the bar close as your hips and knees extend.'],
    [1.23, receive === 'split' ? 'Land in a split stance' : receive === 'tall' ? 'Stay tall through turnover' : 'Receive with bent knees',
      overhead ? 'Fix the bar overhead with straight elbows.' : 'Turn your elbows through and support the bar at the shoulders.'],
    [3.40, 'Guide the bar back down', 'Bend your knees and hips as the bar returns.']], (t) => {
      const hip = key(times, [setHeight[start], setHeight[start], .873, .745, catchHeight[receive], .865,
        jerk ? .741 : .865, jerk ? .758 : .865, .865, .865, .865, setHeight[start], setHeight[start]], t);
      const lean = key(times, [start === 'floor' ? 1.04 : start === 'low' ? .68 : .28,
        start === 'floor' ? 1.04 : start === 'low' ? .68 : .28, .03, .05, .12, .02, .04, .02, .02, .02, .04,
        start === 'floor' ? 1.04 : start === 'low' ? .68 : .28, start === 'floor' ? 1.04 : start === 'low' ? .68 : .28], t);
      const split = receive === 'split' ? key(times, [0, 0, 0, .40, 1, 0, 0, 0, 0, 0, 0, 0, 0], t) : 0;
      torso(v(0, hip, -.32 * lean), pitch(lean), pitch(lean * .38));
      const shoulderY = point('ArmL').y;
      const rack = shoulderY + .07;
      const press = overhead ? 1 : combo ? key(times, [0, 0, 0, 0, 0, 0, 0, jerk ? 1 : .5, 1, 1, 0, 0, 0], t) : 0;
      const rackY = lerp(rack, shoulderY + (overhead ? .51 : .59), press);
      const rise = key(times, [0, 0, .46, .87, 1, 1, 1, 1, 1, 1, .96, 0, 0], t);
      const height = lerp(shaftHeight[start], rackY, rise);
      const z = lerp(start === 'floor' ? .225 : .115, lerp(.205, .025, press), rise) + .065 * Math.sin(Math.PI * rise);
      const direction = v(0, lerp(-1, .89, rise), .25);
      pelvis.position.y -= Math.max(0, hangY(z, width, direction) - height) * (1 - smoothstep(rise, 0, .45));
      for (const [side, s] of sides) leg(side, v(s * (.155 + .025 * split), .074 + (s < 0 ? .078 * split : 0),
        (s > 0 ? .39 : -.46) * split), s < 0 ? pitch(.62 * split) : yaw(.13));
      return bar(v(0, height, z), width, direction,
        (s) => v(s * .68, lerp(-.2, -.9, rise), lerp(-1, .2, rise)));
    }, { duration: 4.5 });
  }

  for (const [id, mode] of [
    ['Power_Jerk', 'power'], ['Split_Jerk', 'split'], ['Squat_Jerk', 'squat'],
    ['Jerk_Balance', 'balance'], ['Jerk_Dip_Squat', 'dip'],
    ['Heaving_Snatch_Balance', 'heave'], ['Snatch_Balance', 'snatch'],
    ['Push_Press_-_Behind_the_Neck', 'push'],
  ]) {
    const wide = ['heave', 'snatch'].includes(mode);
    const rear = wide || mode === 'push';
    const split = mode === 'split' || mode === 'balance';
    const depth = { squat: .47, power: .69, snatch: .48, heave: .60, split: .67, balance: .69, push: .86, dip: .75 }[mode];
    const times = [0, .43, .72, 1.12, 1.80, 2.26, 3.55];
    const phases = [[0, rear ? 'Back rack' : 'Front rack'], [.43, 'Dip'], [.72, mode === 'dip' ? 'Drive up' : 'Drive the bar'],
      [1.12, mode === 'dip' ? 'Stand' : 'Receive'], [1.80, 'Recover'], [2.26, 'Reset the bar']];
    add(id, phases, [[0, rear ? 'Set the bar across your upper back' : 'Support the bar at your shoulders',
      wide ? 'Use a wide snatch grip.' : 'Brace before bending your knees.'],
    [.43, 'Dip with an upright torso', 'Keep your weight centered over your feet.'],
    [1.12, mode === 'dip' ? 'Stand without pressing' : split ? 'Receive with a split stance' : 'Finish with the bar overhead',
      mode === 'dip' ? 'Keep the bar on your shoulders throughout.' : 'Recover to standing before lowering the bar.']], (t) => {
      const initialSplit = mode === 'balance' ? .42 : 0;
      const spread = split ? key(times, [initialSplit, initialSplit, initialSplit, 1, 0, 0, initialSplit], t) : 0;
      const rearSpread = mode === 'balance' ? key(times, [.42, .42, .42, .42, 0, 0, .42], t) : spread;
      torso(v(0, key(times, [.864, .748, .87, depth, .865, .865, .864], t), -.020 * spread), pitch(.04));
      for (const [side, s] of sides) leg(side, v(s * .156, .074 + (s < 0 ? .08 * rearSpread : 0),
        s > 0 ? .43 * spread : -.43 * rearSpread), s < 0 ? pitch(.68 * rearSpread) : yaw(.16));
      const a = mode === 'dip' ? 0 : key(times, [0, 0, .38, 1, 1, 1, 0], t);
      const shoulder = point('ArmL');
      return bar(v(0, shoulder.y + lerp(rear ? .066 : .082, wide ? .51 : .59, a),
        lerp(rear ? -.111 : .225, .027, a)), wide ? .511 : .244,
      v(0, 1, lerp(rear ? -.38 : .31, 0, a)), out);
    }, { duration: 3.55 });
  }

  for (const [id, mode] of [
    ['Standing_Barbell_Calf_Raise', 'standing'], ['Rocking_Standing_Calf_Raise', 'rock'],
    ['Barbell_Seated_Calf_Raise', 'seated'], ['Seated_Good_Mornings', 'hinge'],
    ['Elevated_Back_Lunge', 'lunge'], ['One_Leg_Barbell_Squat', 'single'],
    ['Speed_Box_Squat', 'box'], ['Front_Barbell_Squat_To_A_Bench', 'front'],
  ]) {
    const raised = ['standing', 'rock', 'seated'].includes(mode);
    const sits = ['seated', 'hinge'].includes(mode);
    const box = mode === 'box' || mode === 'front';
    const single = mode === 'single';
    const speedBox = mode === 'box';
    const phases = speedBox ? [[0, 'Setup'], [.25, 'Lower'], [1.65, 'Touch the box'], [1.82, 'Drive'], [2.32, 'Reset']]
      : raised ? up : down;
    const options = sits ? { ...bench, framing: 'standing', benchTransform: { position: [0, 0, -.40] } }
      : single ? { ...bench, framing: 'standing', benchTransform: { position: [0, 0, -.98] } }
        : speedBox ? { equipment: 'barbell', barLoad: 'resisted',
          fixtures: [{ kind: 'box', size: [.56, .43, .49], position: [0, .215, -.35] }] }
          : box ? { ...bench, framing: 'standing', benchTransform: { position: [0, 0, -.80] } } : {};
    if (mode === 'lunge') Object.assign(options, { equipment: 'step-platform-barbell', platformTransform: { position: [0, 0, -1.03] } });
    const liftText = mode === 'rock' ? 'Rock up onto the toes, then back onto the heels' : 'Raise the heels with control';
    const peak = raised ? liftText : mode === 'hinge' ? 'Hinge forward from the hips'
      : box ? 'Touch the pad before rising' : 'Bend the working knee and lower';
    add(id, phases, (speedBox ? (setup, bottom) => cues(phases, setup, bottom,
      ['Drive up quickly', 'Push through both feet as soon as you finish the brief pause.'])
      : raised ? lift : lower)([sits ? 'Set up seated on the bench' : 'Brace before moving',
      mode === 'seated' ? 'Support the bar across your thighs.'
        : mode === 'front' ? 'Cross your arms and hold the bar against the front of your shoulders.'
          : 'Keep the bar steady as you move.'],
    [peak, mode === 'single' ? 'Support the rear foot on the bench and load the front leg.' : 'Keep the working foot stable.']), (t) => {
      const a = rep(phases, t);
      const rocking = mode === 'rock' ? key([0, .3, 1.4, 1.85, 2.73, 3.6], [0, 0, 1, 1, -.45, 0], t) : a;
      const height = sits ? .552 + (mode === 'hinge' ? .014 * a : 0)
        : raised ? .862 + .099 * Math.max(rocking, 0) : lerp(.861, mode === 'front' ? .526 : box ? .536 : .544, a);
      const tilt = mode === 'hinge' ? .80 * a : raised ? .02 : .04 + .48 * a;
      torso(v(0, height, sits ? -.058 : -.177 * (raised ? 0 : a)), pitch(tilt), pitch(.15 * a));
      for (const [side, s] of sides) {
        const rearFoot = s < 0 && (mode === 'lunge' || single);
        const heel = raised ? rocking : 0;
        leg(side, v(s * (mode === 'single' ? .115 : .177), .074 + .104 * Math.max(0, heel) +
          (rearFoot ? single ? .447 : .350 : 0), rearFoot ? -.558
          : mode === 'lunge' || single ? .28 : sits ? .299 : -.015 * heel), pitch((rearFoot ? .90 : 0) + .73 * heel));
      }
      if (mode === 'seated') {
        return bar(v(0, .620 + .047 * a, .29), .236, v(0, -.7, 1), out);
      }
      if (mode === 'front') return crossedFrontRack();
      return backRack();
    }, options);
  }

  for (const [id, type] of [
    ['Bradford_Rocky_Presses', 'seated'], ['Standing_Bradford_Press', 'standing'],
    ['Standing_Barbell_Press_Behind_Neck', 'behind'],
    ['Standing_Overhead_Barbell_Triceps_Extension', 'extension'],
  ]) {
    const alternates = type === 'seated' || type === 'standing';
    const phases = alternates ? [[0, 'Front rack'], [.75, 'Clear the head'], [1.48, 'Rear rack'],
      [2.36, 'Clear the head'], [3.35, 'Front rack']] : up;
    add(id, phases, [[0, alternates ? 'Start with the bar in front' : 'Take a steady stance',
      type === 'extension' ? 'Keep your upper arms beside your ears.' : 'Keep your chest lifted and your wrists over your elbows.'],
    [alternates ? .75 : 1.4, alternates ? 'Travel over the crown' : type === 'extension' ? 'Straighten your elbows' : 'Press from behind your head',
      alternates ? 'Lower to the other side of your head without tilting your torso.' : 'Stay upright and reverse the movement slowly.']], (t) => {
      const seated = type === 'seated';
      torso(v(0, seated ? .55 : .865, 0));
      if (seated) for (const [side, s] of sides) leg(side, v(s * .225, .074, .35));
      else feet();
      const shoulder = point('ArmL');
      const a = alternates ? key([0, .75, 1.48, 2.36, 3.35, 3.6], [0, 1, 0, 1, 0, 0], t) : rep(up, t);
      const z = alternates ? key([0, .75, 1.48, 2.36, 3.35, 3.6], [.23, .04, -.19, .04, .23, .23], t)
        : lerp(-.22, .018, a);
      return bar(v(0, shoulder.y + lerp(type === 'extension' ? .27 : .095, alternates ? .43 : .58, a), z),
        type === 'extension' ? .145 : .282, v(0, 1, z), out);
    }, type === 'seated' ? { ...bench, framing: 'standing', benchTransform: { position: [0, 0, -.30] } } : {});
  }

  for (const [id, type] of [
    ['Barbell_Guillotine_Bench_Press', 'neck'], ['Lying_Close-Grip_Barbell_Triceps_Press_To_Chin', 'chin'],
    ['Lying_Triceps_Press', 'forehead'], ['Reverse_Triceps_Bench_Press', 'reverse'],
    ['Neck_Press', 'wide-neck'], ['Incline_Bench_Pull', 'row'], ['Straight_Raises_on_Incline_Bench', 'raise'],
  ]) {
    const incline = type === 'row' || type === 'raise';
    const options = incline ? { equipment: 'incline-bench-barbell', framing: 'standing',
      benchTransform: { angle: .55, position: [0, 0, .08], yaw: 0 } } : bench;
    const phases = incline ? up : down;
    const target = { neck: 'the base of the neck', 'wide-neck': 'the neck line', chin: 'the chin',
      forehead: 'the forehead', reverse: 'the lower chest', row: 'the underside of the pad', raise: 'eye level' }[type];
    add(id, phases, (incline ? lift : lower)([incline ? 'Set up against the incline pad' : 'Lie with your feet planted',
      type === 'reverse' ? 'Use a narrow palms-up grip.' : 'Keep your shoulders supported.'],
    ['Guide the bar toward ' + target, type === 'chin' || type === 'forehead'
      ? 'Keep your upper arms still and bend only the elbows.' : 'Keep the shaft level as both arms move.']), (t) => {
      const a = rep(phases, t);
      if (incline) {
        torso(v(0, .534, type === 'row' ? .11 : -.04), pitch(1.02));
        for (const [side, s] of sides) leg(side, v(s * .235, .074, -.405));
        const shoulder = point('ArmL');
        if (type === 'row') {
          return bar(v(0, shoulder.y + lerp(-.39, -.19, a), shoulder.z + .07), .248, v(0, -1, .4), pullPole);
        }
        const angle = lerp(.41, 1.80, a);
        const direction = v(0, -Math.cos(angle), Math.sin(angle));
        const width = .248;
        const { offset } = grip('L', v(-1, 0, 0), direction);
        const across = width - shoulder.x - offset.x;
        const reach = Math.sqrt((armLength - .004) ** 2 - across ** 2);
        const center = shoulder.addScaledVector(direction, reach).add(offset).setX(0);
        return bar(center, width, direction, out);
      }
      supine();
      const shoulder = point('ArmL');
      const end = { neck: [.17, -.105], 'wide-neck': [.193, -.13], chin: [.15, -.205],
        forehead: [.18, -.29], reverse: [.147, .16] }[type];
      const width = { neck: .42, 'wide-neck': .25, chin: .147, forehead: .186, reverse: .156 }[type];
      return bar(v(0, shoulder.y + lerp(.54, end[0], a), shoulder.z + lerp(.025, end[1], a)),
        width, v(0, 1, -a * .57), out, { underhand: type === 'reverse' });
    }, options);
  }
  return entries;
}
