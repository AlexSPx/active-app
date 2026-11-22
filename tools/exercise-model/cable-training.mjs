import { createAuthor, cues, lerp, motion, pitch, rep, roll, sides, up, v, yaw } from './barbell-standing-more.mjs';
import { openHand } from './hand-frame.mjs';
import { metadata } from './resistance-catalog.mjs';
import { bracedFoot, bracedFootPitch } from './resistance-fixtures.mjs';

export const groupLabel = 'Cable training';

const low = [0, .16, 1.08];
const high = [0, 2.20, .91];
const behind = [0, .16, -.95];
const behindHigh = [0, 2.20, -1.02];
const dual = (height, z) => [[1.02, height, z], [-1.02, height, z]];
const front = (height) => [0, height, 1.12];
const sideFeed = (height, sign = 1) => [sign * .99, height, .07];
const alternating = [[0, 'Setup'], [.29, 'First side'], [1.02, 'First peak'], [1.74, 'Center'],
  [2.45, 'Other side'], [2.72, 'Other peak'], [3.52, 'Reset']];
const signedRep = (t) => motion(alternating.map(([time]) => time), [0, 0, 1, 0, -1, -1, 0], t);
const flat = { equipment: 'bench', framing: 'floor', benchTransform: { position: [0, 0, -.22] } };
const seated = { equipment: 'bench', benchTransform: { position: [0, 0, -.43] } };
const incline = { equipment: 'incline-bench', framing: 'floor',
  benchTransform: { position: [0, 0, .03], yaw: Math.PI, angle: Math.PI / 4 } };
const onFloor = { framing: 'floor' };
const ankle = (side) => ({ bone: 'Foot' + side, offset: [0, .04, 0] });

function resistance(kind, anchors, hands = 'LR', feeds = anchors.length === 1 && kind === 'stirrup'
  ? hands.split('').map(() => anchors[0]) : anchors, support) {
  return { mode: 'cable', anchors, attachment: { kind, hands: hands.split(''), feeds }, support };
}

