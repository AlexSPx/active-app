import { X, ankleHeight, createAuthor, cues, down, lerp, motion, pitch, q, rep, sides, up, v, yaw } from './barbell-standing-more.mjs';

export const groupLabel = 'Smith, guided machines and cardio';

const halfPi = Math.PI / 2;
const TAU = 2 * Math.PI;
const elbows = (s) => v(s, -.65, .32);
const pull = (s) => v(s * .48, .08, -1);
const uprightElbows = (s) => v(s, .8, -.1);
const smith = (z, equipment = 'barbell', options = {}) => ({
  ...options, equipment, machineGuidedFixture: { kind: 'smith', z, ...options.machineGuidedFixture },
});
const machine = (kind, options = {}) => ({
  equipment: '', fingers: '', ...options, machineGuidedFixture: { kind, ...options.machineGuidedFixture },
});

export function createEntries(asset, helpers) {
  const { add, entries, torso, bone, point, arm, leg, free, grip, hangY, stance, armLength, world } =
    createAuthor(asset, helpers, metadata);

  function exercise(id, phases, setup, peak, finish, pose, options) {
    add(id, phases, cues(phases, setup, peak, finish), pose, options);
  }

  function flatFeet(z, width = .205, height = ankleHeight) {
    for (const [side, s] of sides) leg(side, v(s * width, height, z), yaw(s * .13), v(s * .18, 1, .3));
  }

  function toGrip(side, target, direction, pole) {
    const { hand, offset } = grip(side, X.clone().negate(), direction);
    arm(side, target.clone().sub(offset), pole, hand);
  }

  function guidedBar(center, width, direction, pole, { frame = q(), hands = 'LR' } = {}) {
    const axis = X.clone().applyQuaternion(frame);
    const seats = sides.filter(([side]) => hands.includes(side)).map(([side, s]) => {
      const { hand, offset } = grip(side, axis.clone().negate(), direction);
      const delta = axis.clone().multiplyScalar(s * width).sub(offset);
      const shoulder = point('Arm' + side).sub(delta);
      const radius = Math.sqrt(Math.max(0, (armLength - .002) ** 2 -
        (center.x - shoulder.x) ** 2 - (center.z - shoulder.z) ** 2));
      return { side, s, hand, delta, min: shoulder.y - radius, max: shoulder.y + radius };
    });
    const min = Math.max(...seats.map((seat) => seat.min));
    const max = Math.min(...seats.map((seat) => seat.max));
    center.y = Math.min(max, Math.max(min, center.y));
    for (const { side, s, hand, delta } of seats) arm(side, center.clone().add(delta), pole(s), hand);
    return [center, frame];
  }

  function hangArms() {
    for (const [side, s] of sides) {
      free(side, point('Arm' + side).add(v(s * .09, -.501, .04)), v(0, -1, .15));
    }
  }

  // The bar remains in the rail plane while the upper back pivots under it.
  function shoulderRack(y, theta, z) {
    const frame = pitch(theta);
    const contact = v(0, .539, -.1077).applyQuaternion(frame);
    const center = v(0, y + contact.y, z);
    torso(center.clone().sub(contact), frame, pitch(theta * .25));
    return guidedBar(center, .301, v(0, 1, -.34).applyQuaternion(frame),
      (s) => v(s * .55, -1, -.23).applyQuaternion(frame));
  }

  for (const [id, model, width, z, depth] of [
    ['Smith_Machine_Bench_Press', 'flat', .288, .041, .159],
    ['Smith_Machine_Close-Grip_Bench_Press', 'flat', .144, .061, .163],
    ['Decline_Smith_Press', 'decline', .337, -.110, .171],
    ['Smith_Machine_Decline_Press', 'decline', .274, -.144, .186],
    ['Smith_Machine_Incline_Bench_Press', 'incline', .295, .354, .223],
    ['Smith_Machine_Overhead_Shoulder_Press', 'overhead', .275, .132, .046],
  ]) {
    const decline = model === 'decline';
    const incline = model === 'incline';
    const overhead = model === 'overhead';
    const angle = Math.PI / 6;
    const frame = incline ? yaw(Math.PI) : q();
    const equipment = decline ? 'decline-bench-barbell' : incline ? 'incline-bench-barbell' : 'bench-barbell';
    const benchTransform = incline ? { angle } : overhead ? { position: [0, 0, -.075] } : undefined;
    exercise(id, down,
      [decline ? 'Secure your legs under the rollers' : overhead ? 'Sit tall behind the bar' : 'Set your shoulders on the bench',
        width < .2 ? 'Use a close grip and keep your feet planted.' : 'Set your hands evenly on the shaft.'],
      [overhead ? 'Lower in front of your face' : 'Lower to your chest',
        width < .2 ? 'Keep your elbows close to your sides.' : 'Let your elbows bend beneath the bar.'],
      ['Press straight up the rails', 'Keep the shaft level and finish with your arms long.'], (t) => {
        const a = rep(down, t);
        if (decline) {
          torso(v(0, .611, .105), pitch(-halfPi - Math.PI / 9));
          for (const [side, s] of sides) leg(side, v(s * .137, .528, .687), pitch(.34), v(s * .09, 1, .09));
        } else if (incline) {
          torso(v(0, .561, -.071), pitch(halfPi - angle + .047).multiply(frame),
            pitch(halfPi - angle + .13).multiply(frame));
          for (const [side, s] of sides) leg(side, v(-s * .218, ankleHeight, -.447), frame, v(-s * .20, .85, -1));
        } else if (overhead) {
          torso(v(0, .550, -.075), pitch(-.035), q());
          flatFeet(.422);
        } else {
          torso(v(0, .554, .433), pitch(-halfPi), pitch(-halfPi - .15));
          flatFeet(.735, .234);
        }
        const shoulder = point('ArmL');
        const direction = v(0, 1, overhead ? -.23 : .08);
        const { offset } = grip('L', X.clone().applyQuaternion(frame).negate(), direction);
        const x = width * (incline ? -1 : 1);
        const top = shoulder.y + offset.y + Math.sqrt((armLength - .008) ** 2 -
          (x - offset.x - shoulder.x) ** 2 - (z - offset.z - shoulder.z) ** 2);
        return guidedBar(v(0, lerp(top, shoulder.y + depth, a), z), width, direction,
          (s) => elbows(incline ? -s : width < .2 ? s * .32 : s), { frame });
      }, smith(z, equipment, { framing: 'bench', benchTransform }));
  }

  for (const [id, style, width, z] of [
    ['Smith_Machine_Behind_the_Back_Shrug', 'shrug', .222, -.213],
    ['Smith_Machine_Bent_Over_Row', 'row', .224, .229],
    ['Smith_Machine_One-Arm_Upright_Row', 'one', .265, .205],
    ['Smith_Machine_Upright_Row', 'upright', .155, .180],
    ['Smith_Machine_Stiff-Legged_Deadlift', 'hinge', .219, .212],
  ]) {
    const shrug = style === 'shrug';
    const row = style === 'row';
    const hinge = style === 'hinge';
    const one = style === 'one';
    const phases = hinge ? down : up;
    exercise(id, phases,
      [shrug ? 'Grip the bar behind your hips' : row ? 'Hinge forward with soft knees' : 'Start with the bar at your thighs',
        one ? 'Use one hand and steady yourself through both feet.' : 'Begin with both arms long.'],
      [shrug ? 'Shrug toward your ears' : hinge ? 'Send your hips back' : 'Lead with your elbows',
        shrug ? 'Raise the shoulders with straight arms.' : row ? 'Pull into your lower ribs with your torso still.'
          : hinge ? 'Keep a small knee bend as the bar lowers.' : 'Let your wrists stay below elbow height.'],
      [hinge ? 'Drive your hips forward' : 'Lower under control', 'Keep the bar in the guide rails.'], (t) => {
        const a = rep(phases, t);
        const direction = v(0, shrug || hinge ? -1 : -1 + .43 * a, shrug ? -.31 : .31 + (hinge ? 0 : .64 * a));
        if (hinge) {
          torso(v(0, lerp(.865, .795, a), lerp(.005, -.282, a)), pitch(lerp(.035, 1.17, a)), pitch(.35 * a));
          stance(.157, 0);
          return guidedBar(v(0, hangY(z, width, direction), z), width, direction, pull);
        }
        torso(v(one ? -.070 : 0, row ? .775 : .864, row ? -.241 : .012),
          pitch(row ? 1.15 : .028), pitch(row ? .49 : .03));
        stance(row ? .194 : .166, row ? -.121 : 0);
        if (shrug) for (const [side] of sides) bone('Arm' + side).position.y += .067 * a;
        if (one) free('L', point('ArmL').add(v(.054, -.43, .112)), v(0, -1, .25));
        const y = hangY(z, width, direction) + (row ? .331 : shrug ? 0 : one ? .469 : .425) * a;
        return guidedBar(v(0, y, z), width, direction, row || shrug ? pull : uprightElbows,
          one ? { hands: 'R' } : {});
      }, smith(z, 'barbell', { fingers: one ? 'R' : 'LR' }));
  }

  const clean = [[0, 'Hang'], [.25, 'Load hips'], [.64, 'Extend'], [.91, 'Catch'],
    [1.53, 'Stand'], [2.04, 'Lower'], [3.35, 'Reset']];
  exercise('Smith_Machine_Hang_Power_Clean', clean,
    ['Set the bar near your knees', 'Hinge at the hips and grip just outside shoulder width.'],
    ['Extend quickly', 'Drive through the legs, then rotate your elbows around the shaft.'],
    ['Stand from the catch', 'Finish tall before resetting the bar to the hang.'], (t) => {
      const times = clean.map(([at]) => at);
      const h = motion(times, [.749, .727, .949, .707, .866, .866, .749], t);
      const hipZ = motion(times, [-.228, -.248, -.031, -.149, -.066, -.066, -.228], t);
      const lean = motion(times, [.84, .89, .05, .19, .03, .03, .84], t);
      const y = motion(times, [.465, .443, 1.045, 1.178, 1.367, 1.367, .465], t);
      const turn = motion([0, .64, .91, 2.04, 2.51, 3.35], [0, 0, 1, 1, 0, 0], t);
      torso(v(0, h, hipZ), pitch(lean), pitch(.26 * lean));
      stance(.185, -.025, .16, .09 * motion([0, .42, .64, .91, 3.35], [0, 0, 1, 0, 0], t));
      return guidedBar(v(0, y, .175), .265, v(0, -1 + 1.25 * turn, .17 + .92 * turn),
        (s) => v(s * .72, lerp(-.32, -.92, turn), lerp(-.70, .63, turn)));
    }, smith(.175));

  for (const [id, style, bottom, theta, footZ] of [
    ['Smith_Machine_Squat', 'squat', .440, .290, .195],
    ['Chair_Squat', 'chair', .397, .106, .444],
    ['Smith_Machine_Pistol_Squat', 'pistol', .335, .286, .245],
    ['Smith_Single-Leg_Split_Squat', 'split', .435, .128, .261],
  ]) {
    const pistol = style === 'pistol';
    const split = style === 'split';
    const chair = style === 'chair';
    const z = -.155;
    exercise(id, down,
      ['Set the bar across your upper back', chair ? 'Step both feet well in front of the shaft.'
        : split ? 'Place your rear foot on the bench.' : pistol ? 'Lift the free leg in front of you.' : 'Set your feet under the guide rails.'],
      [pistol || split ? 'Lower on your lead leg' : 'Lower into the squat',
        pistol ? 'Reach the free leg forward as the supporting knee bends.' : 'Keep your torso steady and your front heel down.'],
      ['Drive through the planted foot', 'Rise with the bar on the rails.'], (t) => {
        const a = rep(down, t);
        const weight = shoulderRack(lerp(chair ? .810 : split ? .765 : .858, bottom, a),
          lerp(chair ? -.095 : .023, theta, a), z);
        if (pistol || split) {
          leg('R', v(-.123, ankleHeight, footZ), yaw(-.07));
          leg('L', v(.121, split ? .492 : lerp(.273, .205, a), split ? -.597 : lerp(.466, .655, a)),
            split ? pitch(1.12) : pitch(-.23), split ? v(.12, -.8, .35) : v(.07, .2, 1));
        } else {
          stance(chair ? .214 : .187, footZ, chair ? .16 : .23);
        }
        return weight;
      }, smith(z, split ? 'bench-barbell' : 'barbell', split
        ? { benchTransform: { position: [0, 0, -.745], yaw: halfPi } } : {}));
  }

  const lungeCycle = [[0, 'Left foot leads'], [.48, 'Dip'], [.77, 'Switch feet'],
    [1.53, 'Right foot leads'], [2.29, 'Switch feet'], [3.06, 'Reset']];
  exercise('Lunge_Sprint', lungeCycle, ['Split your stance under the bar', 'Set the shaft across your upper back.'],
    ['Jump and switch the feet', 'Drive through the lead foot and exchange your stance in the air.'],
    ['Land and absorb the impact', 'Bend both knees as you prepare for the next jump.'], (t) => {
      const step = t % 1.53;
      const sign = t < 1.53 || t >= 3.06 ? 1 : -1;
      const forward = sign * motion([0, .60, .97, 1.53], [1, 1, -1, -1], step);
      const hip = motion([0, .02, .47, .61, .79, .98, 1.21, 1.53],
        [.685, .685, .414, .686, .889, .696, .644, .685], step);
      const flight = motion([0, .60, .79, .98, 1.53], [0, 0, .218, 0, 0], step);
      const lower = motion([0, .48, .62, 1.53], [.076, .102, .076, .076], step);
      const weight = shoulderRack(hip, .085 + lower, -.131);
      for (const [side, s] of sides) {
        const rear = (1 - s * forward) / 2;
        leg(side, v(s * .143, ankleHeight + rear * lower + flight, .05 + .410 * s * forward),
          yaw(s * .1).multiply(pitch(.50 * rear + flight)), v(s * .11, 0, 1));
      }
      return weight;
    }, smith(-.131, 'barbell', { duration: 3.06 }));

  for (const [id, reverse, pads, shrug] of [
    ['Smith_Machine_Calf_Raise', false, false, false],
    ['Smith_Machine_Reverse_Calf_Raises', true, false, false],
    ['Standing_Calf_Raises', false, true, false],
    ['Calf-Machine_Shoulder_Shrug', false, true, true],
  ]) {
    const z = -.132;
    const block = shrug ? 0 : .124;
    const pivot = reverse ? -.060 : .135;
    exercise(id, up,
      [shrug ? 'Set your shoulders beneath both pads' : reverse ? 'Place your heels on the edge' : 'Place the balls of both feet on the block',
        shrug ? 'Stand tall with your arms long at your sides.' : 'Keep your knees extended and your feet facing forward.'],
      [shrug ? 'Raise your shoulders' : reverse ? 'Lift the toes' : 'Drive the heels upward',
        shrug ? 'Keep the elbows straight and pause at the top.' : 'Pivot at the ankles while keeping pressure on the block.'],
      ['Return under control', 'Pause before reversing direction.'], (t) => {
        const a = rep(up, t);
        const theta = shrug ? 0 : reverse ? lerp(.41, -.45, a) : lerp(-.31, pads ? .68 : .59, a);
        const ankle = v(0, block + .006, .044 + pivot).sub(v(0, -.068, pivot).applyQuaternion(pitch(theta)));
        const h = ankle.y + .786;
        let load;
        if (pads) torso(v(0, h, .004), pitch(.015), q());
        else load = shoulderRack(h, .022, z);
        if (shrug) for (const [side] of sides) bone('Arm' + side).position.y += .062 * a;
        for (const [side, s] of sides) leg(side, v(s * .137, ankle.y, ankle.z), pitch(theta), v(s * .08, 0, 1));
        if (pads) hangArms();
        return load;
      }, pads ? machine('calf', { machineGuidedFixture: { block } })
        : smith(z, 'barbell', { machineGuidedFixture: { block, reverse } }));
  }

  for (const [id, curl] of [['Smith_Machine_Leg_Press', false], ['Smith_Machine_Hip_Raise', true]]) {
    const z = curl ? .268 : .244;
    const y = curl ? .551 : .143;
    exercise(id, up,
      [curl ? 'Lie on the bench under the shaft' : 'Lie face up under the safeties',
        curl ? 'Set the shaft against the middle of both feet and hold the support grips.' : 'Place the middle of both feet on the shaft with your knees bent.'],
      [curl ? 'Curl your pelvis off the bench' : 'Press through both feet',
        curl ? 'Keep your legs long and lift from your abdominals.' : 'Extend hips and knees together without locking either knee.'],
      ['Lower the bar slowly', 'Keep the soles centered on the shaft.'], (t) => {
        const a = rep(up, t);
        const tilt = curl ? lerp(-halfPi, -2.20, a) : -halfPi - .065;
        if (curl) {
          torso(v(0, y, .263), pitch(tilt), pitch(-halfPi - .145));
          world('Lumbar', pitch(lerp(-halfPi, -2.06, a)));
          world('Chest', pitch(-halfPi));
          const shoulder = point('ArmL');
          bone('Pelvis').position.add(v(0, y - .0054 - shoulder.y, -.230 - shoulder.z));
        } else {
          torso(v(0, y, .242), pitch(tilt), pitch(-halfPi - .16));
        }
        const center = v(0, curl ? lerp(1.376, 1.586, a) : lerp(.452, .930, a), z);
        const foot = pitch(Math.PI - .07);
        for (const [side, s] of sides) {
          const ankle = center.clone().add(v(s * .158, 0, 0)).sub(v(0, -.080, .063).applyQuaternion(foot));
          leg(side, ankle, foot, v(s * .11, .02, -.98), X);
          if (curl) toGrip(side, v(s * .378, .581, .088), v(0, 1, .2), v(s, -1, 0));
          else free(side, v(s * .416, .064, .016), v(s, 0, .1), v(s * .22, 0, -.97));
        }
        return [center, q()];
      }, smith(z, curl ? 'bench-barbell' : 'barbell', {
        framing: 'floor', fingers: curl ? 'LR' : '', machineGuidedFixture: { stabilizers: curl },
      }));
  }

  for (const [id, width, laidBack] of [
    ['Hack_Squat', .211, false], ['Narrow_Stance_Hack_Squats', .102, false], ['Lying_Machine_Squat', .177, true],
  ]) {
    const theta = laidBack ? -1.37 : -.51;
    const footZ = laidBack ? .821 : .411;
    const platform = laidBack ? .247 : .119;
    const phases = laidBack ? up : down;
    exercise(id, phases,
      [laidBack ? 'Lie face up on the carriage' : 'Set your back against the sled',
        width < .15 ? 'Place your feet close together on the plate.' : 'Set your feet shoulder-width on the plate.'],
      [laidBack ? 'Push the carriage away' : 'Lower the carriage',
        laidBack ? 'Extend your knees while staying against the pad.' : 'Keep your heels down and knees in line with your toes.'],
      [laidBack ? 'Bend back to about 90 degrees' : 'Drive up from the bottom', 'Keep your shoulders beneath the pads.'], (t) => {
        const a = rep(phases, t);
        const direction = laidBack ? 1 - a : a;
        torso(v(0, lerp(laidBack ? .407 : .965, laidBack ? .328 : .643, direction),
          lerp(laidBack ? .034 : -.188, laidBack ? .423 : -.008, direction)),
          pitch(theta), pitch(laidBack ? -1.39 : -.29));
        for (const [side, s] of sides) {
          const foot = laidBack ? pitch(-1.12) : yaw(s * (width < .15 ? .065 : .14)).multiply(pitch(-.24));
          leg(side, v(s * width, platform + ankleHeight, footZ), foot, v(s * .10, 1, .61));
          const shoulder = point('Arm' + side);
          toGrip(side, shoulder.add(v(s * .092, laidBack ? .128 : -.14, laidBack ? .04 : .146)),
            v(0, 1, .45), v(s, -1, -.3));
        }
      }, machine('sled', { framing: laidBack ? 'floor' : 'standing', fingers: 'LR',
        machineGuidedFixture: { theta, footZ, platform, laidBack,
          gripOffsets: gripOffsets(helpers) } }));
  }

  exercise('Glute_Ham_Raise', up, ['Set your ankles between the rollers', 'Start face down with your knees behind the thigh pad.'],
    ['Pull yourself upright', 'Bend the knees while keeping your torso and thighs in line.'],
    ['Lower as one unit', 'Keep your feet against the footplate.'], (t) => {
      const theta = lerp(1.52, .095, rep(up, t));
      const frame = pitch(theta);
      const knee = v(0, .690, -.09);
      const length = bone('ShinL').position.length();
      torso(knee.clone().add(v(0, length, .003).applyQuaternion(frame)), frame, pitch(theta * .86));
      for (const [side, s] of sides) {
        leg(side, v(s * .112, .716, -.454), pitch(1.34),
          v(s * .07, -Math.cos(theta), Math.sin(theta)));
        free(side, v(s * .110, .355, .119).applyQuaternion(frame).add(point('Pelvis')),
          v(-s, .12, -.15).applyQuaternion(frame), v(s, -.55, .7).applyQuaternion(frame));
      }
    }, machine('ghr', { framing: 'bench' }));

  const cardioPhases = (duration) => [[0, 'Lead on the right'], [duration / 2, 'Lead on the left'], [duration, 'Repeat']];
  function cardio(id, duration, setup, action, pose, kind, fixture = {}) {
    const phases = cardioPhases(duration);
    add(id, phases, [[0, ...setup], [duration / 2, ...action]], (t) => pose(TAU * t / duration), machine(kind, {
      duration, fingers: fixture.gripOffsets ? 'LR' : '', machineGuidedFixture: fixture,
    }));
  }

  for (const [id, duration, stride, duty, lift, lean] of [
    ['Walking_Treadmill', 1.19, .323, .62, .13, .045],
    ['Jogging_Treadmill', .92, .407, .45, .265, .132],
    ['Running_Treadmill', .71, .445, .373, .367, .225],
  ]) {
    const walking = duty > .5;
    cardio(id, duration,
      ['Start near the center of the belt', walking ? 'Look ahead and let your arms swing naturally.' : 'Look ahead with your elbows comfortably bent.'],
      [walking ? 'Roll from heel to toe' : 'Land under your hips', walking ? 'Allow the opposite arm to swing forward.' : 'Drive off the belt and let the opposite arm swing forward.'],
      (phase) => {
        const base = .166;
        const wave = -Math.cos(2 * (phase - Math.PI * duty / 1.2));
        torso(v(.022 * Math.cos(phase), 1.002 - (walking ? .035 : .077) + wave * (walking ? .018 : .044),
          .055 * Math.sin(2 * phase) * (walking ? .25 : 1)), yaw(-.092 * Math.cos(phase)).multiply(pitch(lean)), pitch(lean * .21));
        world('Chest', yaw(.115 * Math.cos(phase)).multiply(pitch(lean)));
        for (const [side, s] of sides) {
          const cycle = ((phase / TAU + (s > 0 ? .5 : 0)) % 1 + 1) % 1;
          const contact = cycle < duty;
          const swing = (cycle - duty) / (1 - duty);
          const stance = cycle / duty;
          const z = contact ? lerp(stride, -stride, stance)
            : lerp(-stride, stride, motion([0, .32, 1], [0, .18, 1], swing));
          const footPitch = contact ? motion([0, .25, .64, 1], [-.23, 0, 0, .56], stance)
            : motion([0, .28, .66, 1], [.56, .82, -.21, -.23], swing);
          const height = contact ? 0 : lift * Math.sin(Math.PI * swing) ** 1.42;
          const frame = yaw(s * .055).multiply(pitch(footPitch));
          const toe = footPitch > 0 ? .190 : -.045;
          const sole = v(0, -.073, toe).applyQuaternion(frame);
          const flatOffset = v(0, 0, toe);
          const ankle = v(s * (walking ? .091 : .082), base + height, z).sub(sole).add(flatOffset);
          leg(side, ankle, frame, v(s * .12, .07, 1));
          const swingArm = Math.cos(TAU * cycle);
          const shoulder = point('Arm' + side);
          const hand = shoulder.add(v(s * .075, walking ? -.476 + .052 * Math.abs(swingArm)
            : -.315 + .133 * -swingArm, (walking ? .191 : .325) * -swingArm + (walking ? .012 : .105)));
          free(side, hand, walking ? v(0, -1, .17) : v(0, -.32, .96), v(s * .13, -.7, -.7));
        }
      }, 'treadmill');
  }

  for (const [id, recumbent, duration] of [['Bicycling_Stationary', false, 1.13], ['Recumbent_Bike', true, 1.44]]) {
    const crank = recumbent ? [.354, .704] : [.360, .286];
    const radius = recumbent ? .157 : .162;
    const seat = recumbent ? [.468, .010] : [.864, -.002];
    cardio(id, duration,
      [recumbent ? 'Sit back against the seat rest' : 'Sit on the saddle', 'Set both feet on the pedals and relax your shoulders.'],
      ['Pedal through the full circle', recumbent ? 'Keep your back supported.' : 'Keep your hips over the saddle.'],
      (phase) => {
        torso(v(0, seat[0] + .123, seat[1]), pitch(recumbent ? -.48 : .43), pitch(.054));
        for (const [side, s] of sides) {
          const a = phase + (s > 0 ? Math.PI : 0);
          const frame = pitch((recumbent ? -.29 : .07) + .14 * Math.sin(a));
          const spindle = v(s * .141, crank[0] + radius * Math.cos(a), crank[1] + radius * Math.sin(a));
          leg(side, spindle.sub(v(0, -.090, .092).applyQuaternion(frame)), frame, v(s * .10, 1, .39));
          const handle = recumbent ? v(s * .265, .574, .099) : v(s * .239, 1.098, .468);
          toGrip(side, handle, v(0, -.65, .73), v(s * .36, -.64, -.45));
        }
      }, 'bike', { crank, radius, seat, recumbent, gripOffsets: gripOffsets(helpers) });
  }

  const elliptical = { pivot: [.953, .606], gripOffsets: gripOffsets(helpers) };
  cardio('Elliptical_Trainer', 1.49, ['Plant both feet on the pedals', 'Take the moving handles and stand tall.'],
    ['Push and pull opposite the legs', 'Keep each foot supported throughout the stride.'], (phase) => {
      torso(v(0, 1.107 + .031 * Math.cos(2 * phase), -.011),
        yaw(-.055 * Math.sin(phase)).multiply(pitch(.091)), pitch(.04));
      for (const [side, s] of sides) {
        const a = phase + (s > 0 ? Math.PI : 0);
        const pedal = v(s * .161, .390 + .107 * Math.sin(a), .017 + .346 * Math.cos(a));
        leg(side, pedal.clone().add(v(0, ankleHeight + .016, -.048)), pitch(.02 * Math.sin(a)));
        const [pivotY, pivotZ] = elliptical.pivot;
        const swing = -.58 - .56 * Math.cos(a);
        toGrip(side, v(s * .260, pivotY + .39 * Math.cos(swing), pivotZ + .39 * Math.sin(swing)),
          v(0, -.16, 1), v(s * .28, -.80, -.42));
      }
    }, 'elliptical', elliptical);

  for (const [id, mill, duration] of [['Stairmaster', false, 1.63], ['Step_Mill', true, 1.75]]) {
    const handles = { gripOffsets: gripOffsets(helpers) };
    cardio(id, duration,
      [mill ? 'Step onto the moving staircase' : 'Set both feet on the pedals', 'Hold the handrails lightly and stay upright.'],
      [mill ? 'Alternate full-foot steps' : 'Press one pedal down at a time', 'Keep your hips over your feet.'], (phase) => {
        const cycle = phase / TAU;
        torso(v(.018 * Math.cos(phase), (mill ? 1.114 : 1.018) + .032 * Math.cos(2 * phase), -.068),
          pitch(mill ? .134 : .092), pitch(.034));
        for (const [side, s] of sides) {
          const a = (cycle + (s > 0 ? .5 : 0)) % 1;
          const swing = Math.max(0, (a - .5) * 2);
          const track = a < .5 ? 1 - a * 2 : motion([0, 1], [0, 1], swing);
          const z = mill ? lerp(-.110, .170, track) : .114;
          const y = mill ? lerp(.375, .565, track) + .158 * Math.sin(Math.PI * swing)
            : .323 + .146 * Math.cos(TAU * a);
          leg(side, v(s * .141, y + ankleHeight, z - .044), pitch(0));
          toGrip(side, v(s * .322, mill ? 1.427 : 1.295, .326), v(0, -.45, .8), v(s * .31, -.86, -.17));
        }
      }, mill ? 'stepmill' : 'stepper', handles);
  }

  const rowCycle = [[0, 'Catch'], [.32, 'Drive with legs'], [1.06, 'Draw to ribs'], [1.36, 'Reach forward'],
    [1.80, 'Bend knees'], [2.63, 'Catch']];
  exercise('Rowing_Stationary', rowCycle,
    ['Start at the catch', 'Strap in, hinge forward and reach with straight arms.'],
    ['Drive, then draw the handle in', 'Push through your feet before leaning back and bending your elbows.'],
    ['Recover to the catch', 'Reach forward first, then slide the seat toward the footplates.'], (t) => {
      const times = rowCycle.map(([at]) => at);
      const slide = motion(times, [0, .30, 1, 1, .87, 0], t);
      const lean = motion(times, [.40, .40, -.28, -.26, .30, .40], t);
      const handle = motion(times, [0, .18, 1, .94, .31, 0], t);
      torso(v(0, .498, lerp(.109, -.535, slide)), pitch(lean), pitch(lean * .32));
      for (const [side, s] of sides) {
        leg(side, v(s * .147, .236, .384), pitch(-.58), v(s * .13, 1, .18));
        toGrip(side, v(s * .158, lerp(.722, .790, handle), lerp(.718, -.379, handle)),
          v(0, -.22, 1), v(s * .50, -.16, -.97));
      }
    }, machine('rower', { duration: 2.63, framing: 'bench', fingers: 'LR',
      machineGuidedFixture: { gripOffsets: gripOffsets(helpers) } }));

  return entries;
}

