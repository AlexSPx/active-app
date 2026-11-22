import { createKettlebell } from './kettlebell.mjs';
import {
  X, Y, Z, ankleHeight, createAuthor, cues, down, frameFromDown, lerp, mix, motion, pitch, rep, roll, sides,
  smoothstep, up, v, yaw,
} from './barbell-standing-more.mjs';

export const groupLabel = 'Kettlebell techniques';

const floor = { framing: 'floor' };
const below = v(0, -1, 0);
const right = v(-1, 0, 0);
const rear = v(0, 0, -1);
const orbitTimes = [0, .52, 1.14, 1.82, 2.52, 3.35];
const peak = (t, a, b, c) => motion([0, a, b, c], [0, 0, 1, 0], t);

export function createEntries(asset, helpers) {
  const { add, entries, torso, point, world, stance, leg, arm, free, grip, bone, armLength } = createAuthor(asset, helpers, metadata);
  const fixture = createKettlebell();
  const parts = fixture.children;
  const path = parts[0].geometry.parameters.path;
  const horns = [['L', path.curves[2], .32], ['R', path.curves[0], .68]].map(([side, curve, u]) => ({
    side, location: curve.getPoint(u), tangent: curve.getTangent(u).negate(),
  }));
  for (const part of parts) {
    part.geometry.dispose();
    part.material.dispose();
  }

  function stand(height = .865, z = 0, tilt = 0, width = .16) {
    torso(v(0, height, z), pitch(tilt), pitch(tilt * .36));
    stance(width);
  }

  const freeLeft = (x = .13, y = -.48, z = .12) =>
    free('L', point('ArmL').add(v(x, y, z)), v(.42, -1, .38));

  function one(center, axis, bellDown, direction, pole = v(-1, -.54, -.22)) {
    const { hand, offset } = grip('R', axis, direction);
    const shoulder = point('ArmR');
    const delta = center.clone().sub(offset).sub(shoulder);
    if (delta.length() >= armLength) center = shoulder.add(delta.setLength(armLength - .001)).add(offset);
    arm('R', center.clone().sub(offset), pole, hand);
    return [center, frameFromDown(axis, bellDown)];
  }

  function two(center, axis, bellDown, direction, pole, followWrist = false) {
    const frame = frameFromDown(axis, bellDown);
    const targets = horns.map(({ side, location, tangent }) => {
      const { hand, offset } = grip(side, tangent.clone().applyQuaternion(frame), direction);
      const delta = location.clone().applyQuaternion(frame).sub(offset);
      return { side, sign: side === 'L' ? 1 : -1, hand, delta, origin: point('Arm' + side).sub(delta) };
    });
    const fitted = center.clone();
    for (let pass = 0; pass < 8; pass++) {
      for (const { origin } of targets) {
        const offset = fitted.clone().sub(origin);
        if (offset.length() > armLength - .001) fitted.copy(origin).add(offset.setLength(armLength - .001));
      }
    }
    for (const { side, sign, delta, hand } of targets) {
      arm(side, fitted.clone().add(delta), pole(sign), hand, followWrist);
    }
    return [fitted, frame];
  }

  for (const [id, style] of [
    ['Kettlebell_Arnold_Press', 'arnold'], ['Kettlebell_Seated_Press', 'seated'],
    ['One-Arm_Kettlebell_Military_Press_To_The_Side', 'side'], ['One-Arm_Kettlebell_Push_Press', 'push'],
    ['One-Arm_Kettlebell_Jerk', 'jerk'],
  ]) {
    const seated = style === 'seated';
    const side = style === 'side';
    const arnold = style === 'arnold';
    const jerk = style === 'jerk';
    const drive = jerk || style === 'push';
    const phases = jerk ? [[0, 'Rack'], [.38, 'Dip'], [.69, 'Drive'], [.94, 'Catch'], [1.43, 'Stand'],
      [1.94, 'Lower'], [3.35, 'Rack']]
      : drive ? [[0, 'Rack'], [.40, 'Dip'], [.72, 'Drive'], [1.33, 'Lockout'], [1.91, 'Lower'], [3.35, 'Rack']] : up;
    add(id, phases, [[0, seated ? 'Sit with legs apart' : 'Set the bell in the rack', arnold || side
      ? 'Begin with your working palm facing in.' : 'Keep your wrist firm and the bell close to your shoulder.'],
    [drive ? .38 : 1.4, jerk ? 'Dip, drive, and dip again' : drive ? 'Use one dip and drive' : 'Press to lockout',
      jerk ? 'Catch with a straight elbow and bent knees, then stand.' : drive
        ? 'Use your legs to start the press and finish standing tall.' : arnold
          ? 'Rotate your palm forward as the bell rises.' : side
            ? 'Look toward the bell and press up and out.' : 'Press up and slightly out while seated on the floor.'],
    [drive ? 1.94 : 1.85, 'Return to your shoulder', 'Lower the bell under control.']], (t) => {
      const dip = drive ? peak(t, .06, .38, .68) : 0;
      const catchDip = jerk ? peak(t, .68, .95, 1.43) : 0;
      const a = drive ? motion([0, .39, .70, jerk ? .94 : 1.31, 1.94, 3.35], [0, 0, .43, 1, 1, 0], t) : rep(up, t);
      if (seated) {
        torso(v(0, .145, 0), pitch(.035), pitch(0));
        for (const [side, sign] of sides) leg(side, v(sign * .51, ankleHeight, .60), yaw(sign * .48), Y);
      } else {
        stand(.865 - .121 * dip - .149 * catchDip, -.028 * (dip + catchDip), .07 * (dip + catchDip), .166);
      }
      freeLeft(seated ? .23 : .14, -.48, .20);
      const shoulder = point('ArmR');
      const start = v(side ? -.196 : -.154, .09, .275);
      const end = v(side ? -.308 : -.084, side ? .518 : .598, side ? .02 : .065);
      const center = shoulder.add(mix(start, end, a));
      if (arnold) center.x -= .08 * Math.sin(Math.PI * a);
      const axis = X.clone().negate().applyQuaternion(yaw(arnold ? (1 - a) * 1.48 : lerp(side ? 1.16 : .93, side ? -.97 : -.10, a)));
      if (side) world('Head', yaw(-.43 - .31 * a).multiply(pitch(-.22 * a)));
      return one(center, axis, v(lerp(-1, -.30 - .48 * Number(side), a), lerp(-.20, -.43, a), lerp(.20, -.78, a)), v(-.25 * Number(side), 1, .10));
    }, { equipment: 'kettlebell', fingers: 'R', ...(seated ? floor : {}) });
  }

  const clean = [[0, 'Set the bell'], [.43, 'Load the hips'], [.74, 'Drive'], [1.26, 'Rack'],
    [1.86, 'Lower'], [3.35, 'Reset']];
  for (const [id, style] of [
    ['Kettlebell_Dead_Clean', 'dead'], ['Kettlebell_Hang_Clean', 'hang'],
    ['One-Arm_Kettlebell_Clean', 'swing'], ['One-Arm_Kettlebell_Snatch', 'snatch'],
  ]) {
    const dead = style === 'dead';
    const hang = style === 'hang';
    const snatch = style === 'snatch';
    const phases = snatch ? clean.map(([t, label]) => [t, t === 1.26 ? 'Overhead lockout' : label]) : clean;
    add(id, phases, [[0, dead ? 'Start with the bell on the floor' : 'Hinge to load your hips',
      'Keep your back steady and your eyes forward.'],
    [.74, 'Drive through your feet', snatch ? 'Accelerate the bell upward and punch the hand through the handle.'
      : 'Extend your hips and guide the bell close to your body.'],
    [1.26, snatch ? 'Receive overhead' : 'Receive at the shoulder',
      'Let the bell settle against your forearm and reverse under control.']], (t) => {
      const load = peak(t, .02, .42, .79);
      const a = motion([0, .45, .76, 1.26, 1.84, 3.35], [0, 0, .44, 1, 1, 0], t);
      const initial = hang ? .752 : .529;
      stand(lerp(initial, .865, a) - (dead ? 0 : .018) * load, lerp(-.22, -.008, a) - .032 * load,
        lerp(hang ? .86 : .91, .03, a) + .08 * load, dead ? .192 : .257);
      freeLeft(.20 + .13 * load, -.42, -.10 + .27 * a);
      const shoulder = point('ArmR');
      const start = v(hang ? -.056 : lerp(-.096, -.056, load), dead ? .254 : hang ? .440 : .254 + .08 * load,
        dead ? .241 : .241 - .251 * load);
      const end = shoulder.add(snatch ? v(-.054, .595, .071) : v(-.173, .100, .254));
      const center = mix(start, end, a);
      center.z += (snatch ? .18 : .09) * Math.sin(Math.PI * a);
      const catchAmount = snatch ? smoothstep(a, .24, .81) : smoothstep(a, .44, .96);
      const angle = lerp(.10, Math.PI - .13, catchAmount);
      const snatchTurn = snatch ? smoothstep(a, .72, .99) : 0;
      const direction = v(0, -Math.cos(angle), Math.sin(angle));
      return one(center, right.clone().applyQuaternion(yaw(lerp(lerp(.48, 1.08, catchAmount), -.10, snatchTurn))),
        v(-.85 * catchAmount, -1 + .65 * catchAmount, lerp(.26, -.80, snatchTurn) * catchAmount), direction, v(-.64, -1, -.42));
    }, { equipment: 'kettlebell', fingers: 'R' });
  }

  const reachFloor = down.map(([t, label]) => [t, t === 1.65 ? 'Windmill bottom' : label]);
  const bent = [[0, 'Rack'], [.28, 'Shift away'], [1.53, 'Press under the bell'], [2.43, 'Stand locked out'],
    [2.70, 'Lower to rack'], [3.35, 'Reset']];
  for (const [id, style] of [
    ['Kettlebell_Windmill', 'standard'], ['Advanced_Kettlebell_Windmill', 'advanced'], ['Bent_Press', 'bent'],
  ]) {
    const advanced = style === 'advanced';
    const bentPress = style === 'bent';
    const phases = bentPress ? bent : reachFloor;
    add(id, phases, cues(phases, [bentPress ? 'Rack the bell at your shoulder' : 'Lock the bell overhead',
      'Turn both feet away from the working arm.'],
    [bentPress ? 'Press as you lean away' : 'Send your hips toward the bell', advanced
      ? 'Keep your free hand behind your back.' : 'Reach your free hand toward the floor while looking at the bell.'],
    [bentPress ? 'Stand under the locked elbow' : 'Stand by reversing the hinge',
      'Keep the bell over your working shoulder.']), (t) => {
      const a = bentPress ? motion([0, .28, 1.53, 1.79, 2.43, 3.35], [0, 0, 1, 1, 0, 0], t) : rep(phases, t);
      const extension = bentPress ? motion([0, .40, 1.51, 2.66, 3.35], [0, 0, 1, 1, 0], t) : 1;
      const tilt = roll(-(advanced ? 1.30 : 1.40) * a).multiply(pitch(.32 * a));
      torso(v(-.24 * a, .844 - (bentPress ? .19 : .14) * a, -.14 * a), tilt);
      world('Head', roll(-.80 * a).multiply(yaw(-.66 * a)).multiply(pitch(-.20)));
      for (const [side, sign] of sides) leg(side, v(sign * .281, ankleHeight, sign * .047), yaw(.70));
      if (advanced) {
        free('L', v(.10, -.36, -.19).applyQuaternion(tilt).add(point('ArmL')), v(0, -1, -.35));
      } else {
        free('L', mix(point('ArmL').add(v(.18, -.47, .02)), v(.315, bentPress ? .181 : .143, .134), a),
          v(0, -.62, .78), v(.30, .15, .42));
      }
      const shoulder = point('ArmR');
      const center = shoulder.add(mix(v(-.179, .12, .251), v(-.031, .598, .044), extension));
      return one(center, right.clone().applyQuaternion(yaw(.93 * (1 - extension))),
        v(lerp(-1, -.34, extension), -.39, lerp(.21, -.81, extension)), v(-.03, 1, .03));
    }, { equipment: 'kettlebell', fingers: 'R' });
  }

  for (const [id, extension] of [['Kettlebell_Halo', false], ['Kettlebell_Halo_With_Overhead_Extension', true]]) {
    const duration = extension ? 4.8 : 3.6;
    const times = extension ? [0, .60, 1.32, 2.10, 2.29, 3.20, 3.92, 4.60] : orbitTimes;
    const labels = extension ? ['Chest', 'First ear', 'Behind head', 'Extend overhead', 'Lower', 'Behind head', 'Opposite ear', 'Chest']
      : ['Chest', 'First ear', 'Behind head', 'Opposite ear', 'Chest', 'Reset'];
    const phases = times.map((time, i) => [time, labels[i]]);
    add(id, phases, [[0, 'Grip both horns', 'Start with the bell inverted at your chest and keep your head still.'],
    [times[2], 'Circle behind your head', extension
      ? 'Pause, extend both elbows overhead, then lower to the pause position.'
      : 'Pass one ear, then the back of your head, then the other ear.'],
    [times.at(-2), 'Complete the circle', 'Return the bell to your chest without twisting your hips.']], (t) => {
      stand();
      const theta = motion(times, extension ? [0, Math.PI / 2, Math.PI, Math.PI, Math.PI, Math.PI, Math.PI * 1.5, Math.PI * 2]
        : [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2, Math.PI * 2], t);
      const lift = extension ? motion(times, [0, 0, 0, 1, 1, 0, 0, 0], t) : 0;
      const foreAft = Math.cos(theta);
      const behind = (1 - foreAft) * .5;
      // Keep the horns tilted at the front and back so the wrists can follow the forearms.
      const inversion = Math.PI / 2 - .49 * foreAft;
      const angle = .72 * Math.sin(theta);
      const axis = X.clone().applyQuaternion(yaw(angle));
      const bellDown = v(0, Math.cos(inversion), -Math.sin(inversion)).applyQuaternion(yaw(angle));
      const center = v(.35 * Math.sin(theta), 1.405 + .150 * behind + .37 * lift,
        .034 + .365 * foreAft + .14 * lift);
      return two(center, axis, bellDown, v(.12 * Math.sin(theta), 1, .40 * foreAft - .38 * behind * (1 - lift)),
        (sign) => v(sign * .25, -.48, -.04), true);
    }, { equipment: 'kettlebell', duration });
  }

  add('Kettlebell_Overhead_Triceps_Extension', down, cues(down, ['Grip the horns overhead', 'Keep your ribs down and your upper arms close to your head.'],
    ['Bend your elbows', 'Lower the bell behind your head without spreading your elbows.'],
    ['Extend your elbows', 'Bring your forearms back up without moving your upper arms.']), (t) => {
    stand();
    const angle = .12 + 1.95 * rep(down, t);
    const direction = v(0, Math.cos(angle), -Math.sin(angle));
    const bellDown = v(0, -Math.sin(angle), -Math.cos(angle));
    const frame = frameFromDown(X, bellDown);
    const { location, tangent } = horns[0];
    const { offset } = grip('L', tangent.clone().applyQuaternion(frame), direction);
    const wristOffset = location.clone().applyQuaternion(frame).sub(offset);
    const upper = v(-.025, .27, -.06).setLength(bone('ForearmL').position.length());
    const elbow = point('ArmL').add(upper);
    const reach = Math.sqrt(bone('HandL').position.length() ** 2 - (wristOffset.x - elbow.x) ** 2);
    const center = v(wristOffset.x, elbow.y, elbow.z).addScaledVector(direction, reach).sub(wristOffset);
    return two(center, X, bellDown, direction, (s) => v(s * upper.x, upper.y, upper.z), true);
  }, { equipment: 'kettlebell' });

  add('Kettlebell_Pistol_Squat', down, cues(down, ['Hold the bell by both horns', 'Balance on your right foot with your left foot lifted.'],
    ['Sit into the working hip', 'Reach the free leg out and hold the bell in front as a counterbalance.'],
    ['Push through the standing heel', 'Keep the free leg off the floor as you stand.']), (t) => {
    const a = rep(down, t);
    torso(v(-.142 - .051 * a, .865 - .509 * a, -.022 - .243 * a), pitch(.09 + .69 * a), pitch(.11 * a));
    leg('R', v(-.223, ankleHeight, 0), yaw(-.12));
    const hip = point('ThighL');
    const angle = lerp(.37, 1.53, a);
    leg('L', hip.add(v(.027, -.742 * Math.cos(angle), .742 * Math.sin(angle))), pitch(-.23), v(.12, 1, .64));
    const center = point('Chest').add(v(0, .156 + .035 * a, .34 + .167 * a));
    return two(center, X, below, v(0, .62, .78), (sign) => v(sign * .61, -1, -.08));
  }, { equipment: 'kettlebell' });

  function handoff(center, t, leftPass, rightPass) {
    const approach = (pass) => smoothstep(t, pass - .32, pass - .025);
    const release = (pass) => 1 - smoothstep(t, pass + .025, pass + .32);
    const close = (pass) => smoothstep(t, pass - .12, pass - .01);
    const open = (pass) => 1 - smoothstep(t, pass + .01, pass + .12);
    const targets = sides.map(([side, sign]) => {
      const left = side === 'L';
      const reach = left ? approach(leftPass) * release(rightPass) : release(leftPass) + approach(rightPass);
      const hold = left ? close(leftPass) * open(rightPass) : open(leftPass) + close(rightPass);
      const { hand, offset } = grip(side, right, v(0, -1, .24));
      const delta = v(sign * .052, 0, 0).sub(offset);
      return { side, sign, reach, hold, hand, delta, origin: point('Arm' + side).sub(delta) };
    });
    const fitted = center.clone();
    for (let pass = 0; pass < 8; pass++) {
      for (const { origin, reach } of targets) {
        const delta = fitted.clone().sub(origin);
        if (delta.length() > armLength - .001) {
          fitted.lerp(origin.clone().add(delta.setLength(armLength - .001)), reach);
        }
      }
    }
    for (const { side, sign, reach, hand, delta } of targets) {
      const idle = point('Arm' + side).add(v(sign * .138, -.440, lerp(.17, -.09, smoothstep(center.z, -.05, .22))));
      arm(side, mix(idle, fitted.clone().add(delta), reach), v(sign * .63, -.35, -.62), hand);
    }
    return [fitted, frameFromDown(X, below), { L: targets[0].hold, R: targets[1].hold }];
  }

  for (const [id, figureEight] of [['Kettlebell_Figure_8', true], ['Kettlebell_Pass_Between_The_Legs', false]]) {
    const times = [0, .46, .88, 1.24, 1.69, 2.16, 2.61, 3.05, 3.60];
    const phases = [[0, 'Right hand'], [.88, 'First pass'], [1.69, 'Left hand'],
      [2.61, 'Return pass'], [3.60, 'Reset']];
    add(id, phases, [[0, 'Hinge with a wide stance', 'Keep your hips back and your back steady.'],
    [.88, 'Receive between your legs', figureEight ? 'Reach from behind and circle outside each knee.'
      : 'Pass the bell between hands and guide it back along a W-shaped path.'],
    [2.61, 'Pass back to the first hand', 'Take the handle before releasing the other hand.']], (t) => {
      stand(figureEight ? .674 : .716, -.173, figureEight ? .71 : .54, figureEight ? .370 : .330);
      const x = motion(times, [-.526, -.278, 0, .278, .526, .278, 0, -.278, -.526], t);
      const y = motion(times, figureEight ? [.58, .55, .493, .554, .58, .55, .493, .554, .58]
        : [.60, .51, .565, .51, .60, .51, .565, .51, .60], t);
      const z = motion(times, figureEight ? [.13, .492, -.061, -.312, .13, .492, -.061, -.312, .13]
        : [.38, .51, -.055, .51, .38, .51, -.055, .51, .38], t);
      return handoff(v(x, y, z), t, .89, 2.62);
    }, { equipment: 'kettlebell', fingers: 'dynamic' });
  }

  const lungeTimes = [0, .56, 1.08, 1.33, 1.81, 2.37, 2.89, 3.14, 3.60];
  const lungePhases = [[0, 'Right hand'], [.56, 'Left foot forward'], [1.20, 'Pass to left hand'],
    [1.81, 'Stand'], [2.37, 'Right foot forward'], [3.00, 'Pass to right hand'], [3.60, 'Stand']];
  add('Lunge_Pass_Through', lungePhases, [[0, 'Start with the bell in your right hand', 'Keep your torso upright as you step.'],
  [1.20, 'Pass under your lead thigh', 'Receive the handle with your left hand before standing.'],
  [3.00, 'Alternate legs and hands', 'Repeat under the right thigh and return to standing.']], (t) => {
    const first = t <= 1.81;
    const time = first ? t : t - 1.81;
    const lead = first ? 1 : -1;
    const step = motion([0, .52, 1.39, 1.79], [0, 1, 1, 0], time);
    const dip = motion([0, .52, 1.08, 1.30, 1.73], [0, 0, 1, 1, 0], time);
    torso(v(.058 * lead * dip, .859 - .108 * step - .195 * dip, .263 * step), pitch(.10 + .22 * dip));
    for (const [side, sign] of sides) {
      if (sign === lead) leg(side, v(sign * (.155 + .027 * step), ankleHeight + .095 * Math.sin(Math.PI * step), .633 * step), yaw(sign * .10 * step));
      else leg(side, v(sign * .155, ankleHeight + .108 * dip, -.065 * dip), pitch(.61 * dip));
    }
    const x = motion(lungeTimes, [-.350, -.408, -.025, .272, .350, .408, .025, -.272, -.350], t);
    const z = motion(lungeTimes, [.14, .32, .399, .512, .14, .32, .399, .512, .14], t);
    const y = motion(lungeTimes, [.80, .685, .478, .471, .80, .685, .478, .471, .80], t);
    return handoff(v(x, y, z), t, 1.205, 3.015);
  }, { equipment: 'kettlebell', fingers: 'dynamic' });

  add('Leg-Over_Floor_Press', up, cues(up, ['Cross the working-side leg over', 'Lie down and extend your free arm to the side.'],
    ['Press the bell above your shoulder', 'Extend the elbow and keep your torso steady.'],
    ['Lower to the floor', 'Touch down softly with the back of your working arm.']), (t) => {
    const a = rep(up, t);
    torso(v(0, .141, 0), pitch(-Math.PI / 2), pitch(-1.71));
    leg('L', v(.182, ankleHeight, .706), pitch(-.41), Y);
    leg('R', v(.361, ankleHeight, .582), pitch(-.29), Y);
    free('L', v(.640, .047, -.455), X, v(.0, .34, .42));
    const center = mix(v(-.423, .386, -.411), v(-.219, .744, -.470), a);
    const axis = Z.clone().applyQuaternion(yaw(-a * Math.PI / 2));
    return one(center, axis, v(-1, -.31, -.62), v(-.36 * (1 - a), 1, -.36 * (1 - a)), v(-.28, -1, .02));
  }, { equipment: 'kettlebell', fingers: 'R', ...floor });

  return entries;
}

