import {
  X, Y, Z, ankleHeight, createAuthor, cues, down, frameFromDown, lerp, mix, motion,
  pitch, q, rep, roll, sides, smoothstep, up, v, yaw,
} from './barbell-standing-more.mjs';
import { openHand, palmHeight } from './hand-frame.mjs';

export const groupLabel = 'Strongman and specialty strength';
const quarter = Math.PI / 2;
const metadata = {
  'Atlas_Stone_Trainer': ['Atlas Stone Trainer', ['Upper back'], ['Biceps', 'Forearms', 'Glutes', 'Hamstrings', 'Quadriceps']],
  'Atlas_Stones': ['Atlas Stones', ['Upper back'], ['Core', 'Adductors', 'Biceps', 'Calves', 'Forearms', 'Glutes', 'Hamstrings', 'Quadriceps']],
  'Axle_Deadlift': ['Axle Deadlift', ['Upper back'], ['Forearms', 'Glutes', 'Hamstrings', 'Quadriceps']],
  'Car_Deadlift': ['Car Deadlift', ['Quadriceps'], ['Forearms', 'Glutes', 'Hamstrings', 'Upper back']],
  'Chain_Handle_Extension': ['Chain Handle Extension', ['Triceps'], []],
  'Chain_Press': ['Chain Press', ['Chest'], ['Shoulders', 'Triceps']],
  'Circus_Bell': ['Circus Bell', ['Shoulders'], ['Forearms', 'Glutes', 'Hamstrings', 'Upper back', 'Triceps']],
  'Conans_Wheel': ["Conan's Wheel", ['Quadriceps'], ['Core', 'Biceps', 'Calves', 'Forearms', 'Upper back', 'Shoulders']],
  'Crucifix': ['Crucifix', ['Shoulders'], ['Forearms']],
  'Farmers_Walk': ["Farmer's Walk", ['Forearms'], ['Core', 'Glutes', 'Hamstrings', 'Upper back', 'Quadriceps']],
  'Keg_Load': ['Keg Load', ['Upper back'], ['Core', 'Biceps', 'Calves', 'Forearms', 'Glutes', 'Hamstrings', 'Quadriceps', 'Shoulders']],
  'Kettlebell_Turkish_Get-Up_Lunge_style': ['Kettlebell Turkish Get-Up (Lunge style)', ['Shoulders'], ['Core', 'Hamstrings', 'Quadriceps', 'Triceps']],
  'Kettlebell_Turkish_Get-Up_Squat_style': ['Kettlebell Turkish Get-Up (Squat style)', ['Shoulders'], ['Core', 'Calves', 'Hamstrings', 'Quadriceps', 'Triceps']],
  'Kneeling_Jump_Squat': ['Kneeling Jump Squat', ['Glutes'], ['Calves', 'Hamstrings', 'Quadriceps']],
  'Log_Lift': ['Log Lift', ['Shoulders'], ['Core', 'Chest', 'Glutes', 'Hamstrings', 'Upper back', 'Quadriceps', 'Triceps']],
  'Lying_Cambered_Barbell_Row': ['Lying Cambered Barbell Row', ['Upper back'], ['Biceps']],
  'Lying_Face_Down_Plate_Neck_Resistance': ['Lying Face Down Plate Neck Resistance', [], []],
  'Lying_Face_Up_Plate_Neck_Resistance': ['Lying Face Up Plate Neck Resistance', [], []],
  'One-Arm_Open_Palm_Kettlebell_Clean': ['One-Arm Open Palm Kettlebell Clean', ['Hamstrings'], ['Forearms', 'Glutes', 'Upper back', 'Quadriceps', 'Shoulders']],
  'Open_Palm_Kettlebell_Clean': ['Open Palm Kettlebell Clean', ['Hamstrings'], ['Glutes', 'Upper back', 'Quadriceps', 'Shoulders']],
  'Otis-Up': ['Otis-Up', ['Core'], ['Chest', 'Shoulders', 'Triceps']],
  'Plyo_Kettlebell_Pushups': ['Plyo Kettlebell Pushups', ['Chest'], ['Shoulders', 'Triceps']],
  'Power_Stairs': ['Power Stairs', ['Hamstrings'], ['Adductors', 'Calves', 'Glutes', 'Upper back', 'Quadriceps', 'Shoulders']],
  'Rickshaw_Carry': ['Rickshaw Carry', ['Forearms'], ['Core', 'Calves', 'Glutes', 'Hamstrings', 'Upper back', 'Quadriceps']],
  'Rickshaw_Deadlift': ['Rickshaw Deadlift', ['Quadriceps'], ['Forearms', 'Glutes', 'Hamstrings', 'Upper back']],
  'Sandbag_Load': ['Sandbag Load', ['Quadriceps'], ['Core', 'Biceps', 'Calves', 'Forearms', 'Glutes', 'Hamstrings', 'Upper back', 'Shoulders']],
  'Seated_Head_Harness_Neck_Resistance': ['Seated Head Harness Neck Resistance', [], []],
  'Sledgehammer_Swings': ['Sledgehammer Swings', ['Core'], ['Calves', 'Forearms', 'Upper back', 'Shoulders']],
  'Standing_Olympic_Plate_Hand_Squeeze': ['Standing Olympic Plate Hand Squeeze', ['Forearms'], ['Biceps']],
  'Tire_Flip': ['Tire Flip', ['Quadriceps'], ['Calves', 'Chest', 'Forearms', 'Glutes', 'Hamstrings', 'Upper back', 'Shoulders', 'Triceps']],
  'Trap_Bar_Deadlift': ['Trap Bar Deadlift', ['Quadriceps'], ['Glutes', 'Hamstrings']],
  'Weighted_Squat': ['Weighted Squat', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings']],
  'Wrist_Roller': ['Wrist Roller', ['Forearms'], ['Shoulders']],
  'Yoke_Walk': ['Yoke Walk', ['Quadriceps'], ['Core', 'Glutes', 'Adductors', 'Calves', 'Hamstrings', 'Upper back']],
};

const elbows = (s) => v(s * .75, -.6, -.35);
const hanging = (s) => v(s * .22, -.14, -1);
const below = v(0, -1, 0);
const across = v(-1, 0, 0);
const phasesAt = (times, labels) => labels.map((label, i) => [times[i], label]);
const returnCue = ['Reverse with control', 'Keep the load close and return along the same path.'];

export function createEntries(asset, helpers) {
  const { entries, add, torso, bone, point, rotation, world, stance, leg, arm, free, grip, bar, backRack, armLength } =
    createAuthor(asset, helpers, metadata);

  function take(side, center, axis, direction, pole) {
    const { hand, offset } = grip(side, axis, direction);
    arm(side, center.clone().sub(offset), pole, hand);
    return point('Hand' + side).add(offset);
  }

  function palm(side, sign, center, along, dorsal, pole, followWrist = false) {
    const hand = openHand(sign, along, dorsal);
    arm(side, center.clone().addScaledVector(along.clone().normalize(), -.068)
      .addScaledVector(dorsal.clone().normalize(), .032), pole, hand, followWrist);
  }

  function handles(center, frame, slots, followWrist = false) {
    const anchors = slots.map(({ side, at, axis, along, pole }) => {
      const { hand, offset } = grip(side, axis.clone().applyQuaternion(frame), along);
      const delta = at.clone().applyQuaternion(frame).sub(offset);
      return { side, hand, pole, delta };
    });
    const fitted = center.clone();
    for (let pass = 0; pass < 6; pass++) {
      for (const { side, delta } of anchors) {
        const origin = point('Arm' + side).sub(delta);
        const reach = fitted.clone().sub(origin);
        if (reach.length() > armLength - .002) fitted.copy(origin).add(reach.setLength(armLength - .002));
      }
    }
    for (const { side, pole, hand, delta } of anchors) arm(side, fitted.clone().add(delta), pole, hand, followWrist);
    return [fitted, frame];
  }

  const neutral = (width, along = below, facing = 0, depth = 0) => sides.map(([side, s]) => ({
    side, at: v(s * width, 0, depth), axis: Z, along, pole: hanging(s).applyQuaternion(yaw(facing)),
  }));

  function loaded(id, kind, phases, setup, action, pose, options = {}, reset = returnCue) {
    add(id, phases, cues(phases, setup, action, reset), pose, {
      equipment: '', ...options, finalStrengthFixture: { kind },
    });
  }

  for (const [id, kind, width, bottom, front, depth, lean] of [
    ['Axle_Deadlift', 'axle', .265, .225, .30, .55, 1.01],
    ['Car_Deadlift', 'car', .355, .285, .095, .49, .76],
    ['Rickshaw_Deadlift', 'rickshaw', .372, .235, .087, .42, .73],
    ['Trap_Bar_Deadlift', 'trap', .32, .225, .103, .41, .72],
  ]) {
    loaded(id, kind, up, ['Set your grip', kind === 'axle' ? 'Use a shoulder-width mixed grip on the thick axle.'
      : 'Stand between the handles and brace before lifting.'],
    ['Stand tall with the load', 'Drive through both feet and extend your hips and knees.'], (t) => {
      const a = rep(up, t);
      torso(v(0, lerp(depth, .866, a), lerp(-.105, -.015, a)), pitch(lerp(lean, .025, a)), pitch(.10 * (1 - a)));
      stance(kind === 'trap' ? .159 : .145, .02);
      if (kind === 'axle') {
        const slots = sides.map(([side, s]) => ({
          side, at: v(s * width, 0, 0), axis: s > 0 ? across : X,
          along: v(0, -1, s > 0 ? .25 : -.25), pole: hanging(s),
        }));
        return handles(v(0, lerp(bottom, .708, a), lerp(front, .207, a)), q(), slots);
      }
      if (kind === 'car') {
        const frame = pitch(.351 * a);
        const center = v(0, 0, -1.62).applyQuaternion(frame).add(v(0, bottom, front + 1.62));
        for (const [side, s] of sides) take(side, center.clone().add(v(s * width, 0, 0)),
          Z.clone().applyQuaternion(frame), below, hanging(s));
        return [center, frame];
      }
      return handles(v(0, lerp(bottom, .715, a), front), q(), neutral(width));
    });
  }

  function carryStride(progress, facing, origin, stepLength) {
    for (const [side, s] of sides) {
      const cycle = progress + (s < 0 ? .5 : 0);
      const n = Math.floor(cycle);
      const phase = cycle - n;
      const swing = Math.max(0, (phase - .50) * 2);
      const advance = stepLength * (n + motion([0, 1], [0, 1], swing) - cycle + .25);
      const lift = .11 * Math.sin(Math.PI * swing);
      const ankle = v(s * .135, ankleHeight + lift, advance).applyQuaternion(yaw(facing)).add(origin);
      leg(side, ankle, yaw(facing + s * .09).multiply(pitch(.23 * Math.sin(Math.PI * swing))),
        v(s * .15, 0, 1).applyQuaternion(yaw(facing)));
    }
  }

  const walkTimes = [0, .95, 1.35, 4.75, 5.2, 6.05];
  const walkPhases = phasesAt(walkTimes, ['Grip', 'Lift', 'Start walking', 'Finish walking', 'Set down']);
  for (const [id, kind, width, length] of [
    ['Farmers_Walk', 'farmer', .355, .66],
    ['Rickshaw_Carry', 'rickshaw', .372, .57],
    ['Yoke_Walk', 'yoke', .46, .49],
  ]) {
    const yoke = kind === 'yoke';
    loaded(id, kind, walkPhases, [yoke ? 'Set the crossbar across your shoulders' : 'Lift both handles evenly',
      yoke ? 'Brace under the yoke and steady the uprights.' : 'Stand between the handles and drive through your heels.'],
    ['Take short, quick steps', 'Keep your chest steady and look ahead.'], (t) => {
      const raised = motion(walkTimes, [0, 1, 1, 1, 1, 0], t);
      const travel = Math.max(0, Math.min(4, (t - 1.35) * 4 / 3.4));
      const z = length * travel;
      const bob = .018 * Math.sin(2 * Math.PI * travel) ** 2;
      torso(v(0, lerp(yoke ? .73 : kind === 'farmer' ? .421 : .39, .846, raised) + bob, z - .026), pitch(lerp(yoke ? .19 : .84, .065, raised)));
      if (t >= 1.35 && t <= 4.75) carryStride(travel, 0, v(0, 0, z), length);
      else for (const [side, s] of sides) leg(side, v(s * .135, ankleHeight, z + (s > 0 ? .25 : -.25) * length), yaw(s * .09));
      if (yoke) {
        const center = v(0, lerp(1.285, 1.405, raised) + bob, z - .052);
        for (const [side, s] of sides) {
          take(side, center.clone().add(v(s * width, -.205, 0)), Y, v(s * .5, 0, -1), v(s * .5, -.5, 1));
        }
        return [center, q()];
      }
      const center = v(0, lerp(.235, .701, raised) + bob, z + .104);
      if (kind === 'rickshaw') return handles(center, q(), neutral(width));
      const held = sides.map(([side, s]) => [take(side, center.clone().add(v(s * width, 0, 0)), Z, below, hanging(s)), q()]);
      return [...held[0], undefined, held[1]];
    }, { duration: 6.2, oneShot: true }, ['Finish the carry', 'Stop walking and set the implement down under control.']);
  }

  {
    const times = [0, .8, 1.2, 5.9, 6.35, 7.1];
    const phases = phasesAt(times, ['Hook elbows', 'Stand', 'Start turn', 'Complete turn', 'Set down']);
    loaded('Conans_Wheel', 'wheel', phases, ['Cradle the beam in your elbows', 'Clasp your wrist and stand with your chest up.'],
      ['Walk around the pivot', 'Use quick steps and keep the load close.'], (t) => {
        const a = motion(times, [0, 1, 1, 1, 1, 0], t);
        const progress = Math.max(0, Math.min(1, (t - 1.2) / 4.7));
        const facing = Math.PI * 2 * progress;
        const frame = yaw(facing);
        const bob = .013 * Math.sin(progress * 28 * Math.PI) ** 2;
        const beamY = .855 + .227 * a + bob;
        const radius = Math.sqrt(1.25 ** 2 + (.855 - .65) ** 2 - (beamY - .65) ** 2);
        const origin = v(1.25, 0, 0).sub(v(radius, 0, 0).applyQuaternion(frame));
        torso(origin.clone().add(v(0, .665 + .179 * a + bob, 0)), frame.clone().multiply(pitch(.16 - .09 * a)));
        if (progress > 0 && progress < 1) carryStride(progress * 14, facing, origin, .56);
        else for (const [side, s] of sides) leg(side,
          v(s * .135, ankleHeight, s * .14).applyQuaternion(frame).add(origin), yaw(facing + s * .09));
        const center = v(0, beamY, .245).applyQuaternion(frame).add(origin);
        for (const [side, s] of sides) free(side,
          center.clone().add(v(s * .042, .19, .012).applyQuaternion(frame)),
          v(-s, .48, 0).applyQuaternion(frame), v(s, -1, -.1).applyQuaternion(frame));
        return [center, frame];
      }, { duration: 7.25, oneShot: true, fingers: '' }, ['Finish the turn', 'Stop at the starting point and lower the beam.']);
  }

  for (const [id, kind, floor, halfWidth, top] of [
    ['Atlas_Stone_Trainer', 'trainer', .225, .137, 1.19],
    ['Atlas_Stones', 'stone', .217, .173, 1.27],
    ['Keg_Load', 'keg', .262, .17, 1.30],
    ['Sandbag_Load', 'sandbag', .132, .22, 1.18],
    ['Power_Stairs', 'stairs', .315, .115, .747],
  ]) {
    const lap = kind === 'trainer' || kind === 'stone';
    const repeat = kind === 'trainer';
    const stairs = kind === 'stairs';
    const times = [0, .46, 1.04, 1.64, 2.25, 2.95, 3.47, 3.97, 4.5, 5.3];
    const phases = phasesAt(times, ['Set grip', kind === 'keg' ? 'Tilt keg' : 'Break from floor',
      lap ? 'Lap the load' : 'Pull in', lap ? 'Regrip' : 'Stand',
      stairs ? 'Swing forward' : 'Extend', repeat ? 'Hold' : 'Approach', repeat ? 'Lower' : 'Set down', repeat ? 'Lap' : 'Release']);
    loaded(id, kind, phases, [lap ? 'Wrap your arms around the load' : 'Get both hands on the implement',
      kind === 'keg' ? 'Tilt the keg and reach for the opposite bottom rim.'
        : stairs ? 'Set your feet wide with the weight between them.' : 'Brace with the load close to your shins.'],
    [lap ? 'Lap the load and regrip' : stairs ? 'Drive the weight upward' : 'Pull the load into your chest',
      lap ? 'Sit back onto your thighs before wrapping higher around it.' : 'Extend your knees and hips together.'], (t) => {
      const at = (values) => motion(times, values, t);
      const z = at(repeat ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        : [0, 0, 0, 0, .13, .49, .62, .62, .62, .62]);
      const hipY = at(repeat ? [.375, .39, .414, .415, .846, .862, .61, .415, .395, .375]
        : [.40, .42, lap ? .43 : .63, lap ? .50 : .79, .825, .825, .845, .835, .855, .855]);
      const tilt = at(repeat ? [1.05, .93, .59, .42, -.10, -.13, .36, .43, .85, 1.05]
        : [1.05, .85, lap ? .65 : .52, lap ? .35 : .15, .08, .13, .15, .09, .04, .04]);
      torso(v(0, hipY, z - .05), pitch(tilt), pitch(tilt * .37));
      for (const [side, s] of sides) {
        const step = at(s > 0 ? [0, 0, 0, 0, .31, .41, .59, .59, .59, .59]
          : [0, 0, 0, 0, .02, .62, .62, .62, .62, .62]);
        leg(side, v(s * (stairs ? .246 : .224), ankleHeight + (repeat ? 0 : .094 * Math.sin(Math.PI * step / .62) ** 2),
          repeat ? 0 : step), yaw(s * .23));
      }
      const center = v(0, at(repeat ? [floor, floor + .025, .574, .633, top, top + .04, .886, .61, .41, floor]
        : [floor, floor + .047, lap ? .587 : .81, lap ? .676 : .99, stairs ? .71 : 1.10, stairs ? top + .12 : top + .055, top, top, top, top]),
      at(repeat ? [.38, .376, .33, .34, .32, .32, .33, .34, .36, .38]
        : [.38, .379, .34, .35, .49, .85, .993, .993, .993, .993]));
      const angle = at(kind === 'keg' ? [0, -.77, -1.11, -1.16, -1.05, -.56, 0, 0, 0, 0]
        : kind === 'stone' ? [0, .11, .37, .65, .93, 1.05, 1.1, 1.1, 1.1, 1.1]
          : stairs ? [0, 0, .12, .10, -.18, -.23, 0, 0, 0, 0] : [0, 0, .13, .20, .23, .14, 0, 0, 0, 0]);
      const frame = pitch(angle);
      if (kind === 'keg') center.y = Math.max(center.y, .260 * Math.cos(angle) + .163 * Math.abs(Math.sin(angle)));
      const release = repeat ? 0 : at([0, 0, 0, 0, 0, 0, 0, .35, 1, 1]);
      const handShift = at([0, 0, .02, 1, 1, 1, 1, 1, repeat ? .12 : 1, repeat ? 0 : 1]);
      for (const [side, s] of sides) {
        const contact = kind === 'keg' ? v(s * .105, s * .23, s > 0 ? -.095 : .095)
          : v(s * halfWidth, lap ? lerp(-.13, .066, handShift) : stairs ? 0 : -.017, lap ? .015 : -.01);
        const target = contact.applyQuaternion(frame).add(center).lerp(v(s * .23, hipY + .03, z + .10), release);
        if (stairs) take(side, target, across, below, elbows(s));
        else palm(side, s, target, v(-s * .34, lerp(-.75, -.28, handShift), .65),
          v(s * .9, .07, -.13).applyQuaternion(frame), elbows(s));
      }
      return [center, frame];
    }, { duration: 5.45, oneShot: !repeat, fingers: stairs ? 'LR' : '' },
    [repeat ? 'Return through the lap' : 'Transfer the load onto the platform',
      repeat ? 'Keep the trainer close as you lower it.' : 'Set it down securely before letting go.']);
  }

  for (const [id, circus] of [['Log_Lift', false], ['Circus_Bell', true]]) {
    const times = [0, .50, 1.07, 1.35, 1.64, 1.99, 2.48, 2.91, 3.55, 4.35, 4.6];
    const phases = phasesAt(times, ['Grip', 'Clean', 'Rack', 'Dip', 'Drive', 'Lock out', 'Hold', 'Lower', 'Guide to floor', 'Reset']);
    loaded(id, circus ? 'circus' : 'log', phases,
      [circus ? 'Clean with both hands' : 'Grip the log and pull it high', circus ? 'Set one head behind the working shoulder.'
        : 'Roll the log onto your upper chest as you stand.'],
      ['Dip and drive', circus ? 'Press with the working arm and lean slightly away.' : 'Push your head through as the log clears it.'],
      (t) => {
        const at = (values) => motion(times, values, t);
        const hipY = at([.465, .59, .848, .744, .855, .858, .858, .841, .663, .465, .465]);
        const lean = at([1.02, .76, -.12, -.083, -.12, .05, .035, -.112, .43, 1.02, 1.02]);
        const release = circus ? at([0, 0, 1, 1, 1, 1, 1, 1, .25, 0, 0]) : 0;
        const x = circus ? at([0, -.06, -.27, -.27, -.29, -.26, -.26, -.27, -.12, 0, 0]) : 0;
        torso(v(.092 * release, hipY, -.073), pitch(lean).multiply(roll(-.12 * release)), pitch(.35 * lean));
        stance(circus ? .223 : .185, .01);
        const center = v(x,
          at([circus ? .164 : .16, .69, 1.34, 1.237, 1.62, 1.907, 1.907, 1.34, .79, circus ? .164 : .16, circus ? .164 : .16]),
          at([.38, .35, circus ? .055 : .255, circus ? .052 : .258, .15, .027, .025, .22, .31, .38, .38]));
        const frame = circus ? yaw(at([0, .13, .95, .95, .68, .09, .09, .95, .44, 0, 0]))
          : pitch(at([.45, 1.10, 1.35, 1.35, .74, .11, .11, 1.18, .93, .45, .45]));
        const turn = at([.25, .35, 2.31, 2.34, 2.57, 2.57, 2.57, 2.34, .62, .25, .25]);
        const along = v(0, -Math.cos(turn), Math.sin(turn));
        const rackElbow = smoothstep(t, .5, 1.07) * (1 - smoothstep(t, 2.91, 3.55));
        if (!circus) return handles(center, frame, neutral(.237, along).map((slot, index) => ({
          ...slot, along: along.clone().add(v((2 * index - 1) * .38, 0, 0)),
          pole: v((1 - 2 * index) * lerp(.22, .84, rackElbow), -.14, -1),
        })), true);
        const fit = handles(center, frame, [
          { side: 'R', at: v(-.048, 0, 0), axis: across, along, pole: v(-.81, -.56, -.80).lerp(v(-.30, -1, .18), release) },
          { side: 'L', at: v(.054, 0, 0), axis: across, along, pole: v(1, .9, .9) },
        ].slice(0, release === 0 ? 2 : 1), true);
        if (release > 0) {
          const contact = v(.054, 0, 0).applyQuaternion(frame).add(fit[0]).lerp(v(.42, hipY + .15, .14), release);
          take('L', contact, across.clone().applyQuaternion(frame), along.clone().lerp(below, release), v(1, .9, .9));
        }
        return [...fit, { L: 1 - release, R: 1 }];
      }, { duration: 4.7, fingers: circus ? 'dynamic' : 'LR' });
  }

  const bench = { equipment: 'bench', framing: 'bench' };
  function prone(y, z = 0, faceDown = true) {
    const direction = pitch(faceDown ? quarter : -quarter);
    torso(v(0, y, z), direction);
    for (const [side] of sides) {
      world('Thigh' + side, direction);
      world('Shin' + side, direction);
      world('Foot' + side, pitch(faceDown ? .49 : -.28));
    }
  }

  for (const [id, extension] of [['Chain_Handle_Extension', true], ['Chain_Press', false]]) {
    loaded(id, 'chains', extension ? up : down,
      [extension ? 'Point your elbows straight up' : 'Start with both handles over your chest',
        'Keep a pronated grip on the separate chain handles.'],
      [extension ? 'Straighten only the elbows' : 'Lower to a right angle at the elbows',
        extension ? 'Keep your upper arms still as the chains rise.' : 'Allow a portion of each chain to settle on the floor.'], (t) => {
        const a = extension ? 1 - rep(up, t) : rep(down, t);
        torso(v(0, .565, .18), pitch(-quarter));
        stance(.205, .805);
        const held = sides.map(([side, s]) => {
          const shoulder = point('Arm' + side);
          const center = shoulder.add(v(s * (extension ? .025 : lerp(.037, .178, a)),
            extension ? .32 + .275 * Math.cos(1.65 * a) : lerp(.585, .169, a),
            extension ? -.265 * Math.sin(1.65 * a) : lerp(.065, .112, a)));
          return [take(side, center, across, v(0, extension ? Math.cos(1.65 * a) : 1,
            extension ? -Math.sin(1.65 * a) : .28), extension ? v(s * .035, 1, .32) : v(s, -.15, -.15)), q()];
        });
        return [...held[0], undefined, held[1]];
      }, { ...bench, benchTransform: { position: [0, 0, -.07] } },
      [extension ? 'Lower by bending your elbows' : 'Press back to extension', 'Keep both handles level and move them together.']);
  }

  for (const [id, faceDown] of [['Lying_Face_Down_Plate_Neck_Resistance', true], ['Lying_Face_Up_Plate_Neck_Resistance', false]]) {
    const sign = faceDown ? 1 : -1;
    loaded(id, 'neck-plate', down, [faceDown ? 'Hold the plate against the back of your head' : 'Hold the plate against your forehead',
      'Set your shoulders just beyond the end of the bench.'],
    ['Lower your head in an arc', 'Keep the plate secure with both hands.'], (t) => {
      const a = rep(down, t);
      prone(faceDown ? .571 : .548, 0, faceDown);
      const tilt = pitch(sign * quarter + (faceDown ? .58 : -.59) * a);
      world('Head', tilt);
      const center = v(0, .102, faceDown ? -.098 : .116).applyQuaternion(tilt).add(point('Head'));
      for (const [side, s] of sides) palm(side, s, center.clone().add(v(s * .119, 0, 0)),
        v(-s * .62, .03, -sign), v(s * .46, .89, 0), v(s, -.30, -sign * .35));
      return [center, tilt.clone().multiply(pitch(faceDown ? -quarter : quarter))];
    }, { ...bench, fingers: '', benchTransform: { position: [0, 0, -sign * .073] } });
  }

  loaded('Seated_Head_Harness_Neck_Resistance', 'harness', down,
    ['Sit at the end of the bench', 'Set your feet wide and rest both hands on your knees.'],
    ['Lower your chin slowly', 'Keep your torso still and lift your head back with control.'], (t) => {
      const a = rep(down, t);
      const frame = pitch(.18 + .83 * a);
      torso(v(0, .552, .36), pitch(.274), frame);
      stance(.295, .75, .25);
      for (const [side, s] of sides) palm(side, s, point('Shin' + side).add(v(0, .055, .014)),
        v(0, -.18, 1), Y, elbows(s));
      return [v(0, .139, -.011).applyQuaternion(frame).add(point('Head')), frame];
    }, { ...bench, fingers: '', benchTransform: { position: [0, 0, -.08] } });

  loaded('Lying_Cambered_Barbell_Row', 'cambered', up, ['Take a wide overhand grip', 'Lie face down with the cambered bar underneath the bench.'],
    ['Row toward your lower chest', 'Drive the elbows back and pause with the arch clearing the bench.'], (t) => {
      const a = rep(up, t);
      prone(.566, .10);
      world('Head', pitch(1.36));
      return bar(v(0, lerp(.249, .508, a), lerp(.61, .52, a)), .29, v(0, -1, .18), (s) => v(s * .3, .89, -.68));
    }, { ...bench, benchTransform: { position: [0, 0, .05] } });

  loaded('Otis-Up', 'otis', up, ['Anchor your feet and hold the plate to your chest', 'Start with your knees bent and your shoulder blades just off the floor.'],
    ['Sit up and press overhead', 'Raise your chest and finish with both arms straight.'], (t) => {
      const a = rep(up, t);
      const tilt = pitch(lerp(-1.41, -.06, a));
      torso(v(0, .15 + .017 * a, 0), pitch(lerp(-1.41, -.31, a)), tilt);
      world('Lumbar', pitch(lerp(-1.41, -.19, a)));
      world('Chest', tilt);
      stance(.155, .61, .04);
      const center = point('Chest').add(v(0, lerp(.135, .692, a), lerp(.193, .072, a)).applyQuaternion(tilt));
      const frame = pitch(lerp(-.12, 1.38, a));
      for (const [side, s] of sides) palm(side, s, center.clone().add(v(s * .135, 0, 0)),
        v(-s * .8, .45, .1), v(s, 0, -.3), elbows(s));
      return [center, frame];
    }, { framing: 'floor', fingers: '' });

  loaded('Weighted_Squat', 'belt', down, ['Set a bench under each foot', 'Fasten the belt and let the load hang between the benches.'],
    ['Sit below parallel', 'Keep your chest up and use the arms to balance.'], (t) => {
      const a = rep(down, t);
      torso(v(0, lerp(1.29, .886, a), -.14 * a), pitch(.025 + .36 * a), pitch(.07));
      stance(.24, 0, .29, .43);
      for (const [side, s] of sides) free(side, v(s * lerp(.54, .67, a), lerp(1.24, 1.20, a), .025 + .16 * a), v(s, -.2, .15));
      return [point('Pelvis'), q()];
    }, { fingers: '' });

  loaded('Crucifix', 'crucifix', [[0, 'Stand'], [.3, 'Raise'], [1.38, 'Hold parallel'], [2.80, 'Lower'], [3.65, 'Reset']],
    ['Start with the implements at your sides', 'Hold one implement in each hand and stand tall.'],
    ['Hold both arms at shoulder height', 'Keep the arms parallel to the floor through the hold.'], (t) => {
      const a = motion([0, .3, 1.38, 2.8, 3.65], [0, 0, 1, 1, 0], t);
      torso(v(0, .865, 0));
      stance(.17);
      const held = sides.map(([side, s]) => {
        const theta = quarter * a;
        const shoulder = point('Arm' + side);
        const along = v(s * Math.sin(theta), -Math.cos(theta), .045);
        const axis = v(s * Math.cos(theta), Math.sin(theta), .08).normalize();
        const center = take(side, shoulder.addScaledVector(along, .66), axis, along, elbows(s));
        return [center, frameFromDown(axis, v(0, -1, 1))];
      });
      return [...held[0], undefined, held[1]];
    }, { duration: 3.85 });

  loaded('Standing_Olympic_Plate_Hand_Squeeze', 'pinch', down, ['Hang a plate at each side', 'Use a neutral grip on the upper ridge of each plate.'],
    ['Let the plates descend into your fingers', 'Close your hands to draw the plates back up.'], (t) => {
      const a = rep(down, t);
      torso(v(0, .866, 0));
      stance(.187);
      const held = sides.map(([side, s]) => {
        const { hand, offset } = grip(side, Z, below);
        arm(side, point('Arm' + side).add(v(s * .115, -.555, .04)), hanging(s), hand);
        return [point('Hand' + side).add(offset).add(v(0, -.151 - .069 * a, 0)), pitch(s * .045 * a)];
      });
      return [...held[0], { L: 1 - .85 * a, R: 1 - .85 * a }, held[1]];
    }, { fingers: 'dynamic' });

  {
    const times = [0, .30, .64, .99, 1.35, 1.70, 2.09, 2.43, 2.78, 3.16, 3.52, 3.92, 4.25];
    loaded('Wrist_Roller', 'roller', [[0, 'Arms straight'], [.30, 'Start winding'], [2.09, 'Weight raised'],
      [2.43, 'Unwind'], [4.25, 'Reset']], ['Hold the roller straight in front', 'Keep your arms level with the rope fully extended.'],
    ['Alternate your wrists to wind the rope', 'Keep your shoulders and torso still.'], (t) => {
      torso(v(0, .865, 0));
      stance(.185);
      const amount = motion(times, [0, 0, .12, .30, .48, .72, 1, 1, .78, .53, .28, 0, 0], t);
      const center = v(0, 1.366, .589);
      for (const [side, s] of sides) {
        const angle = Math.sin(t * Math.PI * 2.7 + s * quarter) * .65 *
          motion([0, .3, 3.92, 4.25], [0, 1, 1, 0], t);
        take(side, center.clone().add(v(s * .221, 0, 0)), across, Z.clone().applyQuaternion(pitch(angle)), elbows(s));
      }
      return [center, pitch(amount * 18), undefined, [v(0, center.y - lerp(1.03, .17, amount), center.z), q()]];
    }, { duration: 4.4 }, ['Unwind under control', 'Reverse the wrist turns until the rope is fully extended.']);
  }

  {
    const times = [0, .45, 1.08, 1.40, 1.77, 2.20, 2.62, 3.23, 3.75];
    const phases = phasesAt(times, ['Grip the tread', 'Drive upward', 'Step in', 'Change grip', 'Push', 'Release', 'Settle', 'Stand']);
    loaded('Tire_Flip', 'tire', phases, ['Get underneath the near edge', 'Lean your chest into the tire with your feet set back.'],
      ['Step in as the tire rises', 'Drive a knee into the tire and change to a pushing grip.'], (t) => {
        const at = (values) => motion(times, values, t);
        const angle = at([0, .22, .79, 1.15, 1.52, 2.21, Math.PI, Math.PI, Math.PI]);
        const frame = pitch(angle);
        const center = v(0, 0, -.48).applyQuaternion(frame).add(v(0, .147, .99));
        const z = at([-.16, -.13, .04, .19, .38, .47, .49, .49, .49]);
        torso(v(0, at([.48, .61, .73, .76, .79, .84, .853, .858, .858]), z),
          pitch(at([.94, .85, .69, .46, .36, .24, .13, .06, .06])));
        for (const [side, s] of sides) {
          const foot = at(s > 0 ? [-.12, -.12, .51, .55, .55, .55, .55, .55, .55]
            : [-.22, -.22, -.21, -.19, .20, .46, .46, .46, .46]);
          const lift = s > 0 ? at([0, .09, .30, 0, 0, 0, 0, 0, 0]) : at([0, 0, 0, 0, .12, 0, 0, 0, 0]);
          leg(side, v(s * .176, ankleHeight + lift, foot), yaw(s * .10).multiply(pitch(s > 0 ? -.18 * lift : .5 * lift)));
          const change = at([0, 0, 0, .73, 1, 1, 1, 1, 1]);
          const release = at([0, 0, 0, 0, 0, 1, 1, 1, 1]);
          const edge = v(s * .218, lerp(-.13, .14, change), -.413).applyQuaternion(frame).add(center);
          const rest = v(s * .26, point('Pelvis').y - .12, z + .22);
          const along = v(0, .2 * change, 1).applyQuaternion(pitch(angle * (1 - release)));
          const dorsal = v(s * Math.sin(Math.PI * change), -Math.cos(Math.PI * change), -.30)
            .applyQuaternion(pitch(angle * (1 - release)));
          palm(side, s, edge.lerp(rest, release), along, dorsal, v(s * .85, -.18, -.86), true);
        }
        return [center, frame];
      }, { duration: 3.9, oneShot: true, fingers: '' }, ['Push the tire through the turn', 'Release after it passes balance and let it settle.']);
  }

  {
    const times = [0, .53, 1.00, 1.48, 1.82, 2.06, 2.45, 2.94, 3.36, 3.70, 3.92, 4.42, 4.75];
    const phases = [[0, 'Stagger your stance'], [.53, 'Raise the hammer'], [1.48, 'Strike right'], [2.06, 'Switch sides'],
      [2.45, 'Raise the hammer'], [3.36, 'Strike left'], [4.42, 'Reset']];
    loaded('Sledgehammer_Swings', 'sledge', phases, ['Set a staggered stance in front of the tire',
      'Keep one hand near the butt and the other choked up.'], ['Slide the upper hand down during the swing',
      'Control the rebound before changing sides.'], (t) => {
        const at = (values) => motion(times, values, t);
        const s = at([-1, -1, -1, -1, -1, 0, 1, 1, 1, 1, 1, -1, -1]);
        const hinge = at([.21, .04, -.14, .62, .30, .18, .04, -.14, .62, .30, .18, .21, .21]);
        torso(v(0, .811 - .12 * Math.max(0, hinge), -.035), yaw(.45 * s * (1 - hinge)).multiply(pitch(hinge)));
        for (const [side, sign] of sides) leg(side, v(sign * .175, ankleHeight + .035 * Math.max(0, s * sign),
          -sign * .16 * s), yaw(sign * .14));
        const arc = at([.49, 1.92, 2.03, -.68, -.26, .31, 1.92, 2.03, -.68, -.26, .31, .49, .49]);
        const axis = v(.32 * s, Math.sin(arc), Math.cos(arc)).normalize();
        const frame = frameFromDown(axis, v(.85, -.40, -.16));
        const stroke = smoothstep(t, 1, 1.48) + smoothstep(t, 2.94, 3.36);
        const head = v(.24 * s, at([1.04, 1.77, 2.12, .262, .56, .96, 1.77, 2.12, .262, .56, .96, 1.04, 1.04]),
          at([.75, .09, -.19, .79, .79, .66, .09, -.19, .79, .79, .66, .75, .75])
          + .36 * Math.abs(Math.sin(Math.PI * stroke)));
        const slide = at([.22, .27, .30, .037, .10, .19, .27, .30, .037, .10, .19, .22, .22]);
        const slots = sides.map(([side, sign]) => ({
          side, at: v(-.11 + (.10 + slide) * (1 + s * sign) / 2, 0, 0),
          axis: X, along: v(0, -Math.cos(arc), Math.sin(arc)), pole: v(sign, -.45, .9),
        }));
        const fit = handles(head.clone().addScaledVector(axis, -.69), frame, slots);
        const release = 1 - smoothstep(Math.abs(s), .32, .86);
        if (release > 0) {
          const slot = slots[0];
          const orientation = rotation('HandL');
          const wrist = point('HandL').addScaledVector(v(.16, .035, .015), release);
          arm('L', wrist, slot.pole, orientation);
        }
        return [...fit, { L: 1 - release, R: 1 }];
      }, { duration: 4.9, fingers: 'dynamic' }, ['Recover and alternate sides', 'Control the hammer as it comes back off the tire.']);
  }

  const bellOptions = { equipment: 'kettlebell', framing: 'floor' };
  for (const [id, squat] of [['Kettlebell_Turkish_Get-Up_Lunge_style', false], ['Kettlebell_Turkish_Get-Up_Squat_style', true]]) {
    const stages = [0, .64, 1.25, 1.92, 2.49, 3.02, 3.65];
    const times = [...stages, 4.05, 4.69, 5.22, 5.79, 6.46, 7.07, 7.71];
    const phases = [[0, 'Press and plant'], [.64, 'Roll to elbow'], [1.25, 'Post on hand'], [1.92, squat ? 'Draw both feet in' : 'Sweep to knee'],
      [2.49, squat ? 'Balance in squat' : 'Half kneel'], [3.65, 'Stand tall'], [4.05, 'Reverse to floor']];
    add(id, phases, [[0, 'Start on your back with the bell locked out', 'Plant the foot on the same side as the bell.'],
      [1.92, squat ? 'Bring both feet under you' : 'Sweep your free leg underneath you',
        squat ? 'Pause in a supported squat before standing.' : 'Set your knee down and come upright in a half kneel.'],
      [4.05, 'Reverse each position', 'Keep the working elbow locked and the bell stacked over your shoulder.']], (t) => {
      const at = (values) => motion(times, [...values, ...values.slice().reverse()], t);
      const hip = v(at([0, .023, .035, .14, .025, -.07, -.03]),
        at([.153, .174, .20, squat ? .33 : .43, squat ? .45 : .52, .73, .869]),
        at([0, .042, .10, .14, .22, .32, .38]));
      const incline = at([-quarter + .035, -1.00, -.47, -.32, squat ? .32 : -.04, .06, .028]);
      const sideBend = at([0, -.38, -.42, -.46, -.22, -.03, 0]);
      torso(hip, roll(sideBend).multiply(pitch(incline)), roll(.21).multiply(pitch(incline * .58 - .25)));
      const rightZ = .45;
      leg('R', v(-.18, ankleHeight, rightZ), yaw(-.18), v(-.10, 1, 1));
      const leftY = at([.101, .101, .105, squat ? .078 : .255, squat ? .074 : .114, squat ? .074 : .187, .074]);
      const leftZ = at([.825, .825, .82, squat ? .52 : .12, squat ? .42 : -.34, squat ? .39 : -.12, .34]);
      const leftToe = at([-.27, -.27, -.24, squat ? -.04 : 2.72, squat ? 0 : 2.96, squat ? 0 : .60, 0]);
      const kneel = at([0, 0, 0, squat ? 0 : .4, squat ? 0 : 1, 0, 0]);
      leg('L', v(at([.26, .26, .27, .28, .20, .16, .135]), Math.max(leftY, .025 + .207 * Math.sin(leftToe)), leftZ), yaw(.18).multiply(pitch(leftToe)),
        v(.14 + .38 * kneel, 1 - 1.76 * kneel, .34 + .65 * kneel));
      const support = at([1, 1, 1, 1, .18, 0, 0]);
      const contact = v(at([.51, .46, .51, .51, .58, .43, .51]), palmHeight + .026,
        at([-.45, -.35, -.23, .01, -.14, .08, .32]));
      const shoulder = point('ArmL');
      arm('L', shoulder.clone().add(v(.42, -.24, .10)).lerp(contact, support),
        v(.74, at([.52, -.58, -.29, -.12, -.24, -.4, -.49]), -.25), openHand(1, v(.35, .10 * support, 1), Y));
      const center = take('R', point('ArmR').add(v(-.01, .612, .035)), across, Y, v(-.24, 0, -.7));
      return [center, frameFromDown(across, v(-.12, -.75, -.7))];
    }, { ...bellOptions, duration: 7.9, fingers: 'R' });
  }

  for (const [id, two] of [['One-Arm_Open_Palm_Kettlebell_Clean', false], ['Open_Palm_Kettlebell_Clean', true]]) {
    const times = [0, .34, .67, .92, 1.12, 1.38, 1.63, 1.87, 2.08, 2.43, 3.25, 3.52];
    const phases = [[0, 'Grip'], [.34, 'Drive'], [.92, 'Flip'], [1.38, 'Catch on palm'], [1.63, 'Toss'],
      [2.08, 'Catch handle'], [3.25, 'Set down']];
    add(id, phases, [[0, 'Grip the bell between your feet', two ? 'Set both hands on the handle.' : 'Take the handle in one hand.'],
      [1.38, 'Receive the body of the bell on the open palm', 'Extend through the hips to bring the bell up before letting it turn.'],
      [2.08, 'Catch the handle and lower', two ? 'Guide the bell back to the floor before repeating.' : 'Guide the bell back to the floor and repeat on the other arm.']], (t) => {
      const at = (values) => motion(times, values, t);
      const hipY = at([.445, .49, .745, .858, .809, .828, .849, .86, .818, .69, .445, .445]);
      torso(v(two ? 0 : .036, hipY, -.09), pitch(at([.98, .86, .45, .06, .10, .074, .04, .04, .11, .47, .98, .98])));
      stance(.208, 0, .21);
      const center = v(two ? 0 : at([-.07, -.08, -.115, -.19, -.24, -.24, -.24, -.25, -.20, -.17, -.07, -.07]),
        at([.254, .273, .83, 1.40, 1.63, 1.56, 1.58, 1.61, 1.17, .75, .254, .254]),
        at([.30, .27, .24, .33, .36, .37, .39, .48, .48, .39, .30, .30]));
      const angle = at([0, 0, .12, 1.50, 2.78, Math.PI, Math.PI, 4.46, 6.16, 6.28, 2 * Math.PI, 2 * Math.PI]);
      const frame = pitch(angle);
      const opening = at([0, 0, 0, .58, 1, 1, 1, .78, 0, 0, 0, 0]);
      const slots = sides.filter(([side]) => two || side === 'R').map(([side, s]) => ({
        side, at: v(two ? s * .067 : 0, 0, 0), axis: across,
        along: v(0, Math.sin(angle / 2) - .70, .80), pole: v(s * .68, -.26, -.94),
      }));
      const [fitted] = handles(center, frame, slots, true);
      fitted.lerp(center, opening);
      for (const [side, s] of sides) {
        if (!two && side === 'L') {
          free(side, v(.39, hipY + .085, .18), v(.18, -.8, .6));
        } else if (opening > 0) {
          const slot = slots.find((slot) => slot.side === side);
          const closed = grip(side, slot.axis.clone().applyQuaternion(frame), slot.along);
          const wrist = slot.at.clone().applyQuaternion(frame).add(fitted).sub(closed.offset);
          const along = v(-s * .18, .10, .98).normalize();
          const dorsal = v(s * lerp(.85, two ? .45 : 0, opening), -1, 0).normalize();
          const contact = v(two ? s * .060 : 0, -.106, 0).applyQuaternion(frame).add(fitted)
            .addScaledVector(along, -.068).addScaledVector(dorsal, .032);
          arm(side, wrist.lerp(contact, opening), slot.pole, closed.hand.slerp(openHand(s, along, dorsal), opening), true);
        }
      }
      return [fitted, frame, { L: two ? 1 - opening : 0, R: 1 - opening }];
    }, { ...bellOptions, framing: 'standing', duration: 3.65, fingers: 'dynamic' });
  }

  {
    const times = [0, .44, .68, .92, 1.10, 1.52, 1.73, 1.97, 2.14, 2.47];
    const phases = [[0, 'Right hand on bell'], [.44, 'Lower'], [.68, 'Push off'], [1.10, 'Left hand on bell'],
      [1.52, 'Lower'], [1.73, 'Push off'], [2.14, 'Right hand on bell']];
    add('Plyo_Kettlebell_Pushups', phases,
      [[0, 'Set one hand on the bell and one on the floor', 'Keep a straight line from shoulders to heels.'],
        [.68, 'Push off and switch hands in the air', 'Land with the opposite hand on the bell.'],
        [1.52, 'Lower and spring back', 'Bend the elbows to absorb the landing before the next push.']], (t) => {
      const at = (values) => motion(times, values, t);
      const shift = at([1, 1, .98, -.84, -1, -1, -.98, .84, 1, 1]);
      const h = at([0, -.184, .016, .055, 0, -.184, .016, .055, 0, 0]);
      const air = at([0, 0, .02, .31, 0, 0, .02, .31, 0, 0]);
      torso(v(.268 * shift, .399 + h * .55, -.495), pitch(1.28 - h * .48).multiply(roll(-.127 * shift)), pitch(1.23));
      for (const [side, s] of sides) {
        leg(side, v(s * .118 + .109 * shift, .175 + .14 * air, -1.215), pitch(.62), v(s * .10, -.13, 1));
        const use = (1 - s * shift) / 2;
        const handle = v(.058 * s, .254, .233);
        const floor = v(s * .49, palmHeight + .011, .16);
        const wrist = mix(floor, handle, use);
        const { hand, offset } = grip(side, across, Z);
        wrist.addScaledVector(offset, -use).y += air;
        arm(side, wrist, v(s * .76, .2, -.75), openHand(s, v(0, .12, 1), Y).slerp(hand, use));
      }
      return [v(0, .254, .233), q(), { L: (1 - shift) / 2, R: (1 + shift) / 2 }];
    }, { ...bellOptions, duration: 2.6, fingers: 'dynamic' });
  }

  {
    const times = [0, .55, .79, 1.03, 1.26, 1.52, 2.12, 2.56];
    const thighLength = bone('ShinL').position.length();
    const shinLength = bone('FootL').position.length();
    const knee = v(.148, .103, .012);
    const rearAnkle = v(.148, .108, knee.z - Math.sqrt(shinLength ** 2 - (.108 - knee.y) ** 2));
    const legRadius = Math.sqrt(thighLength ** 2 - (.148 - bone('ThighL').position.x) ** 2);
    const phases = phasesAt(times, ['Kneel', 'Sit onto heels', 'Explode', 'Both feet airborne', 'Land in squat', 'Stand']);
    add('Kneeling_Jump_Squat', phases,
      [[0, 'Start kneeling with the bar across your upper back', 'Sit back toward your heels while keeping your chest up.'],
        [1.03, 'Extend your hips and bring both feet under you', 'Land with both feet flat in a squat.'],
        [1.52, 'Stand from the squat', 'Drive through both feet to finish the rep.']], (t) => {
      const at = (values) => motion(times, values, t);
      const heelSit = at([.042, 1.12, .05, 0, 0, 0, 0, 0]);
      const blend = motion([.55, .79, 1.03], [0, .55, 1], t);
      const hip = v(0, knee.y + legRadius * Math.cos(heelSit), knee.z - legRadius * Math.sin(heelSit))
        .lerp(v(0, at([.55, .33, .57, .69, .535, .575, .862, .867]),
          at([0, -.36, -.05, .055, .022, -.034, .10, .10])), blend);
      torso(hip, pitch(at([.075, .17, .035, .19, .49, .37, .041, .041])));
      for (const [side, s] of sides) {
        const target = v(at([.147, .147, .158, .18, .222, .222, .222, .222]),
          at([.108, .108, .24, .31, ankleHeight, ankleHeight, ankleHeight, ankleHeight]),
          at([rearAnkle.z, rearAnkle.z, -.38, -.087, .24, .24, .24, .24]));
        const foot = rearAnkle.clone().lerp(target, blend);
        foot.x *= s;
        const tip = at([3.03, 3.03, 2.75, .42, 0, 0, 0, 0]);
        const fixedPole = v(s * knee.x, knee.y, knee.z).sub(point('Thigh' + side)).normalize();
        leg(side, foot, yaw(s * .18).multiply(pitch(tip)), fixedPole.lerp(v(s * .19, -.23, 1), blend));
      }
      return backRack();
    }, { duration: 2.7, oneShot: true });
  }

  return entries;
}
