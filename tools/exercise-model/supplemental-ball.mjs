import { QuaternionKeyframeTrack } from 'three';
import { createAuthor, cues, down, lerp, motion, pitch, rep, roll, sides, up, v, yaw } from './barbell-standing-more.mjs';
import { createSupportHands, openHand, palmHeight, supportFingerNames } from './hand-frame.mjs';
import { metadata } from './supplemental-catalog.mjs';

export const groupLabel = 'Exercise ball stability and strength';
const radius = .30;
const ball = (z, size = radius) => ({ kind: 'ball', position: [0, size, z], size });
const animatedBall = { kind: 'ball', size: radius };
const feet = v(0, 1, .17);
const elbows = (s) => v(s * .61, -.77, -.19);

export function createEntries(asset, helpers) {
  const { add, entries, bone, torso, world, leg, arm, free, point, stance } = createAuthor(asset, helpers, metadata);
  const support = createSupportHands(bone);
  const exercise = (id, setup, action, pose, options, phases = up) =>
    add(id, phases, cues(phases, setup, action, ['Return slowly', 'Keep the ball controlled as you return to the setup.']),
      pose, { equipment: '', fingers: '', framing: 'floor', ...options });

  function plantHands(id) {
    entries['local:exercise:' + id]?.clip.tracks.push(...supportFingerNames.map((name) =>
      new QuaternionKeyframeTrack(name + '.quaternion', [0], bone(name).quaternion.toArray())));
    support.reset();
  }

  function planted(side, s, x, z, pole = v(s * .42, -.14, -.81)) {
    arm(side, v(s * x, palmHeight + .004, z), pole, support.pose(s, v(0, 0, 1), v(0, 1, 0)));
  }
  function crossed(side, s) {
    const chest = point('Arm' + side).lerp(point('Arm' + (s > 0 ? 'R' : 'L')), .68);
    free(side, chest.add(v(0, .095, .124 + .027 * s)), v(-s, .46, .11), elbows(s));
  }

  for (const [id, mode] of [
    ['Exercise_Ball_Crunch', 'crunch'], ['Crunch_-_Legs_On_Exercise_Ball', 'legs'],
    ['Physioball_Hip_Bridge', 'bridge'],
  ]) {
    const legsOn = mode === 'legs';
    const bridge = mode === 'bridge';
    exercise(id, [legsOn ? 'Rest both calves on the ball' : bridge ? 'Support the shoulder blades on the ball' : 'Support your lower back on the ball',
      legsOn ? 'Bend the knees and relax the neck.' : 'Plant both feet and brace before moving.'],
    [bridge ? 'Squeeze your glutes and lift the hips' : 'Curl your ribs toward your pelvis',
      bridge ? 'Finish with knees, hips and shoulders aligned.' : 'Let the shoulder blades rise without pulling your head.'], (t) => {
      const a = rep(up, t);
      const base = legsOn ? -1.53 : bridge ? lerp(-1.10, -1.55, a) : -1.54;
      torso(v(0, legsOn ? .148 : bridge ? lerp(.501, .706, a) : .666,
        legsOn ? -.037 : bridge ? lerp(.176, .194, a) : .041), pitch(base));
      if (!bridge) {
        world('Lumbar', pitch(base + (legsOn ? .17 : .32) * a));
        world('Chest', pitch(base + (legsOn ? .50 : .68) * a));
        world('Head', pitch(base + (legsOn ? .47 : .67) * a));
      }
      for (const [side, s] of sides) {
        leg(side, v(s * (legsOn ? .081 : .198), legsOn ? .683 : .074, legsOn ? .477 : bridge ? .558 : .508),
          pitch(legsOn ? -.18 : 0), feet);
        crossed(side, s);
      }
    }, { fixtures: [ball(legsOn ? .453 : bridge ? -.283 : -.14)] });
  }

  for (const [id, mode] of [
    ['Ball_Leg_Curl', 'curl'], ['Exercise_Ball_Pull-In', 'pull'], ['Push-Ups_With_Feet_On_An_Exercise_Ball', 'push'],
  ]) {
    const curl = mode === 'curl';
    const pull = mode === 'pull';
    const phases = curl || pull ? up : down;
    exercise(id, [curl ? 'Lie back with your heels on the ball' : pull ? 'Start in a plank with the shins on the ball' :
      'Set your toes on the ball and hands wide on the floor', 'Keep both sides level as you take up the load.'],
    [curl ? 'Pull your heels toward your hips' : pull ? 'Draw your knees toward your chest' : 'Lower your chest between your hands',
      curl ? 'Keep your hips raised as the ball rolls in.' : pull ? 'Let the ball roll in beneath your shins.' :
        'Keep the toes in place and press your body up together.'], (t) => {
      const a = curl ? motion([0, .25, .68, 2.80, 3.34], [0, 0, 1, 1, 0], t) : rep(phases, t);
      const bend = curl ? motion([0, .60, 1.38, 1.86, 2.80, 3.34], [0, 0, 1, 1, 0, 0], t) : a;
      const distance = curl ? lerp(.797, .345, bend) : pull ? lerp(-.998, -.511, a) : -1.07;
      const y = curl ? lerp(.275, .515, a) : pull ? lerp(.509, .76, a) : lerp(.548, .322, a);
      const z = curl ? .026 - .035 * a : pull ? lerp(-.218, .065, a) : -.32;
      torso(v(0, y, z), pitch(curl ? lerp(-1.81, -2.06, a) : pull ? lerp(1.63, 2.01, a) : lerp(1.63, 1.86, a)));
      for (const [side, s] of sides) {
        leg(side, v(s * .115, curl ? lerp(.684, .662, bend) : pull ? .735 : lerp(.736, .784, a),
          distance + (curl ? -.017 : -.064)),
          pitch(curl ? -.34 * a : pull ? .94 + .41 * a : 1.44),
          curl ? v(0, 1, .36) : v(s * .11, -.87, .57));
        if (curl) planted(side, s, .276, -.237, v(s * .24, .42, -.9));
        else planted(side, s, pull ? .229 : .347, pull ? .448 : .231);
      }
      const initial = curl ? .797 : pull ? -.998 : -1.07;
      return [v(0, radius, distance), pitch((distance - initial) / radius)];
    }, { animatedFixture: animatedBall }, curl
      ? [[0, 'Set both heels'], [.25, 'Raise hips'], [.60, 'Curl'], [1.38, 'Hold'], [1.86, 'Extend'], [3.34, 'Reset']]
      : phases);
    plantHands(id);
  }

  for (const [id, mode] of [
    ['Chest_Stretch_on_Stability_Ball', 'chest'], ['Downward_Facing_Balance', 'balance'], ['Pyramid', 'pyramid'],
  ]) {
    const chest = mode === 'chest';
    const balance = mode === 'balance';
    exercise(id, [chest ? 'Kneel close to the ball and rest your elbows on it' :
      balance ? 'Lie face down with your abdomen on the ball' : 'Center your hips over the ball',
    'Set your contact points before moving.'],
    [chest ? 'Let your chest sink between your arms' : balance ? 'Walk your hands forward and float both legs' : 'Lengthen both arms and legs',
      chest ? 'Keep your hips above your knees.' : 'Brace your trunk and balance over the ball.'], (t) => {
      const a = rep(up, t);
      if (chest) {
        torso(v(0, .484 + .014 * a, -.354), pitch(.50 + .35 * a));
        for (const [side, s] of sides) {
          leg(side, v(s * .152, .096, -.751), pitch(2.95), v(0, -.93, .34));
          const target = v(s * .142, .635 + .024 * a, .120 + .11 * a);
          free(side, target, v(s * .16, .56, .82), v(s * .27, -.88, .45));
        }
        return;
      }
      const position = balance ? lerp(-.132, .066, a) : -.072;
      torso(v(0, balance ? lerp(.750, .724, a) : lerp(.746, .774, a), position),
        pitch(balance ? lerp(1.70, 1.97, a) : lerp(1.76, 1.84, a)));
      world('Lumbar', pitch(balance ? lerp(2.18, 1.97, a) : 2.17));
      world('Chest', pitch(balance ? lerp(2.14, 1.97, a) : 2.13));
      world('Head', pitch(1.81));
      for (const [side, s] of sides) {
        const step = balance ? Math.min(1, Math.max(0, (a - (s > 0 ? .48 : 0)) / .48)) : 0;
        const wrist = v(s * .237, palmHeight + .004 + .054 * Math.sin(Math.PI * step),
          (balance ? .424 : .49) + .23 * step);
        arm(side, wrist, v(s * .42, -.14, -.81), support.pose(s, v(0, 0, 1), v(0, 1, 0)));
        leg(side, v(s * (balance ? lerp(.245, .125, a) : .31), balance ? lerp(.205, .733, a) : .205,
          balance ? lerp(-.69, -.725, a) : lerp(-.582, -.645, a)), pitch(balance ? lerp(1.50, 1.14, a) : 1.54),
          v(s * (balance ? .48 : .86), -.91, .10));
      }
    }, { fixtures: [ball(chest ? .14 : balance ? -.128 : -.167, chest ? .32 : radius)] });
    if (!chest) plantHands(id);
  }

  for (const [id, mode] of [['Hug_A_Ball', 'hug'], ['Torso_Rotation', 'rotate']]) {
    const hug = mode === 'hug';
    const phases = hug ? up : [[0, 'Center'], [.30, 'Turn left'], [1.06, 'Left peak'], [1.67, 'Center'],
      [2.47, 'Right peak'], [3.35, 'Center']];
    exercise(id, [hug ? 'Sit with your legs around the ball' : 'Hold the ball at arm’s length in front of you',
      hug ? 'Wrap your arms around the sides.' : 'Keep both feet planted.'],
    [hug ? 'Reach around the ball and round your upper back' : 'Rotate your chest from side to side',
      hug ? 'Let the upper back broaden as you reach.' : 'Let your eyes follow the ball while your pelvis stays steady.'], (t) => {
      const a = hug ? rep(up, t) : motion(phases.map(([at]) => at), [0, 0, 1, 0, -1, 0], t);
      const twist = yaw(.72 * a);
      torso(v(0, hug ? .133 : .861, hug ? -.266 - .035 * a : 0), pitch(hug ? .18 + .25 * a : .025));
      if (hug) for (const [side, s] of sides) leg(side, v(s * .425, .071, .438), yaw(s * .35), v(s * .78, .87, .22));
      else { stance(.167); world('Chest', twist); world('Head', twist); }
      const center = hug ? v(0, .30, .235) : point('Chest').add(v(0, .18, .56).applyQuaternion(twist));
      for (const [side, s] of sides) {
        const offset = hug ? v(s * lerp(.365, .246, a), .15, lerp(.022, .208, a))
          : v(s * .333, 0, -.10).applyQuaternion(twist);
        const wrist = center.clone().add(offset);
        if (hug) arm(side, wrist, v(s, -.35, .18), openHand(s, v(-s * .68, -.24, .67), v(s * .87, .34, .34)));
        else arm(side, wrist, elbows(s).applyQuaternion(twist),
          openHand(s, v(-s * .06, 0, 1).applyQuaternion(twist), v(s, 0, 0).applyQuaternion(twist)));
      }
      if (!hug) return [center, twist];
    }, hug ? { fixtures: [ball(.235)] } : { animatedFixture: animatedBall, framing: 'standing' }, phases);
  }

  for (const [id, sideBend] of [['Weighted_Ball_Hyperextension', false], ['Weighted_Ball_Side_Bend', true]]) {
    exercise(id, [sideBend ? 'Lie sideways across the ball with feet crossed' : 'Lie face down with your abdomen supported',
      sideBend ? 'Hold the plate beside the upper temple.' : 'Hold the plate at your upper chest and anchor your toes.'],
    [sideBend ? 'Shorten the upper side of your waist' : 'Raise your torso into line with your legs',
      sideBend ? 'Keep the movement in the side of the trunk.' : 'Finish in a straight line from hips to head.'], (t) => {
      const a = rep(up, t);
      const tip = sideBend ? roll(lerp(1.66, .84, a)) : pitch(lerp(1.77, 1.24, a));
      torso(v(sideBend ? .045 : 0, sideBend ? .752 : .754, sideBend ? -.04 : -.17), tip);
      const center = sideBend ? point('Head').add(v(.123, .073, .018).applyQuaternion(tip)) :
        point('ArmL').lerp(point('ArmR'), .5).add(v(0, -.119, .119).applyQuaternion(tip));
      for (const [side, s] of sides) {
        leg(side, sideBend ? v(.524 - .084 * s, .075 + (s > 0 ? .017 : 0), .108 + .094 * s)
          : v(s * .267, .207, -.665), sideBend ? yaw(.46) : pitch(1.48),
        sideBend ? v(.66, -.94, .51) : v(s * .62, -.9, .12));
        if (!sideBend) {
          free(side, center.clone().add(v(s * .123, 0, -.02)), v(-s, .19, .32), elbows(s));
        } else if (s > 0) {
          const wrist = center.clone().add(v(.039, -.074, .092).applyQuaternion(tip));
          arm(side, wrist, v(0, -.78, .62).applyQuaternion(tip),
            openHand(s, v(0, .82, -.57).applyQuaternion(tip), v(1, 0, 0).applyQuaternion(tip)));
        } else {
          const wrist = v(-.300, .601, .047);
          arm(side, wrist, v(.5, .5, -1), openHand(s, v(-.34, -.53, .78), v(-.53, .79, .31)));
        }
      }
      return [center, sideBend ? tip.clone().multiply(roll(-Math.PI / 2)) : pitch(Math.PI / 2).multiply(tip)];
    }, { fixtures: [sideBend ? { ...ball(.008), position: [-.154, radius, .008] } : ball(-.065)],
      animatedFixture: { kind: 'plate', size: .128 } });
  }
  return entries;
}
