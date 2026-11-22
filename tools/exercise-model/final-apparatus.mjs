import { X, Y, Z, ankleHeight, createAuthor, cues, down, lerp, motion, pitch, q, rep, roll, sides, up, v, yaw } from './barbell-standing-more.mjs';
import { openHand, palmHeight } from './hand-frame.mjs';

export { createFinalApparatusFixture } from './final-apparatus-fixtures.mjs';
export const groupLabel = 'Suspension, apparatus and assisted mobility';

const metadata = {
  "Ab_Roller": ["Ab Roller", ["Core"], ["Shoulders"]],
  "Anterior_Tibialis-SMR": ["Anterior Tibialis-SMR", ["Calves"], []],
  "Balance_Board": ["Balance Board", ["Calves"], ["Hamstrings", "Quadriceps"]],
  "Band_Assisted_Pull-Up": ["Band Assisted Pull-Up", ["Upper back"], ["Core", "Forearms"]],
  "Behind_Head_Chest_Stretch": ["Behind Head Chest Stretch", ["Chest"], ["Shoulders"]],
  "Chair_Leg_Extended_Stretch": ["Chair Leg Extended Stretch", ["Hamstrings"], ["Adductors"]],
  "Chair_Upper_Body_Stretch": ["Chair Upper Body Stretch", ["Shoulders"], ["Biceps", "Chest"]],
  "Chest_And_Front_Of_Shoulder_Stretch": ["Chest And Front Of Shoulder Stretch", ["Chest"], ["Shoulders"]],
  "Donkey_Calf_Raises": ["Donkey Calf Raises", ["Calves"], []],
  "Foot-SMR": ["Foot-SMR", ["Calves"], []],
  "Hyperextensions_Back_Extensions": ["Hyperextensions (Back Extensions)", ["Upper back"], ["Glutes", "Hamstrings"]],
  "IT_Band_and_Glute_Stretch": ["IT Band and Glute Stretch", ["Glutes"], []],
  "Intermediate_Hip_Flexor_and_Quad_Stretch": ["Intermediate Hip Flexor and Quad Stretch", ["Quadriceps"], []],
  "Inverted_Row_with_Straps": ["Inverted Row with Straps", ["Upper back"], ["Biceps"]],
  "Kipping_Muscle_Up": ["Kipping Muscle Up", ["Upper back"], ["Core", "Biceps", "Forearms", "Shoulders", "Triceps"]],
  "Knee_Hip_Raise_On_Parallel_Bars": ["Knee/Hip Raise On Parallel Bars", ["Core"], []],
  "London_Bridges": ["London Bridges", ["Upper back"], ["Biceps", "Forearms"]],
  "Muscle_Up": ["Muscle Up", ["Upper back"], ["Core", "Biceps", "Forearms", "Shoulders", "Triceps"]],
  "Neck-SMR": ["Neck-SMR", ["Other anatomy"], []],
  "One_Handed_Hang": ["One Handed Hang", ["Upper back"], ["Biceps"]],
  "Platform_Hamstring_Slides": ["Platform Hamstring Slides", ["Hamstrings"], ["Glutes"]],
  "Quad_Stretch": ["Quad Stretch", ["Quadriceps"], []],
  "Ring_Dips": ["Ring Dips", ["Triceps"], ["Chest", "Shoulders"]],
  "Rocky_Pull-Ups_Pulldowns": ["Rocky Pull-Ups/Pulldowns", ["Upper back"], ["Biceps", "Shoulders"]],
  "Rope_Climb": ["Rope Climb", ["Upper back"], ["Biceps", "Forearms", "Shoulders"]],
  "Round_The_World_Shoulder_Stretch": ["Round The World Shoulder Stretch", ["Shoulders"], ["Biceps", "Chest"]],
  "Seated_Band_Hamstring_Curl": ["Seated Band Hamstring Curl", ["Hamstrings"], []],
  "Standing_Elevated_Quad_Stretch": ["Standing Elevated Quad Stretch", ["Quadriceps"], []],
  "Suspended_Fallout": ["Suspended Fallout", ["Core"], ["Chest", "Upper back", "Shoulders"]],
  "Suspended_Push-Up": ["Suspended Push-Up", ["Chest"], ["Shoulders", "Triceps"]],
  "Suspended_Reverse_Crunch": ["Suspended Reverse Crunch", ["Core"], []],
  "Suspended_Row": ["Suspended Row", ["Upper back"], ["Biceps"]],
  "Suspended_Split_Squat": ["Suspended Split Squat", ["Quadriceps"], ["Glutes", "Adductors", "Calves", "Hamstrings"]],
  "Weighted_Bench_Dip": ["Weighted Bench Dip", ["Triceps"], ["Chest", "Shoulders"]],
  "Weighted_Pull_Ups": ["Weighted Pull Ups", ["Upper back"], ["Biceps"]],
  "Weighted_Sit-Ups_-_With_Bands": ["Weighted Sit-Ups - With Bands", ["Core"], []],
  "Bodyweight_Flyes": ["Bodyweight Flyes", ["Chest"], ["Core", "Shoulders", "Triceps"]],
  "Cable_Wrist_Curl": ["Cable Wrist Curl", ["Forearms"], []],
  "Smith_Incline_Shoulder_Raise": ["Smith Incline Shoulder Raise", ["Shoulders"], ["Chest"]],
  "Prone_Manual_Hamstring": ["Prone Manual Hamstring", ["Hamstrings"], []],
};

const rightAngle = Math.PI / 2;
const hold = [[0, 'Set up'], [.35, 'Ease in'], [1.55, 'Hold'], [4.75, 'Ease out'], [5.8, 'Reset']];
const scan = [[0, 'Set pressure'], [.30, 'Roll'], [1.8, 'Pause'], [2.65, 'Roll back'], [4.15, 'Reset']];
const elbowOut = (s) => v(s, -.65, -.25);
const elbowBack = (s) => v(s * .27, -.62, -1);

function swingAt(anchor, length, dz, dx = 0) {
  return v(anchor[0] + dx, anchor[1] - Math.sqrt(length ** 2 - dz ** 2 - dx ** 2), anchor[2] + dz);
}