const metadata = {
  'Advanced_Kettlebell_Windmill': ['Advanced Kettlebell Windmill', ['Core'], ['Glutes', 'Hamstrings', 'Shoulders']],
  'Bent_Press': ['Bent Press', ['Core'], ['Glutes', 'Hamstrings', 'Upper back', 'Quadriceps', 'Shoulders', 'Triceps']],
  'Kettlebell_Arnold_Press': ['Kettlebell Arnold Press', ['Shoulders'], ['Triceps']],
  'Kettlebell_Dead_Clean': ['Kettlebell Dead Clean', ['Hamstrings'], ['Calves', 'Glutes', 'Upper back', 'Quadriceps']],
  'Kettlebell_Figure_8': ['Kettlebell Figure 8', ['Core'], ['Hamstrings', 'Shoulders']],
  'Kettlebell_Halo': ['Kettlebell Halo', ['Shoulders'], ['Upper back', 'Core', 'Triceps']],
  'Kettlebell_Halo_With_Overhead_Extension': ['Kettlebell Halo with Overhead Extension', ['Shoulders', 'Triceps'], ['Upper back', 'Core']],
  'Kettlebell_Hang_Clean': ['Kettlebell Hang Clean', ['Hamstrings'], ['Calves', 'Glutes', 'Upper back', 'Shoulders']],
  'Kettlebell_Overhead_Triceps_Extension': ['Kettlebell Overhead Triceps Extension', ['Triceps'], ['Shoulders', 'Core']],
  'Kettlebell_Pass_Between_The_Legs': ['Kettlebell Pass Between The Legs', ['Core'], ['Glutes', 'Hamstrings', 'Shoulders']],
  'Kettlebell_Pistol_Squat': ['Kettlebell Pistol Squat', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings', 'Shoulders']],
  'Kettlebell_Seated_Press': ['Kettlebell Seated Press', ['Shoulders'], ['Triceps']],
  'Kettlebell_Windmill': ['Kettlebell Windmill', ['Core'], ['Glutes', 'Hamstrings', 'Shoulders', 'Triceps']],
  'Lunge_Pass_Through': ['Lunge Pass Through', ['Hamstrings'], ['Calves', 'Glutes', 'Quadriceps']],
  'One-Arm_Kettlebell_Clean': ['One-Arm Kettlebell Clean', ['Hamstrings'], ['Glutes', 'Upper back', 'Shoulders']],
  'One-Arm_Kettlebell_Jerk': ['One-Arm Kettlebell Jerk', ['Shoulders'], ['Calves', 'Quadriceps', 'Triceps']],
  'One-Arm_Kettlebell_Military_Press_To_The_Side': ['One-Arm Kettlebell Military Press To The Side', ['Shoulders'], ['Triceps']],
  'One-Arm_Kettlebell_Push_Press': ['One-Arm Kettlebell Push Press', ['Shoulders'], ['Calves', 'Quadriceps', 'Triceps']],
  'One-Arm_Kettlebell_Snatch': ['One-Arm Kettlebell Snatch', ['Shoulders'], ['Calves', 'Glutes', 'Hamstrings', 'Upper back', 'Triceps']],
  'Leg-Over_Floor_Press': ['Leg-Over Floor Press', ['Chest'], ['Shoulders', 'Triceps']],
};