export function createEntries(asset, helpers) {
  const rig = createAuthor(asset, helpers, metadata);
  const { add, entries, bone, torso, stance, leg, point, arm, free, grip, world, bar } = rig;
  const setup = (kind = 'stand', lean = 0, twist = 0, side = 0) => {
    if (kind === 'kneel') {
      torso(v(0, .509, -.10), yaw(twist).multiply(pitch(lean)).multiply(roll(side)), pitch(lean * .55));
      for (const [hand, sign] of sides) leg(hand, v(sign * .145, .093, -.51), pitch(2.94), v(sign * .05, -.93, .42));
    } else if (kind === 'seat' || kind === 'row') {
      const row = kind === 'row';
      torso(v(0, .555, row ? -.17 : -.12), yaw(twist).multiply(pitch(lean)).multiply(roll(side)));
      for (const [hand, s] of sides) leg(hand, v(s * .169, row ? bracedFoot.y : .074, row ? bracedFoot.z : .34),
        pitch(row ? bracedFootPitch : 0), v(s * .13, .81, .52));
    } else if (kind === 'flat' || kind === 'incline' || kind === 'floor') {
      const bench = kind !== 'floor';
      torso(v(0, bench ? .555 : .154, -.05), pitch((kind === 'incline' ? -.78 : -Math.PI / 2) + lean));
      for (const [hand, s] of sides) {
        leg(hand, v(s * (bench ? .218 : .113), .074, bench ? .505 : .78),
          pitch(bench ? 0 : -.28), v(s * .15, 1, .14));
      }
    } else {
      torso(v(0, kind === 'split' ? .813 : .865, -.025), yaw(twist).multiply(pitch(lean)).multiply(roll(side)));
      if (kind === 'split') for (const [hand, s] of sides) leg(hand, v(s * .157, .074, s * .27), yaw(s * .15));
      else stance(.166);
    }
  };
  const rest = (side, s) => free(side, point('Arm' + side).add(v(s * .052, -.395, .121)), v(-s * .18, -.91, .24));
  const gripHand = (side, target, axis, along, pole) =>
    arm(side, target, pole, grip(side, axis.normalize(), along).hand);
  const forearmGrip = (side, target, axis, pole) =>
    arm(side, target, pole, (along) => grip(side, axis.clone().addScaledVector(along, -along.dot(axis)).normalize(), along).hand);
  const pair = (hands, pose, idle = rest) => {
    for (const [side, s] of sides) {
      if (hands.includes(side)) pose(side, s, point('Arm' + side));
      else idle(side, s);
    }
  };
  // Solve the wrist along a forearm arc with a fixed upper arm. The elbow
  // offset also serves as the IK pole, so the authored arc retains its hinge.
  function hinge(side, shoulder, upper, lower, axis) {
    const elbow = upper.clone().setLength(bone('Forearm' + side).position.length());
    const forearm = lower.clone().setLength(bone('Hand' + side).position.length() - .001);
    gripHand(side, shoulder.add(elbow).add(forearm), axis, lower, upper);
  }
  const exercise = (id, fixture, gear, start, peak, detail, pose, phases = up) =>
    add(id, phases, cues(phases, [start, 'Set your stance and take up the cable tension.'], [peak, detail],
      ['Return with control', 'Keep tension as you reverse the movement.']), pose,
    { equipment: '', fingers: gear.attachment?.hands.join('') ?? '', resistance: gear, ...fixture });

  for (const [id, kind, lean, feed, alternatingPress] of [
    ['Cable_Chest_Press', 'seat', .03, dual(1.02, -.62), false],
    ['Incline_Cable_Chest_Press', 'incline', 0, dual(.68, -.66), false],
    ['Standing_Cable_Chest_Press', 'split', .18, dual(1.20, -.71), false],
    ['Cable_Shoulder_Press', 'stand', 0, dual(.17, -.16), false],
    ['Alternating_Cable_Shoulder_Press', 'stand', -.03, dual(.17, -.16), true],
    ['Seated_Cable_Shoulder_Press', 'seat', -.09, dual(.44, -.29), false],
  ]) {
    const overhead = id.includes('Shoulder');
    const fixture = kind === 'incline' ? incline : kind === 'seat' ? seated : {};
    exercise(id, fixture, resistance('stirrup', feed), overhead ? 'Start with the handles at shoulder height' :
      'Start with the elbows bent and the handles beside the chest',
    overhead ? 'Press overhead' : 'Press forward and inward',
    alternatingPress ? 'Finish one press before lifting the other handle.' : 'Extend the elbows while keeping the rib cage steady.', (t) => {
      setup(kind, lean);
      pair('LR', (side, s, shoulder) => {
        const cycle = signedRep(t);
        const a = alternatingPress ? Math.max(0, s * cycle) : rep(up, t);
        const raise = kind === 'incline' ? .34 : .015;
        const target = overhead ? v(s * lerp(.252, .067, a), lerp(.083, .519, a), lerp(.115, .056, a))
          : v(s * lerp(.211, -.085, a), lerp(-.117, raise, a), lerp(.148, kind === 'incline' ? .367 : .525, a));
        gripHand(side, shoulder.add(target), v(-1, 0, 0), overhead ? v(s * -.13, 1, 0) :
          v(-s * .19 * a, .63 - .49 * a, .53 + .42 * a), overhead ? v(s, -.7, -.19) : v(s * .83, -.61, -.4));
      });
    }, alternatingPress ? alternating : up);
  }

  for (const [id, kind, mode, feed] of [
    ['Cable_Crossover', 'split', 'high', dual(1.93, -.57)],
    ['Low_Cable_Crossover', 'split', 'low', dual(.18, -.42)],
    ['Single-Arm_Cable_Crossover', 'split', 'alternate', dual(1.91, -.53)],
    ['Flat_Bench_Cable_Flyes', 'flat', 'flat', dual(.16, -.32)],
    ['Incline_Cable_Flye', 'incline', 'incline', dual(.16, -.55)],
    ['Cable_Rear_Delt_Fly', 'stand', 'rear', dual(1.72, .71)],
    ['Cable_Iron_Cross', 'stand', 'down', dual(2.05, .06)],
  ]) {
    const bench = kind === 'flat' || kind === 'incline';
    const reverse = mode === 'rear';
    const alternate = mode === 'alternate';
    const fixtures = kind === 'flat' ? flat : kind === 'incline' ? incline : {};
    const gear = resistance('stirrup', feed, 'LR', reverse ? [...feed].reverse() : feed);
    exercise(id, fixtures, gear, reverse ? 'Take the opposite handles with your arms crossed' : 'Set your shoulders and soften the elbows',
      reverse ? 'Open the arms to shoulder height' : mode === 'down' ? 'Sweep both arms down to your sides' : 'Sweep the handles together',
      alternate ? 'Hold one handle in front while the other arm opens, then switch.' : 'Keep the elbows softly bent throughout the arc.', (t) => {
        setup(kind, kind === 'split' ? .20 : 0);
        pair('LR', (side, s, shoulder) => {
          const a = alternate ? 1 - Math.max(0, s * signedRep(t)) : rep(up, t);
          const theta = Math.PI / 2 * (reverse ? 1 - a : a);
          const out = .516 * Math.cos(theta);
          const reach = .493 * Math.sin(theta);
          const offset = mode === 'down' ? v(s * out, -reach, .048)
            : bench ? v(s * (out - .082 * a), .04 + reach * (kind === 'incline' ? .74 : 1), reach * (kind === 'incline' ? .63 : .08))
              : v(s * (out - (reverse ? .24 : .093) * Math.sin(theta)), reverse ? .018 : mode === 'low' ? lerp(-.28, .11, a) : lerp(.014, -.24, a),
                reverse ? reach - .13 * a : .047 + reach * (mode === 'low' ? .91 : .81));
          const direction = offset.clone().normalize();
          const axis = v(s * direction.z + .022, .76, -s * direction.x);
          const wrist = shoulder.add(offset);
          const pole = bench ? v(s * .45, -.6, .55) : v(s * .15, -.87, -.34);
          if (bench || mode === 'down') forearmGrip(side, wrist, v(0, 0, 1), pole);
          else gripHand(side, wrist, axis, direction, pole);
        });
      }, alternate ? alternating : up);
  }

  for (const [id, config] of [
    ['Standing_Biceps_Cable_Curl', { grip: 'supinated', attachment: 'straight', width: .173 }],
    ['Reverse_Cable_Curl', { grip: 'pronated', attachment: 'straight', width: .185 }],
    ['Cable_Hammer_Curls_-_Rope_Attachment', { grip: 'neutral', attachment: 'rope' }],
    ['Standing_One-Arm_Cable_Curl', { grip: 'supinated', attachment: 'stirrup', hands: 'R' }],
    ['High_Cable_Curls', { grip: 'supinated', attachment: 'stirrup', high: true }],
    ['Lying_Cable_Curl', { grip: 'supinated', attachment: 'straight', kind: 'floor', width: .173 }],
    ['Lying_Close-Grip_Bar_Curl_On_High_Pulley', { grip: 'supinated', attachment: 'straight', kind: 'flat', width: .124 }],
  ]) {
    const { grip: style, attachment, hands = 'LR', kind = 'stand', high: highCurl, width } = config;
    const feed = highCurl ? dual(1.78, .08) : [kind === 'flat' ? behindHigh : kind === 'floor' ? front(.13) : low];
    exercise(id, kind === 'flat' ? flat : kind === 'floor' ? onFloor : {}, resistance(attachment, feed, hands),
      highCurl ? 'Hold the upper arms out at shoulder height' : 'Start with the working elbows extended',
      highCurl ? 'Curl toward your ears' : kind === 'flat' ? 'Curl the bar toward your chin' : 'Curl toward the chest',
      'Keep the upper arms steady and bend at the elbows.', (t) => {
        setup(kind);
        const a = rep(up, t);
        if (attachment === 'straight') {
          const flatHigh = kind === 'flat';
          const lying = kind === 'floor';
          const armDirection = flatHigh ? v(0, 1, 0) : lying ? v(0, .075, 1) : v(0, -1, .04);
          const theta = lerp(.16, flatHigh ? 2.19 : 2.37, a);
          const direction = flatHigh ? v(0, Math.cos(theta), Math.sin(theta))
            : lying ? v(0, Math.sin(theta), Math.cos(theta)) : v(0, -Math.cos(theta), Math.sin(theta));
          const shoulder = point('ArmL');
          const target = v(0, shoulder.y, shoulder.z).addScaledVector(armDirection, .274).addScaledVector(direction, .255);
          const barAxis = v(style === 'supinated' ? 1 : -1, 0, 0);
          target.add(grip('L', barAxis, direction).offset).x = 0;
          bar(target, width, direction, (s) => armDirection.clone().add(v(s * .055, 0, 0)), { underhand: style === 'supinated' });
        } else pair(hands, (side, s, shoulder) => {
          const theta = lerp(.22, 2.43, a);
          const upper = highCurl ? v(s, -.03, .12) : v(s * .05, -1, .025);
          const lower = highCurl ? v(s * Math.cos(theta), .85 * Math.sin(theta), .27 * Math.sin(theta))
            : v(0, -Math.cos(theta), Math.sin(theta));
          hinge(side, shoulder, upper, lower, highCurl ? v(0, 0, s) :
            style === 'neutral' ? v(0, Math.sin(theta), Math.cos(theta)) : v(1, 0, 0));
        });
      });
  }

  for (const [id, kind, mode, attachment, hands, width, feed] of [
    ['Triceps_Pushdown', 'stand', 'push', 'straight', 'LR', .162, high],
    ['Triceps_Pushdown_-_Rope_Attachment', 'stand', 'split', 'rope', 'LR', 0, high],
    ['Cable_One_Arm_Tricep_Extension', 'split', 'reverse', 'stirrup', 'R', 0, high],
    ['Standing_Low-Pulley_One-Arm_Triceps_Extension', 'stand', 'overhead', 'stirrup', 'L', 0, behind],
    ['Cable_Rope_Overhead_Triceps_Extension', 'stand', 'overhead', 'rope', 'LR', 0, behind],
    ['Cable_Lying_Triceps_Extension', 'flat', 'lying', 'straight', 'LR', .123, behind],
    ['Cable_Incline_Triceps_Extension', 'incline', 'incline', 'straight', 'LR', .119, behindHigh],
  ]) {
    const over = ['overhead', 'lying', 'incline'].includes(mode);
    const fixture = kind === 'flat' ? flat : kind === 'incline' ? incline : {};
    exercise(id, fixture, resistance(attachment, [feed], hands),
      over ? 'Set the upper arms and begin with the elbows bent' : 'Tuck the elbows beside your ribs',
      over ? 'Straighten the arms along the upper-arm line' : 'Extend the elbows toward your thighs',
      mode === 'split' ? 'Separate the rope ends as you approach full extension.' : 'Keep the upper arms steady.', (t) => {
        setup(kind, kind === 'stand' && !over ? .09 : 0);
        const a = rep(up, t);
        const theta = lerp(over ? 1.77 : 1.57, .13, a);
        const upper = over ? (mode === 'incline' ? v(0, .44, .9) : v(0, 1, 0)) : v(0, -1, .065);
        const lower = over ? v(0, Math.cos(theta), -Math.sin(theta)).applyQuaternion(pitch(mode === 'incline' ? 1.10 : .06))
          : v(0, -Math.cos(theta), Math.sin(theta));
        if (attachment === 'straight') {
          const shoulder = point('ArmL');
          const center = v(0, shoulder.y, shoulder.z).addScaledVector(upper, .275).addScaledVector(lower, .256);
          center.add(grip('L', v(mode === 'reverse' ? 1 : -1, 0, 0), lower).offset).x = 0;
          bar(center, width, lower, (s) => upper.clone().add(v(s * .07, 0, 0)), { underhand: mode === 'reverse' });
        } else pair(hands, (side, s, shoulder) => {
          const localUpper = upper.clone().add(v(s * (over ? -.16 : -.06), 0, 0));
          const localLower = lower.clone().add(v(s * (mode === 'split' ? lerp(-.43, .30, a) :
            over ? -.09 : 0), 0, 0));
          const axis = mode === 'reverse' ? v(1, 0, 0) :
            attachment === 'rope' ? v(.12, localLower.z, -localLower.y) : v(-1, 0, 0);
          hinge(side, shoulder, localUpper, localLower, axis);
        });
      });
  }

  for (const [id, kind, attachment, hands, width, end, underhand] of [
    ['Wide-Grip_Lat_Pulldown', 'seat', 'straight', 'LR', .381, 'chest', false],
    ['Wide-Grip_Pulldown_Behind_The_Neck', 'seat', 'straight', 'LR', .361, 'neck', false],
    ['Underhand_Cable_Pulldowns', 'seat', 'straight', 'LR', .203, 'chest', true],
    ['V-Bar_Pulldown', 'seat', 'neutral', 'LR', 0, 'chest', false],
    ['One_Arm_Lat_Pulldown', 'seat', 'stirrup', 'R', 0, 'side', false],
    ['Full_Range-Of-Motion_Lat_Pulldown', 'stand', 'stirrup', 'LR', 0, 'arc', false],
    ['Straight-Arm_Pulldown', 'stand', 'straight', 'LR', .251, 'hip', false],
    ['Rope_Straight-Arm_Pulldown', 'split', 'rope', 'LR', 0, 'hip', false],
  ]) {
    const arc = end === 'arc';
    const straightArm = end === 'hip';
    const behindHead = end === 'neck';
    const feed = arc ? dual(2.26, .11) : [[0, kind === 'stand' && straightArm ? 2.12 : 1.99, straightArm ? 1.00 : .75]];
    const support = behindHead ? 'knees-behind' : kind === 'seat' ? 'knees' : undefined;
    exercise(id, kind === 'seat' ? seated : {}, resistance(attachment, feed, hands,
      arc ? [...feed].reverse() : behindHead ? [[0, 1.99, -.36]] : undefined, support),
    straightArm ? 'Reach forward from a small hip hinge' : 'Reach up to the attachment',
    straightArm ? 'Sweep the attachment toward your hips' : end === 'neck' ? 'Pull the bar behind the head' : 'Draw your elbows down',
    arc ? 'Open the crossed handles into a wide arc, then rotate into a neutral grip.' :
      straightArm ? 'Maintain a small, fixed elbow bend.' : 'Keep your feet steady and control the return.', (t) => {
      const a = rep(up, t);
      setup(kind, straightArm ? .49 : end === 'neck' ? .13 : end === 'arc' ? .04 : -.14 - .06 * a);
      if (straightArm) {
        const theta = lerp(1.42, -.22, a);
        const dir = v(0, -Math.cos(theta), Math.sin(theta));
        const mid = point('ArmL');
        if (attachment === 'straight') bar(v(0, mid.y, mid.z).addScaledVector(dir, .49),
          width, dir, (s) => v(s * .15, -.11, -.9));
        else pair(hands, (side, s, shoulder) =>
          gripHand(side, shoulder.addScaledVector(dir, .484).add(v(s * lerp(-.087, .087, a), 0, 0)),
            v(.3, Math.sin(theta), Math.cos(theta)), dir, v(s * .46, -.28, -.75)));
      } else if (attachment === 'straight') {
        const shoulder = point('ArmL');
        const wide = width > .3;
        const reach = wide ? .461 : .52;
        const target = v(0, shoulder.y + lerp(reach, behindHead ? .11 : -.065, behindHead ? Math.max(0, (a - .27) / .73) : a),
          shoulder.z + (behindHead ? -.155 : lerp(.20, .255, a)));
        bar(target, width, v(0, .72 + .27 * (1 - a), .5 * a), (s) => v(s * .67, -.89, end === 'neck' ? -.56 : -.13), { underhand });
      } else pair(hands, (side, s, shoulder) => {
        const target = arc
          ? v(s * (-.31 * (1 - a) + .188 * Math.sin(Math.PI * a) + .05 * a), lerp(.393, -.095, a), lerp(.196, .105, a))
          : v(s * lerp(end === 'side' ? .05 : -.128, end === 'side' ? .084 : -.145, a),
            lerp(.515, -.095, a), lerp(.13, end === 'side' ? .166 : .276, a));
        const axis = arc ? v(-1 + .98 * a, .10, s * a) : attachment === 'neutral' ? v(0, .12, s) : v(-1, 0, 0);
        gripHand(side, shoulder.add(target), axis, v(s * .15, 1, .19 * a),
          attachment === 'neutral' ? v(s * .30, -.90, .25) : v(s * .81, -.91, -.34));
      });
    });
  }

  for (const [id, kind, mode, attachment, hands, feed] of [
    ['Seated_Cable_Rows', 'row', 'low', 'neutral', 'LR', front(.18)],
    ['Seated_One-arm_Cable_Pulley_Rows', 'row', 'low', 'stirrup', 'R', front(.18)],
    ['Cable_Rope_Rear-Delt_Rows', 'row', 'high', 'rope', 'LR', front(.20)],
    ['Shotgun_Row', 'split', 'shotgun', 'stirrup', 'R', front(.20)],
    ['Kneeling_High_Pulley_Row', 'kneel', 'low', 'rope', 'LR', high],
    ['Kneeling_Single-Arm_High_Pulley_Row', 'kneel', 'low', 'stirrup', 'R', high],
    ['Face_Pull', 'stand', 'face', 'rope', 'LR', front(1.68)],
  ]) {
    exercise(id, kind === 'row' ? seated : kind === 'kneel' ? onFloor : {},
      resistance(attachment, [feed], hands, undefined, kind === 'row' ? 'feet' : undefined),
      'Start with the working arms reaching toward the pulley',
      mode === 'face' ? 'Pull the rope toward the eyes' : mode === 'high' ? 'Pull toward the upper chest' : 'Row the handle toward your ribs',
      mode === 'shotgun' ? 'Turn your palm upward as your working elbow travels back.' :
        mode === 'face' || mode === 'high' ? 'Lead with high elbows and separate the rope ends.' : 'Draw the shoulder blades back before finishing the pull.', (t) => {
        const a = rep(up, t);
        const bent = mode === 'low' || mode === 'shotgun';
        setup(kind, kind === 'row' ? lerp(.13, -.04, a) : kind === 'split' ? .26 - .09 * a : -.04,
          hands === 'R' ? lerp(.13, -.115, a) : 0);
        pair(hands, (side, s, shoulder) => {
          const wide = mode === 'high' || mode === 'face';
          const target = v(s * lerp(wide ? -.067 : hands === 'R' ? -.02 : -.15, wide ? .020 :
            hands === 'R' ? .041 : -.146, a), lerp(kind === 'kneel' ? .35 : mode === 'face' ? .03 : -.09,
            mode === 'face' ? .103 : wide ? -.031 : -.27, a), lerp(kind === 'kneel' ? .395 : .502, bent ? .144 : .192, a));
          const axis = mode === 'shotgun' ? v(a, 1 - a, .052) : attachment === 'neutral' ? v(.11, 1, 0)
            : attachment === 'rope' ? v(wide ? .28 + .55 * a : .20, 1 - .55 * a, .10) : v(.1, 1, .08);
          const wrist = shoulder.add(target);
          if (kind === 'kneel') forearmGrip(side, wrist, v(1, .22, 0), v(s * .42, -.72, -.6));
          else gripHand(side, wrist, axis, v(s * .13, bent ? -.31 : .16, .95),
            wide ? v(s, .12, -.39) : v(s * .36, -.73, -.88));
        });
      });
  }

  for (const [id, kind, mode, side, feed] of [
    ['Bent_Over_Low-Pulley_Side_Lateral', 'split', 'rear', 'R', sideFeed(.16, 1)],
    ['Front_Cable_Raise', 'stand', 'front', 'L', behind],
    ['Standing_Low-Pulley_Deltoid_Raise', 'stand', 'side', 'L', sideFeed(.19, -1)],
    ['Cable_Internal_Rotation', 'sit', 'internal', 'R', sideFeed(.24, -1)],
    ['External_Rotation_with_Cable', 'stand', 'external', 'R', sideFeed(1.08, 1)],
    ['One-Arm_High-Pulley_Cable_Side_Bends', 'stand', 'bend', 'R', sideFeed(2.14, -1)],
  ]) {
    const rotate = ['internal', 'external'].includes(mode);
    exercise(id, kind === 'sit' ? onFloor : {}, resistance('stirrup', [feed], side),
      rotate ? 'Brace your working elbow against your side' :
        mode === 'bend' ? 'Hold the handle at shoulder height' : 'Set the working shoulder with a long arm',
      rotate ? 'Rotate the forearm around the tucked elbow' : mode === 'bend' ? 'Bend sideways away from the pulley' :
        mode === 'front' ? 'Raise the handle in front of you' : 'Raise the working arm to the side',
      rotate ? 'Keep the elbow at 90 degrees and resist turning your torso.' :
        mode === 'bend' ? 'Keep the handle beside your shoulder and the hips level.' : 'Lift without swinging the torso.', (t) => {
        const a = rep(up, t);
        if (kind === 'sit') {
          torso(v(0, .144, -.03));
          for (const [hand, s] of sides) leg(hand, v(s * .143, .079, .758), pitch(-.15), v(s * .05, 1, .02));
        } else setup(kind, mode === 'rear' ? 1.04 : .02, 0, mode === 'bend' ? -.34 * a : 0);
        pair(side, (hand, s, shoulder) => {
          if (rotate) {
            const angle = lerp(.99, -.99, a) * (mode === 'internal' ? 1 : -1);
            hinge(hand, shoulder, v(s * -.06, -1, .06), v(s * Math.sin(angle), .04, Math.cos(angle)), v(0, 1, .03));
          } else if (mode === 'bend') {
            hinge(hand, shoulder, v(s * .20, -1, .17), v(s * .12, 1, .61), v(1, 0, .08));
          } else {
            const angle = lerp(mode === 'side' ? -.48 : .05, mode === 'rear' ? 1.49 : 1.53, a);
            const direction = mode === 'front' ? v(-s * .09, -Math.cos(angle), Math.sin(angle))
              : v(s * Math.sin(angle), -Math.cos(angle), mode === 'rear' ? -.13 * a : .22 * (1 - a));
            gripHand(hand, shoulder.addScaledVector(direction, .491),
              mode === 'front' ? v(-1, 0, 0) : v(0, .42, -s), direction, v(s * .30, -.91, -.42));
          }
        }, (hand, s) => {
          if (mode === 'rear') free(hand, point('Shin' + hand).add(v(s * .045, .11, .015)), v(0, -1, .22));
          else rest(hand, s);
        });
      });
  }

  for (const [id, mode] of [['Cable_Deadlifts', 'deadlift'], ['Cable_Shrugs', 'shrug'], ['Upright_Cable_Row', 'row'],
    ['Cable_Incline_Pushdown', 'incline'], ['Pull_Through', 'pull']]) {
    const dead = mode === 'deadlift';
    const pull = mode === 'pull';
    const inclined = mode === 'incline';
    const kind = inclined ? 'incline' : 'stand';
    const feeds = dead ? dual(.16, -.06) : [pull ? behind : inclined ? behindHigh : low];
    const gear = resistance(dead ? 'stirrup' : pull ? 'rope' : 'straight', feeds);
    const labels = { deadlift: ['Set your feet between the low pulleys', 'Stand up with long arms', 'Drive through the floor and extend your hips and knees.'],
      shrug: ['Hold the bar in front of your thighs', 'Raise only your shoulders', 'Keep your elbows extended and lift the shoulders straight up.'],
      row: ['Start with the bar just in front of your thighs', 'Lead upward with the elbows', 'Keep the bar close to your trunk.'],
      incline: ['Set your back against the incline', 'Arc the bar overhead, then draw it back to your thighs', 'Keep a soft bend in the elbows as the shoulders move.'],
      pull: ['Face away and straddle the low cable', 'Drive the hips forward', 'Let the rope follow the hinge with straight arms.'] };
    exercise(id, inclined ? incline : {}, gear, ...labels[mode], (t) => {
      const a = rep(up, t);
      const bend = 1 - a;
      if (dead || pull) {
        torso(v(0, .865 - (dead ? .326 : .125) * bend, -(dead ? .125 : .28) * bend),
          pitch((dead ? .49 : 1.06) * bend), pitch(.16 * bend));
        stance(dead ? .19 : .235);
        pair('LR', (hand, s, shoulder) => {
          const dir = pull ? v(-s * .30, -.9 + .42 * bend, -.65 * bend + .145) : v(s * .17, -1, -.16 * bend);
          gripHand(hand, shoulder.addScaledVector(dir.normalize(), dead ? .522 : .487), pull ? v(.1, .1, 1) : v(0, 0, s), dir,
            v(s * .15, -.28, -.92));
        });
      } else {
        setup(kind);
        const shoulder = point('ArmL');
        let center;
        let direction;
        let width = .179;
        let pole = (s) => v(s * .25, -1, -.06);
        if (mode === 'shrug') {
          for (const [hand, s] of sides) bone('Arm' + hand).position.add(v(-s * .009 * a, .078 * a, 0));
          center = v(0, shoulder.y - .535 + .078 * a, .126);
          direction = v(0, -1, .07);
        } else if (mode === 'row') {
          center = v(0, lerp(.783, 1.356, a), lerp(.166, .19, a));
          width = .145;
          direction = v(0, -1, .13);
          pole = (s) => v(s * .91, a - .43, -.13);
        } else {
          const angle = lerp(-2.03, .91, a);
          direction = v(0, Math.cos(angle), -Math.sin(angle));
          center = v(0, shoulder.y, shoulder.z).addScaledVector(direction, .487);
          width = .218;
          pole = (s) => v(s * .27, .14, -.72);
        }
        bar(center, width, direction, pole);
      }
    });
  }

  for (const [id, kind, mode] of [
    ['Cable_Crunch', 'kneel', 'spine'], ['Kneeling_Cable_Crunch_With_Alternating_Oblique_Twists', 'kneel', 'twist'],
    ['Cable_Seated_Crunch', 'seat', 'spine'], ['Standing_Rope_Crunch', 'stand', 'spine'],
  ]) {
    const alternate = mode === 'twist';
    const feed = kind === 'kneel' ? high : behindHigh;
    exercise(id, kind === 'seat' ? seated : kind === 'kneel' ? onFloor : {}, resistance('rope', [feed]),
      'Hold the rope ends close to your head or shoulders', alternate ? 'Curl toward alternating knees' : 'Curl your rib cage toward your pelvis',
      'Let the spine flex while the hips stay steady.', (t) => {
        const a = alternate ? signedRep(t) : rep(up, t);
        const flex = Math.abs(a);
        setup(kind, kind === 'kneel' ? .20 : -.07);
        const base = kind === 'kneel' ? .20 : -.07;
        world('Lumbar', yaw(alternate ? a * .18 : 0).multiply(pitch(base + .64 * flex)));
        world('Chest', yaw(alternate ? a * .39 : 0).multiply(pitch(base + 1.15 * flex)));
        world('Head', yaw(alternate ? a * .42 : 0).multiply(pitch(base + 1.28 * flex)));
        pair('LR', (hand, s, shoulder) => {
          const direction = v(-s * .09, .95, -.24);
          gripHand(hand, point(kind === 'stand' ? 'Chest' : 'Head')
            .add(v(s * .154, kind === 'stand' ? .057 : -.049, .086 + .055 * flex)), v(.09, .32, 1), direction, v(s * .38, -.73, .84));
        });
      }, alternate ? alternating : up);
  }

  for (const [id, mode, feed] of [
    ['Pallof_Press', 'press', sideFeed(1.25)], ['Pallof_Press_With_Rotation', 'rotate', sideFeed(1.25)],
    ['Standing_Cable_Lift', 'lift', sideFeed(.17)], ['Standing_Cable_Wood_Chop', 'chop', sideFeed(1.98)],
    ['Cable_Judo_Flip', 'flip', sideFeed(.17)],
  ]) {
    const flip = mode === 'flip';
    const press = mode === 'press' || mode === 'rotate';
    const gear = resistance(flip ? 'rope' : 'shared', [feed]);
    const peaks = { press: 'Press straight ahead and resist rotation', rotate: 'Press out, then rotate away from the tower',
      lift: 'Sweep from the near hip to above the opposite shoulder', chop: 'Draw the handle down across the body',
      flip: 'Bring the rope over your shoulder and then down' };
    const turning = [[0, 'Setup'], [.34, 'Extend'], [1.04, 'Turn'], [1.67, 'Unwind'], [2.35, 'Retract'], [3.4, 'Reset']];
    const flipping = [[0, 'Setup'], [.25, 'Turn'], [.84, 'Rope over shoulder'], [1.4, 'Crunch'], [1.85, 'Return'], [3.35, 'Reset']];
    exercise(id, {}, gear, press ? 'Stand side-on with the handle at your chest' : 'Take the handle with both hands in a wide stance',
      peaks[mode], flip ? 'Shift your weight as the chest turns and flexes.' : 'Move under control around your stance.', (t) => {
        const a = rep(up, t);
        const extension = mode === 'rotate' ? motion([0, .28, .86, 2.03, 3.22], [0, 0, 1, 1, 0], t) : a;
        const rotation = mode === 'rotate' ? motion([0, .84, 1.49, 1.84, 2.31, 3.4], [0, 0, 1, 1, 0, 0], t) : a;
        const turn = press ? (mode === 'rotate' ? -.69 * rotation : 0) : lerp(.55, -.68, a);
        const shift = press ? 0 : lerp(.11, -.13, a);
        torso(v(shift, press ? .849 : .784 + (mode === 'lift' ? .054 : -.07) * a, -.02), yaw(press ? 0 : turn)
          .multiply(pitch(flip ? .12 + .78 * a : mode === 'chop' ? .30 * a : .025)));
        if (mode === 'rotate') {
          world('Lumbar', yaw(turn * .38));
          world('Chest', yaw(turn));
          world('Head', yaw(turn));
        }
        for (const [hand, s] of sides) leg(hand, v(s * (press ? .182 : .261), .074, s * .09),
          yaw((press ? 0 : turn) * .58 + s * .18));
        const z = .23 + .29 * extension;
        const bend = flip ? Math.sin(Math.PI * a) : 0;
        const target = press ? v(0, -.015, z) : mode === 'lift' ? v(lerp(.10, -.16, a), lerp(-.32, .41, a), .29 + .08 * a)
          : mode === 'chop' ? v(lerp(.12, -.12, a), lerp(.43, -.36, a), .33)
            : v(-.20 * bend, lerp(-.32, -.28, a) + .76 * bend, .33 - .05 * bend);
        const center = point('Chest').add(target.applyQuaternion(yaw(turn)));
        if (flip) {
          const frame = yaw(turn);
          pair('LR', (hand, s) => {
            const wrist = center.clone().add(v(s * .095, 0, 0).applyQuaternion(frame));
            forearmGrip(hand, wrist, v(0, -.22, 1).applyQuaternion(frame),
              v(s * .40, -.65, .75).applyQuaternion(frame));
          });
        }
        else bar(center, .072, v(0, .07, 1).applyQuaternion(yaw(turn)),
          (s) => mode === 'lift' ? v(s * .30, -.90, -.35) : v(s * .8, -.65, -.15),
          { frame: yaw(turn).multiply(roll(.64)) });
      }, mode === 'rotate' ? turning : flip ? flipping : up);
  }

  for (const [id, mode, feed] of [
    ['Cable_Hip_Adduction', 'adduct', sideFeed(.16, -1)], ['One-Legged_Cable_Kickback', 'kick', [0, .15, .71]],
    ['Cable_Reverse_Crunch', 'reverse', front(.39)],
  ]) {
    const reverse = mode === 'reverse';
    const kick = mode === 'kick';
    const gear = { mode: 'cable', anchors: [feed], links: reverse ? [[feed, ankle('L')], [feed, ankle('R')]] : [[feed, ankle('R')]],
      support: kick ? 'hands' : undefined };
    exercise(id, reverse ? onFloor : kick ? { fingers: 'LR' } : {}, gear, reverse ? 'Lie back with both ankles cuffed' :
      kick ? 'Grip the frame with the working ankle cuffed' : 'Set your balance with the working ankle cuffed',
      reverse ? 'Curl your knees toward your torso' : mode === 'kick' ? 'Sweep the working leg back' : 'Draw the working leg across your midline',
      reverse ? 'Roll the pelvis up without pushing through your arms.' : 'Keep your pelvis square and move from the working hip.', (t) => {
        const a = rep(up, t);
        if (reverse) {
          torso(v(0, .151 + .12 * a, -.04 - .065 * a), pitch(-Math.PI / 2 - .48 * a), pitch(-Math.PI / 2));
          world('Lumbar', pitch(-Math.PI / 2 + .22 * a));
          world('Chest', pitch(-Math.PI / 2));
          for (const [hand, s] of sides) {
            leg(hand, v(s * .12, lerp(.379, .478, a), lerp(.48, .19, a)), pitch(-.22 + .47 * a), v(s * .10, 1, -.14));
            const wrist = point('Head').add(v(s * .146, .062, .073));
            arm(hand, wrist, v(s, .58, .22), openHand(s, v(-s, .18, -.27), v(0, -1, 0)));
          }
        } else {
          torso(v(.105, .843, kick ? -.072 : 0), pitch(kick ? .30 : 0));
          leg('L', v(.205, .074, .03), yaw(.12));
          leg('R', kick ? v(-.115, lerp(.11, .253, a), lerp(.01, -.48, a))
            : v(lerp(-.33, .078, a), .088 + .05 * a, lerp(.022, .18, a)),
          pitch(kick ? .45 * a : 0), v(-.13, 0, 1));
          if (kick) bar(v(0, .99, .566), .135, v(0, .18, 1), (s) => v(s * .24, -.91, -.18));
          else for (const [hand, s] of sides) {
            const target = hand === 'R' ? v(-.40, 1.14, .18) : point('ArmL').add(v(.08, -.38, .08));
            free(hand, target, v(-s * .19, -.54, .55));
          }
        }
      });
  }
  return entries;
}
