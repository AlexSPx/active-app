import { createAuthor, cues, lerp, motion, pitch, rep, roll, sides, up, v, yaw } from './barbell-standing-more.mjs';
import { metadata } from './supplemental-catalog.mjs';
import { bracedFoot, bracedFootPitch } from './resistance-fixtures.mjs';

export const groupLabel = 'Cable accessories and support';
const low = [0, .16, 1.05];
const high = [0, 2.16, .85];
const rearHigh = [0, 1.91, -.96];
const seat = { equipment: 'bench', benchTransform: { position: [0, 0, -.45] } };
const elbows = (s) => v(s * .45, -1, -.15);
const stable = { kind: 'ball', size: .30, position: [0, .30, -.29] };
const preacher = { ...seat, fixtures: [{ kind: 'preacher', position: [0, .751, .225] }] };

export function createEntries(asset, helpers) {
  const { add, entries, bar, torso, leg, stance, arm, grip, point, bone, world } = createAuthor(asset, helpers, metadata);
  const exercise = (id, kind, anchors, setup, action, pose, options = {}, phases = up) => add(id, phases,
    cues(phases, setup, action, ['Return with control', 'Keep tension on the attachment as you reset.']), pose, {
      equipment: '', resistance: { mode: 'cable', anchors, attachment: { kind, hands: ['L', 'R'], feeds: anchors } },
      ...options,
    });
  function sit(y = .55, z = -.075, reach = .32, footY = .074, lean = .02, footPitch = 0) {
    torso(v(0, y, z), pitch(lean));
    for (const [side, s] of sides) leg(side, v(s * .181, footY, reach), pitch(footPitch), v(s * .12, .84, .56));
  }
  function hold(side, wrist, direction, axis, pole) {
    arm(side, wrist, pole, grip(side, axis.normalize(), direction).hand);
  }

  exercise('Seated_Two-Arm_Palms-Up_Low-Pulley_Wrist_Curl', 'straight', [low],
    ['Rest your forearms on your thighs', 'Take a palms-up grip with your wrists just past the knees.'],
    ['Curl through the wrists', 'Keep your forearms against your thighs as the bar rolls toward you.'], (t) => {
      const a = rep(up, t);
      sit(.55, -.09, .37, .074, .43);
      const angle = lerp(-.61, .9, a);
      const direction = v(0, Math.sin(angle), Math.cos(angle));
      for (const [side, s] of sides) hold(side, v(s * .134, .549, .354), direction, v(1, 0, 0), elbows(s));
    }, seat);

  for (const [id, mode] of [
    ['Cable_Preacher_Curl', 'preacher'], ['Overhead_Cable_Curl', 'overhead'],
    ['Cable_Seated_Lateral_Raise', 'lateral'],
  ]) {
    const supported = mode === 'preacher';
    const lateral = mode === 'lateral';
    const anchors = supported ? [low] : [[1.12, lateral ? .14 : 1.71, .06], [-1.12, lateral ? .14 : 1.71, .06]];
    exercise(id, supported ? 'straight' : 'stirrup', anchors,
      [supported ? 'Set your upper arms on the preacher pad' : lateral ? 'Sit between the low pulleys and take the opposite handles' :
        'Stand centered between the high pulleys', supported ? 'Start with the elbows nearly straight.' : 'Keep your trunk upright.'],
      [lateral ? 'Lead out with the elbows' : 'Bring the handles in by flexing the elbows',
        lateral ? 'Stop when the arms approach shoulder height.' : 'Keep the upper arms in place.'], (t) => {
        const a = rep(up, t);
        if (supported) {
          sit(.55, -.083, .267, .074, .21);
          const theta = lerp(.85, 2.44, a);
          const forearm = v(0, -Math.cos(theta), Math.sin(theta));
          const upper = v(0, -.77, .63).setLength(bone('ForearmL').position.length());
          for (const [side] of sides) {
            const wrist = point('Arm' + side).add(upper).addScaledVector(forearm, bone('Hand' + side).position.length() - .001);
            hold(side, wrist, forearm, v(1, 0, 0), upper);
          }
          return;
        }
        if (lateral) sit();
        else { torso(v(0, .865, 0)); stance(.174); }
        for (const [side, s] of sides) {
          const theta = lerp(.04, lateral ? 1.35 : 2.18, a);
          const upper = lateral ? v(s * Math.sin(theta), -Math.cos(theta), .08) : v(s, -.01, .047);
          const lower = lateral ? v(s * lerp(-.65, .85, a), lerp(-1, -.19, a), .28)
            : v(s * Math.cos(theta), Math.sin(theta) * .25, Math.sin(theta));
          const elbow = upper.clone().setLength(bone('Forearm' + side).position.length());
          const wrist = point('Arm' + side).add(elbow).add(lower.clone().setLength(bone('Hand' + side).position.length() - .003));
          hold(side, wrist, lower, lateral ? v(0, 0, 1) : v(s * -.12, 1, -.11), upper);
        }
      }, supported ? preacher : lateral ? { ...seat, resistance: { mode: 'cable', anchors,
        attachment: { kind: 'stirrup', hands: ['L', 'R'], feeds: [...anchors].reverse() } } } : {});
  }

  for (const [id, mode] of [
    ['Close-Grip_Front_Lat_Pulldown', 'lat'], ['Elevated_Cable_Rows', 'raised'], ['Low_Pulley_Row_To_Neck', 'neck'],
  ]) {
    const vertical = mode === 'lat';
    const raised = mode === 'raised';
    const anchors = [vertical ? [0, 2.2, .41] : low];
    const attachment = { kind: vertical ? 'straight' : raised ? 'v' : 'rope', hands: ['L', 'R'], feeds: anchors };
    exercise(id, attachment.kind, anchors, [vertical ? 'Sit with both thighs under the pad'
      : raised ? 'Sit on the raised seat with feet braced' : 'Sit tall and take an overhand grip on the rope',
    vertical ? 'Take a close overhand grip.' : 'Start with long arms and a soft bend in both knees.'],
    [vertical ? 'Pull to your upper chest' : raised ? 'Draw the handle to your waist' : 'Spread the rope beside your neck',
      vertical ? 'Drive your elbows down and keep the chest lifted.' : 'Move your elbows back without rocking the trunk.'], (t) => {
      const a = rep(up, t);
      sit(raised ? .66 : .555, raised ? -.11 : -.14, vertical ? .34 : bracedFoot.z, vertical ? .074 : bracedFoot.y,
        vertical ? -.11 * a : .12 - .17 * a, vertical ? 0 : bracedFootPitch);
      const shoulder = point('ArmL');
      const y = shoulder.y + (vertical ? lerp(.572, -.112, a) : raised ? lerp(-.30, -.401, a) : lerp(-.24, .024, a));
      const z = shoulder.z + (vertical ? lerp(.165, .23, a) : lerp(.48, raised ? .235 : .185, a));
      bar(v(0, y, z), vertical ? .151 : raised ? .114 : lerp(.12, .285, a),
        vertical ? v(0, 1, .31) : v(0, -.17 + .41 * a, 1),
        (s) => vertical ? v(s * .30, -.90, .25) : v(s * (raised ? .35 : .89), -.23, -.82));
    }, { ...seat, ...(raised && { fixtures: [{ kind: 'box', size: [.29, .104, .32], position: [0, .483, -.16] }] }),
      resistance: { mode: 'cable', anchors, attachment, support: vertical ? 'knees' : 'feet' } });
  }

  for (const [id, mode] of [
    ['Kneeling_Cable_Triceps_Extension', 'kneel'], ['Low_Cable_Triceps_Extension', 'flat'],
    ['Reverse_Grip_Triceps_Pushdown', 'reverse'], ['Triceps_Overhead_Extension_with_Rope', 'overhead'],
    ['Triceps_Pushdown_-_V-Bar_Attachment', 'v'],
  ]) {
    const kneeling = mode === 'kneel';
    const flat = mode === 'flat';
    const overhead = mode === 'overhead';
    const reverse = mode === 'reverse';
    const anchors = [kneeling ? rearHigh : flat || overhead ? [0, .13, -1.03] : high];
    exercise(id, kneeling || reverse ? 'straight' : mode === 'v' ? 'v' : 'rope', anchors,
      [kneeling ? 'Rest the backs of your upper arms on the bench' : flat ? 'Lie face up with your head toward the low pulley'
        : overhead ? 'Face away from the low pulley' : reverse ? 'Take a palms-up grip' : 'Take an overhand grip on the V handle',
      kneeling || flat || overhead ? 'Start with the elbows bent and the attachment behind your head.' : 'Keep your elbows close to your ribs.'],
      [kneeling ? 'Extend the forearms forward over the bench' : flat ? 'Extend upward from the elbows'
        : overhead ? 'Straighten both arms overhead' : 'Press down until the elbows straighten',
      'Keep the upper arms steady and control the return.'], (t) => {
        const a = rep(up, t);
        if (kneeling) {
          torso(v(0, .49, -.47), pitch(1.49));
          for (const [side, s] of sides) leg(side, v(s * .14, .093, -.87), pitch(2.88), v(s * .04, -.96, .38));
        } else if (flat) sit(.55, .10, .52, .074, -Math.PI / 2);
        else {
          torso(v(0, overhead ? .815 : .863, 0), pitch(overhead ? .23 : .085));
          if (overhead) for (const [side, s] of sides) leg(side, v(s * .155, .074, s * .28), yaw(s * .15));
          else stance(.159);
        }
        if (flat || overhead) {
          const theta = lerp(flat ? 1.43 : 2.10, .09, a);
          for (const [side, s] of sides) {
            const upper = v(s * .19, 1, flat ? .10 : .24);
            const direction = v(s * .11 * a, Math.cos(theta), -Math.sin(theta));
            const elbow = point('Arm' + side).addScaledVector(upper.normalize(), bone('Forearm' + side).position.length());
            const wrist = elbow.addScaledVector(direction.normalize(), bone('Hand' + side).position.length() - .001);
            hold(side, wrist, direction, v(-1, 0, 0), upper);
          }
          return;
        }
        const shoulder = point('ArmL');
        const theta = lerp(kneeling ? 2.04 : 1.40, .11, a);
        const y = kneeling ? -.10 + .26 * Math.sin(theta) : -.31 - .29 * Math.cos(theta);
        const z = kneeling ? .31 + .277 * Math.cos(theta) : .065 + .267 * Math.sin(theta);
        bar(v(0, shoulder.y + y, shoulder.z + z), kneeling ? .103 : reverse ? .189 : .13 + .029 * a,
          v(0, kneeling ? .5 : -Math.cos(theta), kneeling ? Math.cos(theta) : Math.sin(theta)),
          elbows, { underhand: reverse });
      }, kneeling ? { equipment: 'bench', framing: 'floor', benchTransform: { yaw: Math.PI / 2, position: [0, 0, .136] } }
        : flat ? { ...seat, framing: 'floor', benchTransform: { position: [0, 0, -.21] } } : {});
  }

  for (const [id, mode] of [
    ['Rope_Crunch', 'rope'], ['Cable_Russian_Twists', 'twist'], ['Bosu_Ball_Cable_Crunch_With_Side_Bends', 'bosu'],
  ]) {
    const kneeling = mode === 'rope';
    const twist = mode === 'twist';
    const phases = kneeling || twist ? up : [[0, 'Center'], [.3, 'First side'], [1.12, 'First peak'], [1.77, 'Center'],
      [2.56, 'Second peak'], [3.35, 'Center']];
    const anchors = kneeling ? [high] : twist ? [[.99, 1.03, -.29]] : [[.83, .13, -.72], [-.83, .13, -.72]];
    exercise(id, kneeling ? 'rope' : twist ? 'shared' : 'stirrup', anchors,
      [kneeling ? 'Kneel with the rope by your temples' : twist ? 'Bridge with upper back supported by the ball' :
        'Support your lower back on the dome', 'Brace before moving against the cable.'],
      [kneeling ? 'Curl your ribs toward your pelvis' : twist ? 'Rotate away from the pulley with your arms reaching' :
        'Curl up and side bend', twist ? 'Keep your hips steady. Reposition to work the other side.'
        : kneeling ? 'Keep your hips steady as your trunk moves.' : 'Alternate sides while keeping your feet planted.'], (t) => {
      const a = twist ? -rep(up, t) : kneeling ? rep(up, t) : motion(phases.map(([at]) => at), [0, 0, 1, 0, -1, 0], t);
      if (kneeling) {
        torso(v(0, .505, -.11), pitch(.15 + .46 * a));
        for (const [side, s] of sides) leg(side, v(s * .15, .093, -.515), pitch(2.94), v(0, -.93, .4));
        world('Chest', pitch(.15 + .91 * a));
      } else {
        const stance = twist ? .617 : .225;
        torso(v(0, stance, twist ? .114 : .068), pitch(twist ? -1.48 : lerp(-1.74, -1.02, Math.abs(a))));
        for (const [side, s] of sides) leg(side, v(s * .195, .074, twist ? .493 : .57), pitch(0), v(s * .13, 1, .21));
        const base = twist ? -1.52 : lerp(-1.74, -.95, Math.abs(a));
        world('Chest', pitch(base).multiply(yaw(twist ? .77 * a : .12 * a)).multiply(roll(twist ? 0 : .34 * a)));
      }
      if (twist) {
        const middle = point('ArmL').lerp(point('ArmR'), .5);
        const turn = yaw(-.52 * a);
        const target = middle.add(v(.414 * a, .49 - .13 * Math.abs(a), .091));
        bar(target, .075, v(0, 1, .16), (s) => v(s * .78, .10, -1), { frame: turn });
        return;
      }
      const chest = point('Chest');
      for (const [side, s] of sides) {
        const shoulder = point('Arm' + side);
        const target = kneeling ? shoulder.add(v(s * .058, .245 - .19 * a, .155 + .18 * a))
          : shoulder.clone().add(v(s * .05, lerp(.12, .32, Math.abs(a)), -.22 + .57 * Math.abs(a)));
        const direction = target.clone().sub(kneeling ? chest : shoulder);
        hold(side, target, direction, v(-1, 0, .12), elbows(s));
      }
    }, kneeling ? { framing: 'floor' } : { framing: 'floor', fixtures: [twist ? stable : { kind: 'bosu', size: .36, position: [0, .045, -.155] }] },
    phases);
  }
  return entries;
}
