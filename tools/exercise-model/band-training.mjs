import { createAuthor, cues, down, lerp, motion, pitch, rep, sides, up, v, yaw } from './barbell-standing-more.mjs';
import { openHand } from './hand-frame.mjs';
import { metadata } from './resistance-catalog.mjs';

export const groupLabel = 'Resistance band training';

const underFeet = [[.167, .017, .116], [-.167, .017, .116]];
const front = [0, 1.29, 1.01];
const back = [0, 1.17, -.86];
const benchFoot = [.0, .026, -.67];
const ankle = (side) => ({ bone: 'Foot' + side, offset: [0, .047, 0] });
const bodyPoint = (bone, offset) => ({ bone, offset });
const handLinks = (from) => [[from[0], 'L'], [from[1], 'R']];
const flat = { equipment: 'bench', framing: 'floor', benchTransform: { position: [0, 0, -.22] } };

export function createEntries(asset, helpers) {
  const { add, entries, torso, stance, leg, point, arm, free, grip, bone, world, pelvis } = createAuthor(asset, helpers, metadata);
  const hold = (side, target, axis, dir, pole) => arm(side, target, pole, grip(side, axis.normalize(), dir).hand);
  const feet = (rotation = 0, height = .074) => {
    for (const [side, s] of sides) leg(side, v(s * .167, height, 0), pitch(rotation));
  };
  const exercise = (id, phases, fixture, links, anchors, hands, labels, pose, support) =>
    add(id, phases, cues(phases, [labels[0], 'Take up the band tension before moving.'], [labels[1], labels[2]],
      ['Reverse with control', 'Let the band shorten gradually.']), pose,
    { equipment: '', fingers: hands, resistance: { mode: 'band', anchors, links, support }, ...fixture });

  for (const [id, mode] of [
    ['Band_Pull_Apart', 'apart'], ['Back_Flyes_-_With_Bands', 'back'], ['Cross_Over_-_With_Bands', 'cross'],
    ['Lateral_Raise_-_With_Bands', 'lateral'], ['Upright_Row_-_With_Bands', 'row'],
  ]) {
    const fly = ['back', 'cross', 'apart'].includes(mode);
    const start = mode === 'back' ? [front, front] : mode === 'cross' ? [back, back] : underFeet;
    const labels = {
      apart: ['Hold the band in front of your chest', 'Pull the ends apart', 'Keep the elbows nearly straight as the band approaches your chest.'],
      back: ['Face the anchor with both arms reaching forward', 'Open the arms to a T', 'Keep your hands at shoulder height.'],
      cross: ['Face away from the anchor with your arms open', 'Bring your arms together', 'Sweep the hands forward with a soft elbow bend.'],
      lateral: ['Stand on the band with your hands at your sides', 'Raise the handles out to the sides', 'Keep the torso quiet and lift to shoulder height.'],
      row: ['Stand on the band with your hands in front of your thighs', 'Draw the handles up your trunk', 'Lead with the elbows and keep the handles close together.'],
    };
    exercise(id, up, {}, mode === 'apart' ? [['L', 'R']] : handLinks(start), mode === 'back' || mode === 'cross' ? [start[0]] : [],
      'LR', labels[mode], (t) => {
        const a = rep(up, t);
        const angle = mode === 'cross' ? Math.PI / 2 * (1 - a) : Math.PI / 2 * a;
        torso(v(0, mode === 'cross' ? .822 : .858, -.022), pitch(mode === 'cross' ? .17 : .025));
        if (mode === 'cross') for (const [side, s] of sides) leg(side, v(s * .16, .074, s * .24), yaw(s * .12));
        else feet();
        for (const [side, s] of sides) {
          const shoulder = point('Arm' + side);
          const dir = fly ? v(s * Math.sin(angle), -.05, Math.cos(angle))
            : v(s * Math.sin(angle), -Math.cos(angle), .07);
          const target = mode === 'row' ? v(s * .240, lerp(.837, 1.305, a), lerp(.151, .200, a))
            : shoulder.addScaledVector(dir, mode === 'apart' ? .449 : .50)
              .add(v(fly ? -s * .11 * Math.cos(angle) : s * .044 * (1 - a), 0, 0));
          const axis = mode === 'row' ? v(-1, 0, 0) : mode === 'apart' ? v(0, 1, 0) :
            fly ? v(s * dir.z + .016, .78, -s * dir.x) : v(-.22, .31, -s);
          hold(side, target, axis, mode === 'row' ? v(0, -1, .12 + .50 * a) : dir,
            mode === 'row' ? v(s * .76, lerp(-.2, .64, a), -.16) : v(s * .29, -.80, -.34));
        }
      });
  }

  for (const [id, mode] of [
    ['Shoulder_Press_-_With_Bands', 'press'], ['Squats_-_With_Bands', 'squat'],
    ['Calf_Raises_-_With_Bands', 'calf'], ['Speed_Band_Overhead_Triceps', 'triceps'],
  ]) {
    const phases = mode === 'squat' ? down : mode === 'triceps'
      ? [[0, 'Ready'], [.35, 'Extend'], [.82, 'Lockout'], [1.05, 'Lower'], [2.05, 'Reset']] : up;
    const labels = {
      press: ['Stand on the band and hold the handles at your shoulders', 'Press both hands overhead', 'Keep the ribs stacked and extend both elbows.'],
      squat: ['Hold the handles beside your shoulders', 'Lower into a squat', 'Keep your feet planted and let your knees follow your toes.'],
      calf: ['Stand on the band with the handles held at your shoulders', 'Rise onto the balls of your feet', 'Keep the knees long and the handles steady.'],
      triceps: ['Stand on the band and hold it behind your head', 'Extend both elbows overhead', 'Keep the upper arms fixed as you straighten quickly and return slowly.'],
    };
    const calf = mode === 'calf';
    const forefeet = [[.167, .01, .19], [-.167, .01, .19]];
    exercise(id, phases, {}, handLinks(calf ? forefeet : underFeet), [], 'LR', labels[mode], (t) => {
      const a = rep(phases, t);
      const squat = mode === 'squat';
      const press = mode === 'press' ? a : 0;
      const theta = .73 * a;
      torso(v(0, .859 - (squat ? .298 * a : 0) + (calf ? .095 * a : 0), squat ? -.19 * a : calf ? .072 * a : 0),
        pitch(squat ? .39 * a : .01));
      if (calf) for (const [i, [side]] of sides.entries()) {
        const frame = pitch(theta);
        leg(side, v(...forefeet[i]).sub(v(0, -.064, .19).applyQuaternion(frame)), frame);
      }
      else stance(.167, 0, squat ? .20 : .02);
      for (const [side, s] of sides) {
        const shoulder = point('Arm' + side);
        if (mode === 'triceps') {
          const angle = lerp(1.74, .10, a);
          const dir = v(0, Math.cos(angle), -Math.sin(angle));
          const upper = v(-s * .13, 1, .045).setLength(bone('Forearm' + side).position.length());
          hold(side, shoulder.add(upper).addScaledVector(dir, bone('Hand' + side).position.length() - .001),
            v(-1, 0, 0), dir, upper);
        } else {
          hold(side, shoulder.add(v(s * lerp(.19, .069, press), lerp(.128, .52, press), .062 + .066 * (1 - press))),
            v(-1, 0, 0), v(-s * .18, 1, .09), v(s * .79, -.79, -.19));
        }
      }
    });
  }

  for (const [id, mode] of [
    ['Band_Good_Morning', 'foot'], ['Band_Good_Morning_Pull_Through', 'post'],
    ['Bench_Press_-_With_Bands', 'press'], ['Band_Skull_Crusher', 'skull'],
  ]) {
    const bench = mode === 'press' || mode === 'skull';
    const post = mode === 'post';
    const anchors = post ? [[0, .14, -.91]] : [];
    const neck = bodyPoint('Chest', [0, .195, -.065]);
    const links = bench ? handLinks([benchFoot, benchFoot])
      : (post ? [anchors[0], anchors[0]] : underFeet).map((base, i) => [base, {
        ...neck, offset: [(i === 0 ? 1 : -1) * .104, ...neck.offset.slice(1)],
      }]);
    const labels = {
      foot: ['Stand on the loop and support it across your upper back', 'Hinge at the hips', 'Keep your back long and your knees softly bent.'],
      post: ['Face away from the low anchor with the loop across your upper back', 'Send your hips backward', 'Keep tension in the band as you fold forward.'],
      press: ['Set your back on the bench with both handles above your chest', 'Lower the handles toward your ribs', 'Keep the wrists over the elbows, then press back up.'],
      skull: ['Lie on the bench with elbows pointed up', 'Straighten your elbows', 'Keep your upper arms still against the pull from behind you.'],
    };
    const phases = mode === 'skull' ? up : down;
    exercise(id, phases, bench ? flat : {}, links, anchors, bench ? 'LR' : '', labels[mode], (t) => {
      const a = rep(phases, t);
      if (bench) {
        torso(v(0, .553, .02), pitch(-Math.PI / 2));
        for (const [side, s] of sides) {
          leg(side, v(s * .218, .074, .52), yaw(s * .12), v(s * .17, 1, .04));
          const shoulder = point('Arm' + side);
          if (mode === 'press') {
            hold(side, shoulder.add(v(s * lerp(.074, .215, a), lerp(.507, .193, a), .079 + .106 * a)),
              v(-1, 0, 0), v(0, 1, .13), v(s * .89, -.16, .41));
          } else {
            const angle = lerp(1.87, .11, a);
            const direction = v(0, Math.cos(angle), -Math.sin(angle));
            hold(side, shoulder.add(v(-s * .044, .275, -.029)).addScaledVector(direction, .259),
              v(.14, Math.sin(angle), Math.cos(angle)), direction, v(s * .14, .89, -.09));
          }
        }
      } else {
        const hinge = (post ? 1.42 : 1.02) * a;
        const frame = pitch(hinge);
        torso(v(0, .859 - (post ? .192 : .126) * a, -(post ? .265 : .19) * a), frame, pitch(.68 * hinge));
        feet();
        for (const [side, s] of sides) {
          const wrist = point('Chest').add(v(s * .166, .22, .024).applyQuaternion(frame));
          const acrossShoulder = v(-s * .73, .15, -.66).normalize().applyQuaternion(frame);
          arm(side, wrist, v(s * .7, -.55, .42).applyQuaternion(frame), (forearm) =>
            openHand(s, forearm.lerp(acrossShoulder, .35), v(0, 1, .32).applyQuaternion(frame)));
        }
      }
    });
  }

  for (const [id, mode, from] of [
    ['Band_Hip_Adductions', 'out', [1.03, .14, .062]], ['Hip_Extension_with_Bands', 'back', [0, .123, .56]],
    ['Hip_Flexion_with_Band', 'front', [0, .124, -.83]], ['Internal_Rotation_with_Band', 'internal', [-.86, 1.07, .10]],
  ]) {
    const labels = {
      out: ['Anchor the band to your left and cuff the far ankle', 'Sweep the cuffed leg away from the anchor', 'Keep the knees long and the pelvis level.'],
      back: ['Face the low anchor and cuff one ankle', 'Extend the working hip', 'Move the leg backward while keeping the torso steady.'],
      front: ['Face away from the low anchor', 'Lift the cuffed knee', 'Bring the thigh toward hip height without leaning backward.'],
      internal: ['Stand with your working side toward the anchor', 'Turn your forearm toward your abdomen', 'Keep your elbow next to your ribs at a right angle.'],
    };
    const rotate = mode === 'internal';
    exercise(id, up, {}, [[from, rotate ? 'R' : ankle('R')]], [from], rotate ? 'R' : '', labels[mode], (t) => {
      const a = rep(up, t);
      torso(v(rotate ? 0 : .093, .851, -.03), pitch(mode === 'back' ? .13 : .005));
      leg('L', v(.169, .074, .02));
      leg('R', mode === 'back' ? v(-.118, .09 + .186 * a, -.45 * a)
        : mode === 'front' ? v(-.124, .094 + .375 * a, .322 * a)
          : mode === 'out' ? v(-.137 - .395 * a, .103 + .149 * a, .031) : v(-.167, .074, 0),
      pitch(mode === 'back' ? .45 * a : -.17 * a), v(-.11, mode === 'front' ? .47 : .05, 1));
      for (const [side, s] of sides) {
        const shoulder = point('Arm' + side);
        if (rotate && side === 'R') {
          const angle = lerp(.99, -.98, a);
          const dir = v(s * Math.sin(angle), .045, Math.cos(angle));
          hold(side, shoulder.add(v(s * -.02, -.286, .035)).addScaledVector(dir, .253), v(0, 1, .09), dir,
            v(s * .06, -1, .07));
        } else {
          if (mode === 'back') arm(side, v(s * .060, 1.10, .504), v(s * .44, -.89, -.15),
            openHand(s, v(-s * .43, .52, .68), v(s, 0, -1)));
          else free(side, shoulder.add(v(s * .063, -.34, .04)), v(-s * .18, -1, .15));
        }
      }
    }, mode === 'back' ? 'post' : undefined);
  }

  const hipL = bodyPoint('Pelvis', [.111, -.035, .105]);
  const hipR = bodyPoint('Pelvis', [-.111, -.035, .105]);
  const pegs = [[.41, .032, .08], [-.41, .032, .08]];
  exercise('Hip_Lift_with_Band', up, { framing: 'floor' }, [[pegs[0], hipL], [hipL, hipR], [pegs[1], hipR]], pegs,
    '', ['Lie with the band across the front of your hips', 'Drive the hips into the band', 'Keep your shoulders and feet on the floor.'], (t) => {
      const a = rep(up, t);
      torso(v(), pitch(-1.56 - .76 * a), pitch(-1.55));
      world('Lumbar', pitch(-1.56 - .74 * a));
      world('Chest', pitch(-1.56 - .60 * a));
      const shoulder = point('ArmL');
      pelvis.position.set(0, .155 - shoulder.y, -.39 - shoulder.z);
      for (const [side, s] of sides) {
        leg(side, v(s * .152, .074, .56), yaw(s * .13), v(s * .09, 1, .05));
        free(side, v(s * .267, .079, .071), v(s * .09, -.21, 1), v(s * .30, .30, -.86));
      }
    });

  const walk = [[0, 'Set tension'], [.49, 'Left step'], [1.0, 'Right step'], [1.49, 'Left step'],
    [1.99, 'Right step'], [2.50, 'Step back'], [3.50, 'Reset']];
  const loop = (bone, y) => {
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([side, z]) =>
      bodyPoint(bone + (side > 0 ? 'L' : 'R'), [.050 * side, y, .056 * z]));
    return corners.map((corner, i) => [corner, corners[(i + 1) % corners.length]]);
  };
  exercise('Monster_Walk', walk, {}, [...loop('Foot', .043), ...loop('Shin', -.05)], [], '',
    ['Take a wide, low stance with two bands', 'Take alternating steps forward', 'Keep the knees apart, then retrace your steps backward.'], (t) => {
      const keys = [0, .49, 1.0, 1.49, 1.99, 2.50, 3.0, 3.5, 3.6];
      const left = [0, .24, .24, .48, .48, .24, .24, 0, 0];
      const right = [0, 0, .23, .23, .47, .47, .22, 0, 0];
      const z = [motion(keys, left, t), motion(keys, right, t)];
      const wave = Math.sin(Math.PI * Math.min(1, t / 3.5) * 7) ** 2;
      torso(v(.045 * Math.sin(Math.PI * 4 * Math.min(1, t / 3.5)), .681 + .026 * wave, (z[0] + z[1]) * .5 - .11), pitch(.36));
      for (const [side, s] of sides) {
        const i = side === 'L' ? 0 : 1;
        const travel = i === 0 ? left : right;
        const end = Math.min(keys.length - 1, keys.findIndex((time) => t <= time));
        const lift = end > 0 && travel[end] !== travel[end - 1]
          ? Math.sin(Math.PI * (t - keys[end - 1]) / (keys[end] - keys[end - 1])) ** 2 * .09 : 0;
        leg(side, v(s * (.228 + lift * .27), .074 + lift, z[i]), yaw(s * .19));
        free(side, point('Chest').add(v(s * .115, -.05, .338)), v(-s * .48, .36, .80));
      }
    });
  return entries;
}
