import { createEntries as createDumbbellExpansion } from './dumbbell-expansion.mjs';
import { createAuthor, cues, down, lerp, motion, pitch, q, rep, sides, up, v, yaw } from './barbell-standing-more.mjs';
import { metadata } from './catalog-more.mjs';
import { openHand } from './hand-frame.mjs';

export const groupLabel = 'Dumbbell isolation and swings';
const oneSide = 'R';
const flat = { framing: 'floor', benchTransform: { position: [0, 0, -.17] } };
const handPole = (s) => v(s * .8, -.22, .06);

export function createEntries(asset, helpers) {
  const { add, entries, bone: authorBone, torso, stance, leg, arm, grip, free, point, rotation, armLength } =
    createAuthor(asset, helpers, metadata);
  function weight(side, target, axis, direction, pole) {
    const { hand } = grip(side, axis.clone().normalize(), direction);
    arm(side, target, pole, hand);
  }

  for (const [id, mode] of [
    ['Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench', 'head'],
    ['Dumbbell_Lying_One-Arm_Rear_Lateral_Raise', 'one'],
    ['Dumbbell_Lying_Rear_Lateral_Raise', 'incline'], ['Lying_Rear_Delt_Raise', 'flat'],
  ]) {
    const incline = mode !== 'flat';
    const heads = mode === 'head';
    const hands = mode === 'one' ? oneSide : 'LR';
    const angle = heads ? .73 : incline ? Math.PI / 12 : 0;
    const options = incline ? { framing: 'floor', benchTransform: { angle, position: [0, 0, heads ? -.252 : .13] } }
      : { framing: 'floor', benchTransform: { position: [0, 0, .18] } };
    add(id, up, cues(up, [heads ? 'Hinge and rest your forehead lightly on the incline' : 'Set your chest against the pad',
      'Start with the working arm hanging and the elbow soft.'],
    ['Raise outward at shoulder level', 'Lead with your elbow and avoid shrugging.'],
    ['Return to a hang', 'Lower the dumbbell on the same arc.']), (t) => {
      const a = rep(up, t);
      torso(v(0, heads ? .777 : .563, heads ? -.454 : .018), pitch(heads ? 1.24 : Math.PI / 2 - angle));
      for (const [side, s] of sides) {
        leg(side, v(s * (heads ? .31 : .185), .074, heads ? -.75 : -.48), yaw(s * .17));
        const shoulder = point('Arm' + side);
        if (!hands.includes(side)) {
          free(side, v(.15, .25, .51), v(-.38, -.86, .22));
          continue;
        }
        const theta = heads ? lerp(.28, 1.49, a) : 1.49 * a;
        const direction = v(s * Math.sin(theta), -Math.cos(theta), -.03);
        weight(side, shoulder.addScaledVector(direction, mode === 'flat' ? .391 + .124 * a : .515), v(Math.cos(theta), s * Math.sin(theta), .10),
          direction, v(s * .16, -.19, -.86));
      }
    }, { ...options, equipment: (incline ? 'incline-bench-' : 'bench-') +
      (hands === oneSide ? 'dumbbell-right' : 'dumbbells'), fingers: hands });
  }

  for (const [id, style] of [
    ['Dumbbell_Tricep_Extension_-Pronated_Grip', 'both'], ['One_Arm_Pronated_Dumbbell_Triceps_Extension', 'pronated'],
    ['One_Arm_Supinated_Dumbbell_Triceps_Extension', 'supinated'], ['Standing_One-Arm_Dumbbell_Triceps_Extension', 'standing'],
  ]) {
    const standing = style === 'standing';
    const both = style === 'both';
    const hands = both ? 'LR' : oneSide;
    add(id, down, cues(down, [standing ? 'Stand tall with one arm overhead' : 'Lie on the bench with the weight over your shoulder',
      style === 'supinated' ? 'Turn the working palm toward your face.' : 'Use a forward-facing grip.'],
    [standing ? 'Lower the dumbbell behind your head' : 'Lower the weight toward your ear',
      'Bend the elbow while keeping the upper arm steady.'],
    ['Extend your elbow', 'Follow the same arc back to the top.']), (t) => {
      const theta = rep(down, t) * 1.98;
      torso(v(0, standing ? .865 : .55, standing ? 0 : .12), pitch(standing ? 0 : -Math.PI / 2));
      if (standing) stance(.157);
      else for (const [side, s] of sides) leg(side, v(s * .22, .074, .49));
      for (const [side, s] of sides) {
        if (!hands.includes(side)) {
          if (standing) free(side, point('ArmL').add(v(.06, -.44, .08)), v(-.66, -.31, .35));
          else {
            const wrist = point('ArmR').add(v(.125, .139, .092));
            arm(side, wrist, v(.2, -.55, .70), (forearm) =>
              openHand(s, forearm.lerp(v(-1, .05, -.18), .42), v(0, .32, 1)));
          }
          continue;
        }
        const upper = v(s * .07, 1, -.09).setLength(authorBone('Forearm' + side).position.length());
        const direction = v(s * .08, Math.cos(theta), -Math.sin(theta)).normalize();
        const target = point('Arm' + side).add(upper)
          .addScaledVector(direction, authorBone('Hand' + side).position.length());
        weight(side, target, v(style === 'supinated' ? -1 : 1, 0, 0), direction, upper);
      }
    }, { ...(standing ? {} : flat), equipment: (standing ? '' : 'bench-') +
      (both ? 'dumbbells' : 'dumbbell-right'), fingers: hands });
  }

  add('Dumbbell_Seated_One-Leg_Calf_Raise', up, cues(up, ['Sit with one dumbbell supported on your thigh',
    'Rest the ball of your working foot on the platform.'], ['Raise that heel', 'Keep the weight supported above the knee.'],
  ['Lower your heel slowly', 'Keep your toes in contact with the platform.']), (t) => {
    const a = rep(up, t);
    torso(v(0, .557, -.17), pitch(.12));
    const foot = pitch(.64 * a);
    const forefoot = v(0, -.073, .186).applyQuaternion(foot);
    leg('R', v(-.165, .30, .49).sub(forefoot), foot);
    leg('L', v(.32, .074, .27));
    const knee = point('ShinR');
    weight('R', knee.add(v(-.008, .144, -.038)), v(0, 0, 1), v(0, -1, .22), v(-.92, -.16, .41));
    free('L', point('ShinL').add(v(.05, .09, -.04)), v(.17, -1, .42));
  }, { equipment: 'bench-platform-dumbbell-right', fingers: oneSide, benchTransform: { position: [0, 0, -.55] }, platformTransform: { position: [0, 0, .09] } });

  // Reuse the two-palm cradle from the seated extension, expressed in prop space.
  const cradle = createDumbbellExpansion({ scene: asset.scene, onlyExercises: ['Seated_Triceps_Press'] },
    helpers)['local:exercise:Seated_Triceps_Press'];
  const [centerTrack, turnTrack] = cradle.propClip.tracks;
  const center = v().fromArray(centerTrack.values);
  const turn = q().fromArray(turnTrack.values);
  for (const { name, values } of cradle.clip.tracks) {
    const [joint, property] = name.split('.');
    const bone = authorBone(joint);
    if (bone && (property === 'position' || property === 'quaternion')) bone[property].fromArray(values);
  }
  const seats = sides.map(([side]) => ({
    side, offset: point('Hand' + side).sub(center).applyQuaternion(turn.clone().invert()),
    hand: turn.clone().invert().multiply(rotation('Hand' + side)),
  }));
  const digits = cradle.clip.tracks.filter(({ name }) => /^(Thumb|Index|Middle|Ring|Little)/.test(name));

  for (const [id, mode] of [
    ['Single_Dumbbell_Raise', 'raise'], ['Standing_Dumbbell_Triceps_Extension', 'extension'], ['Vertical_Swing', 'swing'],
  ]) {
    const extension = mode === 'extension';
    const swing = mode === 'swing';
    const phases = extension ? down : swing ? [[0, 'Setup'], [.42, 'Hinge'], [.76, 'Drive'], [1.16, 'Overhead'],
      [1.65, 'Land'], [2.12, 'Reset']] : up;
    const annotations = swing ? [[0, 'Hold the dumbbell with both hands', 'Let it hang between your legs.'],
      [.42, 'Hinge and drive through your legs', 'Swing back between the thighs, then drive the weight overhead.'],
      [1.65, 'Land with soft knees', 'Bring the weight back to the center under control.']]
      : cues(phases, [extension ? 'Hold one head of the dumbbell overhead' : 'Cup one head of the dumbbell in both hands',
        'Brace your torso before moving.'], [extension ? 'Bend your elbows behind your head' : 'Raise the weight in front of you',
        extension ? 'Keep your upper arms steady.' : 'Lift with long arms and a quiet torso.'],
      ['Return under control', 'Keep your feet steady.']);
    add(id, phases, annotations, (t) => {
      const a = rep(extension ? down : up, t);
      const hinge = swing ? motion([0, .42, .78, 1.16, 1.65, 2.12, 2.70], [0, 1, 0, 0, .44, 0, 0], t) : 0;
      const air = swing ? motion([0, .67, 1.16, 1.65, 2.70], [0, 0, .15, 0, 0], t) : 0;
      torso(v(0, .865 - .207 * hinge + air, -.205 * hinge), pitch(.78 * hinge), pitch(.09));
      stance(swing ? .29 : .20, 0, .21, air);
      if (extension) {
        const flex = -.05 - 2.05 * a;
        const frame = pitch(flex).multiply(yaw(Math.PI)).multiply(turn);
        const upperLength = authorBone('ForearmL').position.length();
        const forearmLength = authorBone('HandL').position.length();
        const upper = v(-.066, .27, -.06).setLength(upperLength);
        const elbow = point('ArmL').add(upper);
        const offsets = seats.map(({ side, offset, hand }) => ({
          side, offset: offset.clone().applyQuaternion(frame), hand: frame.clone().multiply(hand),
        }));
        const wristSpread = Math.abs(offsets[0].offset.x - offsets[1].offset.x) / 2;
        const sagittalLength = Math.sqrt(forearmLength ** 2 - (elbow.x - wristSpread) ** 2);
        const wristCenter = v(0, elbow.y, elbow.z).add(v(0, sagittalLength, 0).applyQuaternion(pitch(flex)));
        const midpoint = offsets[0].offset.clone().add(offsets[1].offset).multiplyScalar(.5);
        const root = wristCenter.sub(midpoint);
        for (const { side, offset, hand } of offsets) {
          const pole = v(side === 'L' ? upper.x : -upper.x, upper.y, upper.z);
          arm(side, root.clone().add(offset), pole, hand, true);
        }
        return [root, frame];
      }
      const travel = swing ? motion([0, .42, .76, 1.16, 1.65, 2.12, 2.70], [0, -.4, .7, 2.75, .94, 0, 0], t)
        : .28 + 1.64 * a;
      const joint = point('Chest').add(v(0, .17, 0));
      const root = joint.add(v(0, -.52 * Math.cos(travel), .54 * Math.sin(travel) + .07));
      const frame = pitch(3.52 - travel).multiply(yaw(Math.PI)).multiply(turn);
      const targets = seats.map(({ side, offset, hand }) => ({
        side, offset: offset.clone().applyQuaternion(frame), hand: frame.clone().multiply(hand),
      }));
      // Keep both palms on the same rigid head at the limits of shoulder reach.
      for (let pass = 0; pass < 8; pass++) for (const { side, offset } of targets) {
        const shoulder = point('Arm' + side);
        const delta = root.clone().add(offset).sub(shoulder);
        if (delta.length() > armLength - .001) root.copy(shoulder.add(delta.setLength(armLength - .001)).sub(offset));
      }
      for (const { side, offset, hand } of targets) arm(side, root.clone().add(offset), handPole(side === 'L' ? 1 : -1), hand);
      return [root, frame];
    }, { equipment: 'cradle-dumbbell', fingers: '', duration: swing ? 2.70 : 3.6 });
    entries['local:exercise:' + id]?.clip.tracks.push(...digits);
  }
  return entries;
}
