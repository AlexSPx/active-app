import { createAuthor, cues, down, frameFromDown, lerp, motion, pitch, rep, roll, sides, up, v, yaw } from './barbell-standing-more.mjs';
import { gripFrame } from './ez-curl-exercises.mjs';
import { openHand } from './hand-frame.mjs';
import { metadata } from './supplemental-catalog.mjs';

export const groupLabel = 'Bench accessories and kettlebell drills';
const bench = { equipment: 'bench', benchTransform: { position: [0, 0, -.43] } };
const preacher = { kind: 'preacher', position: [0, .751, .225] };
const out = (s) => v(s * .68, -1, -.2);
const downAxis = v(0, -1, 0);
const xNegative = v(-1, 0, 0);

export function createEntries(asset, helpers) {
  const { add, entries, torso, stance, leg, arm, point, free, grip, bone, bar, armLength } =
    createAuthor(asset, helpers, metadata);
  const exercise = (id, setup, action, pose, options, phases = up) =>
    add(id, phases, cues(phases, setup, action, ['Reverse with control', 'Return to the setup before the next repetition.']),
      pose, { equipment: '', ...options });

  for (const [id, mode] of [
    ['One_Arm_Dumbbell_Preacher_Curl', 'single'], ['Preacher_Hammer_Dumbbell_Curl', 'hammer'],
    ['Two-Arm_Dumbbell_Preacher_Curl', 'pair'], ['Zottman_Preacher_Curl', 'zottman'],
    ['Preacher_Curl', 'ez'], ['Reverse_Barbell_Preacher_Curls', 'reverse'], ['Spider_Curl', 'spider'],
  ]) {
    const ez = ['ez', 'reverse', 'spider'].includes(mode);
    const single = mode === 'single';
    const spider = mode === 'spider';
    const hammer = mode === 'hammer';
    const zottman = mode === 'zottman';
    const reverse = mode === 'reverse';
    const phases = zottman ? [[0, 'Palms up'], [.25, 'Curl'], [1.40, 'Turn palms down'], [1.94, 'Lower'],
      [3.25, 'Reset grip']] : up;
    const fixture = spider ? { ...preacher, angle: -1, position: [0, .863, .096] } : preacher;
    const style = ez ? 'bench-ez-curl-bar' : single ? 'bench-dumbbell-right' : 'bench-dumbbells';
    const grips = sides.map(([, s]) => gripFrame(s, mode === 'ez', !reverse, helpers.dumbbellGripTransform));
    exercise(id, [spider ? 'Lean over the steep side of the pad' : 'Set your upper arms firmly on the pad',
      reverse ? 'Take a palms-down grip on the EZ bar.' : hammer ? 'Keep the palms facing each other.' :
        single ? 'Support the working upper arm and steady yourself with the other hand.' : 'Start with your elbows almost straight.'],
    [zottman ? 'Turn your palms down at the top' : 'Curl toward your shoulders',
      zottman ? 'Lower with palms down and turn them up again at the bottom.' :
        spider ? 'Let your upper arms hang and move only the forearms.' : 'Keep the upper arms against the pad.'], (t) => {
      const a = zottman ? motion([0, .25, 1.4, 1.94, 3.25, 3.6], [0, 0, 1, 1, 0, 0], t) : rep(up, t);
      const turn = zottman ? motion([0, 1.4, 1.94, 2.99, 3.38, 3.6], [0, 0, 1, 1, 0, 0], t) : 0;
      torso(v(0, spider ? .729 : .555, spider ? -.289 : -.095), pitch(spider ? 1.01 : .25));
      for (const [side, s] of sides) leg(side, v(s * .22, .074, spider ? -.54 : .287),
        yaw(s * .16), v(s * .1, .82, .53));
      const theta = lerp(spider ? .195 : .78, spider ? 2.40 : 2.57, a);
      const lower = v(0, -Math.cos(theta), Math.sin(theta));
      const upper = v(0, spider ? -1 : -.77, spider ? .065 : .63)
        .setLength(bone('ForearmL').position.length());
      if (ez) {
        const frame = pitch(.44 - theta);
        const left = grips[0](frame, lower);
        const center = point('ArmL').add(upper).addScaledVector(lower, bone('HandL').position.length() - .029).sub(left.offset);
        center.x = 0;
        sides.forEach(([side, s], i) => {
          const { rotation, offset } = grips[i](frame, lower);
          arm(side, center.clone().add(offset), upper.clone().add(v(s * .028, 0, 0)), rotation);
        });
        return [center, frame];
      }
      for (const [side, s] of sides) {
        if (single && s > 0) {
          free(side, v(.222, .98, .164), v(.03, -.71, .55));
          continue;
        }
        const wrist = point('Arm' + side).add(upper).addScaledVector(lower, bone('Hand' + side).position.length() - .001);
        const axis = hammer ? v(0, Math.sin(theta), Math.cos(theta))
          : v(1, 0, 0).applyAxisAngle(lower, s * Math.PI * .94 * turn);
        arm(side, wrist, upper, grip(side, axis, lower).hand);
      }
    }, { ...bench, equipment: style, fingers: single ? 'R' : 'LR', fixtures: [fixture] }, phases);
  }

  const calfFixture = { kind: 'dumbbell', position: [0, .086, -.03] };
  exercise('Calf_Raise_On_A_Dumbbell', ['Balance on the dumbbell handle', 'Use the stable support for balance.'],
    ['Raise your heels without bouncing', 'Pause on the balls of your feet, then lower.'], (t) => {
      const a = rep(up, t);
      torso(v(0, .925 + .088 * a, -.073 + .022 * a));
      for (const [side, s] of sides) {
        leg(side, v(s * .071, .157 + .104 * a, -.141 + .053 * a), pitch(.14 + .77 * a));
        free(side, v(s * .23, 1.147, .416), v(0, .72, .69), v(s * .45, -.94, -.12));
      }
    }, { fingers: '', fixtures: [calfFixture, { kind: 'wall', position: [0, .65, .50], size: [.64, 1.30, .055] }] });

  const jumpTimes = [0, .32, .72, 1.03, 1.41, 1.68, 2.40, 2.83, 3.15, 3.6];
  const jump = [[0, 'Sit'], [.32, 'Load'], [.72, 'Drive'], [1.03, 'Flight'], [1.41, 'Land on box'],
    [1.68, 'Stand'], [2.40, 'Step down'], [3.15, 'Sit']];
  exercise('Dumbbell_Seated_Box_Jump', ['Sit on the bench with the dumbbell at your chest', 'Plant both feet facing the box.'],
    ['Drive off the floor toward the box', 'Land with both feet and bend at the hips and knees.'], (t) => {
      const p = (values) => motion(jumpTimes, values, t);
      torso(v(0, p([.55, .548, .846, 1.035, .923, 1.235, 1.20, .83, .55, .55]),
        p([-.18, -.10, .14, .54, .77, .80, .78, .23, -.18, -.18])),
      pitch(p([.07, .32, .13, .18, .33, .02, .16, .19, .07, .07])));
      for (const [side, s] of sides) {
        const late = s > 0 ? .10 : 0;
        leg(side, v(s * .17, p([.074, .074, .103, .65, .456, .456, .456, .074 + late, .074, .074]),
          p([.11, .11, .15, .55, .85, .85, .83, .31 + late, .11, .11])), pitch(.04));
      }
      const center = point('Chest').add(v(0, .12, .266));
      for (const [side, s] of sides) free(side, center.clone().add(v(s * .101, -.07, .014)),
        v(-s * .4, .94, 0), out(s));
      return [center, pitch(Math.PI * .04).multiply(roll(Math.PI / 2))];
    }, { ...bench, equipment: 'bench-cradle-dumbbell', fingers: '',
      fixtures: [{ kind: 'box', size: [.62, .382, .53], position: [0, .191, .89] }] }, jump);

  exercise('Close-Grip_Push-Up_off_of_a_Dumbbell', ['Set both hands over the top of the upright dumbbell', 'Brace in a straight plank.'],
    ['Lower your chest with elbows tucked', 'Press through both hands while keeping the hips in line.'], (t) => {
      const a = rep(down, t);
      torso(v(0, lerp(.540, .315, a), -.46), pitch(lerp(1.17, 1.49, a)));
      for (const [side, s] of sides) {
        leg(side, v(s * .11, .177, -1.102), pitch(1.55), v(s * .10, -.8, .10));
        arm(side, v(s * .057, .239, .113), v(s * .43, -.34, -.92), openHand(s, v(-s * .91, 0, .3), v(0, 1, 0)));
      }
      return [v(0, .112, .125), roll(Math.PI / 2)];
    }, { equipment: 'cradle-dumbbell', fingers: '', framing: 'floor' }, down);

  exercise('Hyperextensions_With_No_Hyperextension_Bench', ['Lie face down with your hips at the bench edge', 'Secure the ankles before lowering your torso.'],
    ['Raise your torso into line with your legs', 'Hinge at the hips and keep the neck in line.'], (t) => {
      const a = rep(up, t);
      torso(v(0, .553, .395), pitch(lerp(2.24, 1.55, a)));
      for (const [side, s] of sides) {
        leg(side, v(s * .121, .492, -.377), pitch(1.55), v(s * .13, -.83, -.12));
        free(side, point('Chest').add(v(-s * .093, -.17, .045)), v(-s * .9, .16, .16), out(s));
      }
    }, { ...bench, framing: 'floor', fingers: '', benchTransform: { position: [0, 0, -.195] },
      fixtures: [{ kind: 'box', size: [.42, .10, .17], position: [0, .661, -.407] },
        { kind: 'block', size: [.062, .61, .07], position: [.25, .31, -.407] }] });

  exercise('Natural_Glute_Ham_Raise', ['Kneel on the support and secure your ankles', 'Brace with your hips extended.'],
    ['Lower as a unit from the knees', 'Use the hamstrings to draw yourself back up.'], (t) => {
      const a = rep(down, t);
      const theta = lerp(.05, 1.26, a);
      torso(v(0, .52 + .39 * Math.cos(theta), -.10 + .39 * Math.sin(theta)), pitch(theta));
      for (const [side, s] of sides) {
        leg(side, v(s * .127, .55, -.465), pitch(2.83), v(s * .04, -1, .47));
        free(side, point('Chest').add(v(-s * .083, .004, .20)), v(-s, .64, .10), out(s));
      }
    }, { ...bench, fingers: '', fixtures: [{ kind: 'preacher', position: [0, .588, -.54], angle: -.4 }] }, down);

  exercise('V-Bar_Pullup', ['Hang from the neutral handles', 'Set the attachment over the main bar and raise your chest slightly.'],
    ['Draw your chest toward the V handle', 'Drive your elbows down and lean back enough to clear the shaft.'], (t) => {
      const a = rep(up, t);
      torso(v(0, lerp(1.183, 1.802, a), lerp(-.072, -.097, a)), pitch(lerp(-.07, -.31, a)));
      for (const [side, s] of sides) {
        leg(side, v(s * .101, lerp(.506, 1.047, a), lerp(-.39, -.494, a)),
          pitch(1.12), v(s * .13, -.25, 1));
        const axis = v(s * .61, 0, .792).normalize().multiplyScalar(s);
        const { hand, offset } = grip(side, axis, v(0, 1, -.3 - .45 * a));
        arm(side, v(s * .098, 2.171, -.012).sub(offset), v(s * .30, -.90, .25), hand);
      }
    }, { equipment: 'pull-up-bar', fingers: 'LR', fixtures: [{ kind: 'v-handle', position: [0, 2.171, -.012] }] });

  function bell(side, center, axis, below, along, pole) {
    const { hand, offset } = grip(side, axis, along);
    const shoulder = point('Arm' + side);
    const wrist = center.clone().sub(offset).sub(shoulder).clampLength(0, armLength - .001).add(shoulder);
    arm(side, wrist, pole, hand);
    return [wrist.add(offset), frameFromDown(axis, below)];
  }
  exercise('Two-Arm_Kettlebell_Row', ['Hinge with a bell in each hand', 'Let both arms hang below your shoulders.'],
    ['Draw both elbows toward your hips', 'Bring the bells up beside the ribs without raising your torso.'], (t) => {
      const a = rep(up, t);
      torso(v(0, .767, -.207), pitch(.98));
      stance(.228, -.034);
      const [right, left] = [sides[1], sides[0]].map(([side, s]) => bell(side,
        point('Arm' + side).add(v(s * .081, lerp(-.591, -.31, a), lerp(.03, -.254, a))),
        v(0, .06, s * 1).normalize(), downAxis, v(0, -1, .12), v(s * .38, -.18, -1)));
      return [...right, undefined, left];
    }, { equipment: 'two-kettlebells' });

  exercise('Extended_Range_One-Arm_Kettlebell_Floor_Press', ['Lie back with the working-side knee crossed over', 'Start with the bell at the working shoulder.'],
    ['Press up and inward', 'Allow the torso to rotate slightly with the press.'], (t) => {
      const a = rep(up, t);
      torso(v(0, .144, -.102), pitch(-1.57).multiply(yaw(-.26 + .35 * a)));
      leg('L', v(.16, .075, .66), pitch(-.19), v(0, 1, .14));
      leg('R', v(.112, .074, .358), roll(.46), v(.68, 1, .03));
      arm('L', v(.445, .075, -.11), v(.64, -.2, -.7), openHand(1, v(.71, .04, -.58), v(0, 1, 0)));
      const shoulder = point('ArmR');
      return bell('R', shoulder.add(v(lerp(-.199, .107, a), lerp(.235, .576, a), .032)),
        xNegative, v(-.47, -.46, -.72), v(0, 1, .02), out(-1));
    }, { equipment: 'kettlebell', fingers: 'R', framing: 'floor' });

  const swingTimes = [0, .25, .99, 1.22, 1.79, 2.41, 2.65, 3.35, 3.6];
  const swing = [[0, 'Center'], [.25, 'Swing left'], [.99, 'Left peak'], [1.79, 'Pass center'],
    [2.41, 'Right peak'], [3.35, 'Center']];
  exercise('Kettlebell_Pirate_Ships', ['Take a wide stance and hold the bell with both hands', 'Begin with the bell below your waist.'],
    ['Turn and swing up toward head height', 'Pass through center and swing up on the other side.'], (t) => {
      const a = motion(swingTimes, [0, 0, 1, 1, 0, -1, -1, 0, 0], t);
      const height = Math.abs(a);
      const frame = yaw(.87 * a);
      torso(v(.047 * a, .792 + .063 * height, -.10 + .085 * height), frame.clone().multiply(pitch(.30 * (1 - height))));
      for (const [side, s] of sides) leg(side, v(s * .283, .074, -.02), yaw(.28 * a + .27 * s));
      const center = v(0, lerp(.775, 1.58, height), .45).applyQuaternion(frame);
      return bar(center, .063, v(0, lerp(-1, .24, height), .84).applyQuaternion(frame), out, { frame });
    }, { equipment: 'kettlebell' }, swing);

  exercise('Double_Kettlebell_Windmill', ['Lock one bell above your shoulder and turn both feet out', 'Set the lower bell beside the front foot.'],
    ['Hinge sideways and pick up the lower bell', 'Keep the upper bell stacked as you return upright.'], (t) => {
      const times = [0, .35, 1.30, 1.50, 2.20, 2.46, 3.05, 3.24, 3.6];
      const a = motion(times, [0, 0, 1, 1, 0, 0, 1, 1, 0], t);
      const hold = motion(times, [0, 0, 0, 1, 1, 1, 1, 0, 0], t);
      torso(v(-.151 * a, .856 - .121 * a, -.087 * a), roll(-1.12 * a).multiply(pitch(.27 * a)),
        roll(.12 - .39 * a).multiply(yaw(-.44)));
      for (const [side, s] of sides) leg(side, v(s * .222, .074, s * .095), yaw(.69));
      const raised = bell('R', point('ArmR').add(v(-.051, .582, .008)), xNegative,
        v(-.4, -.5, -.5), v(0, 1, 0), out(-1));
      const floor = v(.385, .254, .258);
      const hang = point('ArmL').add(v(.091, -.545, .071));
      const loaded = floor.clone().lerp(hang, hold * (1 - a));
      const reaching = floor.clone().lerp(hang, 1 - a).add(v(.034, .037, -.046));
      const lower = bell('L', reaching.lerp(loaded, hold), xNegative, downAxis, v(0, -1, .15), out(1));
      if (hold < 1) lower[0].copy(floor);
      return [...raised, { L: hold, R: 1 }, lower];
    }, { equipment: 'two-kettlebells', fingers: 'dynamic' },
    [[0, 'Set overhead'], [.35, 'Hinge'], [1.30, 'Pick up'], [1.50, 'Stand with both bells'],
      [2.46, 'Set the bell back down'], [3.05, 'Release']]);
  return entries;
}
