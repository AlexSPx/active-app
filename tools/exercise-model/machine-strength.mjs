import { createAuthor, cues, lerp, pitch, q, rep, sides, up, v, yaw } from './barbell-standing-more.mjs';

export const groupLabel = 'Machine strength';
const chest = ['Chest'];
const back = ['Upper back'];
const arms = ['Shoulders', 'Triceps'];
const calves = ['Calves'];
const hamstrings = ['Hamstrings'];
const quadriceps = ['Quadriceps'];
const posterior = ['Glutes', 'Hamstrings'];
const biceps = ['Biceps'];
const shoulders = ['Shoulders'];

const metadata = {
  Ab_Crunch_Machine: ['Ab Crunch Machine', ['Core'], []],
  Butterfly: ['Butterfly', chest, []],
  Calf_Press: ['Calf Press', calves, []],
  Calf_Press_On_The_Leg_Press_Machine: ['Calf Press On The Leg Press Machine', calves, []],
  Dip_Machine: ['Dip Machine', ['Triceps'], ['Chest', 'Shoulders']],
  Leg_Extensions: ['Leg Extensions', quadriceps, []],
  Leg_Press: ['Leg Press', quadriceps, ['Calves', ...posterior]],
  Leverage_Chest_Press: ['Leverage Chest Press', chest, arms],
  Leverage_Deadlift: ['Leverage Deadlift', quadriceps, posterior],
  Leverage_Decline_Chest_Press: ['Leverage Decline Chest Press', chest, arms],
  Leverage_High_Row: ['Leverage High Row', back, []],
  Leverage_Incline_Chest_Press: ['Leverage Incline Chest Press', chest, arms],
  Leverage_Iso_Row: ['Leverage Iso Row', back, biceps],
  Leverage_Shoulder_Press: ['Leverage Shoulder Press', shoulders, ['Triceps']],
  Leverage_Shrug: ['Leverage Shrug', back, ['Forearms']],
  Lying_Leg_Curls: ['Lying Leg Curls', hamstrings, []],
  'Lying_T-Bar_Row': ['Lying T-Bar Row', back, biceps],
  Machine_Bench_Press: ['Machine Bench Press', chest, arms],
  Machine_Bicep_Curl: ['Machine Bicep Curl', biceps, []],
  Machine_Preacher_Curls: ['Machine Preacher Curls', biceps, []],
  Machine_Shoulder_Military_Press: ['Machine Shoulder (Military) Press', shoulders, ['Triceps']],
  Machine_Triceps_Extension: ['Machine Triceps Extension', ['Triceps'], []],
  Narrow_Stance_Leg_Press: ['Narrow Stance Leg Press', quadriceps, ['Calves', ...posterior]],
  Reverse_Hyperextension: ['Reverse Hyperextension', hamstrings, ['Calves', 'Glutes']],
  Reverse_Machine_Flyes: ['Reverse Machine Flyes', shoulders, []],
  Seated_Calf_Raise: ['Seated Calf Raise', calves, []],
  Seated_Leg_Curl: ['Seated Leg Curl', hamstrings, []],
  'Single-Leg_Leg_Extension': ['Single-Leg Leg Extension', quadriceps, []],
  Standing_Leg_Curl: ['Standing Leg Curl', hamstrings, []],
  Thigh_Abductor: ['Thigh Abductor', ['Glutes'], []],
  Thigh_Adductor: ['Thigh Adductor', ['Adductors'], posterior],
};

const box = (name, size, at, material = 'steel', angle = 0, follow) =>
  ({ name, size, at, material, angle, follow });
const beam = (name, from, to, width = .052) => ({ name, size: [width, width], from, to });
const roller = (name, from, to, radius, material = 'pad') => ({ name, radius, from, to, material });
const pad = (name, size, at, angle = 0, follow) => box(name, size, at, 'pad', angle, follow);
const boneAt = (bone, ...offset) => ({ bone, offset });
const handleAt = (side, x = 0) => ({ bone: 'Hand' + side, offset: [x, 0, 0], grip: true });
const between = (from, to, fraction, shift = [0, 0, 0]) => ({ from, to, fraction, shift });
const translated = (at, shift) => ({ at, shift });
const leverPlates = (pivot, side, s, radius) => roller('Leverage plates',
  between(pivot, handleAt(side), .33, [s * .04, 0, 0]),
  between(pivot, handleAt(side), .33, [s * .16, 0, 0]), radius, 'weight');
const gripPart = (side, radius = .017) => roller('Hand grip ' + side, handleAt(side, -.068), handleAt(side, .068), radius);
const base = (width, rear, front) => [
  ...[-1, 1].map((side) => box('Base rail', [.069, .052, front - rear], [side * (width - .069) / 2, .026, (front + rear) / 2])),
  ...[rear + .048, front - .048].map((z) => box('Base crossmember', [width, .041, .085], [0, .0205, z])),
  box('Base spine', [.083, .037, front - rear], [0, .0185, (front + rear) / 2]),
];
const pedestal = (x, z, y, name = 'Frame upright') => box(name, [.075, y, .082], [x, y / 2, z]);
const axle = (x, y, z) => roller('Pivot hub', [x - .035, y, z], [x + .035, y, z], .054, 'pin');
const stack = (x, z, y = 1.20) => [
  pedestal(x - .105, z, y, 'Weight guide'), pedestal(x + .105, z, y, 'Weight guide'),
  ...Array.from({ length: 6 }, (_, i) =>
    box('Weight plate', [.205, .038, .16], [x, .105 + i * .042, z], 'weight')),
  box('Stack crossmember', [.31, .055, .095], [x, y, z]),
];
const discs = (x, y, z, radius = .139) => roller('Leverage plates',
  [x - .07, y, z], [x + .07, y, z], radius, 'weight');