export function createEntries(asset, helpers) {
  const { add, entries, torso, world, point, bone, arm, leg, free, grip, bar, stance, armLength } =
    createAuthor(asset, helpers, metadata);
  const gripOffsets = sides.map(([, s]) => helpers.dumbbellGripTransform(s).position.toArray());

  function exercise(id, phases, setup, peak, finish, pose, fixture, options = {}) {
    add(id, phases, cues(phases, setup, peak, finish), pose, {
      equipment: '', fingers: '', duration: phases.at(-1)[0], framing: 'standing',
      finalApparatusFixture: { ...fixture, gripOffsets }, ...options,
    });
  }

  function grasp(side, center, axis, direction, pole, followWrist) {
    const { hand, offset } = grip(side, axis, direction);
    arm(side, center.clone().sub(offset), pole, hand, followWrist);
  }

  function graspRope(side, center, axis, direction, pole) {
    const { hand, offset } = grip(side, axis, direction);
    const wrist = center.clone().sub(offset);
    const delta = wrist.clone().sub(point('Arm' + side));
    const along = delta.dot(axis);
    const across = delta.addScaledVector(axis, -along).lengthSq();
    // Fit the grip along the rope so the reach limit cannot pull a closed hand off it.
    const limit = Math.sqrt(Math.max(0, (armLength - .002) ** 2 - across));
    wrist.addScaledVector(axis, Math.max(-limit, Math.min(limit, along)) - along);
    arm(side, wrist, pole, hand, false, X);
  }

  function palm(side, s, target, direction = Z, dorsal = Y) {
    arm(side, target, elbowOut(s), openHand(s, direction, dorsal));
  }

  function feet(z, width = .15, height = ankleHeight) {
    for (const [side, s] of sides) leg(side, v(s * width, height, z), yaw(s * .08), Z);
  }

  function relax(side, s) {
    free(side, point('Arm' + side).add(v(s * .075, -.46, .06)), v(s * .13, -1, .17));
  }

  function crossArms(tilt) {
    for (const [side, s] of sides) {
      const opposite = point('Arm' + (side === 'L' ? 'R' : 'L'));
      free(side, opposite.add(v(s * .105, -.12 + s * .032, .145).applyQuaternion(tilt)),
        v(-s, .52, .12).applyQuaternion(tilt), elbowOut(s).applyQuaternion(tilt));
    }
  }

  function proneLeg(side, thighPitch, kneePitch) {
    world('Thigh' + side, pitch(thighPitch));
    world('Shin' + side, pitch(kneePitch));
    world('Foot' + side, pitch(kneePitch - .27));
  }

  exercise('Ab_Roller', down, ['Kneel and grip the wheel', 'Start with the wheel below your shoulders.'],
    ['Roll straight forward', 'Lengthen through your hips and shoulders without touching your torso to the floor.'],
    ['Pull the wheel back', 'Keep your abdominals braced as you return to kneeling.'], (t) => {
      const a = rep(down, t);
      const hipAngle = lerp(.39, 1.28, a);
      torso(v(0, .077 + .444 * Math.cos(hipAngle), -.473 + .444 * Math.sin(hipAngle)),
        pitch(1.245 + .045 * a), pitch(1.15 + .14 * a));
      for (const [side, s] of sides) {
        leg(side, v(s * .120, .082, -.848), pitch(2.92), v(0, -1, .67));
        grasp(side, v(s * .145, .088, .18 + .69 * a), v(-1, 0, 0), v(0, -.94, .32), elbowOut(s));
      }
      return [v(0, .088, .18 + .69 * a), pitch(.69 * a / .088)];
    }, { animated: 'ab-wheel' }, { fingers: 'LR', framing: 'floor' });

  exercise('Anterior_Tibialis-SMR', scan, ['Sit with your feet planted', 'Set the roller on the outer front of one shin.'],
    ['Roll down the muscle', 'Travel from below the knee to above the ankle, pausing at a point of tension for 10–30 seconds.'],
    ['Return and switch legs', 'Keep the pressure on muscle.'], (t) => {
      const a = rep(scan, t);
      torso(v(0, .138, -.315), pitch(.30 + .23 * a), pitch(.52 + .25 * a));
      leg('L', v(.139, ankleHeight, .316), q(), Y);
      leg('R', v(-.20, ankleHeight, .414), yaw(-.18), v(-.48, 1, 0));
      const start = point('ShinL');
      const end = point('FootL');
      const center = start.lerp(end, .18 + .63 * a).add(v(.054, .042, .070));
      const [fitted, frame] = bar(center, .143, v(0, -.36, 1), elbowOut, { frame: yaw(-.20).multiply(roll(.16)) });
      return [fitted, frame.multiply(pitch(4 * a))];
    }, { animated: 'pin' }, { fingers: 'LR', framing: 'floor' });

  exercise('Balance_Board', hold, ['Place both feet on the board', 'Take a hip-width stance with soft knees.'],
    ['Balance over the center', 'Make small corrections through your ankles and hips. Hold as long as desired.'],
    ['Bring the deck back toward level', 'Keep your weight centered over the board.'], (t) => {
      const envelope = rep(hold, t);
      const tilt = .12 * Math.sin(t * 2.9) * envelope;
      const frame = roll(tilt);
      torso(v(-.16 * tilt, .924 + .018 * envelope, -.014), roll(-tilt * .46), q());
      for (const [side, s] of sides) {
        const ankle = v(s * .157, ankleHeight, -.055).applyQuaternion(frame).add(v(0, .105, 0));
        leg(side, ankle, frame.clone().multiply(yaw(.08 * s)), Z);
        free(side, point('Arm' + side).add(v(s * (.34 + .11 * envelope), -.33, .10)), v(s, -.45, .24));
      }
      return [v(0, .105, 0), frame];
    }, { animated: 'board' });

  const pullBarY = 2.30;
  for (const id of ['Band_Assisted_Pull-Up', 'Weighted_Pull_Ups', 'Rocky_Pull-Ups_Pulldowns', 'One_Handed_Hang']) {
    const one = id === 'One_Handed_Hang';
    const band = id === 'Band_Assisted_Pull-Up';
    const rocky = id === 'Rocky_Pull-Ups_Pulldowns';
    const phase = rocky ? [[0, 'Wide hang'], [.25, 'Pull in front'], [1.32, 'Bar to upper chest'], [1.8, 'Lower'],
      [2.9, 'Arms extended'], [3.15, 'Pull behind'], [4.25, 'Bar behind neck'], [4.72, 'Lower'], [5.95, 'Reset']]
      : one ? hold : up;
    const width = rocky ? .405 : band ? .309 : .253;
    exercise(id, phase,
      one ? ['Grab the bar with one hand', 'Use a pronated grip and leave both feet supported on the step.']
        : band ? ['Loop the band under one bent knee', 'Take a medium to wide grip with the band anchored at the middle of the bar.']
          : rocky ? ['Hang from a wide grip', 'Lean back slightly with your chest lifted.']
            : ['Attach the load to a dip belt', 'Take a medium pronated grip and start with arms extended.'],
      one ? ['Let the supported shoulder lengthen', 'Keep your feet on the step and hold 10–20 seconds before switching.']
        : rocky ? ['Pull toward the upper chest first', 'Lower to a full hang before pulling up on the other side of the bar.']
          : ['Pull without swinging', 'Drive the elbows down until your chin clears the bar.'],
      rocky ? ['Lower before alternating', 'On the next pull, stay upright and tip your head forward only enough to clear the bar.']
        : ['Return slowly', one ? 'Stand back into the step and switch hands.' : 'Lower until the arms are long again.'], (t) => {
        const a = rocky ? motion([0, .25, 1.32, 1.8, 2.9], [0, 0, 1, 1, 0], t) : rep(phase, t);
        const rear = rocky ? motion([0, 2.9, 3.15, 4.25, 4.72, 5.95], [0, 0, 0, 1, 1, 0], t) : 0;
        const theta = one ? -.12 - .08 * a : rocky ? -.36 - .09 * a + .44 * rear : band ? -.05 - .11 * a : -.24 - .11 * a;
        const z = one ? -.098 - .05 * a : rocky ? lerp(.125, .075, a) + .056 * rear : (band ? -.024 : .041) + .082 * a;
        torso(v(one ? .073 + .051 * a : 0, one ? 1.320 - .061 * a : lerp(rocky ? 1.305 : 1.238, 1.745, a) + .486 * rear, z), pitch(theta),
        pitch(one ? -.05 : theta * .4 + .43 * rear));
        if (one) {
          feet(-.105, .137, ankleHeight + .488);
          grasp('L', v(.303, pullBarY, 0), v(-1, 0, 0), v(0, 1, .21), elbowBack(1));
          relax('R', -1);
        } else {
          for (const [side, s] of sides) {
            const hip = point('Thigh' + side);
            const bent = band && side === 'L';
            leg(side, hip.add(v(-s * .021, bent ? -.51 : -.79, bent ? -.27 : -.056)),
              pitch(bent ? 1.08 : .35), bent ? v(-.38, .05, 1) : Z);
            grasp(side, v(s * width, pullBarY, 0), v(-1, 0, 0), v(0, 1, .23 - .44 * rear),
              v(s * (rocky ? .86 : .30), -.71, -.55 - .32 * rear));
          }
        }
      }, { kind: 'pull-up', band, weight: id === 'Weighted_Pull_Ups', step: one },
    { fingers: one ? 'L' : 'LR' });
  }

  const partnerStretch = [[0, 'Set up'], [.35, 'Begin pressing'], [1.55, 'Hold the press'],
    [2.95, 'Relax and let the elbows move back'], [5.8, 'Reset']];
  exercise('Behind_Head_Chest_Stretch', partnerStretch, ['Sit tall with your hands behind your head', 'Have your partner support both elbows from behind.'],
    ['Press gently against your partner’s hands', 'Hold for at least 10 seconds without moving your elbows.'],
    ['Relax into the stretch', 'Let your partner guide your elbows back and say when the stretch is enough.'], (t) => {
      const a = motion([0, 1.55, 2.95, 4.25, 4.75, 5.8], [0, 0, 0, 1, 1, 0], t);
      torso(v(0, .136, 0), pitch(-.08 * a), pitch(.045));
      for (const [side, s] of sides) {
        leg(side, v(s * .22, .088, .53), yaw(-s * .40), v(s * .89, .81, .08));
        const wrist = point('Head').add(v(s * .126, .075, -.080));
        arm(side, wrist, v(s, -.28, .50 - 1.55 * a), openHand(s, v(-s, .28, -.05), v(0, .12, -1)));
      }
    }, { kind: 'partner', contact: 'elbows' }, { framing: 'floor' });

  for (const id of ['Chair_Leg_Extended_Stretch', 'Chair_Upper_Body_Stretch', 'Foot-SMR']) {
    const extend = id === 'Chair_Leg_Extended_Stretch';
    const upper = id === 'Chair_Upper_Body_Stretch';
    const phase = extend ? [[0, 'Sit upright'], [.25, 'Extend knee'], [1.25, 'Leg straight'], [2.2, 'Sweep out'],
      [2.68, 'Pause'], [3.52, 'Return to center'], [4.33, 'Lower heel']] : upper ? hold : scan;
    exercise(id, phase,
      extend ? ['Sit upright and hold the seat', 'Start with both feet planted.']
        : upper ? ['Sit on the edge and grip the chair back', 'Keep both feet planted.']
          : ['Sit with one arch on the roller', 'Place the roller across your bare foot.'],
      extend ? ['Straighten the knee and flex the ankle', 'Sweep the straight leg outward without leaning back.']
        : upper ? ['Move your chest forward', 'Keep your back straight and hold the stretch for 20–30 seconds.']
          : ['Roll across the arch', 'Press down and pause on an area of tension for 10–30 seconds.'],
      extend ? ['Bring the leg back to center and lower', 'Repeat on the other side.']
        : upper ? ['Ease back upright', 'Release the stretch gradually.']
          : ['Return and switch feet', 'Keep the other foot planted.'], (t) => {
        const a = extend ? motion([0, .25, 1.25, 3.52, 4.33], [0, 0, 1, 1, 0], t) : rep(phase, t);
        const sweep = extend ? motion([0, 1.25, 2.2, 2.68, 3.52, 4.33], [0, 0, 1, 1, 0, 0], t) : 0;
        torso(v(0, .565, upper ? .115 + .085 * a : .026), pitch(upper ? .10 + .25 * a : extend ? -.031 : .13), q());
        leg('R', v(-.145, ankleHeight, .493), yaw(-.08), Z);
        if (extend) {
          const hip = point('ThighL');
          const angle = .45 * sweep;
          const raised = hip.add(v(.79 * Math.sin(angle), -.075, .79 * Math.cos(angle)));
          leg('L', v(.145, ankleHeight, .493).lerp(raised, a), yaw(angle).multiply(pitch(-.32 * a)), Y);
        } else if (upper) {
          leg('L', v(.145, ankleHeight, .505), yaw(.08), Z);
        } else {
          const roller = v(.147, .033, .627 + .065 * a);
          const frame = pitch(.055 - .10 * a);
          const arch = v(0, -.073, .107 - .065 * a).applyQuaternion(frame);
          leg('L', roller.clone().add(v(0, .033, 0)).sub(arch), frame, Z);
        }
        for (const [side, s] of sides) {
          if (upper) grasp(side, v(s * .221, .894, -.219), v(-1, 0, 0), v(0, -.86, -.5), elbowBack(s));
          else if (extend) grasp(side, v(s * .214, .453, .087), Z, v(0, -1, .09), elbowOut(s));
          else free(side, v(s * .187, .585, .235), v(0, -.20, 1));
        }
        if (!extend && !upper) return [v(.147, .033, .627 + .065 * a), pitch(.065 * a / .033)];
      }, { kind: 'chair', ...(!extend && !upper && { animated: 'foot-roller' }) },
    { fingers: upper || extend ? 'LR' : '', framing: 'bench' });
  }

  for (const [id, reverse] of [['Chest_And_Front_Of_Shoulder_Stretch', false], ['Round_The_World_Shoulder_Stretch', true]]) {
    exercise(id, hold,
      reverse ? ['Hold the stick behind your hips', 'Use a wide grip with your palms down and thumbs outward.']
        : ['Take a wide grip in front', 'Stand with your legs together and hold the stick palms down.'],
      reverse ? ['Lift the stick behind you', 'Keep your arms long and stop at a comfortable overhead position.']
        : ['Arc the stick overhead and back', 'Keep the movement smooth as the stick passes behind your head.'],
      ['Return along the same path', 'Move only through a comfortable range.'], (t) => {
        const a = rep(hold, t);
        const angle = lerp(reverse ? 3.66 : 2.64, reverse ? 5.68 : -.91, a);
        torso(v(0, .887, 0), pitch(.018), q());
        stance(.081, 0, .08);
        const shoulder = point('ArmL');
        const center = v(0, shoulder.y + .478 * Math.cos(angle), shoulder.z + .474 * Math.sin(angle));
        return bar(center, reverse ? .475 : .433, v(0, Math.cos(angle), Math.sin(angle) + .001),
          (s) => v(s, -.12, .35), { underhand: reverse });
      }, { animated: 'stick' }, { fingers: 'LR' });
  }

  exercise('Donkey_Calf_Raises', up, ['Set your forefeet on the block', 'Bend at the hip, take the side handles and position the pad over your tailbone.'],
    ['Raise both heels', 'Keep the knees soft and still while the ankles extend.'],
    ['Lower your heels off the edge', 'Pause where you feel a stretch through your calves.'], (t) => {
      const a = rep(up, t);
      const footPitch = pitch(-.17 + .65 * a);
      const hip = v(0, .975 + .089 * a, -.253 - .019 * a);
      torso(hip, pitch(1.48), pitch(.92));
      for (const [side, s] of sides) {
        const ankle = v(0, .073, -.125).applyQuaternion(footPitch).add(v(s * .153, .17, -.213));
        leg(side, ankle, footPitch, v(s * .13, 0, 1));
        grasp(side, v(s * .315, .86, .459), v(-1, 0, 0), v(0, -.15, 1), elbowOut(s));
      }
      return [hip.clone().add(v(0, .116, -.027))];
    }, { kind: 'donkey', animated: 'calf-pad' }, { fingers: 'LR', framing: 'bench' });

  exercise('Hyperextensions_Back_Extensions', down, ['Set your upper thighs on the pad', 'Secure your ankles under the roller and cross your arms over your chest.'],
    ['Hinge at your waist', 'Keep your back flat while lowering until you feel a hamstring stretch.'],
    ['Raise your torso to a straight line', 'Use a controlled lift and stop when your torso lines up with your legs.'], (t) => {
      const a = rep(down, t);
      const tilt = pitch(1.08 + 1.17 * a);
      torso(v(0, .935, .06), tilt);
      for (const [side, s] of sides) {
        leg(side, v(s * .117, .568, -.66), pitch(.81), v(0, -.8, .45));
      }
      crossArms(tilt);
    }, { kind: 'back-extension' }, { framing: 'bench' });

  for (const id of ['IT_Band_and_Glute_Stretch', 'Intermediate_Hip_Flexor_and_Quad_Stretch', 'Quad_Stretch']) {
    const it = id === 'IT_Band_and_Glute_Stretch';
    const prone = id === 'Intermediate_Hip_Flexor_and_Quad_Stretch';
    exercise(id, hold,
      it ? ['Lie on your back and loop the belt around one foot', 'Keep the other leg extended on the floor.']
        : prone ? ['Lie face down and loop the belt around one foot', 'Bend the knee and hold both ends of the belt.']
          : ['Lie on your side with the top foot in the loop', 'Bend the top knee and draw the heel toward your glutes.'],
      it ? ['Draw your straight leg across your body', 'Keep it off the floor and use the belt to pull the toes up.']
        : prone ? ['Pull the heel toward you and lift the thigh', 'Let the knee and hip rise as the front of the thigh lengthens.']
          : ['Pull the belt over your shoulder', 'Keep your hips stacked as you gently extend the top hip.'],
      ['Release gently and switch legs', 'Hold the stretch for 10–20 seconds at a comfortable tension.'], (t) => {
      const a = rep(hold, t);
      const tilt = it ? pitch(-rightAngle) : prone ? pitch(rightAngle) : roll(rightAngle);
      if (it) {
        torso(v(0, .137, 0), tilt, pitch(-1.42));
        leg('R', v(-.13, ankleHeight, .81), pitch(-.26), Y);
        const hip = point('ThighL');
        leg('L', hip.add(v(-.49 - .125 * a, .544 + .035 * a, .374 - .21 * a).setLength(.813)),
          yaw(-.77 - .45 * a).multiply(pitch(-.51 - .20 * a)), v(0, -.1, 1));
      } else if (prone) {
        torso(v(0, .189 + .048 * a, 0), pitch(rightAngle + .13 * a), pitch(1.54));
        proneLeg('R', 1.52, 1.57);
        world('FootR', pitch(2.98));
        world('ThighL', pitch(1.73 + .26 * a));
        world('ShinL', pitch(2.96 + .32 * a));
        world('FootL', pitch(2.66 + .32 * a));
      } else {
        torso(v(0, .256, 0), tilt, tilt);
        leg('R', v(.79, .105, .153), yaw(rightAngle), v(0, .05, 1));
        const hip = point('ThighL');
        leg('L', hip.add(v(.19 - .04 * a, .018, -.13 - .129 * a)),
          yaw(-rightAngle - .42 * a), v(1, .32, .11));
      }
      const foot = point('FootL');
      for (const [side, s] of sides) {
        const shoulder = point('Arm' + side);
        const target = it ? shoulder.add(v(-.13 - .12 * a, .25, .12 + s * .06))
          : prone ? shoulder.add(v(s * .045, .168, .257 - .07 * a))
            : v(-.67, .30 + .11 * s, -.07 - .035 * a);
        const dir = foot.clone().sub(target);
        const axis = it || prone ? v(s * .23, 1, .16).cross(dir).normalize() : v(.12, .37, -.92).normalize();
        grasp(side, target, axis, it ? dir : prone ? dir.negate() : v(-.58, -.84, -.15),
          it ? elbowOut(s) : v(s * .4, 1, .24));
      }
    }, { kind: 'belt-stretch' }, { fingers: 'LR', framing: 'floor' });
  }

  exercise('Neck-SMR', scan, ['Place a roller behind your neck', 'Tip one end so the pressure stays on muscle to the side of the spine.'],
    ['Roll from the base of the skull down the neck', 'Pause on muscle for 10–30 seconds.'],
    ['Ease the pressure and switch sides', 'Guide the roller with both hands.'], (t) => {
      const a = rep(scan, t);
      torso(v(0, .139, -.20), pitch(.045), roll(-.045 - .13 * a).multiply(pitch(.11 + .13 * a)));
      for (const [side, s] of sides) leg(side, v(s * .22, .080, .43), yaw(-s * .37), v(s, .66, .25));
      const center = point('Head').add(v(.035, .120 - .192 * a, -.105));
      const [fitted, frame] = bar(center, .146, v(0, .2, -1), (s) => v(s, .09, .87), { frame: roll(.39) });
      return [fitted, frame.multiply(pitch(-5 * a))];
    }, { animated: 'pin' }, { fingers: 'LR', framing: 'floor' });

  for (const id of ['Inverted_Row_with_Straps', 'Suspended_Row', 'Suspended_Push-Up', 'Suspended_Fallout']) {
    const inverted = id === 'Inverted_Row_with_Straps';
    const row = inverted || id === 'Suspended_Row';
    const fallout = id === 'Suspended_Fallout';
    const phase = row ? up : down;
    const length = inverted ? 1.827 : row ? 1.268 : fallout ? 2.13 : 2.30;
    const anchorZ = inverted ? -.30 : row ? .33 : fallout ? .78 : .46;
    const anchors = sides.map(([, s]) => [s * (row || fallout ? .238 : .332), 2.48, anchorZ]);
    const axis = fallout || (row && !inverted) ? v(-1, 0, 0) : Z;
    exercise(id, phase,
      row ? ['Take both handles and lean back', inverted ? 'Plant your heels and hang with a straight body and long arms.' : 'Start with long arms and your chest tall.']
        : ['Lean into the handles', fallout ? 'Set the handles below waist level and begin on an incline.' : 'Hold a straight plank close to the floor.'],
      row ? ['Pull your chest toward the handles', 'Bend the elbows and bring the shoulder blades together.']
        : fallout ? ['Reach overhead with straight arms', 'Let your shoulders open while your hips and spine stay in line.']
          : ['Lower between the handles', 'Bend the elbows past 90 degrees while holding a straight plank.'],
      row ? ['Lower to long arms', 'Keep your heels planted and your hips in line.']
        : ['Reverse the motion', fallout ? 'Use your shoulders and core to return to the incline.' : 'Press evenly through both handles.'], (t) => {
        const a = rep(phase, t);
        const ankleZ = inverted ? .73 : row ? .94 : fallout ? -.70 : -.92;
        const ankleY = row ? .074 : .202;
        const dz = inverted ? .081 - .131 * a : row ? -.122 - .046 * a : fallout ? -.39 + .795 * a : -.05 * a;
        const direction = fallout ? v(0, -Math.cos(1.68 * a), Math.sin(1.68 * a))
          : inverted ? v(0, .84, .45) : row ? v(0, .48 - .54 * a, 1) : v(0, -.88, .44);
        let theta = inverted ? -1.45 + .27 * a : row ? -.98 + .33 * a : 1.17 + .176 * a;
        if (fallout) {
          // Intersect the shoulder's arc around the ankles with the wrist's reach limit.
          const wrist = swingAt(anchors[0], length, dz).sub(grip('L', axis, direction).offset);
          const y = wrist.y - ankleY;
          const z = wrist.z - ankleZ;
          const radius = Math.hypot(y, z);
          const shoulderRadius = .812 + .493;
          const reachSq = (armLength - .006) ** 2 - (wrist.x - .19071) ** 2;
          const cosine = (shoulderRadius ** 2 + radius ** 2 - reachSq) / (2 * shoulderRadius * radius);
          theta = Math.atan2(z, y) - Math.acos(Math.min(1, cosine)) + .004;
        }
        const tilt = pitch(theta);
        const hip = v(0, .812, 0).applyQuaternion(tilt).add(v(0, ankleY, ankleZ));
        torso(hip, tilt, pitch(row && !inverted ? theta * .64 : theta * .9));
        for (const [index, [side, s]] of sides.entries()) {
          leg(side, v(s * .113, ankleY, ankleZ), pitch(row ? -.25 : 1.05), Z);
          const handle = swingAt(anchors[index], length, dz);
          grasp(side, handle, axis, direction, row ? elbowBack(s) : v(s, -.07, -.94));
        }
      }, { kind: 'suspension', anchors, endpoint: 'hands', axis: axis.x ? 'X' : 'Z', length }, { fingers: 'LR', framing: 'bench' });
  }

  for (const id of ['Suspended_Reverse_Crunch', 'Suspended_Split_Squat']) {
    const crunch = id === 'Suspended_Reverse_Crunch';
    const phase = crunch ? up : down;
    const length = crunch ? 2.172 : 1.95;
    const anchors = (crunch ? sides : sides.slice(1)).map(([, s]) => [s * .137, 2.48, crunch ? -.94 : -.74]);
    exercise(id, phase,
      crunch ? ['Set your feet in the low cradles', 'Plant your palms and brace in a straight plank.']
        : ['Place your rear foot in the cradle', 'Face away from the anchor and plant your front foot.'],
      crunch ? ['Draw your knees toward your chest', 'Curl the pelvis up while keeping the hands planted.']
        : ['Lower by bending the front knee and hip', 'Keep your chest up and your weight on the front heel.'],
      crunch ? ['Extend back into the plank', 'Keep your hips from sagging.']
        : ['Drive through your front heel', 'Finish tall and repeat on the other side.'], (t) => {
        const a = rep(phase, t);
        if (crunch) {
          torso(v(0, .357 + .292 * a, -.18 - .03 * a), pitch(1.49 + .57 * a), pitch(1.41));
          world('Chest', pitch(1.51 + .20 * a));
          for (const [side, s] of sides) palm(side, s, v(s * .207, palmHeight + .028, .34), v(0, .17, 1));
        } else {
          torso(v(.016, .892 - .333 * a, -.055 + .067 * a), pitch(.08 + .21 * a), pitch(.09));
          leg('L', v(.137, ankleHeight, .282), q(), Z);
          for (const [side, s] of sides) free(side, point('Arm' + side).add(v(s * .10, -.45 + .10 * a, .10 + .15 * a)),
            v(s * .15, -.87, .22 + .55 * a));
        }
        for (const [index, [side]] of (crunch ? sides : sides.slice(1)).entries()) {
          const foot = pitch(crunch ? 1.22 + .34 * a : 1.40 - .17 * a);
          const center = swingAt(anchors[index], length, crunch ? -.04 + .521 * a : .16 - .19 * a);
          const ankle = center.sub(v(0, -.034, .092).applyQuaternion(foot));
          leg(side, ankle, foot, v(0, -1, .68));
        }
      }, { kind: 'suspension', anchors, endpoint: crunch ? 'feet' : 'footR', length }, { framing: 'bench' });
  }

  const muscle = [[0, 'False-grip hang'], [.34, 'Initiate pull'], [1.26, 'Rings to armpits'],
    [1.68, 'Roll over the rings'], [2.35, 'Press to support'], [2.73, 'Lower with control'], [4.45, 'Reset']];
  const kip = [[0, 'False-grip hang'], [.55, 'Swing feet backward'], [1.1, 'Drive knees forward'], [1.72, 'Roll over the rings'],
    [2.33, 'Press to support'], [2.74, 'Lower with control'], [4.45, 'Reset']];
  for (const id of ['Ring_Dips', 'Muscle_Up', 'Kipping_Muscle_Up']) {
    const dip = id === 'Ring_Dips';
    const kipping = id === 'Kipping_Muscle_Up';
    const phase = dip ? down : kipping ? kip : muscle;
    const length = dip ? .884 : .555;
    const anchors = sides.map(([, s]) => [s * (kipping ? .36 : .298), 2.52, 0]);
    const ringGripAxes = kipping ? sides.map(([, s]) =>
      X.clone().applyQuaternion(helpers.dumbbellGripTransform(s).quaternion).toArray()) : undefined;
    exercise(id, phase,
      dip ? ['Start in ring support', 'Hold the rings by your sides with your elbows straight.']
        : ['Set a false grip on both rings', 'Rest the base of your palms on the rings before you pull.'],
      dip ? ['Lower below a right angle', 'Bend your elbows and keep the rings steady.']
        : kipping ? ['Swing back, then drive the legs forward', 'Pull the rings to your armpits as you roll your shoulders over them.']
          : ['Pull the rings into your armpits', 'Turn your shoulders over the rings as your elbows travel behind you.'],
      dip ? ['Press back to support', 'Extend both elbows without swinging.']
        : ['Press to straight arms', 'Stabilize at the top, then lower with control.'], (t) => {
        const a = dip ? rep(down, t) : motion(phase.map(([at]) => at), [0, kipping ? .03 : 0, kipping ? .45 : .65, .81, 1, 1, 0], t);
        const turnover = dip ? a : motion([0, 1.10, 1.72, 2.74, 3.62, 4.45], [0, 0, 1, 1, .12, 0], t);
        const kick = kipping ? motion([0, .55, 1.1, 1.72, 2.33, 4.45], [0, -.34, .59, .27, 0, 0], t) : 0;
        // Open both rings for the pull and descent, then bring them alongside the forearms in support.
        const swivel = kipping ? motion([0, .33, .74, 1.49, 2.27, 2.80, 3.22, 3.85, 4.45],
          [0, 0, 1.68, 1.68, 0, 0, 1.83, 1.83, 0], t) : 0;
        const handTurn = Math.PI * (kipping
          ? motion([0, .55, 1.07, 1.78, 2.74, 3.55, 4.45], [0, 0, .55, .94, .94, .50, 0], t) : turnover);
        const support = kipping ? motion([0, 1.15, 2.30, 2.74, 3.50, 4.45], [0, 0, 1, 1, 0, 0], t) : 0;
        const hang = kipping ? 1 - a : 0;
        const tilt = dip ? .07 + .38 * a : -.09 + .48 * turnover - .25 * support;
        torso(v(0, dip ? 1.66 - .31 * a : .91 + 1.095 * a + .053 * support + .030 * hang,
          dip ? .058 - .12 * a : -.079 - .13 * Math.sin(Math.PI * a) + .16 * turnover),
        pitch(tilt), pitch(tilt * .5));
        for (const [index, [side, s]] of sides.entries()) {
          const hip = point('Thigh' + side);
          leg(side, hip.add(v(s * .01, -.731 + .34 * Math.abs(kick), -.125 + kick)), pitch(.44 - .58 * kick),
            v(s * .10, 0, 1));
          const handle = swingAt(anchors[index], length, dip ? -.078 * a : -.13 * Math.sin(Math.PI * a),
            kipping ? s * .015 * turnover : 0);
          const roll = -s * Math.sin(Math.PI * turnover);
          const pole = kipping ? v(s * lerp(.15, -.21, turnover), .37 - .55 * kick - .07 * turnover, -.90)
            : dip ? v(s * .15, .74, -1) : v(s, .10, -.90);
          const ring = kipping ? q().setFromUnitVectors(Y, v(...anchors[index]).sub(handle).normalize())
            : pitch(Math.atan2(anchors[index][2] - handle.z, anchors[index][1] - handle.y));
          const gripYaw = kipping ? (s === 1 ? Math.PI - swivel : swivel) : 0;
          const direction = kipping ? v(0, Math.cos(handTurn), Math.sin(handTurn))
            : dip ? v(0, -1, .40) : v(roll, Math.cos(handTurn), .40);
          grasp(side, handle, Z.clone().applyQuaternion(yaw(gripYaw)).applyQuaternion(ring), direction.applyQuaternion(ring), pole, kipping);
        }
      }, { kind: 'suspension', anchors, endpoint: 'hands', axis: 'Z', rings: true, length,
        ...(ringGripAxes && { ringGripAxes }) }, { fingers: 'LR' });
  }

  exercise('Knee_Hip_Raise_On_Parallel_Bars', up, ['Support yourself on the forearm pads', 'Grip the handles, place your lower back against the pad and let your legs hang.'],
    ['Raise your straight legs', 'Lift until your legs are parallel to the floor without swinging.'],
    ['Lower your legs slowly', 'Keep your back supported and your knees straight.'], (t) => {
      const a = rep(up, t);
      torso(v(0, 1.067 + .014 * a, -.065 + .035 * a), pitch(-.034 - .035 * a), q());
      for (const [side, s] of sides) {
        const hip = point('Thigh' + side);
        leg(side, hip.add(v(s * .023, -.815 * Math.cos(rightAngle * a), .815 * Math.sin(rightAngle * a))),
          pitch(.17 - .46 * a), Z);
        grasp(side, v(s * .254, 1.369, .314), Y, v(0, .15, .95), v(s * .20, -1, -.38));
      }
    }, { kind: 'captains-chair' }, { fingers: 'LR' });

  const bridge = [[0, 'Stand on the box'], [.32, 'Lower right hand'], [1.12, 'Lower left hand'], [1.9, 'Reach the low position'],
    [2.45, 'Climb back'], [3.23, 'Switch hands'], [4.15, 'Stand tall']];
  exercise('London_Bridges', bridge, ['Stand on a secure box with the rope', 'Start with the rope in both hands.'],
    ['Walk your hands down the rope', 'Lower as a straight line from shoulders to feet.'],
    ['Climb back hand over hand', 'Keep the feet on the box and reverse the hand sequence.'], (t) => {
      const theta = -motion(bridge.map(([at]) => at), [.16, .16, .65, 1.37, 1.37, .67, .16], t);
      const tilt = pitch(theta);
      torso(v(0, .809, 0).applyQuaternion(tilt).add(v(0, .405, .30)), tilt, pitch(theta * .77));
      feet(.30, .128, .405);
      const low = motion(bridge.map(([at]) => at), [1.60, 1.60, 1.60, .83, .83, 1.6, 1.60], t);
      const high = motion(bridge.map(([at]) => at), [1.84, 1.84, 1.31, 1.31, 1.13, 1.13, 1.84], t);
      const top = v(0, 2.64, .45);
      const direction = v(0, -2.35, -.06 + 1.60 * Math.sin(theta)).setLength(2.51);
      const end = top.clone().add(direction);
      const openR = motion([0, .32, .73, 1.12, 2.45, 2.84, 3.23, 4.15], [0, 0, 1, 0, 0, 1, 0, 0], t);
      const openL = motion([0, 1.12, 1.51, 1.9, 3.23, 3.69, 4.15], [0, 0, 1, 0, 0, 1, 0], t);
      for (const [side, s] of sides) {
        const y = side === 'L' ? high : low;
        const center = top.clone().addScaledVector(direction, (y - top.y) / direction.y);
        center.x += s * .072 * (side === 'L' ? openL : openR);
        graspRope(side, center, direction.clone().normalize(), v(-s, -.21, .52), v(s * .30, -.90, -.35));
      }
      return [end, q(), { L: 1 - openL, R: 1 - openR }];
    }, { kind: 'rope', anchor: [0, 2.64, .45], bridge: true, animated: 'rope-end' }, { fingers: 'dynamic' });

  const climb = [[0, 'Grab overhead'], [.26, 'Jump and wrap'], [.95, 'Pinch the rope'], [1.53, 'Stand and reach'],
    [2.04, 'Bring knees up'], [2.62, 'Stand again'], [3.18, 'Descend hand over hand'], [4.67, 'Return to floor']];
  exercise('Rope_Climb', climb, ['Grip the rope overhead', 'Make a small jump and establish a foot lock.'],
    ['Stand up on the foot lock and take a higher grip', 'Release the rope with your feet, draw the knees up and pinch it again.'],
    ['Lower hand over hand', 'Control the descent with your feet and hands.'], (t) => {
      const times = climb.map(([at]) => at);
      const hip = motion(times, [.886, .962, 1.12, 1.43, 1.47, 1.88, 1.81, .886], t);
      const tuck = motion(times, [0, .05, .65, .15, .72, .17, .44, 0], t);
      const climbZ = motion([0, .26, .95, 3.18, 4.67], [-.18, -.18, -.155, -.155, -.18], t);
      torso(v(0, hip, climbZ), pitch(-.07 - .14 * tuck), pitch(.055 - .29 * tuck));
      const wrap = motion([0, .26, .95, 3.18, 4.67], [0, 0, 1, 1, 0], t);
      for (const [side, s] of sides) {
        const foot = side === 'L' ? .057 : .047;
        leg(side, v(s * lerp(.137, foot, wrap), hip - .812 + .56 * tuck + .062 * wrap * s,
          lerp(-.235, .082 + s * .059, wrap)), yaw(-s * .60 * wrap).multiply(pitch(-.27 * wrap)), v(s * .23, .25, 1));
      }
      const left = motion([0, .95, 1.53, 2.04, 2.62, 3.18, 3.72, 4.67],
        [1.78, 1.85, 2.25, 2.22, 2.64, 2.64, 1.99, 1.78], t);
      const right = motion([0, .26, .95, 1.53, 2.04, 2.62, 3.18, 3.72, 4.67],
        [1.66, 1.66, 2.06, 2.06, 2.45, 2.45, 2.45, 2.45, 1.66], t);
      const releasing = (from, to) => Math.sin(Math.PI * motion([from, to], [0, 1], t));
      const openL = releasing(.95, 1.53) + releasing(2.04, 2.62) + releasing(3.18, 3.72);
      const openR = releasing(.26, .95) + releasing(1.53, 2.04) + releasing(3.72, 4.67);
      for (const [side, s] of sides) {
        const isLeft = side === 'L';
        graspRope(side, v(s * .085 * (isLeft ? openL : openR), isLeft ? left : right, .13),
          Y, v(-s, .19, .57), v(s * .30, -.90, -.35));
      }
      return [undefined, q(), { L: 1 - openL, R: 1 - openR }];
    }, { kind: 'rope', anchor: [0, 2.98, .13] }, { fingers: 'dynamic' });

  exercise('Platform_Hamstring_Slides', up, ['Lie on your back with both legs long', 'Put one heel on a towel or slider.'],
    ['Slide your heel toward you', 'Flex the knee while the other leg stays straight.'],
    ['Push the heel back out', 'Let it glide on the floor and switch sides.'], (t) => {
      const a = rep(up, t);
      torso(v(0, .144, .04), pitch(-1.52), pitch(-1.49));
      leg('R', v(-.135, .094, .848), pitch(-.07), Y);
      const ankle = v(.141, .090, .847 - .562 * a);
      leg('L', ankle, pitch(-.055 + .10 * a), Y);
      for (const [side, s] of sides) free(side, v(s * .31, .080, -.10), v(s * .20, 0, 1), v(s, .2, -.45));
      return [v(ankle.x, .008, ankle.z - .015)];
    }, { animated: 'slider' }, { framing: 'floor' });

  exercise('Seated_Band_Hamstring_Curl', up, ['Sit and loop the band behind both ankles', 'With the band anchored low in front, start with your legs extended.'],
    ['Pull the heels toward the bench', 'Lean back slightly if needed to keep both feet clear of the floor.'],
    ['Extend both knees slowly', 'Keep tension in the band.'], (t) => {
      const a = rep(up, t);
      torso(v(0, .552, 0), pitch(-.13 - .12 * a), q());
      for (const [side, s] of sides) {
        const knee = v(s * .126, .485, .435);
        const angle = .07 + 1.77 * a;
        leg(side, knee.add(v(s * .009, -.374 * Math.sin(angle), .374 * Math.cos(angle))),
          pitch(-.13 + .24 * a), v(s * .04, .34, 1));
        palm(side, s, v(s * .154, .474, -.107), Z);
      }
    }, { kind: 'seated-band' }, { framing: 'bench' });

  exercise('Standing_Elevated_Quad_Stretch', hold, ['Rest one foot on a bench behind you', 'Plant the supporting foot far enough forward to balance.'],
    ['Settle into the stretch', 'Keep a soft bend in the supporting knee without pushing it beyond your toes.'],
    ['Ease out, then switch legs', 'Keep your torso tall and stay balanced.'], (t) => {
      const a = rep(hold, t);
      torso(v(0, .863 - .073 * a, -.017 - .052 * a), pitch(.045 + .04 * a), q());
      leg('R', v(-.13, ankleHeight, .14), q(), Z);
      leg('L', v(.129, .557, -.641), pitch(1.21), v(.15, -1, .27));
      for (const [side, s] of sides) free(side, point('Arm' + side).add(v(s * .131, -.48, .055)), v(s * .25, -1, .12));
    }, { kind: 'quad-bench' });

  exercise('Weighted_Bench_Dip', down, ['Grip the near edge and set your heels on the second bench', 'Have a partner place the dumbbell across your lap.'],
    ['Lower by bending your elbows', 'Keep the elbows close and the forearms near vertical.'],
    ['Press back up', 'Straighten both arms and keep the heels on the bench.'], (t) => {
      const a = rep(down, t);
      torso(v(0, .449 - .137 * a, .037 + .023 * a), pitch(-.055 + .090 * a), q());
      for (const [side, s] of sides) {
        leg(side, v(s * .128, .489, .819), pitch(-.22 + .10 * a), Y);
        arm(side, v(s * .203, .430 + palmHeight, -.195), v(s * .12, .54, -1), openHand(s, Z, Y));
      }
      const lap = point('ThighL').lerp(point('ShinL'), .38);
      return [v(0, lap.y + .136, lap.z)];
    }, { kind: 'bench-dip', animated: 'dumbbell' }, { framing: 'bench' });

  exercise('Weighted_Sit-Ups_-_With_Bands', up, ['Secure your legs in the decline bench rollers', 'Anchor the bands to the low end and bring the handles to the collarbones.'],
    ['Sit up against the bands', 'Keep the hands by the collarbones and raise your torso to vertical.'],
    ['Lower slowly onto the pad', 'Keep the arms still relative to the torso.'], (t) => {
      const a = rep(up, t);
      const tilt = pitch(-rightAngle - Math.PI / 9 + 1.92 * a);
      torso(v(0, .611, .105), tilt, pitch(-1.88 + 1.88 * a));
      world('Chest', pitch(-rightAngle - Math.PI / 9 + 2.04 * a - .12 * a * a));
      for (const [side, s] of sides) {
        leg(side, v(s * .137, .528, .687), pitch(.34), v(s * .09, 1, .09));
        const shoulder = point('Arm' + side);
        grasp(side, shoulder.add(v(-s * .045, -.07, .162).applyQuaternion(tilt)),
          v(0, 1, 0).applyQuaternion(tilt), v(-s, .08, -.23).applyQuaternion(tilt), elbowOut(s).applyQuaternion(tilt));
      }
    }, { kind: 'decline-band' }, { fingers: 'LR', framing: 'bench' });

  exercise('Bodyweight_Flyes', down, ['Set both hands on equally loaded EZ bars', 'Start in a straight push-up plank with both bars free to roll.'],
    ['Roll the bars apart', 'Lower the chest between your hands with a soft bend at the elbows.'],
    ['Draw both bars back in', 'Keep your hips and shoulders moving together.'], (t) => {
      const a = rep(down, t);
      const theta = 1.22 + .28 * a;
      const hip = v(0, .813, 0).applyQuaternion(pitch(theta)).add(v(0, .202, -.92));
      torso(hip, pitch(theta), pitch(1.34 + .12 * a));
      const poses = sides.map(([side, s]) => {
        leg(side, v(s * .122, .202, -.92), pitch(1.05), Z);
        const x = .226 + .40 * a;
        const frame = yaw(rightAngle).multiply(pitch(s * (x - .226) / .145));
        const center = v(s * x, .145, .263 + .096 * a);
        const lane = v(.105, 0, .030).applyQuaternion(frame);
        const handleAxis = v(2, 0, 1).normalize().applyQuaternion(frame);
        grasp(side, center.clone().add(lane), handleAxis, v(s * .29 * a, -.8, .16), v(s * .62, -.08, -.84));
        return [center, frame];
      });
      return [...poses[0], undefined, poses[1]];
    }, { animated: 'fly-bars' }, { fingers: 'LR', framing: 'floor' });

  exercise('Cable_Wrist_Curl', up, ['Sit facing a low pulley', 'Hold the straight bar palms up with your forearms supported on your thighs.'],
    ['Curl the bar upward at the wrists', 'Keep the forearms still, with your wrists past your knees.'],
    ['Lower under cable tension', 'Move only at your wrists.'], (t) => {
      const a = rep(up, t);
      torso(v(0, .552, 0), pitch(.58), pitch(.78));
      feet(.51);
      const direction = v(0, Math.sin(-.53 + 1.41 * a), Math.cos(-.53 + 1.41 * a));
      const wrists = sides.map(([side, s]) => {
        const { hand, offset } = grip(side, X, direction);
        const wrist = v(s * .136, .558, .596);
        arm(side, wrist, v(s * .26, -1, -.21), hand);
        return point('Hand' + side).add(offset);
      });
      return [wrists[0].lerp(wrists[1], .5)];
    }, { kind: 'wrist-cable', animated: 'cable-bar', anchor: [0, .17, 1.17] }, { fingers: 'LR', framing: 'bench' });

  exercise('Smith_Incline_Shoulder_Raise', up, ['Set your shoulders directly under the Smith bar', 'On an incline bench, take a shoulder-width pronated grip with your elbows nearly straight.'],
    ['Reach up through your shoulders', 'Lift the bar along the rails and straighten your arms.'],
    ['Lower to the start', 'Keep the motion small and controlled before reracking.'], (t) => {
      const a = rep(up, t);
      const reversed = yaw(Math.PI);
      const tilt = pitch(rightAngle - Math.PI / 6 + .047).multiply(reversed);
      torso(v(0, .561, -.071), tilt, pitch(rightAngle - Math.PI / 6 + .13).multiply(reversed));
      for (const [side, s] of sides) {
        leg(side, v(-s * .218, ankleHeight, -.447), reversed, v(-s * .20, .85, -1));
        bone('Arm' + side).position.addScaledVector(v(0, .46, .89), .051 * a);
      }
      const y = 1.295 + .087 * a;
      for (const [side, s] of sides) grasp(side, v(-s * .236, y, .354), X, v(0, 1, .1), v(-s, -.44, -.28));
      return [v(0, y, .354)];
    }, { kind: 'smith', animated: 'smith-bar', z: .354 }, { fingers: 'LR', framing: 'bench' });

  exercise('Prone_Manual_Hamstring', up, ['Lie face down with both legs extended', 'Have your partner place a hand against the working heel.'],
    ['Curl one heel up against the hand', 'Start with light resistance and communicate as your partner increases pressure.'],
    ['Lower the heel against resistance', 'Ask your partner to reverse the pressure and keep the hips down.'], (t) => {
      const a = rep(up, t);
      torso(v(0, .183, 0), pitch(rightAngle), pitch(1.34));
      proneLeg('R', 1.54, 1.58);
      proneLeg('L', 1.54, 1.58 + 1.70 * a);
      world('FootR', pitch(2.93));
      world('FootL', pitch(2.93 + 1.28 * a));
      for (const [side, s] of sides) palm(side, s, v(s * .24, palmHeight + .029, .51), v(-s, .17, .51));
    }, { kind: 'partner', contact: 'heel' }, { framing: 'floor' });

  return entries;
}