function gripOffsets({ dumbbellGripTransform }) {
  return sides.map(([, s]) => dumbbellGripTransform(s).position.toArray());
}

const metadata = {
  "Bicycling_Stationary": ["Bicycling, Stationary", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Calf-Machine_Shoulder_Shrug": ["Calf-Machine Shoulder Shrug", ["Upper back"], []],
  "Chair_Squat": ["Chair Squat", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Decline_Smith_Press": ["Decline Smith Press", ["Chest"], ["Shoulders", "Triceps"]],
  "Elliptical_Trainer": ["Elliptical Trainer", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Glute_Ham_Raise": ["Glute Ham Raise", ["Hamstrings"], ["Calves", "Glutes"]],
  "Hack_Squat": ["Hack Squat", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Jogging_Treadmill": ["Jogging, Treadmill", ["Quadriceps"], ["Glutes", "Hamstrings"]],
  "Lunge_Sprint": ["Lunge Sprint", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Lying_Machine_Squat": ["Lying Machine Squat", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Narrow_Stance_Hack_Squats": ["Narrow Stance Hack Squats", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Recumbent_Bike": ["Recumbent Bike", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Rowing_Stationary": ["Rowing, Stationary", ["Quadriceps"], ["Biceps", "Calves", "Glutes", "Hamstrings", "Upper back"]],
  "Running_Treadmill": ["Running, Treadmill", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Smith_Machine_Behind_the_Back_Shrug": ["Smith Machine Behind the Back Shrug", ["Upper back"], ["Shoulders"]],
  "Smith_Machine_Bench_Press": ["Smith Machine Bench Press", ["Chest"], ["Shoulders", "Triceps"]],
  "Smith_Machine_Bent_Over_Row": ["Smith Machine Bent Over Row", ["Upper back"], ["Biceps", "Shoulders"]],
  "Smith_Machine_Calf_Raise": ["Smith Machine Calf Raise", ["Calves"], []],
  "Smith_Machine_Close-Grip_Bench_Press": ["Smith Machine Close-Grip Bench Press", ["Triceps"], ["Chest", "Shoulders"]],
  "Smith_Machine_Decline_Press": ["Smith Machine Decline Press", ["Chest"], ["Shoulders", "Triceps"]],
  "Smith_Machine_Hang_Power_Clean": ["Smith Machine Hang Power Clean", ["Hamstrings"], ["Glutes", "Upper back", "Quadriceps", "Shoulders"]],
  "Smith_Machine_Hip_Raise": ["Smith Machine Hip Raise", ["Core"], []],
  "Smith_Machine_Incline_Bench_Press": ["Smith Machine Incline Bench Press", ["Chest"], ["Shoulders", "Triceps"]],
  "Smith_Machine_Leg_Press": ["Smith Machine Leg Press", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Smith_Machine_One-Arm_Upright_Row": ["Smith Machine One-Arm Upright Row", ["Shoulders"], ["Biceps", "Upper back"]],
  "Smith_Machine_Overhead_Shoulder_Press": ["Smith Machine Overhead Shoulder Press", ["Shoulders"], ["Triceps"]],
  "Smith_Machine_Pistol_Squat": ["Smith Machine Pistol Squat", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Smith_Machine_Reverse_Calf_Raises": ["Smith Machine Reverse Calf Raises", ["Calves"], []],
  "Smith_Machine_Squat": ["Smith Machine Squat", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings", "Upper back"]],
  "Smith_Machine_Stiff-Legged_Deadlift": ["Smith Machine Stiff-Legged Deadlift", ["Hamstrings"], ["Glutes", "Upper back"]],
  "Smith_Machine_Upright_Row": ["Smith Machine Upright Row", ["Upper back"], ["Biceps", "Shoulders"]],
  "Smith_Single-Leg_Split_Squat": ["Smith Single-Leg Split Squat", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Stairmaster": ["Stairmaster", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Standing_Calf_Raises": ["Standing Calf Raises", ["Calves"], []],
  "Step_Mill": ["Step Mill", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
  "Walking_Treadmill": ["Walking, Treadmill", ["Quadriceps"], ["Calves", "Glutes", "Hamstrings"]],
};
