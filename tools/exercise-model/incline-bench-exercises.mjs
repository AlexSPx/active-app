import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const forward = v(0, 0, 1);
const pitch = (angle) => new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), angle);
const turnAround = new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), Math.PI);
const lerp = THREE.MathUtils.lerp;
const sides = [['L', 1], ['R', -1]];

function orient(from, direction, facing, target) {
  const axis = direction.clone().normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), axis);
  const actual = facing.clone().applyQuaternion(turn);
  const planar = target.clone().addScaledVector(axis, -target.dot(axis));
  const twist = Math.atan2(axis.dot(actual.clone().cross(planar)), actual.dot(planar));
  return turn.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, twist));
}

export function createEntries({ scene, onlyExercises }, { createPowerGripTracks }) {
  const figure = clone(scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const pelvis = bone('Pelvis');
  const joints = ['Pelvis', 'Lumbar', 'Chest', 'Head', ...sides.flatMap(([side]) =>
    ['Arm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot'].map((name) => name + side))];
  const grip = createPowerGripTracks(figure);
  const entries = {};

  function world(name, rotation) {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  }

  function torso(position, angle, prone) {
    pelvis.position.copy(position);
    for (const name of ['Pelvis', 'Lumbar', 'Chest', 'Head']) world(name, prone ? pitch(angle) : pitch(angle).multiply(turnAround));
  }

  function segments(first, second, third, upper, lower, bend, endRotation, lowerRotation) {
    world(first, orient(bone(second).position, upper, forward, bend));
    world(second, lowerRotation ?? orient(bone(third).position, lower, forward, bend));
    world(third, endRotation);
  }

  function reach(first, second, third, end, pole) {
    const axis = end.clone().sub(point(first));
    const upper = bone(second).position.length();
    const lower = bone(third).position.length();
    const length = THREE.MathUtils.clamp(axis.length(), Math.abs(upper - lower) + .0001, upper + lower - .0001);
    axis.normalize();
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length);
    const firstSegment = axis.clone().multiplyScalar(along)
      .addScaledVector(bend, Math.sqrt(upper ** 2 - along ** 2));
    return [firstSegment, axis.multiplyScalar(length).sub(firstSegment)];
  }

  function arm(side, wrist, pole, palm) {
    const sign = side === 'L' ? 1 : -1;
    const names = ['Arm' + side, 'Forearm' + side, 'Hand' + side];
    const [upper, lower] = reach(...names, wrist, pole);
    const along = v(sign * .025, -.137, .065).normalize();
    const across = v(1, 0, 0).addScaledVector(along, -along.x).normalize();
    const palmRest = along.clone().cross(across);
    const hand = orient(along, lower, palmRest, palm);
    const forearm = orient(bone(names[2]).position, lower, palmRest, palm);
    segments(...names, upper, lower, pole.clone().negate(), hand, forearm);
  }

  function leg(side, ankle, pole, angle, facing = pole) {
    const names = ['Thigh' + side, 'Shin' + side, 'Foot' + side];
    segments(...names, ...reach(...names, ankle, pole), facing, pitch(angle));
  }

  function add(id, name, primary, supporting, angle, pose, phases, cues, duration = 3.6) {
    if (onlyExercises && !onlyExercises.includes(id)) return;
    const times = Array.from({ length: Math.round(duration * 50) + 1 }, (_, frame) => frame / 50);
    const rotations = joints.map(() => []);
    const positions = [];
    for (const time of times) {
      pose(time);
      positions.push(...pelvis.position.toArray());
      joints.forEach((joint, i) => bone(joint).quaternion.toArray(rotations[i], rotations[i].length));
    }
    const tracks = joints.map((joint, i) =>
      new THREE.QuaternionKeyframeTrack(joint + '.quaternion', times, rotations[i]));
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions), ...grip);
    entries['local:exercise:' + id] = {
      name, primary, supporting, equipment: 'incline-bench-dumbbells', framing: 'bench',
      benchTransform: { position: [0, 0, 0], angle }, phases, cues,
      clip: new THREE.AnimationClip(name, duration, tracks),
    };
  }

  const low = Math.PI / 6;
  const steep = Math.PI / 4;
  const lift = [[0, 'Setup'], [.25, 'Lift'], [1.25, 'Hold'], [1.85, 'Lower'], [3.35, 'Reset']];
  const press = [[0, 'Setup'], [.25, 'Lower'], [1.85, 'Pause'], [2.2, 'Press'], [3.35, 'Reset']];
  const fly = [[0, 'Setup'], [.25, 'Open'], [1.65, 'Stretch'], [2, 'Close'], [3.35, 'Reset']];
  function progress(time, phases = lift) {
    const [, [begin], [pause], [resume], [reset]] = phases;
    const smooth = THREE.MathUtils.smoothstep;
    return smooth(time, begin, pause) * (1 - smooth(time, resume, reset));
  }

  function seated(angle) {
    // Fit the pelvis pitch to the seat and the upper torso pitch to the backrest.
    const lowIncline = angle === low;
    const pelvisPosition = lowIncline ? v(0, .56457, -.06901) : v(0, .571, -.067);
    torso(pelvisPosition, Math.PI / 2 - angle + (lowIncline ? .06 : 0), false);
    for (const joint of ['Lumbar', 'Chest']) world(joint, pitch(Math.PI / 2 - angle + .07).multiply(turnAround));
    world('Head', pitch(Math.PI / 2 - angle + (lowIncline ? .15 : .19)).multiply(turnAround));
    for (const [side, sign] of sides) {
      leg(side, v(-sign * .255, .074, -.44), v(-sign * .20, .85, -1), 0, v(0, 0, -1));
      world('Foot' + side, turnAround);
    }
  }

  function supportedProne() {
    // Keep the chest near the high end of the pad with the feet straddling the seat.
    torso(v(0, .778, .104), Math.PI / 2 - steep, true);
    world('Head', pitch(.52));
    for (const [side, sign] of sides) {
      leg(side, v(sign * .30, .074, -.06), v(sign * .7, -.1, -.8), 0, v(0, 0, 1));
    }
  }

  for (const [id, name, neutral] of [
    ['Incline_Dumbbell_Press', 'Incline Dumbbell Press', false],
    ['Incline_Dumbbell_Bench_With_Palms_Facing_In', 'Incline Dumbbell Bench With Palms Facing In', true],
  ]) {
    add(id, name, ['Chest'], ['Shoulders', 'Triceps'], low, (time) => {
      seated(low);
      const amount = progress(time, press);
      for (const [side, sign] of sides) {
        const shoulder = point('Arm' + side);
        const wrist = shoulder.add(v(-sign * lerp(.055, neutral ? .18 : .245, amount),
          lerp(.521, .275, amount), lerp(-.025, -.095, amount)));
        arm(side, wrist, v(-sign, -.35, -.42), neutral ? v(sign, 0, 0) : v(0, 0, -1));
      }
    }, press, [[0, 'Set your base', 'Plant both feet and keep your hips and upper back supported.'],
      [.25, 'Lower beside your chest', neutral ? 'Keep your palms facing each other.' : 'Keep your palms facing forward.'],
      [2.2, 'Press up', 'Extend both elbows as the weights rise over your shoulders.']]);
  }

  add('Incline_Dumbbell_Flyes_-_With_A_Twist', 'Incline Dumbbell Flyes - With A Twist', ['Chest'], ['Shoulders'],
    low, (time) => {
      seated(low);
      const amount = progress(time, fly);
      const sweep = lerp(-.16, 1.50, amount);
      for (const [side, sign] of sides) {
        const shoulder = point('Arm' + side);
        const wrist = shoulder.add(v(-sign * Math.sin(sweep), Math.cos(sweep), lerp(-.22, -.10, amount))
          .normalize().multiplyScalar(.505));
        const palm = v(0, 0, 1).lerp(v(0, 1, 0), amount);
        arm(side, wrist, v(sign * .15, -.23, -.85), palm);
      }
    }, fly, [[0, 'Start above your chest', 'Keep a soft elbow bend and turn your palms toward you.'],
      [.25, 'Open and rotate', 'Open at the shoulders and turn the palms toward the ceiling at the bottom.'],
      [2, 'Bring the weights together', 'Reverse the arc and wrist rotation.']]);

  for (const [id, name, style] of [
    ['Incline_Dumbbell_Curl', 'Incline Dumbbell Curl', 'supinated'],
    ['Incline_Hammer_Curls', 'Incline Hammer Curls', 'neutral'],
    ['Alternate_Incline_Dumbbell_Curl', 'Alternate Incline Dumbbell Curl', 'alternating'],
    ['Dumbbell_Prone_Incline_Curl', 'Dumbbell Prone Incline Curl', 'prone'],
  ]) {
    const prone = style === 'prone';
    const alternating = style === 'alternating';
    const angle = steep;
    add(id, name, ['Biceps'], ['Forearms'], angle, (time) => {
      if (prone) supportedProne();
      else seated(angle);
      for (const [side, sign] of sides) {
        const amount = progress(time - (alternating && side === 'L' ? 3.6 : 0));
        const outward = prone ? sign : -sign;
        const upper = v(outward * (style === 'neutral' ? .50 : prone ? .32 : .41), -1, 0).normalize();
        const bend = lerp(.07, style === 'neutral' ? 1.98 : 2.15, amount);
        const lower = upper.clone().multiplyScalar(Math.cos(bend))
          .add(v(0, 0, prone ? 1 : -1).multiplyScalar(Math.sin(bend)));
        const elbow = point('Arm' + side).addScaledVector(upper, bone('Forearm' + side).position.length());
        const wrist = elbow.addScaledVector(lower, bone('Hand' + side).position.length());
        const supinated = v(0, Math.sin(bend), (prone ? 1 : -1) * Math.cos(bend));
        const neutral = v(-outward, 0, 0);
        arm(side, wrist, v(0, 0, prone ? -1 : 1), style === 'neutral' ? neutral
          : alternating ? neutral.lerp(supinated, amount) : supinated);
      }
    }, alternating ? [...lift, [3.85, 'Left lift'], [4.85, 'Hold'], [5.45, 'Lower'], [6.95, 'Reset']] : lift, [
      [0, prone ? 'Lie face down' : 'Set your back against the pad',
        prone ? 'Keep your shoulders near the top of the bench and straddle it with both feet planted.'
          : style === 'neutral' ? 'Let the weights hang with your palms facing in.' : 'Let the weights hang at your sides.'],
      [.25, 'Curl without swinging', alternating ? 'Curl the right weight and turn the palm up as you lift.'
        : 'Keep your upper arms still as your elbows bend.'],
      [1.85, 'Lower fully', 'Return to the hanging position with control.'],
      ...(alternating ? [[3.85, 'Curl the left weight', 'Turn the palm up as you lift.']] : []),
    ], alternating ? 7.2 : 3.6);
  }

  add('Front_Incline_Dumbbell_Raise', 'Front Incline Dumbbell Raise', ['Shoulders'], [],
    steep, (time) => {
      seated(steep);
      const sweep = lerp(-.26, .48, progress(time));
      for (const [side, sign] of sides) {
        const shoulder = point('Arm' + side);
        const wrist = shoulder.add(v(-sign * .26, Math.sin(sweep), -Math.cos(sweep)).normalize().multiplyScalar(.525));
        arm(side, wrist, v(-sign * .1, -.8, -.1), v(0, -1, 0));
      }
    }, lift, [[0, 'Start above your thighs', 'Plant both feet, rest your head on the pad and face your palms down.'],
      [.25, 'Raise both arms', 'Keep your elbows nearly straight and stop just above shoulder height.'],
      [1.85, 'Lower with control', 'Return the weights toward your thighs.']]);

  add('Dumbbell_Incline_Row', 'Dumbbell Incline Row', ['Upper back'], ['Biceps', 'Shoulders'], steep, (time) => {
    supportedProne();
    const amount = progress(time);
    for (const [side, sign] of sides) {
      const shoulder = point('Arm' + side);
      const wrist = shoulder.add(v(sign * lerp(.09, .07, amount), lerp(-.525, -.25, amount),
        lerp(.025, -.22, amount)));
      arm(side, wrist, v(sign * .12, .17, -1), v(-sign, 0, 0));
    }
  }, lift, [[0, 'Rest your chest on the incline', 'Start with arms hanging and palms facing in.'],
    [.25, 'Row toward your ribs', 'Draw your elbows back alongside your torso.'],
    [1.85, 'Lower with control', 'Let the arms extend while keeping your chest supported.']]);

  return entries;
}
