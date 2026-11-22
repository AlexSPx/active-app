import {
  X, ankleHeight, createAuthor, cues, down, frameFromDown, lerp, motion, pitch, rep, roll, sides, up, v, yaw,
} from './barbell-standing-more.mjs';
import { metadata } from './catalog-more.mjs';

export const groupLabel = 'Kettlebell pairs and combinations';
const pair = { equipment: 'two-kettlebells' };
const single = { equipment: 'kettlebell', fingers: 'R' };
const split = [[0, 'Set up'], [.80, 'Right side'], [1.58, 'Reset'], [2.38, 'Left side'], [3.35, 'Reset']];
const below = v(0, -1, 0);

export function createEntries(asset, helpers) {
  const { add, entries, torso, stance, leg, arm, grip, free, point, bone, armLength } =
    createAuthor(asset, helpers, metadata);
  const upperArmLength = bone('ForearmL').position.length();
  const forearmLength = bone('HandL').position.length();
  function hold(side, center, axis, bellDown, direction, pole) {
    const { hand, offset } = grip(side, axis, direction);
    const shoulder = point('Arm' + side);
    const delta = center.clone().sub(offset).sub(shoulder);
    if (delta.length() > armLength - .001) center = shoulder.add(delta.setLength(armLength - .001)).add(offset);
    arm(side, center.clone().sub(offset), pole, hand);
    return [center, frameFromDown(axis, bellDown)];
  }
  const two = (pose) => {
    const [right, left] = [sides[1], sides[0]].map(([side, sign]) => pose(side, sign));
    return [...right, undefined, left];
  };
  const form = (phases, setup, motion) => cues(phases, setup, motion,
    ['Reset with control', 'Keep your grip and bring the bells back to the starting position.']);
  const elbow = (sign) => v(sign * .75, -.61, -.29);
  const alternate = (s, t) => motion(split.map(([time]) => time), [0, s < 0 ? 1 : 0, 0, s > 0 ? 1 : 0, 0], t);

  for (const [id, type] of [
    ['Two-Arm_Kettlebell_Military_Press', 'press'], ['Alternating_Kettlebell_Press', 'alternate'],
    ['Kettlebell_Seesaw_Press', 'seesaw'], ['Double_Kettlebell_Push_Press', 'push'],
    ['Double_Kettlebell_Jerk', 'jerk'], ['Two-Arm_Kettlebell_Jerk', 'double-jerk'],
    ['Kettlebell_Thruster', 'thruster'], ['Front_Squats_With_Two_Kettlebells', 'squat'],
  ]) {
    const alt = type === 'alternate' || type === 'seesaw';
    const squat = type === 'squat';
    const splitJerk = type === 'jerk';
    const jerk = splitJerk || type === 'double-jerk';
    const drive = type === 'push' || jerk || type === 'thruster';
    const driveTimes = [0, .43, .75, 1.15, 1.52, 1.95, 3.35];
    const phases = alt ? split : drive ? [[0, 'Rack'], [.43, type === 'thruster' ? 'Squat' : 'Dip'], [.75, 'Drive'],
      [1.15, jerk ? 'Catch' : 'Lockout'], [1.52, 'Stand'], [1.95, 'Lower'], [3.35, 'Rack']] : squat ? down : up;
    add(id, phases, form(phases, ['Rack both bells at the shoulders', 'Keep your elbows under the bells.'],
      [squat ? 'Sit between your feet' : jerk ? splitJerk ? 'Drive and receive in a split stance' : 'Drive and receive on soft knees'
        : type === 'thruster' ? 'Stand out of the squat and press' : alt ? 'Press one side at a time' : 'Press overhead',
      squat ? 'Keep your heels planted and your torso tall.' : 'Finish each working arm straight with the wrist stacked.']), (t) => {
      const a = drive || alt ? 0 : rep(phases, t);
      const dip = squat ? .36 * a : drive ? motion(driveTimes,
        [0, type === 'thruster' ? .365 : .125, 0, jerk ? (type === 'jerk' ? .13 : .176) : 0, 0, 0, 0], t) : 0;
      const balance = type === 'seesaw' ? alternate(-1, t) - alternate(1, t) : 0;
      torso(v(0, .863 - dip, -.31 * dip), pitch(.04 + .68 * dip).multiply(roll(-.19 * balance)));
      if (splitJerk) {
        const shift = motion(driveTimes, [0, 0, .12, 1, 0, 0, 0], t);
        for (const [side, s] of sides) leg(side, v(s * .17, ankleHeight + (s < 0 ? .086 * shift : 0),
          (s > 0 ? .36 : -.43) * shift), s < 0 ? pitch(.72 * shift) : yaw(.14));
      } else {
        stance(squat || type === 'thruster' ? .207 : .164);
      }
      return two((side, s) => {
        const amount = squat ? 0 : type === 'seesaw'
          ? s < 0 ? .5 + .5 * balance : .5 - .5 * balance
          : alt ? alternate(s, t)
            : drive ? motion(driveTimes, [0, 0, .45, 1, 1, 1, 0], t) : a;
        const shoulder = point('Arm' + side);
        const center = shoulder.add(v(s * lerp(.064, .10, amount), lerp(.055, .586, amount), lerp(.245, .051, amount)));
        const axis = X.clone().negate().applyQuaternion(yaw(s * lerp(-1.03, .06, amount)));
        return hold(side, center, axis, v(s * .56, -.64, -.42 - .25 * amount), v(0, 1, .08), elbow(s));
      });
    }, pair);
  }

  for (const [id, mode] of [
    ['Alternating_Hang_Clean', 'alternating'], ['Double_Kettlebell_Alternating_Hang_Clean', 'switch'],
    ['Double_Kettlebell_Snatch', 'snatch'], ['Two-Arm_Kettlebell_Clean', 'clean'],
    ['One-Arm_Kettlebell_Clean_and_Jerk', 'combo'], ['One-Arm_Kettlebell_Split_Jerk', 'split-jerk'],
    ['One-Arm_Kettlebell_Split_Snatch', 'split-snatch'],
  ]) {
    const lone = mode === 'combo' || mode.startsWith('split-');
    const alt = mode === 'alternating' || mode === 'switch';
    const snapped = mode.endsWith('snatch');
    const startsInRack = mode === 'split-jerk';
    const splits = mode.startsWith('split-');
    const times = [0, .34, .69, 1.08, 1.52, 1.88, 2.16, 2.58, 2.92, 3.60, 4];
    const switching = mode === 'switch';
    const exchange = [[0, 'Right bell racked'], [.32, 'Exchange'], [1.32, 'Left bell racked'],
      [1.72, 'Exchange'], [2.72, 'Right bell racked'], [3.35, 'Reset']];
    const phases = switching ? exchange : alt ? split : [[0, startsInRack ? 'Rack' : 'Hang'], [.34, 'Load'], [.69, 'Drive'],
      [1.08, snapped || startsInRack ? 'Catch overhead' : 'Rack'],
      ...(mode === 'combo' ? [[1.52, 'Dip'], [1.88, 'Catch overhead'], [2.16, 'Recover']] : [[1.52, 'Recover']]),
      [2.58, 'Return'], [3.60, 'Reset']];
    add(id, phases, [[0, switching ? 'Rack the right bell and let the left bell hang'
      : startsInRack ? 'Start with the bell at your shoulder' : 'Hold the bells below your hips',
      'Brace your trunk and keep the handle secure.'],
    [switching ? 1.32 : alt ? .80 : .69, switching ? 'Switch the bells in one motion'
      : alt ? 'Drive one bell into the rack' : 'Extend the hips and guide the bell upward',
      'Keep the path close and let the handle turn in your hand.'],
    [switching ? 2.72 : alt ? 2.38 : mode === 'combo' ? 1.88 : 1.08, splits ? 'Receive in a split stance'
      : snapped || mode === 'combo' ? 'Receive with your elbow straight' : 'Finish with the forearm under the bell',
    splits ? 'Recover the feet before lowering.' : 'Return along the same path under control.']], (t) => {
      const blend = (values) => motion(times, values, t);
      const hinge = switching ? motion([0, .32, .82, 1.32, 1.72, 2.22, 2.72], [0, 0, .68, 0, 0, .68, 0], t)
        : alt ? motion([0, .35, .80, 1.58, 1.93, 2.38, 3.35], [.62, 1, 0, .62, 1, 0, .62], t) :
        blend([startsInRack ? 0 : .3, 1, 0, .15, mode === 'combo' ? .35 : 0, 0, 0, 0, .35,
          startsInRack ? 0 : .3, startsInRack ? 0 : .3]);
      const stagger = splits ? blend([0, 0, .3, 1, 0, 0, 0, 0, 0, 0, 0]) : 0;
      torso(v(0, .858 - .181 * hinge - .178 * stagger, -.22 * hinge), pitch(.04 + (startsInRack ? .10 : .72) * hinge));
      for (const [side, s] of sides) leg(side, v(s * .171, ankleHeight + (s < 0 ? .091 * stagger : 0),
        (s > 0 ? .35 : -.50) * stagger), pitch(s < 0 ? .72 * stagger : 0));
      const leftRack = switching ? motion(exchange.map(([time]) => time), [0, 0, 1, 1, 0, 0], t) : 0;
      function path(side, s) {
        const rising = switching ? (s < 0 ? 1 - leftRack : leftRack) : alt ? alternate(s, t)
          : startsInRack ? 1 : blend([0, 0, .54, 1, 1, 1, 1, 1, .46, 0, 0]);
        const top = alt ? 0 : snapped ? rising : startsInRack ? blend([0, 0, .45, 1, 1, 1, 1, 1, .38, 0, 0])
          : mode === 'combo' ? blend([0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0]) : 0;
        const shoulder = point('Arm' + side);
        const rack = shoulder.clone().add(v(s * .075, lerp(.055, .595, top), lerp(.216, .054, top)));
        const hang = v(s * .19, .685 - .322 * hinge, .155 - .245 * hinge);
        const center = hang.lerp(rack, rising);
        const axis = X.clone().negate().applyQuaternion(yaw(lerp(-s * .10, -s * .96, rising * (1 - top))));
        const turnover = lerp(.13, Math.PI - .13, rising);
        return hold(side, center, axis, v(s * .60 * rising, -1, -.78 * rising),
          v(0, -Math.cos(turnover), Math.sin(turnover)), v(s * .56, -.65, -.92));
      }
      if (!lone) return two(path);
      const shoulder = point('ArmL');
      free('L', shoulder.add(v(.16, -.45, -.12 * hinge)), v(.24, -1, -.2));
      return path('R', -1);
    }, { ...(lone ? single : pair), duration: alt ? 3.6 : 4 });
  }

  const floor = { framing: 'floor' };
  for (const [id, style] of [
    ['Alternating_Floor_Press', 'floor'], ['Alternating_Kettlebell_Row', 'row'], ['Alternating_Renegade_Row', 'plank'],
  ]) {
    const onBack = style === 'floor';
    const plank = style === 'plank';
    const phases = split;
    add(id, phases, [[0, onBack ? 'Lie down with both bells in the rack' : plank ? 'Set a wide plank over the handles'
      : 'Hinge forward with both bells hanging', 'Brace your trunk and keep your neck neutral.'],
    [.80, onBack ? 'Press the right bell' : 'Row the right bell toward your ribs',
    plank ? 'Keep the other bell planted and your hips square.' : 'Keep the shoulder controlled as the elbow moves.'],
    [2.38, 'Repeat on the left', 'Bring both bells back under control.']], (t) => {
      const hip = onBack ? v(0, .142, 0) : plank ? v(0, .49, -.08) : v(0, .716, -.28);
      torso(hip, pitch(onBack ? -1.57 : plank ? 1.66 : 1.01), pitch(onBack ? -1.53 : plank ? 1.05 : .34));
      for (const [side, s] of sides) {
        leg(side, v(s * (plank ? .265 : .165), onBack ? .074 : plank ? .203 : .074,
          onBack ? .48 : plank ? -.80 : .05), plank ? pitch(1.04) : yaw(s * .12));
      }
      return two((side, s) => {
        const a = alternate(s, t);
        const shoulder = point('Arm' + side);
        if (onBack) {
          const upper = v(s * lerp(.94, .13, a), lerp(-.34, 1, a), -.05).normalize();
          const lower = v(-s * lerp(.10, .02, a), 1, lerp(.13, -.02, a)).normalize();
          const wrist = shoulder.addScaledVector(upper, upperArmLength).addScaledVector(lower, forearmLength);
          const turn = a * Math.PI / 2;
          const axis = v(-Math.sin(turn), 0, -s * Math.cos(turn));
          const { hand, offset } = grip(side, axis, lower);
          arm(side, wrist, upper, hand, true);
          return [wrist.add(offset), frameFromDown(axis, v(s * Math.cos(turn), -.32, -Math.sin(turn)))];
        }
        const center = plank ? v(s * .253, lerp(.254, .55, a), lerp(.46, .12, a))
          : shoulder.add(v(s * .08, lerp(-.55, -.19, a), lerp(.06, -.27, a)));
        return hold(side, center, X.clone().negate().applyQuaternion(yaw(s * 1.32)),
          below, v(0, -1, .27), v(s * .3, .64, -1));
      });
    }, { ...pair, ...(onBack || plank ? floor : {}) });
  }
  return entries;
}
