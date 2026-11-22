import * as THREE from 'three';
import { handAlong, handDorsal } from './hand-frame.mjs';

export const groupLabel = 'Dumbbell strength';

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const pitchAxis = v(1, 0, 0);
const up = v(0, 1, 0);
const forward = v(0, 0, 1);
const rotation = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const pitch = (angle) => rotation(pitchAxis, angle);
const { lerp, smoothstep } = THREE.MathUtils;
const sides = [['L', 1], ['R', -1]];
const shoulders = ['Shoulders'];
const triceps = ['Triceps'];
const inward = (sign) => v(-sign, 0, 0);
const hanging = (sign) => [v(sign * .29, -1, .05), v(sign * .19, -1, .16), inward(sign)];
const pulse = (time, start, top, hold, end) =>
  smoothstep(time, start, top) * (1 - smoothstep(time, hold, end));

function orient(from, to, normal, target) {
  const axis = to.clone().normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), axis);
  const actual = normal.clone().applyQuaternion(turn);
  const twist = Math.atan2(axis.dot(actual.clone().cross(target)), actual.dot(target));
  return turn.premultiply(rotation(axis, twist));
}

export function createEntries({ scene, onlyExercises }, { createDumbbellGripTracks, dumbbellGripTransform }) {
  const bone = (name) => scene.getObjectByName(name);
  const grip = createDumbbellGripTracks(scene);
  const entries = {};
  const joints = ['Pelvis', 'Head', ...sides.flatMap(([side]) =>
    ['Arm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot'].map((joint) => joint + side))];
  const palmRest = handDorsal().negate();
  const lengths = sides.map(([side]) => [bone('Forearm' + side).position.length(), bone('Hand' + side).position.length()]);
  const shaftAxes = sides.map(([, sign]) => v(1).applyQuaternion(dumbbellGripTransform(sign).quaternion));
  const restAnkle = bone('FootL').getWorldPosition(v());
  const legLengths = [bone('ShinL').position.length(), bone('FootL').position.length()];

  function segments(offset, pole, [upperLength, lowerLength]) {
    const distance = Math.min(offset.length(), upperLength + lowerLength - .001);
    const axis = offset.clone().normalize();
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
    const upper = axis.clone().multiplyScalar(along).addScaledVector(bend, Math.sqrt(upperLength ** 2 - along ** 2));
    return [upper, axis.multiplyScalar(distance).sub(upper)];
  }

  function reach(sign, wrist, pole, palm) {
    return [...segments(wrist, pole, lengths[sign === 1 ? 0 : 1]), palm];
  }

  function heelShift(angle) {
    // Fit the pivot to the part of the rig's forefoot that touches the floor.
    const ball = v(0, -.074, .166);
    return ball.clone().sub(ball.clone().applyAxisAngle(pitchAxis, angle));
  }

  function add(id, name, primary, supporting, pose, cues, {
    equipment = 'dumbbells', duration = 3,
    phases = [[0, 'Setup'], [.2, 'Lift'], [1.25, 'Pause'], [1.65, 'Lower'], [2.8, 'Reset']],
  } = {}) {
    if (onlyExercises && !onlyExercises.includes(id)) return;
    const times = Array.from({ length: Math.round(duration * 50) + 1 }, (_, frame) => frame / 50);
    const values = Object.fromEntries(joints.map((joint) => [joint, []]));
    const positions = [];
    for (const time of times) {
      const a = pulse(time, .2, 1.25, 1.65, 2.8);
      const { arms, hip = 0, head = 0, y = .889, z = .015, stance = .15, toes = 0, heel = 0, lift = 0 } = pose(a, time);
      const hipTurn = pitch(hip);
      const shift = heelShift(heel);
      shift.y += lift;
      const pelvis = v(0, y + shift.y, z + shift.z);
      positions.push(...pelvis.toArray());
      values.Pelvis.push(...hipTurn.toArray());
      values.Head.push(...pitch(head - hip).toArray());
      for (const [index, [side, sign]] of sides.entries()) {
        const [upper, lower, palm, shaft] = arms(sign).map((direction) =>
          direction.applyAxisAngle(pitchAxis, -hip));
        const elbow = bone('Forearm' + side).position;
        const wrist = bone('Hand' + side).position;
        const upperTurn = orient(elbow, upper, forward, lower);
        const handTurn = shaft
          ? orient(handAlong(sign), lower, shaftAxes[index], shaft)
          : orient(handAlong(sign), lower, palmRest, palm);
        const lowerTurn = orient(wrist, lower, palmRest, palmRest.clone().applyQuaternion(handTurn));
        values['Arm' + side].push(...upperTurn.toArray());
        values['Forearm' + side].push(...upperTurn.invert().multiply(lowerTurn).toArray());
        values['Hand' + side].push(...lowerTurn.invert().multiply(handTurn).toArray());

        const yaw = rotation(up, sign * toes);
        const knee = forward.clone().applyQuaternion(yaw);
        const across = pitchAxis.clone().applyQuaternion(yaw);
        const hipPoint = bone('Thigh' + side).position.clone().applyQuaternion(hipTurn).add(pelvis);
        const ankle = v(sign * stance, restAnkle.y, restAnkle.z).add(shift.clone().applyQuaternion(yaw));
        const [upperLeg, lowerLeg] = segments(ankle.sub(hipPoint), knee, legLengths);
        const thighTurn = orient(bone('Shin' + side).position, upperLeg, pitchAxis, across);
        const shinTurn = orient(bone('Foot' + side).position, lowerLeg, pitchAxis, across);
        const footTurn = yaw.clone().multiply(pitch(heel));
        values['Thigh' + side].push(...hipTurn.clone().invert().multiply(thighTurn).toArray());
        values['Shin' + side].push(...thighTurn.invert().multiply(shinTurn).toArray());
        values['Foot' + side].push(...shinTurn.invert().multiply(footTurn).toArray());
      }
    }
    const tracks = joints.map((joint) => new THREE.QuaternionKeyframeTrack(joint + '.quaternion', times, values[joint]));
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions),
      ...grip.filter((track) => equipment === 'dumbbells' || track.name.endsWith('L.quaternion')));
    entries['local:exercise:' + id] = {
      name, primary, supporting, equipment, phases, cues, clip: new THREE.AnimationClip(name, duration, tracks),
    };
  }

  function lateral(sign, a, limit) {
    const axis = v(0, .10, sign).normalize();
    const [upper, lower, palm] = hanging(sign);
    return [
      upper.applyAxisAngle(axis, limit * a),
      lower.applyAxisAngle(axis, limit * a),
      palm.applyAxisAngle(v(sign, -.25, .16).normalize(), -sign * .13 * a)
        .applyAxisAngle(axis, limit * a),
    ];
  }

  add('Power_Partials', 'Power Partials', shoulders, [], (a) => ({
    arms: (sign) => lateral(sign, a, 1.14), stance: .16,
  }), [[0, 'Start with the weights by your sides', 'Stand tall with your feet about shoulder-width apart.'],
    [.2, 'Lift out to the sides', 'Keep your arms nearly straight and stop around shoulder height.']]);

  add('One-Arm_Side_Laterals', 'One-Arm Side Laterals', shoulders, [], (a) => ({
    arms: (sign) => sign === 1 ? lateral(sign, a, 1.27) : hanging(sign),
  }), [[0, 'Stand with both feet planted', 'Hold one dumbbell at your side and let your free arm hang.'],
    [.2, 'Lift the working arm sideways', 'Keep a soft elbow and lower slowly from shoulder height.']], {
    equipment: 'dumbbell-left',
  });

  add('Standing_Concentration_Curl', 'Standing Concentration Curl', ['Biceps'], ['Forearms'], (a) => ({
    hip: .90, head: .46, y: .83, z: -.20, stance: .18,
    arms: (sign) => {
      if (sign === -1) return [v(-.22, -.86, -.36), v(.10, -.53, -.77), v(.27, -1, .20)];
      const upper = v(.08, -1, .06);
      const axis = v(-.94, -.03, -.34).normalize();
      const bend = lerp(.11, 2.22, a);
      return [upper, upper.clone().applyAxisAngle(axis, bend), forward.clone().applyAxisAngle(axis, bend)];
    },
  }), [[0, 'Hinge and let the working arm hang', 'Keep your upper arm still, your elbow turned out and your palm forward.'],
    [.2, 'Curl toward your shoulder', 'Pause at the top and lower without swinging.']], {
    equipment: 'dumbbell-left',
  });

  add('Tricep_Dumbbell_Kickback', 'Tricep Dumbbell Kickback', triceps, [], (a) => ({
    hip: 1.28, head: .88, y: .81, z: -.24,
    arms: (sign) => {
      const bend = lerp(.04, Math.PI / 2 - .08, a);
      return [v(sign * .35, -.04, -1), v(sign * .22, -Math.cos(bend), -Math.sin(bend)), inward(sign)];
    },
  }), [[0, 'Hinge and tuck your elbows near your ribs', 'Let your forearms hang with your palms facing in.'],
    [.2, 'Straighten both elbows', 'Pause with the weights behind you, then lower without dropping your elbows.']]);

  add('Standing_Palm-In_One-Arm_Dumbbell_Press', 'Standing Palm-In One-Arm Dumbbell Press',
    shoulders, triceps, (a) => ({
      stance: .17,
      arms: (sign) => sign === 1
        ? reach(sign, v(lerp(.075, .272, a), lerp(.497, .212, a), lerp(.10, .16, a)),
          v(1, -.55, -.14), inward(sign))
        : [v(-.36, -1, .10), v(-.15, -1, .16), inward(sign)],
    }), [[0, 'Start overhead with your palm facing in', 'Plant both feet and brace your torso.'],
    [.2, 'Lower to shoulder height', 'Keep your forearm upright, then press without rotating your wrist.']], {
      equipment: 'dumbbell-left',
      phases: [[0, 'Setup'], [.2, 'Lower'], [1.25, 'Pause'], [1.65, 'Press'], [2.8, 'Reset']],
    });

  add('Arnold_Dumbbell_Press', 'Arnold Dumbbell Press', shoulders, triceps, (_, t) => {
    const turn = pulse(t, .2, .94, 2.12, 2.8);
    const lift = pulse(t, .68, 1.4, 1.65, 2.46);
    return {
      stance: .17,
      arms: (sign) => {
        const wrist = v(sign * lerp(.047 + .22 * turn, .068, lift),
          lerp(.081 + .145 * turn, .50, lift), lerp(.288 - .13 * turn, .10, lift));
        const pole = v(sign * lerp(.05, 1, turn), -1, -.16);
        const palm = v(-sign * Math.sin(Math.PI * turn), 0, -Math.cos(Math.PI * turn));
        return reach(sign, wrist, pole, palm);
      },
    };
  }, [[0, 'Hold the weights near your upper chest', 'Start with your elbows forward and palms facing you.'],
    [.2, 'Open your elbows as you press', 'Turn your palms forward on the way up and reverse the turn on the way down.']], {
    phases: [[0, 'Setup'], [.2, 'Turn outward'], [.68, 'Press'], [1.4, 'Pause'], [1.65, 'Lower'], [2.12, 'Turn inward'], [2.8, 'Reset']],
  });

  add('Standing_Dumbbell_Calf_Raise', 'Standing Dumbbell Calf Raise', ['Calves'], [], (a) => ({
    heel: .46 * a, arms: hanging,
  }), [[0, 'Plant both feet on the floor', 'Keep the dumbbells hanging at your sides.'],
    [.2, 'Rise onto the balls of your feet', 'Keep your knees soft and lower your heels slowly.']]);

  const lower = [[0, 'Setup'], [.2, 'Lower'], [1.25, 'Pause'], [1.65, 'Stand'], [2.8, 'Reset']];
  add('Plie_Dumbbell_Squat', 'Plie Dumbbell Squat', ['Quadriceps'], ['Core', 'Calves', 'Glutes', 'Hamstrings'], (a) => ({
    hip: .13 * a, head: .04 * a, y: lerp(.85, .46, a), z: lerp(.01, -.16, a),
    stance: .34, toes: .57,
    arms: (sign) => [v(-sign * .10, -1, .65), v(sign * .04, -.96, .49), inward(sign)],
  }), [[0, 'Take a wide stance with your toes turned out', 'Hold the weights in front of your hips.'],
    [.2, 'Lower between your knees', 'Keep your knees tracking over your toes and push through your feet to stand.']], { phases: lower });

  add('Iron_Cross', 'Iron Cross', shoulders, ['Chest', 'Glutes', 'Hamstrings', 'Upper back', 'Quadriceps', 'Upper back'],
    (a) => ({
      hip: .28 * a, head: .05 * a, stance: .22, toes: .17,
      y: lerp(.875, .49, a), z: lerp(.01, -.225, a),
      arms: (sign) => {
        const angle = lerp(1.40, .04, a);
        const radial = v(sign * Math.sin(angle), 0, Math.cos(angle));
        return [radial.clone().add(v(0, -.03, 0)), radial.clone().add(v(0, .10, .08)), inward(sign), up.clone()];
      },
    }), [[0, 'Stand with the weights out to your sides', 'Keep a slight bend in your elbows and hold the handles upright.'],
      [.2, 'Squat and bring your arms forward', 'Keep the weights near shoulder height and open your arms again as you stand.']],
    { phases: lower });

  add('Dumbbell_Clean', 'Dumbbell Clean', ['Hamstrings'],
    ['Calves', 'Forearms', 'Glutes', 'Upper back', 'Quadriceps', 'Shoulders', 'Upper back'], (_, t) => {
      const drive = smoothstep(t, .24, .76);
      const dip = pulse(t, .76, 1.13, 1.24, 1.80);
      const reset = smoothstep(t, 2.15, 3.35);
      const rack = pulse(t, .64, 1.13, 2.15, 2.86);
      const load = 1 - drive + reset;
      const rise = pulse(t, .57, .76, .78, .96);
      return {
        hip: .86 * load + .25 * dip, head: .47 * load + .10 * dip,
        y: .883 - .553 * load - .205 * dip, z: .007 - .25 * load - .115 * dip, stance: .16, toes: .10,
        heel: .29 * rise, lift: .038 * pulse(t, .74, .82, .83, .96),
        arms: (sign) => {
          const upper = v(sign * lerp(.50, .27, rack), -1, lerp(.24, .45, rack));
          const axis = v(-1, 0, 0);
          const lower = v(sign * lerp(.42, .14, rack), -1, .32).applyAxisAngle(axis, 2.48 * rack);
          return [upper, lower, inward(sign)];
        },
      };
    }, [[0, 'Set the weights close to the floor', 'Bend your hips and knees and keep your back braced.'],
      [.24, 'Drive through your feet', 'Extend your hips and knees before bending your elbows.'],
      [.76, 'Catch at your shoulders', 'Bend your knees to absorb the catch, then stand tall.'],
      [2.15, 'Reset under control', 'Lower the weights before returning to the start.']], {
      duration: 3.6, phases: [[0, 'Setup'], [.24, 'Drive'], [.76, 'Extend'], [1.13, 'Catch'],
        [1.24, 'Stand'], [1.8, 'Finish'], [2.15, 'Reset'], [3.35, 'Ready']],
    });

  return entries;
}
