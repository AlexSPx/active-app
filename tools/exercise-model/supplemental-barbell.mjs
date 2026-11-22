import { Matrix4 } from 'three';
import { X, createAuthor, cues, down, lerp, motion, pitch, q, rep, sides, smoothstep, up, v, yaw } from './barbell-standing-more.mjs';
import { metadata } from './supplemental-catalog.mjs';

export const groupLabel = 'Barbell overload and technique';
const overhead = v(0, 1, 0);
const hanging = v(0, -1, .13);
const elbows = (s) => v(s, -.62, -.23);
const pull = (s) => v(s * .28, -.12, -1);
const reset = ['Reset under control', 'Retrace the path and keep the load balanced.'];
const block = (size, position) => ({ kind: 'block', size, position });
const platform = (height) => block([.74, height, .46], [0, height / 2, -.075]);
const rack = { equipment: 'rack-barbell', rackTransform: { position: [0, 0, -.12] } };

export function createEntries(asset, helpers) {
  const { add, entries, torso, stance, leg, free, arm, grip, point, bar, backRack, hangY, bone } =
    createAuthor(asset, helpers, metadata);

  function exercise(id, setup, action, pose, options, phases = up) {
    add(id, phases, cues(phases, setup, action, reset), pose, options);
  }

  for (const [id, mode, sumo] of [
    ['Deadlift_with_Bands', 'resisted'], ['Deadlift_with_Chains', 'chains'],
    ['Deficit_Deadlift', 'deficit'], ['Rack_Pull_with_Bands', 'rack'],
    ['Reverse_Band_Deadlift', 'assisted'], ['Reverse_Band_Sumo_Deadlift', 'assisted', true],
    ['Romanian_Deadlift_from_Deficit', 'romanian'], ['Sumo_Deadlift_with_Bands', 'resisted', true],
    ['Sumo_Deadlift_with_Chains', 'chains', true],
  ]) {
    const raised = mode === 'deficit' || mode === 'romanian';
    const romanian = mode === 'romanian';
    const fromPins = mode === 'rack';
    const height = romanian ? .13 : raised ? .075 : 0;
    const bottom = fromPins ? .55 : .225;
    const width = sumo ? .174 : .253;
    const phases = romanian ? down : mode === 'chains'
      ? [[0, 'Set chains on the floor'], [.37, 'Break from floor'], [1.58, 'Stand'], [1.94, 'Lower'], [3.33, 'Set down']]
      : mode === 'assisted'
        ? [[0, 'Set under the bands'], [.25, 'Pull'], [1.24, 'Lockout'], [1.81, 'Lower'], [3.30, 'Reset']]
        : up;
    const setup = fromPins ? 'Start with the bar on the pins' : romanian ? 'Stand on the platform with the bar at your thighs'
      : raised ? 'Set up with both feet on the platform' : sumo ? 'Place your feet wide, with hands inside your knees'
        : 'Set the bar close to your shins';
    const options = raised ? { fixtures: [platform(height)] }
      : fromPins || mode === 'assisted' ? { ...rack, barLoad: fromPins ? 'resisted' : mode,
        rackTransform: { ...rack.rackTransform, ...(fromPins && { hookHeight: bottom }) } } : { barLoad: mode };
    exercise(id, [setup, mode === 'chains' ? 'Set the chains evenly on the sleeves.'
      : mode === 'assisted' ? 'The overhead bands assist most near the floor.'
        : raised ? 'Keep your whole foot supported.' : 'Brace with the load centered over your feet.'],
    [romanian ? 'Hinge with soft knees' : 'Drive the floor away',
      romanian ? 'Keep your hips high and guide the bar below your knees.' : 'Keep the shaft close as the hips and knees extend.'], (t) => {
      const lift = romanian ? 1 - rep(phases, t) : rep(phases, t);
      const lean = lerp(fromPins ? .71 : sumo ? .76 : romanian ? 1.24 : 1.01, .035, lift);
      const hips = lerp(fromPins ? .735 : romanian ? .694 : sumo ? .50 : .484, .865, lift) + height;
      torso(v(0, hips, -.30 * lean), pitch(lean), pitch(.45 * lean));
      stance(sumo ? .369 : .163, -.037, sumo ? .55 : .14, height);
      const z = lerp(sumo ? .205 : .226, .142, lift);
      const y = lift === 0 ? bottom : lerp(bottom, hangY(z, width, hanging) + .022, lift);
      return bar(v(0, y, z), width, hanging, pull);
    }, options, phases);
  }

  for (const [id, support, load] of [
    ['Box_Squat_with_Bands', 'box', 'resisted'], ['Box_Squat_with_Chains', 'box', 'chains'],
    ['Reverse_Band_Box_Squat', 'box', 'assisted'], ['Reverse_Band_Power_Squat', 'wide', 'assisted'],
    ['Squat_with_Bands', 'open', 'resisted'], ['Squat_with_Chains', 'open', 'chains'],
    ['Weighted_Jump_Squat', 'jump'],
  ]) {
    const seated = support === 'box';
    const jump = support === 'jump';
    const wide = support === 'wide';
    const phases = jump ? [[0, 'Stand'], [.25, 'Load'], [1, 'Drive'], [1.27, 'Flight'], [1.53, 'Land'],
      [1.81, 'Absorb'], [2.8, 'Stand']] : load === 'chains'
      ? [[0, 'Stand'], [.22, 'Lower'], [1.48, seated ? 'Meet the box' : 'Bottom'], [2.08, 'Stand'], [3.26, 'Reset']]
      : load === 'assisted' && seated
        ? [[0, 'Stand'], [.27, 'Sit back'], [1.58, 'Meet the box'], [2.22, 'Drive'], [3.35, 'Reset']] : down;
    const fixtures = seated ? [{ kind: 'box', position: [0, .215, -.35], size: [.56, .43, .49] }] : [];
    exercise(id, ['Set the bar on your upper back', seated ? 'Set your stance in front of the box.'
      : jump ? 'Brace with both feet planted.' : 'Brace before you bend your knees.'],
    [seated ? 'Sit back to the box' : jump ? 'Drive up into the jump' : 'Lower between your feet',
      seated ? 'Touch down briefly and drive back up.' : jump ? 'Land softly and bend your hips and knees.'
        : 'Track the knees over the toes as you reverse.'], (t) => {
      const a = jump ? motion([0, .25, 1, 1.21, 1.53, 1.81, 2.8, 3.6], [0, 0, 1, 0, 0, .72, 0, 0], t) : rep(phases, t);
      const flight = jump ? Math.max(0, 5.4 * (t - 1.21) * (1.53 - t)) : 0;
      const width = wide ? .30 : seated ? .225 : .18;
      torso(v(0, lerp(.865, seated ? (load === 'assisted' ? .546 : .531) : jump ? .674 : wide ? .492 : load === 'chains' ? .514 : .496, a) + flight,
        -(seated ? .26 : .175) * a), pitch(.04 + (seated ? .55 : .46) * a), pitch(.12 + .11 * a));
      for (const [side, s] of sides) leg(side, v(s * width, .074 + flight, 0),
        yaw(s * (wide ? .46 : .21)).multiply(pitch(.28 * flight)));
      return backRack();
    }, { ...(seated || load === 'assisted' ? rack : {}), barLoad: load, fixtures }, phases);
  }

  const plateRep = 4.9;
  const plateRadius = .145;
  const plateStart = .12;
  const plateMove = [3.54, 4.10];
  const repeat = (marks) => [0, plateRep].flatMap((offset) =>
    marks.map(([at, ...labels]) => [offset + at, ...labels]));
  add('Squat_with_Plate_Movers', repeat([[0, 'Stand'], [.15, 'Lower'], [1.05, 'Bottom'], [1.19, 'Rise'],
    [2.20, 'Side step'], [plateMove[0], 'Slide the plate'], [4.15, 'Step onto the plate']]),
  repeat([[0, 'Stand with one foot on the plate', 'Keep the bar on your upper back and turn your toes slightly out.'],
    [.15, 'Squat and stand back up', 'Keep both feet supported as you bend and extend your knees and hips.'],
    [2.20, 'Step across the plate', 'Bring your feet together on the other side.'],
    [plateMove[0], 'Push the plate sideways with your inside foot', 'Step onto the plate for the next squat.']]), (time) => {
    const direction = Math.floor(time / plateRep) % 2 ? -1 : 1;
    const t = time % plateRep;
    const depth = motion([.15, 1.05, 1.19, 2], [0, 1, 1, 0], t);
    const plateX = motion(plateMove, [plateStart, -plateStart], t);
    // The ankle stays outside the rim while the side of the foot pushes it.
    const edge = plateX + plateRadius + .087;
    const leadX = motion([2.20, 2.76], [plateStart, .49], t);
    const leadHeight = motion([2.20, 2.43, 2.76], [.036, .15, 0], t);
    const trailX = motion([2.88, 3.43, 4.25, 4.73], [-.49, edge, edge, -plateStart], t);
    const trailHeight = motion([2.88, 3.17, 3.39, 3.51, 4.15, 4.38, 4.73], [0, .17, .10, 0, 0, .12, .036], t);
    const hipsX = motion([2, 2.24, 2.76, 2.88, 3.46, 4.15, 4.73], [-.16, -.35, -.025, -.025, .36, .36, .16], t);
    const hipsY = motion([2, 2.25, 2.76, 2.96, 3.46, 4.15, 4.73], [.854, .824, .744, .744, .824, .824, .854], t);
    torso(v(direction * hipsX, lerp(hipsY, .496, depth), -.175 * depth),
      pitch(.04 + .46 * depth), pitch(.12 + .11 * depth));
    for (const [side, sign] of sides) {
      const leads = sign === direction;
      const height = leads ? leadHeight : trailHeight;
      leg(side, v(direction * (leads ? leadX : trailX), .074 + height, 0), yaw(sign * .21));
    }
    return [...backRack(), undefined, [v(direction * plateX, .018, 0), q()]];
  }, { ...rack, rackTransform: { position: [0, 0, -.80] },
    duration: plateRep * 2, animatedFixture: { kind: 'plate', size: plateRadius } });

  for (const [id, depth, snatch] of [
    ['Clean_from_Blocks', .49, false], ['Power_Clean_from_Blocks', .706, false],
    ['Snatch_from_Blocks', .457, true], ['Power_Snatch_from_Blocks', .73, true],
  ]) {
    const width = snatch ? .445 : .235;
    const height = depth > .6 ? .29 : .22;
    const times = [0, .32, .76, 1.01, 1.25, 1.95, 2.49, 3.44, 3.8];
    const phases = [[0, 'Set on blocks'], [.32, 'Pull'], [.76, 'Extend'], [1.01, 'Turn over'], [1.25, 'Receive'],
      [1.95, 'Stand'], [2.49, 'Return to blocks']];
    add(id, phases, [[0, 'Set the loaded plates on the blocks', snatch ? 'Take a wide grip.' : 'Take a grip outside the legs.'],
      [.76, 'Extend through the hips and knees', 'Guide the bar close to your body.'],
      [1.25, depth > .6 ? 'Receive above parallel' : 'Receive in a deep squat',
        snatch ? 'Fix the bar overhead.' : 'Turn the elbows through to the front rack.']], (t) => {
      const a = motion(times, [0, 0, .53, .85, 1, 1, 1, 0, 0], t);
      const lean = motion(times, [.62, .62, .05, .055, .13, .03, .045, .62, .62], t);
      torso(v(0, motion(times, [.654, .654, .87, .781, depth, .865, .86, .654, .654], t), -.24 * lean), pitch(lean));
      stance(snatch ? .19 : .167, 0, .18);
      const shoulder = point('ArmL');
      const shaft = v(0, lerp(height + .225, shoulder.y + (snatch ? .50 : .069), a),
        lerp(.187, snatch ? .035 : .205, a) + .06 * Math.sin(Math.PI * a));
      return bar(shaft, width, v(0, lerp(-1, .94, a), .27), elbows);
    }, { duration: 3.8, fixtures: [-1, 1].map((s) => block([.31, height, .46], [s * .715, height / 2, .187])) });
  }

  for (const [id, hangingBar] of [['Good_Morning_off_Pins', false], ['Hanging_Bar_Good_Morning', true]]) {
    const fixtures = hangingBar ? [] : sides.map(([, s]) =>
      block([.07, .048, .51], [s * .60, 1.126, .038]));
    exercise(id, [hangingBar ? 'Start under the suspended bar' : 'Set the bar on the safety pins',
      'Set your upper back under the shaft with the hips hinged.'],
    ['Extend at the hips', 'Stand tall, then bring the bar back to its starting height.'], (t) => {
      const a = rep(up, t);
      torso(v(0, lerp(hangingBar ? .766 : .745, .865, a), lerp(hangingBar ? -.24 : -.27, 0, a)),
        pitch(lerp(hangingBar ? .79 : .90, .04, a)), pitch(lerp(.48, .04, a)));
      stance(.215);
      return backRack();
    }, { ...rack, barLoad: hangingBar ? 'suspended' : undefined, fixtures });
  }

  for (const [id, mode] of [
    ['Bench_Press_with_Chains', 'chains'], ['Board_Press', 'board'],
    ['Floor_Press_with_Chains', 'floor'], ['Pin_Presses', 'pins'], ['Reverse_Band_Bench_Press', 'assisted'],
    ['Front_Raise_And_Pullover', 'pullover'], ['Press_Sit-Up', 'situp'],
  ]) {
    const floor = mode === 'floor';
    const situp = mode === 'situp';
    const pullover = mode === 'pullover';
    const pins = mode === 'pins';
    const rises = pins || situp || pullover;
    const phases = pullover ? [[0, 'Bar over thighs'], [.25, 'Raise'], [1.42, 'Reach overhead'],
      [1.87, 'Sweep forward'], [3.35, 'Reset']] : rises ? up : down;
    const options = floor ? { equipment: 'barbell', framing: 'floor', barLoad: 'chains' }
      : { equipment: situp ? 'decline-bench-barbell' : 'bench-barbell', framing: 'floor',
        benchTransform: { position: [0, 0, -.21] },
        barLoad: ['chains', 'assisted'].includes(mode) ? mode : undefined,
        rackTransform: pins || mode === 'assisted' ? { position: [0, 0, -.10], hookHeight: .78 } : undefined,
        fixtures: pins ? sides.map(([, s]) => block([.073, .047, .48], [s * .60, .747, -.228]))
          : mode === 'board' ? [block([.29, .081, .16], [0, .761, -.228])] : [] };
    exercise(id, [pins ? 'Set the bar down on the pins' : mode === 'board' ? 'Set the board over the sternum'
      : pullover ? 'Start with the bar over your thighs' : situp ? 'Secure your feet and start with the bar at your chest'
        : floor ? 'Lie back with both feet on the floor' : 'Plant your feet and set your shoulders on the pad',
    mode === 'assisted' ? 'The overhead bands help most near the chest.' : 'Set your hands evenly on the shaft.'],
    [pullover ? 'Sweep the shaft back overhead' : situp ? 'Curl up and press overhead' : pins ? 'Press from a dead stop'
      : mode === 'board' ? 'Touch the board lightly' : floor ? 'Touch the upper arms to the floor' : 'Lower toward the sternum',
    pullover ? 'Maintain a soft elbow bend as the shoulders move.' : 'Keep the shaft level throughout the repetition.'], (t) => {
      const a = rep(phases, t);
      const angle = situp ? lerp(-1.78, -.12, a) : -Math.PI / 2;
      torso(v(0, floor ? .135 : situp ? .575 : .552, situp ? .185 : .068), pitch(angle));
      for (const [side, s] of sides) leg(side, v(s * (floor ? .18 : .205), situp ? .43 : .074, situp ? .66 : .49),
        pitch(situp ? -.37 : 0), v(s * .19, 1, .21));
      const shoulder = point('ArmL');
      if (pullover) {
        const theta = lerp(-1.38, 1.38, a);
        return bar(v(0, shoulder.y + .565 * Math.cos(theta), shoulder.z - .565 * Math.sin(theta)),
          .194, v(0, Math.cos(theta), -Math.sin(theta)), elbows);
      }
      if (situp) return bar(v(0, shoulder.y + lerp(.133, .52, a), shoulder.z + lerp(.217, .037, a)),
        .223, overhead, elbows);
      const depth = mode === 'board' ? .816 : floor ? .359 : pins ? .785 : mode === 'assisted' ? .702 : .727;
      const lower = pins ? 1 - a : a;
      return bar(v(0, lerp(shoulder.y + .57, depth, lower), shoulder.z + .055 + .142 * lower),
        floor ? .270 : .29, v(0, 1, -.17 * lower), elbows);
    }, options, phases);
  }

  for (const [id, type] of [
    ['Anti-Gravity_Press', 'anti'], ['Lying_High_Bench_Barbell_Curl', 'prone-curl'],
    ['Standing_Palms-Up_Barbell_Behind_The_Back_Wrist_Curl', 'behind'], ['Finger_Curls', 'fingers'],
    ['Straight_Bar_Bench_Mid_Rows', 'bench-row'], ['Rack_Delivery', 'delivery'],
  ]) {
    const anti = type === 'anti';
    const prone = type === 'prone-curl';
    const row = type === 'bench-row';
    const delivery = type === 'delivery';
    const behind = type === 'behind';
    const fingers = type === 'fingers';
    const fixtures = prone ? [block([.36, .12, 1.32], [0, .71, -.15]), block([.36, .65, .33], [0, .325, -.43])] : [];
    const options = anti ? { equipment: 'incline-bench-barbell', benchTransform: { angle: .60, position: [0, 0, -.01] } }
      : row ? { equipment: 'bench-barbell', benchTransform: { yaw: Math.PI / 2 } }
        : { fixtures, ...(fingers && { fingers: 'dynamic' }) };
    exercise(id, [anti ? 'Support your chest on the incline' : prone ? 'Lie face down on a high bench'
      : row ? 'Stand on the bench and hinge' : delivery ? 'Begin with high elbows and the bar hanging' :
        behind ? 'Hold the shaft behind your glutes' : 'Let the bar sit near the ends of your fingers',
    prone || fingers ? 'Start with palms up.' : 'Keep the load even between your hands.'],
    [anti ? 'Press forward past your head' : row ? 'Row to the lower ribs' : delivery ? 'Turn the elbows through to the rack'
      : prone ? 'Curl toward your shoulders' : fingers ? 'Close your fingers around the shaft' : 'Curl through the wrists',
    delivery ? 'Stay tall and rotate the elbows around the bar.' : 'Keep the upper arms steady and move without swinging.'], (t) => {
      const a = rep(up, t);
      if (prone || anti) {
        torso(v(0, prone ? .907 : .560, prone ? -.25 : .062), pitch(prone ? Math.PI / 2 : .96));
        for (const [side, s] of sides) leg(side, v(s * .19, prone ? .737 : .341, prone ? -1.02 : -.64),
          pitch(prone ? 1.37 : .92), v(s * .20, -.78, -.09));
      } else {
        torso(v(0, row ? 1.099 : .865, row ? -.261 : 0), pitch(row ? .97 : .02));
        stance(row ? .205 : .156, row ? -.01 : 0, .14, row ? .432 : 0);
      }
      const shoulder = point('ArmL');
      if (delivery) {
        const turn = lerp(.33, -1.17, smoothstep(a, 0, .50));
        const result = bar(v(0, shoulder.y + lerp(-.193, .045, a),
          shoulder.z + lerp(.292, .123, a) - .06 * Math.sin(Math.PI * a)),
        .286, v(0, -Math.cos(turn), Math.sin(turn)),
        (s) => v(s * lerp(.35, -.48, a), lerp(.36, .024, a), lerp(-.33, -.047, a)));
        return [...result, { L: 1 - .42 * a, R: 1 - .42 * a }];
      }
      if (anti) return bar(v(0, shoulder.y - .117 + .152 * a, shoulder.z + .155 + .454 * a),
        .234, v(0, lerp(.65, .07, a), 1), elbows);
      if (prone) return bar(v(0, shoulder.y + lerp(-.625, -.367, a), shoulder.z + .26 * Math.sin(Math.PI * .66 * a)),
        .182, v(0, -1 + 1.78 * a, .78), (s) => v(s * .16, -1, -.07), { underhand: true });
      if (row) return bar(v(0, shoulder.y + lerp(-.613, -.278, a), shoulder.z + lerp(.027, -.217, a)),
        .255, hanging, pull);
      const z = behind ? -.242 : .193;
      const direction = v(0, -1 + .52 * a, (behind ? -1 : 1) * lerp(.27, .91, a));
      const result = bar(v(0, hangY(z, .195, direction, !behind) + (fingers ? .066 : .056) * a, z),
        .195, direction, elbows, { underhand: !behind, frame: pitch((behind ? -.42 : .43) * a) });
      return fingers ? [...result, { L: .45 + .55 * a, R: .45 + .55 * a }] : result;
    }, options);
  }

  for (const [id, feet] of [['Barbell_Ab_Rollout', true], ['Barbell_Rollout_from_Bench', false]]) {
    exercise(id, [feet ? 'Start in a plank supported by the bar' : 'Kneel on the end of the bench',
      'Grip the bar evenly and brace your abdominals.'],
    [feet ? 'Pike your hips and roll toward your feet' : 'Roll away from the bench',
      feet ? 'Keep the arms close to vertical.' : 'Reach forward without collapsing through the lower back.'], (t) => {
      const a = rep(up, t);
      const thighAngle = lerp(-.66, 1.32, a);
      const knee = v(0, .487, -.32);
      const thigh = bone('ShinL').position.length();
      const y = feet ? lerp(.545, .862, a) : knee.y + thigh * Math.cos(thighAngle);
      const hipZ = feet ? lerp(-.43, -.688, a) : knee.z + thigh * Math.sin(thighAngle);
      const lean = feet ? lerp(1.38, 2.23, a) : lerp(1.88, 1.79, a);
      torso(v(0, y, hipZ), pitch(lean), pitch(feet ? lean * .94 : 1.51));
      for (const [side, s] of sides) {
        if (feet) leg(side, v(s * .13, .166, -1.12), pitch(1.17), v(s * .09, -.85, .44));
        else {
          const plantedKnee = knee.clone().add(v(s * .102, 0, 0));
          const ankle = plantedKnee.clone().add(v(0, 0, -bone('Foot' + side).position.length()));
          leg(side, ankle, pitch(1.58), plantedKnee.sub(point('Thigh' + side)));
        }
      }
      const start = feet ? .113 : .226;
      const z = lerp(start, feet ? -.315 : 1.138, a);
      const direction = feet ? v(0, -1, .15) : v(0, lerp(-1, -.43, a), lerp(.48, 1, a));
      return bar(v(0, .225, z), .211, direction, elbows, { frame: pitch((z - start) / .225) });
    }, { ...(feet ? {} : { equipment: 'bench-barbell', benchTransform: { position: [0, 0, -.71] } }), framing: 'floor' });
  }

  for (const [id, mode] of [
    ['Bent_Over_One-Arm_Long_Bar_Row', 'side-row'], ['Bent_Over_Two-Arm_Long_Bar_Row', 'straddle-row'],
    ['One-Arm_Long_Bar_Row', 'elbow-row'], ['T-Bar_Row_with_Handle', 'handle-row'],
    ['Landmine_180s', 'rotate'], ['Landmine_Linear_Jammer', 'jammer'], ['Single-Arm_Linear_Jammer', 'single-jammer'],
  ]) {
    const rotates = mode === 'rotate';
    const presses = mode.endsWith('jammer');
    const one = ['side-row', 'elbow-row', 'single-jammer'].includes(mode);
    const handle = ['handle-row', 'jammer'].includes(mode);
    const phases = rotates ? [[0, 'Center'], [.25, 'Sweep left'], [1.06, 'Left hip'], [1.53, 'Cross'],
      [2.38, 'Right hip'], [3.35, 'Center']] : up;
    const pivot = v(mode === 'side-row' ? -.37 : mode === 'elbow-row' ? -.44 : 0, .048,
      presses || rotates ? 1.24 : -1.34);
    exercise(id, [rotates ? 'Raise the bar between both hands' : presses ? 'Set the bar at shoulder height' : 'Hinge near the loaded end',
      one ? 'Use the working hand and brace through both feet.' : 'Keep the unloaded end in its anchor.'],
    [rotates ? 'Sweep the sleeve across the body' : presses ? 'Extend the hips and drive the handle up' : 'Draw the elbow back',
      rotates ? 'Turn through your feet and hips as the sleeve travels.' : presses ? 'Finish with the elbow extended.' : 'Return to a long arm without rounding your back.'], (t) => {
      const a = rotates ? motion([0, .25, 1.06, 1.53, 2.38, 3.35], [0, 0, 1, 0, -1, 0], t) : rep(up, t);
      const dip = presses ? motion([0, .25, .53, 1.4, 1.85, 3.35], [.025, .025, mode === 'jammer' ? .22 : .12, 0, 0, .025], t) : 0;
      const side = mode === 'side-row' ? -.22 : mode === 'elbow-row' ? -.30 : 0;
      torso(v(side - .138 * (rotates ? a : 0), presses ? .86 - dip : rotates ? .825 - .115 * Math.abs(a) : .663,
        presses ? lerp(-.32, .078, a) : rotates ? .19 - .043 * Math.abs(a) : -.17), yaw(rotates ? -.67 * a : mode === 'elbow-row' ? -.22 : 0)
        .multiply(pitch(presses ? .19 + dip : rotates ? .12 + .09 * Math.abs(a) : 1.02)));
      for (const [foot, s] of sides) leg(foot, v(side + s * (presses || rotates ? .275 : .205),
        .074, presses ? -.075 : rotates ? .12 : -.08), yaw(s * .18 - (rotates ? .27 * a : 0)));
      const elevation = rotates ? lerp(1.18, .71, Math.abs(a)) : presses ? lerp(.89 - dip, 1.23, a)
        : lerp(.260, mode === 'handle-row' ? .45 : .415, a);
      const azimuth = rotates ? -.23 * a : presses ? (one ? -.12 : 0) : mode === 'elbow-row' ? -.045 : 0;
      const axis = v(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation),
        (presses || rotates ? -1 : 1) * Math.cos(azimuth) * Math.cos(elevation));
      const center = pivot.clone().addScaledVector(axis, 1.68);
      const across = X.clone().addScaledVector(axis, -axis.x).normalize();
      // The handle is on local Z, perpendicular to the pivot shaft.
      const frame = q().setFromRotationMatrix(new Matrix4().makeBasis(axis, across.clone().cross(axis), across));
      for (const [hand, s] of sides) {
        const shoulder = point('Arm' + hand);
        if (one && s > 0) {
          free(hand, shoulder.add(v(.08, -.34, .21)), v(0, -1, .22));
          continue;
        }
        const seat = handle ? center.clone().addScaledVector(across, s * .105)
          : center.clone().addScaledVector(axis, one ? -.046 : s > 0 ? -.017 : -.119);
        const { hand: orientation, offset } = grip(hand, handle ? across.clone().negate() : axis.clone(),
          presses || rotates ? overhead : hanging);
        const pole = presses ? v(s, -1, 0) : rotates ? v(s * .45, -.64, -.92) : pull(s);
        arm(hand, seat.sub(offset), pole, orientation, presses || rotates);
      }
      return [center, frame];
    }, { equipment: '', animatedFixture: { kind: 'landmine', handle }, fixtures: [{ kind: 'pivot', position: [pivot.x, .03, pivot.z] }],
      fingers: one ? 'R' : 'LR' }, phases);
  }
  return entries;
}