const seat = (y, z, depth = .40) => [
  pad('Seat pad', [.36, .073, depth], [0, y, z]),
  pedestal(0, z, y, 'Seat support'),
];
function backrest(hip, angle = 0) {
  const [x, y, z] = v(0, .27, -.113).applyQuaternion(pitch(angle)).add(v(...hip));
  return [
    pad('Backrest', [.34, .50, .078], [x, y, z], angle),
    beam('Backrest brace', [0, .05, z - .21], [0, y, z - .03], .077),
  ];
}
const restingHands = (x, y, z) => sides.flatMap(([side, s]) => [
  pedestal(s * x, z, y, 'Grab rail mount'),
  gripPart(side),
]);
const acrossBone = (name, joint, radius, halfWidth, y, z) => roller(name,
  boneAt(joint, -halfWidth, y, z), boneAt(joint, halfWidth, y, z), radius);
const polar = (length, angle) => v(0, -length * Math.cos(angle), length * Math.sin(angle));
const returning = ['Return slowly', 'Keep tension on the machine as you return to the starting position.'];

export function createEntries(asset, helpers) {
  const { entries, add, bone, point, torso, world, stance, leg, arm, grip, armLength } =
    createAuthor(asset, helpers, metadata);
  const thighLength = bone('ShinL').position.length();
  const shinLength = bone('FootL').position.length();
  const upperArmLength = bone('ForearmL').position.length();
  const forearmLength = bone('HandL').position.length();
  const phase = (lift, peak, lower) => [[0, 'Setup'], [.25, lift], [1.4, peak], [1.85, lower], [3.35, 'Reset']];

  const seats = new Map(sides.map(([side, sign]) => [side, helpers.dumbbellGripTransform(sign)]));
  function pointRef(ref) {
    if (Array.isArray(ref)) return ref;
    if (ref?.from) return { ...ref, from: pointRef(ref.from), to: pointRef(ref.to) };
    if (ref?.at) return { ...ref, at: pointRef(ref.at) };
    if (!ref?.grip) return ref;
    const { position, quaternion } = seats.get(ref.bone.at(-1));
    return boneAt(ref.bone, ...v(...ref.offset).applyQuaternion(quaternion).add(position));
  }

  function exercise(id, parts, setup, work, pose, phases = up) {
    add(id, phases, cues(phases, setup, work, returning), (t) => { pose(rep(phases, t)); },
      { equipment: '', machineStrengthFixture: { name: metadata[id][0] + ' station',
        parts: parts.map((part) => part.from ? { ...part, from: pointRef(part.from), to: pointRef(part.to) } : part),
      } });
  }

  function take(side, center, axis, direction, pole) {
    const { hand, offset } = grip(side, axis, direction);
    arm(side, center.clone().sub(offset), pole, hand);
  }

  function rails(x, y, z) {
    for (const [side, s] of sides) {
      take(side, v(s * x, y, z), v(0, 0, 1), v(0, -1, -.16), v(s * .35, -1, -.3));
    }
  }

  // A fixed upper segment and an angular lower segment keep the knee over the machine axle.
  function kneeMotion(side, upper, lower, orientation) {
    const hip = point('Thigh' + side);
    const knee = hip.clone().add(upper);
    const ankle = knee.clone().add(lower);
    const axis = ankle.clone().sub(hip).normalize();
    const pole = upper.clone().addScaledVector(axis, -upper.dot(axis));
    leg(side, ankle, orientation, pole);
  }

  const sit = (hip, tilt = 0, width = .17, feet = .36) => {
    torso(v(...hip), pitch(tilt));
    stance(width, feet, .12);
  };

  // The common pivot is equidistant from both endpoints of the lever's travel.
  function leverArc(start, finish, sweep) {
    const middle = start.clone().lerp(finish, .5);
    const chord = finish.clone().sub(start);
    const pivot = middle.add(v(0, -chord.z, chord.y).multiplyScalar(.5 / Math.tan(sweep / 2)));
    return { pivot, at: (a) => start.clone().sub(pivot).applyQuaternion(pitch(sweep * a)).add(pivot) };
  }

  for (const [id, tilt, from, to, sweep, width, style] of [
    ['Leverage_Chest_Press', -.14, [1.04, .193], [1.02, .457], .53, .294, 'lever'],
    ['Leverage_Incline_Chest_Press', -.38, [1.11, .047], [1.395, .155], .52, .275, 'lever'],
    ['Leverage_Decline_Chest_Press', .035, [1.06, .210], [.86, .469], .59, .295, 'lever'],
    ['Machine_Bench_Press', -1.22, [.913, -.110], [1.270, -.249], .72, .27, 'bench'],
    ['Leverage_Shoulder_Press', -.13, [1.111, .064], [1.620, -.089], .73, .305, 'lever'],
    ['Machine_Shoulder_Military_Press', -.025, [1.077, .11], [1.610, -.045], .73, .344, 'stack'],
  ]) {
    const overhead = id.includes('Shoulder');
    const incline = id.includes('Incline');
    const decline = id.includes('Decline');
    const bench = style === 'bench';
    const hip = [0, bench ? .53 : .555, bench ? .20 : -.07];
    const arc = leverArc(v(0, ...from), v(0, ...to), sweep);
    const { y: pivotY, z: pivotZ } = arc.pivot;
    const parts = [
      ...base(.90, Math.min(pivotZ - .12, bench ? -1.10 : -.68), .64),
      ...seat(.46, hip[2], bench ? .44 : .39), ...backrest(hip, tilt),
      ...(style === 'stack' ? stack(.61, -.35, 1.38) : []),
    ];
    for (const [side, s] of sides) {
      const x = s * (width + .10);
      const pivot = [x, pivotY, pivotZ];
      parts.push(pedestal(x, pivotZ, pivotY), axle(...pivot), gripPart(side),
        beam('Press lever', pivot, handleAt(side), .047));
      if (style === 'lever') parts.push(leverPlates(pivot, side, s, .10));
    }

    exercise(id, parts,
      [bench ? 'Lie back under the handles' : 'Set your back against the pad',
        overhead ? 'Start with the handles at shoulder height and keep your ribs down.'
          : 'Plant your feet and start with the handles beside your chest.'],
      [overhead ? 'Press overhead' : incline ? 'Press up and away' : decline ? 'Press down and away' : 'Press away from your chest',
        'Extend the elbows without locking them or lifting away from the support.'], (a) => {
        sit(hip, tilt, bench ? .21 : .176, bench ? .45 : .34);
        for (const [side, s] of sides) {
          const center = arc.at(a).add(v(s * width, 0, 0));
          const shaft = style === 'lever' && !overhead ? v(0, 1, .18).normalize() : v(-1, 0, 0);
          const direction = overhead ? v(0, lerp(.83, .99, a), lerp(.55, .13, a))
            : v(0, bench ? .97 : incline ? .72 : decline ? -.22 : .10, bench ? .25 : incline ? .69 : .97);
          take(side, center, shaft, direction, v(s * (overhead ? 1 : .73), -.52, -.19));
        }
      }, phase('Press', 'Arms extended', 'Lower'));
  }

  for (const reverse of [false, true]) {
    const id = reverse ? 'Reverse_Machine_Flyes' : 'Butterfly';
    const hip = [0, .55, -.06];
    const tilt = reverse ? .12 : -.035;
    sit(hip, tilt, .18, .36);
    const parts = [...base(.79, -.60, .56), ...seat(.45, -.06), ...stack(.53, -.42),
      ...(reverse ? [
        pad('Chest pad', [.27, .32, .073], [0, .955, .138], .06),
        pedestal(0, .15, .94, 'Chest pad support'),
      ] : backrest(hip))];
    for (const [side, s] of sides) {
      const shoulder = point('Arm' + side);
      const x = reverse ? s * .23 : shoulder.x;
      const y = reverse ? 1.135 : 1.46;
      const z = reverse ? .155 : shoulder.z;
      const pivot = [x, y, z];
      parts.push(pedestal(s * .64, -.42, y + .10),
        beam('Overhead pivot mount', [s * .64, y + .10, -.42], [x, y + .10, z]),
        roller('Fly pivot', pivot, [x, y + .10, z], .047, 'pin'));
      if (reverse) {
        parts.push(beam('Fly lever', pivot, handleAt(side), .043), gripPart(side));
      } else {
        const direction = v(0, s, 0);
        const { offset } = grip(side, direction, v(0, 0, 1));
        const gripTop = handleAt(side, s * .068);
        const overhead = translated(gripTop, [0, y - shoulder.y - offset.y - .068, 0]);
        parts.push(gripPart(side, .0145),
          beam('Fly lever', pivot, overhead, .043), beam('Grip mount', overhead, gripTop, .037));
      }
    }
    exercise(id, parts,
      [reverse ? 'Face the chest pad' : 'Set your back against the pad', 'Take the handles with a soft bend in both elbows.'],
      [reverse ? 'Sweep the handles out' : 'Bring the handles together',
        reverse ? 'Lead with the elbows and keep your chest against the pad.' : 'Keep your shoulders down as you bring your upper arms together.'],
      (a) => {
        sit(hip, tilt, .18, .36);
        const angle = reverse ? lerp(0, 1.59, a) : lerp(1.28, -.13, a);
        for (const [side, s] of sides) {
          if (reverse) {
            const reach = v(s * Math.sin(angle), -.17, Math.cos(angle));
            const center = reach.clone().multiplyScalar(.48).add(v(s * .23, 1.135, .155));
            take(side, center, v(0, 1, 0), reach, v(s * .73, -.70, -.18));
          } else {
            const upper = v(0, 0, 1).applyQuaternion(yaw(s * (angle + .35)));
            const lower = v(0, 0, 1).applyQuaternion(yaw(s * (angle - .35)));
            const wrist = point('Arm' + side).addScaledVector(upper, upperArmLength).addScaledVector(lower, forearmLength);
            const { hand } = grip(side, v(0, s, 0), lower);
            arm(side, wrist, upper, hand, true);
          }
        }
      }, phase(reverse ? 'Open' : 'Close', reverse ? 'Arms out' : 'Handles together', 'Return'));
  }

  for (const [id, high] of [['Leverage_High_Row', true], ['Leverage_Iso_Row', false]]) {
    const hip = [0, .54, -.19];
    const width = high ? .291 : .236;
    const arc = high
      ? leverArc(v(0, 1.37, .352), v(0, .994, .159), .82)
      : leverArc(v(0, 1.02, .467), v(0, .924, .239), -1.00);
    const { y: pivotY, z: pivotZ } = arc.pivot;
    const parts = [...base(.91, -.64, .76), ...seat(.448, -.18),
      pad('Chest support', [.28, .31, .071], [0, .91, .025], .18),
      pedestal(0, .063, .92, 'Chest pad mount')];
    for (const [side, s] of sides) {
      const x = s * (width + .09);
      const pivot = [x, pivotY, pivotZ];
      parts.push(pedestal(x, pivotZ, pivotY), axle(...pivot), leverPlates(pivot, side, s, .10),
        beam('Independent row lever', pivot, handleAt(side), .049), gripPart(side));
    }
    exercise(id, parts,
      ['Brace against the chest support', high ? 'Reach up for both handles.' : 'Take both handles with your arms reaching forward.'],
      [high ? 'Pull down and back' : 'Row toward your lower ribs',
        'Let the elbows lead while your chest stays against the pad.'],
      (a) => {
        sit(hip, .24, .21, .32);
        for (const [side, s] of sides) {
          const center = arc.at(a).add(v(s * width, 0, 0));
          take(side, center, high ? v(-1, 0, 0) : v(0, 1, 0),
            high ? v(0, lerp(.6, -.04, a), .85) : v(0, -.10, 1), v(s * .32, -1, -.52));
        }
      }, phase('Pull', 'Elbows back', 'Reach'));
  }

  {
    const hip = [0, .89, -.17];
    const arc = leverArc(v(0, .515, .432), v(0, .805, .392), -.32);
    const pivot = arc.pivot.toArray();
    const handle = between(handleAt('L'), handleAt('R'), .5);
    const plate = between(pivot, handle, .72);
    const parts = [...base(.86, -.70, .99),
      pad('Inclined chest pad', [.30, .065, .53], [0, .921, .115], -.35),
      beam('Inclined pad mount', [0, .05, -.16], [0, .89, .12], .09),
      ...sides.map(([, s]) => box('Foot platform', [.24, .075, .27], [s * .22, .077, -.53], 'pad', .11)),
      pedestal(0, pivot[2], pivot[1]), axle(...pivot),
      beam('T-bar lever', pivot, handle, .063),
      beam('T-handle crosspiece', handleAt('L'), handleAt('R'), .041),
      ...sides.map(([side]) => gripPart(side)),
      roller('Leverage plates', translated(plate, [-.10, 0, 0]), translated(plate, [.10, 0, 0]), .14, 'weight')];
    exercise('Lying_T-Bar_Row', parts, ['Lie chest-down on the inclined pad', 'Brace both feet on the platforms.'],
      ['Pull the T-handle toward the pad', 'Drive your elbows back while keeping your chest supported.'], (a) => {
        torso(v(...hip), pitch(1.215));
        for (const [side, s] of sides) {
          leg(side, v(s * .215, .183, -.52), pitch(.11), v(s * .12, 0, .95));
          const center = arc.at(a).add(v(s * .219, 0, 0));
          take(side, center, v(0, 0, -1), v(0, lerp(-1, -.56, a), lerp(.12, .83, a)), v(s * .70, .15, -.91));
        }
      }, phase('Row', 'Handles at ribs', 'Lower'));
  }

  {
    const hip = [0, .565, -.10];
    const parts = [...base(.86, -.56, .57), ...seat(.47, -.07), ...backrest(hip, .10), ...stack(.63, -.40)];
    for (const [side, s] of sides) {
      const pivot = [s * .448, .67, -.29];
      parts.push(pedestal(pivot[0], pivot[2], pivot[1]), axle(...pivot),
        beam('Dip lever', pivot, handleAt(side), .049), gripPart(side));
    }
    exercise('Dip_Machine', parts, ['Sit tall with the handles at your sides', 'Keep both feet planted and your shoulders down.'],
      ['Press the handles toward the floor', 'Straighten your elbows without leaning on the handles.'], (a) => {
        sit(hip, .10, .19, .38);
        for (const [side, s] of sides) {
          const center = polar(.40, lerp(1.91, 1.20, a)).add(v(s * .315, .67, -.29));
          take(side, center, v(0, 0, 1), v(0, -.94, .31), v(s * .30, -.20, -1));
        }
      }, phase('Press down', 'Arms extended', 'Release'));
  }

  {
    const hip = [0, .555, -.075];
    const parts = [...base(.99, -.53, .53), ...seat(.465, -.05), ...backrest(hip),
      ...stack(.57, -.39, 1.33), box('Foot plate', [.55, .055, .22], [0, .028, .31], 'pad')];
    for (const [side, s] of sides) {
      const pivot = [s * .46, .83, -.075];
      // Join the grip at its outer extension so the lever clears the forearm.
      const mount = handleAt(side, -s * .145);
      parts.push(pedestal(pivot[0], pivot[2], pivot[1]), axle(...pivot),
        beam('Crunch lever', pivot, mount),
        roller('Grip mount', handleAt(side, -s * .068), mount, .017, 'steel'), gripPart(side));
    }
    exercise('Ab_Crunch_Machine', parts, ['Sit back and grasp the shoulder-height handles', 'Keep your hips against the seat and brace your feet.'],
      ['Curl your ribs toward your pelvis', 'Move through your trunk and keep your arms in place relative to your chest.'], (a) => {
        torso(v(...hip), q(), pitch(.56 * a));
        world('Lumbar', pitch(.33 * a));
        world('Chest', pitch(.69 * a));
        world('Head', pitch(.69 * a));
        stance(.172, .31, .12, .055);
        for (const [side, s] of sides) {
          const center = point('Chest').add(v(s * .259, .245, .299).applyQuaternion(pitch(.69 * a)));
          take(side, center, v(-1, 0, 0), v(0, .48, .88).applyQuaternion(pitch(.69 * a)),
            v(s * .35, -1, .18));
        }
      }, phase('Curl forward', 'Ribs down', 'Uncurl'));
  }

  for (const [id, mode] of [
    ['Machine_Bicep_Curl', 'curl'], ['Machine_Preacher_Curls', 'preacher'], ['Machine_Triceps_Extension', 'extension'],
  ]) {
    const preacher = mode === 'preacher';
    const extension = mode === 'extension';
    const hip = [0, preacher ? .55 : .565, -.12];
    const tilt = preacher ? .26 : .125;
    const upper = v(0, preacher ? -.59 : -.76, preacher ? .81 : .65).setLength(upperArmLength);
    const [start, finish] = extension ? [2.53, .83] : preacher ? [1.00, 2.65] : [.80, 2.37];
    const pivotY = hip[1] + .27;
    const pivotZ = preacher ? .218 : .148;
    const parts = [...base(.79, -.51, .60), ...seat(.465, -.12), ...stack(.56, -.27, 1.12),
      pad('Upper arm pad', [preacher ? .49 : .42, .057, preacher ? .285 : .226],
        [0, preacher ? .899 : .874, preacher ? .165 : .114], preacher ? .61 : .78),
      pedestal(0, .23, .829, 'Arm pad support')];
    for (const [side, s] of sides) {
      const pivot = [s * .32, pivotY, pivotZ];
      parts.push(pedestal(pivot[0], pivot[2], pivot[1]), axle(...pivot), gripPart(side),
        beam('Elbow lever', pivot, handleAt(side, s * .054)));
    }
    exercise(id, parts,
      ['Rest your upper arms on the pad', extension ? 'Start with your elbows bent.' : 'Take an underhand grip and start with your elbows softly bent.'],
      [extension ? 'Straighten your elbows' : 'Curl the handles up',
        extension ? 'Keep the upper arms still as you push the handles away.' : 'Keep the elbows on the pad as the forearms rotate up.'],
      (a) => {
        sit(hip, tilt, .18, .39);
        for (const [side, s] of sides) {
          const upperSide = upper.clone().add(v(s * .024, 0, 0)).setLength(upperArmLength);
          const lower = polar(forearmLength, lerp(start, finish, a));
          const wrist = point('Arm' + side).add(upperSide).add(lower);
          const { hand } = grip(side, v(extension ? -1 : 1, 0, 0), lower);
          arm(side, wrist, upperSide, hand);
        }
      }, phase(extension ? 'Extend' : 'Curl', extension ? 'Arms extended' : 'Elbows bent', 'Return'));
  }

  for (const [id, shrug] of [['Leverage_Deadlift', false], ['Leverage_Shrug', true]]) {
    const parts = [...base(.92, -.59, .66)];
    for (const [side, s] of sides) {
      const pivot = [s * .45, shrug ? .31 : .17, -.48];
      parts.push(pedestal(pivot[0], pivot[2], pivot[1]), axle(...pivot),
        beam('Loaded lever', pivot, handleAt(side, s * .045), .061),
        leverPlates(pivot, side, s, shrug ? .13 : .115), gripPart(side));
    }
    exercise(id, parts,
      [shrug ? 'Stand tall with a neutral grip' : 'Set your hips back between the handles',
        shrug ? 'Keep your arms straight and your neck relaxed.' : 'Bend your knees and brace with your spine neutral.'],
      [shrug ? 'Lift your shoulders straight up' : 'Drive through your feet',
        shrug ? 'Pause, then lower without rolling the shoulders.' : 'Extend your hips and knees together and finish standing tall.'], (a) => {
        torso(v(0, shrug ? .879 : lerp(.635, .88, a), shrug ? -.015 : lerp(-.23, -.015, a)),
          pitch(shrug ? .035 : lerp(.69, .035, a)), pitch(shrug ? 0 : lerp(.42, 0, a)));
        stance(shrug ? .145 : .185, .026);
        for (const [side, s] of sides) {
          if (shrug) bone('Arm' + side).position.y += .065 * a;
          const shoulder = point('Arm' + side);
          const direction = v(s * .125, -.982, shrug ? .095 : lerp(.17, .075, a)).normalize();
          const { hand } = grip(side, v(0, 0, s), direction);
          arm(side, shoulder.addScaledVector(direction, armLength - .006), v(s * .45, 0, -.80), hand);
        }
      }, phase(shrug ? 'Elevate' : 'Stand', shrug ? 'Shoulders high' : 'Hips extended', 'Lower'));
  }

  for (const [id, legPress, calfOnly, narrow] of [
    ['Leg_Press', true, false, false],
    ['Narrow_Stance_Leg_Press', true, false, true],
    ['Calf_Press_On_The_Leg_Press_Machine', true, true, false],
    ['Calf_Press', false, true, false],
  ]) {
    const hip = legPress ? [0, .49, -.29] : [0, .51, -.26];
    const tilt = legPress ? -.71 : -.22;
    const width = narrow ? .088 : calfOnly ? .138 : .211;
    const rake = calfOnly ? legPress ? -1.96 : -1.57 : -.99;
    const normal = v(0, -.040, 0).applyQuaternion(pitch(rake));
    const plateContact = boneAt('FootL', -width, calfOnly ? -.059 : -.063, calfOnly ? .151 : .074);
    const plate = translated(plateContact, [...normal]);
    const parts = [...base(1.13, -.92, 1.12), ...seat(.39, -.29, .37), ...backrest(hip, tilt),
      pad(calfOnly ? 'Forefoot plate' : 'Sled footplate', [legPress ? .63 : .43, .061, calfOnly ? .15 : .34],
        plate, rake),
      ...restingHands(.285, .504, -.17)];
    for (const [, s] of sides) {
      const x = s * .43;
      const lower = [x, legPress ? calfOnly ? .64 : .29 : .39, legPress && !calfOnly ? .30 : .36];
      const upper = [x, legPress ? calfOnly ? .94 : 1.08 : .39, 1.02];
      const carriage = translated(plate, [s * .405, -.093, .083]);
      parts.push(beam('Sled rail', lower, upper, .061), pedestal(x, upper[2], upper[1]),
        beam('Sled crossmember', plate, carriage, .046));
      if (legPress) parts.push(roller('Sled weight plates',
        translated(carriage, [s * .03, 0, 0]), translated(carriage, [s * .16, 0, 0]),
        .126, 'weight'));
    }
    if (!legPress) parts.push(...stack(.67, .60, 1.10));
    exercise(id, parts,
      [calfOnly ? 'Set the balls of your feet on the plate' : narrow ? 'Place your feet close together' : 'Place both feet flat on the footplate',
        calfOnly ? 'Keep a soft bend in your knees and let your heels drop.' : 'Stay against the back pad as your knees bend.'],
      [calfOnly ? 'Push through the balls of your feet' : 'Drive the sled away',
        calfOnly ? 'Move at your ankles and keep the knee angle steady.' : 'Keep your knees tracking in line with your toes and avoid locking them.'],
      (a) => {
        torso(v(...hip), pitch(tilt), pitch(tilt * .72));
        rails(.285, .504, -.17);
        for (const [side, s] of sides) {
          if (calfOnly) {
            const rotation = pitch(lerp(legPress ? -2.24 : -1.88, legPress ? -1.68 : -1.33, a));
            const ankle = legPress ? v(s * width, .724 + a * .019, .465 - a * .006)
              : v(s * width, .41 + a * .019, .542);
            leg(side, ankle, rotation, v(s * .16, .94, -.24));
          } else {
            const position = v(s * width, lerp(.44, narrow ? .68 : .708, a), lerp(.255, narrow ? .47 : .478, a));
            leg(side, position, pitch(rake), v(s * (narrow ? .12 : .26), 1, -.42));
          }
        }
      }, phase(calfOnly ? 'Raise heels' : 'Press', calfOnly ? 'Ankles extended' : 'Legs extended', 'Lower'));
  }

  for (const [id, mode] of [
    ['Leg_Extensions', 'extension'], ['Single-Leg_Leg_Extension', 'single'], ['Seated_Leg_Curl', 'curl'],
  ]) {
    const curl = mode === 'curl';
    const single = mode === 'single';
    const hip = [0, .555, -.125];
    const upper = polar(thighLength, curl ? 1.45 : 1.405);
    const pivotY = hip[1] + upper.y;
    const pivotZ = hip[2] + upper.z;
    const parts = [...base(.87, -.56, .70), ...seat(.463, .01, .58), ...backrest(hip, -.085),
      ...stack(.58, -.34), ...restingHands(.27, .52, .04)];
    if (curl) {
      parts.push(roller('Thigh restraint', [-.29, .614, .19], [.29, .614, .19], .06),
        pedestal(.29, .19, .614, 'Thigh restraint mount'));
    }
    for (const [side, s] of sides) {
      if (single && s > 0) continue;
      const pivot = [s * .309, pivotY, pivotZ];
      const contact = boneAt('Shin' + side, s * .068, -.297, curl ? -.066 : .076);
      parts.push(pedestal(pivot[0], pivot[2], pivot[1]), axle(...pivot),
        beam('Knee lever', pivot, contact),
        acrossBone(curl ? 'Heel roller' : 'Shin roller', 'Shin' + side, .056, .096, -.297, curl ? -.066 : .076));
    }
    exercise(id, parts,
      [curl ? 'Sit with your legs nearly straight' : 'Line up your knees with the pivot',
        curl ? 'Set your lower legs over the roller and secure the thigh pad.' :
          single ? 'Set the right shin behind its roller and relax the left leg.' : 'Set both shins behind the roller and hold the side handles.'],
      [curl ? 'Curl your heels under the seat' : single ? 'Straighten the right knee' : 'Straighten both knees',
        'Keep your thighs on the seat and control the roller on the way back.'], (a) => {
        torso(v(...hip), pitch(-.085), pitch(-.035));
        rails(.27, .52, .04);
        for (const [side, s] of sides) {
          const angle = curl ? lerp(1.27, -.34, a) :
            single ? (s < 0 ? lerp(.045, 1.28, a) : 0) : lerp(.19, 1.36, a);
          kneeMotion(side, upper, polar(shinLength, angle), pitch(-angle * .62));
        }
      }, phase(curl ? 'Curl' : 'Extend', curl ? 'Knees bent' : 'Knees nearly straight', 'Return'));
  }

  {
    const hip = [0, .725, .06];
    const upper = polar(thighLength, -1.43);
    const pivot = [.34, hip[1] + upper.y, hip[2] + upper.z];
    const parts = [...base(.85, -.82, .90),
      pad('Thigh pad', [.37, .068, .41], [0, .601, -.16], .14),
      pad('Chest pad', [.37, .068, .56], [0, .619, .357], -.065),
      pedestal(0, -.14, .60), pedestal(0, .39, .61), ...stack(.55, -.32, 1.03),
      pedestal(pivot[0], pivot[2], pivot[1]), axle(...pivot),
      beam('Curl lever', pivot, boneAt('ShinL', .13, -.30, -.075)),
      ...sides.flatMap(([side, s]) => [
        acrossBone('Ankle roller', 'Shin' + side, .057, .10, -.30, -.075),
        beam('Handle mount', [s * .22, .09, .68], handleAt(side)), gripPart(side),
      ])];
    exercise('Lying_Leg_Curls', parts, ['Lie face down with your knees at the hinge', 'Set the roller behind your ankles and hold the handles.'],
      ['Curl your heels toward your glutes', 'Keep the hips on the pad and lower slowly.'], (a) => {
        torso(v(...hip), pitch(1.50), pitch(1.43));
        for (const [side, s] of sides) {
          const angle = lerp(-1.40, -2.99, a);
          kneeMotion(side, upper, polar(shinLength, angle), pitch(lerp(1.43, 2.63, a)));
          take(side, v(s * .248, .616, .765), v(-1, 0, 0), v(0, -.35, .94), v(s * .55, -1, -.24));
        }
      }, phase('Curl', 'Heels up', 'Lower'));
  }

  {
    const hip = [0, .893, -.055];
    const upper = polar(thighLength, .13);
    const pivot = [-.34, hip[1] + upper.y, hip[2] + upper.z];
    const parts = [...base(.90, -.79, .60), ...stack(.65, -.28, 1.16),
      pad('Thigh pad', [.23, .24, .071], [-.106, .682, .077], .065),
      pedestal(-.23, .125, .72), pedestal(pivot[0], pivot[2], pivot[1]), axle(...pivot),
      beam('Standing curl lever', pivot, boneAt('ShinR', -.07, -.30, -.072)),
      acrossBone('Ankle roller', 'ShinR', .057, .10, -.30, -.072),
      ...sides.flatMap(([side, s]) => [
        beam('Grab rail mount', [s * .30, .09, .40], handleAt(side)), gripPart(side),
      ])];
    exercise('Standing_Leg_Curl', parts, ['Stand with your working thigh against the pad', 'Place the roller behind the right ankle and hold the frame.'],
      ['Curl the right heel up and back', 'Keep the right thigh against the pad and your left foot planted.'], (a) => {
        torso(v(...hip), pitch(.13));
        leg('L', v(.161, .074, .055), yaw(.19));
        const angle = lerp(-.25, -1.86, a);
        kneeMotion('R', upper, polar(shinLength, angle), pitch(lerp(-.21, 1.33, a)));
        for (const [side, s] of sides) take(side, v(s * .28, 1.064, .40), v(-1, 0, 0), v(0, .3, .95), v(s * .3, -1, -.25));
      }, phase('Curl', 'Heel up', 'Lower'));
  }

  {
    const hip = [0, .555, -.07];
    const parts = [...base(.86, -.53, .66), ...seat(.46, -.07),
      box('Toe platform', [.49, .077, .153], [0, .089, .421], 'pad'),
      pedestal(.36, -.29, .62), axle(.36, .62, -.29), discs(.414, .59, -.19, .124)];
    for (const [side, s] of sides) {
      const touch = boneAt('Thigh' + side, 0, -.30, .109);
      parts.push(acrossBone('Thigh pad', 'Thigh' + side, .055, .111, -.30, .109),
        beam('Calf lever', [s * .35, .62, -.29], touch),
        beam('Release handle mount', touch, handleAt(side)), gripPart(side));
    }
    exercise('Seated_Calf_Raise', parts, ['Set the thigh pads above your knees', 'Keep the balls of your feet on the ledge and let your heels hang.'],
      ['Raise your heels', 'Lift the thigh pads without bouncing or moving your torso.'], (a) => {
        torso(v(...hip), q());
        for (const [side, s] of sides) {
          const rotation = pitch(lerp(-.22, .44, a));
          const toe = v(s * .147, .131, .414);
          leg(side, toe.sub(v(0, -.061, .153).applyQuaternion(rotation)), rotation, v(s * .10, .20, 1));
          take(side, v(s * .267, .637 + a * .057, .226), v(-1, 0, 0), v(0, -.80, .60), v(s * .33, -1, -.30));
        }
      }, phase('Raise heels', 'Heels high', 'Lower'));
  }

  {
    const hip = [0, .94, -.035];
    const parts = [...base(.81, -.88, .78),
      pad('Hip and torso pad', [.44, .085, .59], [0, .813, .255], -.06),
      pedestal(0, .55, .78), beam('Bench brace', [0, .08, .68], [0, .73, .09], .085),
      pedestal(-.34, -.10, .56), axle(-.34, .56, -.10), discs(-.36, .42, -.28, .139)];
    for (const [side, s] of sides) {
      const contact = boneAt('Shin' + side, 0, -.315, -.071);
      parts.push(beam('Reverse hyper lever', [s * .34, .56, -.10], contact),
        acrossBone('Heel cuff', 'Shin' + side, .047, .089, -.315, -.071),
        beam('Grab handle mount', [s * .29, .72, .53], handleAt(side)), gripPart(side));
    }
    exercise('Reverse_Hyperextension', parts, ['Lie face down with your hips over the end of the bench', 'Hold the front grips and place your heels in the cuff.'],
      ['Lift your legs behind you', 'Stop when your legs line up with your torso. Keep the movement at the hips.'], (a) => {
        torso(v(...hip), pitch(1.51), pitch(1.48));
        const angle = lerp(-.20, -1.46, a);
        for (const [side, s] of sides) {
          kneeMotion(side, polar(thighLength, angle), polar(shinLength, angle - .19), pitch(-angle + .25));
          take(side, v(s * .263, .827, .544), v(-1, 0, 0), v(0, .55, .83), v(s * .30, -1, -.60));
        }
      }, phase('Raise legs', 'Hips extended', 'Lower'));
  }

  for (const [id, open] of [['Thigh_Abductor', true], ['Thigh_Adductor', false]]) {
    const hip = [0, .555, -.10];
    const parts = [...base(1.15, -.58, .69), ...seat(.46, -.03, .46), ...backrest(hip, -.09),
      ...stack(.66, -.38), ...restingHands(.274, .544, -.13)];
    for (const [side, s] of sides) {
      const pivot = [s * .162, .33, -.11];
      const padSide = open ? s : -s;
      const contact = boneAt('Shin' + side, padSide * .080, .02, .026);
      parts.push(pedestal(pivot[0], pivot[2], pivot[1]),
        beam('Thigh lever', pivot, contact, .049),
        pad(open ? 'Outer knee pad' : 'Inner knee pad', [.073, .178, .145], contact, 0, 'Shin' + side),
        pad('Foot rest', [.153, .045, .21], boneAt('Foot' + side, 0, -.080, .055), 0, 'Foot' + side));
    }
    exercise(id, parts,
      [open ? 'Set the pads outside your thighs' : 'Set the pads inside your thighs',
        'Sit against the backrest and support both feet on the rests.'],
      [open ? 'Press your knees apart' : 'Draw your knees together',
        'Move smoothly from your hips and keep your torso still.'], (a) => {
        torso(v(...hip), pitch(-.09));
        rails(.274, .544, -.13);
        const angle = open ? lerp(.18, .92, a) : lerp(1.02, .065, a);
        for (const [side, s] of sides) {
          const turn = yaw(s * angle);
          const upper = polar(thighLength, 1.375).applyQuaternion(turn);
          const lower = polar(shinLength, open ? .19 : .34).applyQuaternion(turn);
          kneeMotion(side, upper, lower, turn);
        }
      }, phase(open ? 'Open knees' : 'Close knees', open ? 'Knees apart' : 'Knees together', 'Return'));
  }

  return entries;
}
