import { createAuthor, cues, down, lerp, motion, pitch, rep, roll, sides, up, v, yaw } from './barbell-standing-more.mjs';
import { gripFrame } from './ez-curl-exercises.mjs';
import { handAlong, handDorsal, openHand } from './hand-frame.mjs';
import { metadata } from './supplemental-catalog.mjs';

export const groupLabel = 'Plate, band and medicine ball accessories';
const elbows = (s) => v(s * .62, -.85, -.21);
const forward = v(0, 0, 1);
const alternate = [[0, 'Center'], [.27, 'Turn left'], [1.03, 'Left peak'], [1.66, 'Center'],
  [2.44, 'Right peak'], [3.35, 'Center']];
const alternating = (t) => motion(alternate.map(([at]) => at), [0, 0, 1, 0, -1, 0], t);

export function createEntries(asset, helpers) {
  const { add, entries, torso, world, leg, arm, free, stance, point, grip, bone } = createAuthor(asset, helpers, metadata);
  const exercise = (id, setup, action, pose, options, phases = up) =>
    add(id, phases, cues(phases, setup, action, ['Reset under control', 'Return to the start while keeping your balance.']),
      pose, { equipment: '', fingers: '', ...options });

  const anchor = [.98, 1.06, .04];
  exercise('External_Rotation_with_Band', ['Face across the anchor with your right elbow bent', 'Place the band at elbow height and tuck your upper arm.'],
    ['Move your hand outward', 'Rotate at the shoulder while keeping the elbow close to your side.'], (t) => {
      const a = rep(up, t);
      torso(v(0, .863, 0));
      stance(.161);
      const elbow = v(-.249, 1.057, .093);
      const theta = lerp(-.48, 1.20, a);
      const lower = v(-Math.sin(theta), .05, Math.cos(theta));
      const wrist = elbow.clone().addScaledVector(lower, bone('HandR').position.length());
      arm('R', wrist, elbow.sub(point('ArmR')), grip('R', v(0, 1, 0), lower).hand);
      free('L', v(.267, .971, .116), v(-.12, -.97, .15));
    }, { fingers: 'R', resistance: { mode: 'band', anchors: [anchor], links: [[anchor, 'R']], support: 'post' } });

  const grips = sides.map(([, s]) => gripFrame(s, true, true, helpers.dumbbellGripTransform));
  exercise('Close-Grip_EZ-Bar_Curl_with_Band', ['Stand over the bands and take the close EZ grip', 'Start with your palms up and both elbows beside your ribs.'],
    ['Curl without moving your upper arms', 'Keep the band tension as the bar rises toward your shoulders.'], (t) => {
      const a = rep(up, t);
      const theta = lerp(.37, 2.62, a);
      const lower = v(0, -Math.cos(theta), Math.sin(theta));
      const frame = pitch(.49 - theta);
      torso(v(0, .864, 0));
      stance(.172);
      const upper = v(-.093, -1, .074).setLength(bone('ForearmL').position.length());
      const center = point('ArmL').add(upper).addScaledVector(lower, bone('HandL').position.length() - .013)
        .sub(grips[0](frame, lower).offset);
      center.x = 0;
      sides.forEach(([side, s], i) => {
        const { offset, rotation } = grips[i](frame, lower);
        arm(side, center.clone().add(offset), v(-s * .09, -1, .08), rotation);
      });
      return [center, frame];
    }, { equipment: 'ez-curl-bar', fingers: 'LR', barLoad: 'curl-bands' });

  for (const [id, mode] of [
    ['Car_Drivers', 'drivers'], ['Front_Plate_Raise', 'raise'], ['Plate_Twist', 'seated'],
    ['Plate_Pinch', 'pinch'], ['Svend_Press', 'svend'], ['Reverse_Plate_Curls', 'reverse'], ['Weighted_Crunches', 'crunch'],
  ]) {
    const rotating = ['drivers', 'seated'].includes(mode);
    const seated = mode === 'seated';
    const drivers = mode === 'drivers';
    const reverse = mode === 'reverse';
    const raise = mode === 'raise';
    const pinch = mode === 'pinch';
    const crunch = mode === 'crunch';
    const svend = mode === 'svend';
    const phases = rotating ? alternate : up;
    const fixture = { kind: crunch ? 'medicine-ball' : pinch ? 'plate-pair' : 'plate', size: crunch ? .121 : pinch ? .105 : .174 };
    const setups = {
      drivers: ['Hold the plate at three and nine o’clock', 'Reach forward at shoulder height.'],
      raise: ['Hold the plate against your thighs', 'Use both hands and soften your elbows.'],
      seated: ['Sit with your knees bent and hold the plate in front', 'Lean back slightly and raise both feet.'],
      pinch: ['Put two plates together with the smooth faces out', 'Grip the pair between your fingers and thumb.'],
      svend: ['Press both palms against the plate at your chest', 'Maintain inward pressure with both hands.'],
      reverse: ['Grip the top of a plate with both palms facing down', 'Start with the plate in front of your thighs.'],
      crunch: ['Lie back with knees bent and hold the ball to your chest', 'Keep your feet flat and neck relaxed.'],
    };
    const actions = {
      drivers: ['Turn the plate like a steering wheel', 'Alternate which hand rises while keeping the arms extended.'],
      raise: ['Raise the plate forward to eye level', 'Move at the shoulders without swinging your torso.'],
      seated: ['Rotate the plate toward each hip in turn', 'Let the shoulders turn with the plate.'],
      pinch: ['Stand with the plate in your fingertips', 'Hold the plate still before setting it back down.'],
      svend: ['Press straight ahead while squeezing the plate', 'Keep both palms in contact and bring the plate back to the chest.'],
      reverse: ['Curl the plate up toward your chest', 'Keep your elbows beside your ribs and lower without swinging.'],
      crunch: ['Curl your shoulders off the floor', 'Keep the ball against your chest as the ribs move toward the pelvis.'],
    };
    exercise(id, setups[mode], actions[mode], (t) => {
      const a = rotating ? alternating(t) : rep(up, t);
      const twist = yaw(seated ? .79 * a : 0);
      if (seated || crunch) {
        const tilt = crunch ? -1.57 : -.64;
        torso(v(0, .132, -.086), pitch(tilt));
        if (crunch) {
          world('Lumbar', pitch(tilt + .28 * a));
          world('Chest', pitch(tilt + .59 * a));
          world('Head', pitch(tilt + .56 * a));
        } else {
          world('Chest', twist.clone().multiply(pitch(tilt)));
          world('Head', twist.clone().multiply(pitch(tilt)));
        }
        for (const [side, s] of sides) leg(side, v(seated ? -.029 * s : s * .136, seated ? .23 + s * .031 : .074, seated ? .64 : .437),
          pitch(seated ? -.43 : 0), v(s * .13, .93, .25));
      } else {
        const load = pinch ? 1 - a : 0;
        torso(v(0, lerp(.863, .448, load), -.203 * load), pitch(pinch ? 1.06 * load : .03));
        stance(pinch ? .24 : .165);
      }
      const mid = point('ArmL').lerp(point('ArmR'), .5);
      const raiseAngle = lerp(-1.36, .29, a);
      const center = crunch ? mid.clone().add(v(0, .197, .123 + .04 * a))
        : seated ? mid.clone().add(v(.09 * a, lerp(-.122, -.291, Math.abs(a)), .295).applyQuaternion(twist))
        : drivers ? v(0, 1.399, .575)
        : reverse ? mid.clone().add(v(0, lerp(-.734, -.145, a), lerp(.228, .352, a)))
        : raise ? mid.clone().add(v(0, .507 * Math.sin(raiseAngle), .034 + .507 * Math.cos(raiseAngle)))
        : svend ? mid.clone().add(v(0, -.166, lerp(.231, .564, a)))
        : v(-.341, lerp(.215, .774, a), lerp(.214, .056, a));
      const frame = drivers ? roll(1.24 * a).multiply(pitch(Math.PI / 2))
        : reverse ? pitch(lerp(1.50, .86, a)) : raise ? pitch(lerp(.21, 1.58, a)) : pinch ? roll(Math.PI / 2)
        : svend ? roll(Math.PI / 2) : twist.clone().multiply(pitch(seated ? 1.14 : 0));
      for (const [side, s] of sides) {
        if (seated) {
          const direction = v(-s * .38, .055, .92).applyQuaternion(twist);
          const hand = openHand(s, direction, v(s, 0, 0).applyQuaternion(twist));
          const palm = handAlong(s).multiplyScalar(.078).addScaledVector(handDorsal(), -.024).applyQuaternion(hand);
          const contact = v(s * fixture.size, 0, 0).applyQuaternion(frame).add(center);
          arm(side, contact.sub(palm), elbows(s), hand, true);
          continue;
        }
        if (pinch) {
          if (s > 0) {
            free(side, point('ArmL').add(v(.091, -.38, .166)), v(.21, -.92, .14));
          } else {
            const wrist = center.clone().add(v(0, .136, -.041));
            arm(side, wrist, elbows(s), openHand(s, v(0, -1, .15), v(-.79, .06, .69)));
          }
          continue;
        }
        const rotateGrip = drivers ? roll(1.24 * a) : twist;
        const halfWidth = svend ? .064 : crunch ? .128 : .185;
        const offset = (reverse ? v(s * .085, -.058, -.16).applyQuaternion(frame)
          : v(s * halfWidth, crunch ? -.016 : 0, svend ? -.071 : -.034).applyQuaternion(rotateGrip));
        const direction = v(-s * (svend ? .42 : .69), svend ? .1 : crunch ? .49 : .07,
          reverse ? .97 : crunch ? .11 : .64).applyQuaternion(rotateGrip);
        const hand = openHand(s, direction, v(s, 0, 0));
        arm(side, center.clone().add(offset), elbows(s), hand);
      }
      return [center, frame];
    }, { animatedFixture: fixture, ...(seated || crunch ? { framing: 'floor' } : {}) }, phases);
  }

  exercise('Weighted_Sissy_Squat', ['Hold the plate to your chest and take the post with your free hand',
    'Balance over the balls of both feet.'],
  ['Let your knees travel forward as you lean back', 'Keep the hips extended and use the support for balance.'], (t) => {
    const a = rep(down, t);
    torso(v(0, lerp(.885, .635, a), lerp(.026, .166, a)), pitch(-.55 * a));
    for (const [side, s] of sides) leg(side, v(s * .162, .127 + .076 * a, -.046 + .034 * a),
      pitch(.52 + .51 * a), v(s * .13, .06, 1));
    const center = point('Chest').add(v(-.083, .155, .213).applyQuaternion(pitch(-.55 * a)));
    free('R', center.clone().add(v(-.154, -.087, -.073)), v(.47, .82, .32));
    const post = v(.442, 1.075, .206);
    arm('L', post, elbows(1), grip('L', v(0, 1, 0), forward).hand);
    return [center, pitch(1.5 - .55 * a)];
  }, { fingers: 'L', animatedFixture: { kind: 'plate', size: .157 },
    fixtures: [{ kind: 'wall', position: [.49, .72, .206], size: [.082, 1.44, .076] }] }, down);
  return entries;
}
