import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const pitch = (angle) => new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), angle);
const forward = v(0, 0, 1);
const sides = [['L', 1], ['R', -1]];
const { lerp, smoothstep } = THREE.MathUtils;

function orient(from, to, facing, target) {
  const axis = to.clone().normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), axis);
  const actual = facing.clone().applyQuaternion(turn);
  const planar = target.clone().addScaledVector(axis, -target.dot(axis));
  const twist = Math.atan2(axis.dot(actual.clone().cross(planar)), actual.dot(planar));
  return turn.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, twist));
}

export function createEntries({ scene, onlyExercises }, { createPowerGripTracks }) {
  const figure = clone(scene);
  figure.updateMatrixWorld(true);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const pelvis = bone('Pelvis');
  const joints = ['Pelvis', 'Lumbar', 'Chest', 'Head', ...sides.flatMap(([side]) =>
    ['Arm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot'].map((name) => name + side))];
  const grip = createPowerGripTracks(figure);
  const entries = {};
  const sole = [];
  const foot = bone('FootL');
  const inverse = foot.matrixWorld.clone().invert();
  figure.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const index = mesh.skeleton.bones.indexOf(foot);
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      if (skinIndex.getX(i) === index && skinWeight.getX(i) > .999) {
        sole.push(v().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
      }
    }
  });
  const toe = sole.reduce((front, p) => p.z > front.z ? p : front);

  function world(name, rotation) {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  }

  function torso(y, z, tilt, head = tilt) {
    pelvis.position.set(0, y, z);
    for (const name of ['Pelvis', 'Lumbar', 'Chest']) world(name, pitch(tilt));
    world('Head', pitch(head));
  }

  function reach(first, second, third, end, pole) {
    const axis = end.clone().sub(point(first));
    const a = bone(second).position.length();
    const b = bone(third).position.length();
    const length = THREE.MathUtils.clamp(axis.length(), Math.abs(a - b) + .0001, a + b - .0001);
    axis.normalize();
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (a * a - b * b + length * length) / (2 * length);
    const upper = axis.clone().multiplyScalar(along).addScaledVector(bend, Math.sqrt(a * a - along * along));
    return [upper, axis.multiplyScalar(length).sub(upper)];
  }

  function armSegments(side, sign, upper, lower, facing, palm) {
    const along = v(sign * .025, -.137, .065).normalize();
    const palmRest = along.clone().cross(v(1, 0, 0)).normalize();
    world('Arm' + side, orient(bone('Forearm' + side).position, upper, forward, facing));
    world('Forearm' + side, orient(bone('Hand' + side).position, lower, palmRest, palm));
    world('Hand' + side, orient(along, lower, palmRest, palm));
  }

  function arm(side, sign, wrist, pole, palm, faceBend = false) {
    const [upper, lower] = reach('Arm' + side, 'Forearm' + side, 'Hand' + side, wrist, pole);
    armSegments(side, sign, upper, lower, faceBend ? lower : palm, palm);
  }

  function hang(side, sign, spread = .31) {
    armSegments(side, sign, v(sign * spread, -1, .10), v(sign * .19, -1, .16), forward, v(-sign, 0, 0));
  }

  function leg(side, sign, z = 0, lift = 0, roll = 0, supine = false) {
    const footRotation = pitch(roll);
    const soleHeight = Math.min(...sole.map((p) => p.y * Math.cos(roll) - p.z * Math.sin(roll)));
    const ankle = v(sign * .145, lift - soleHeight, z + toe.z - toe.clone().applyQuaternion(footRotation).z);
    const pole = supine ? v(sign * .07, 1, 0) : v(sign * .09, 0, 1);
    const [upper, lower] = reach('Thigh' + side, 'Shin' + side, 'Foot' + side, ankle, pole);
    world('Thigh' + side, orient(bone('Shin' + side).position, upper, forward, pole));
    world('Shin' + side, orient(bone('Foot' + side).position, lower, forward, supine ? v(0, 0, 1) : pole));
    world('Foot' + side, footRotation);
  }

  function add(id, name, primary, supporting, pose, phases, cues, framing = 'standing', equipment = 'dumbbells', duration = 3.6) {
    if (onlyExercises && !onlyExercises.includes(id)) return;
    const times = Array.from({ length: Math.round(duration * 60) + 1 }, (_, i) => i / 60);
    const rotations = joints.map(() => []);
    const positions = [];
    for (const time of times) {
      pose(smoothstep(time, .25, 1.4) * (1 - smoothstep(time, 1.9, 3.35)), time);
      positions.push(...pelvis.position.toArray());
      joints.forEach((name, i) => bone(name).quaternion.toArray(rotations[i], rotations[i].length));
    }
    const tracks = joints.map((name, i) => new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, rotations[i]));
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions));
    tracks.push(...grip.filter((track) => equipment === 'dumbbells' || track.name.endsWith('L.quaternion')));
    entries['local:exercise:' + id] = {
      name, primary, supporting, phases, cues, equipment, framing,
      clip: new THREE.AnimationClip(name, duration, tracks),
    };
  }

  const lift = [[0, 'Setup'], [.25, 'Lift'], [1.4, 'Pause'], [1.9, 'Lower'], [3.35, 'Reset']];
  const lower = [[0, 'Setup'], [.25, 'Lower'], [1.4, 'Pause'], [1.9, 'Press'], [3.35, 'Reset']];

  for (const [id, name, reverse] of [
    ['Dumbbell_Lunges', 'Dumbbell Lunges', false],
    ['Dumbbell_Rear_Lunge', 'Dumbbell Rear Lunge', true],
  ]) {
    const step = reverse ? 'Step back' : 'Step forward';
    add(id, name, ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings'], (_, time) => {
      const moving = time < 3.6 ? 1 : -1;
      const t = time % 3.6;
      const travel = smoothstep(t, .15, .75) * (1 - smoothstep(t, 2.65, 3.25));
      const depth = smoothstep(t, .75, 1.5) * (1 - smoothstep(t, 1.85, 2.65));
      const swing = (start, end) => {
        const p = smoothstep(t, start, end);
        return 4 * p * (1 - p);
      };
      const rise = .085 * Math.max(swing(.15, .75), swing(2.65, 3.25));
      torso(.885 - .12 * travel - .202 * depth, (reverse ? -.29 : .32) * travel - .095 * depth, .07 * travel);
      pelvis.position.x = -moving * .085 * Math.max(rise / .085, reverse ? travel : 0)
        + moving * (reverse ? 0 : .075 * depth);
      for (const [side, sign] of sides) {
        const steps = sign === moving;
        const rear = steps === reverse;
        leg(side, sign, steps ? (reverse ? -.61 : .61) * travel : 0, steps ? rise : 0,
          rear ? travel * (.42 + .31 * depth) : 0);
        hang(side, sign, .45);
      }
    }, [[0, 'Setup'], [.15, step], [.75, 'Lower'], [1.5, 'Bottom'], [1.85, 'Stand'],
      [2.65, 'Return'], [3.75, step + ' on the other side'], [4.35, 'Lower'],
      [5.1, 'Bottom'], [5.45, 'Stand'], [6.25, 'Return'], [6.85, 'Reset']],
    [[0, 'Hold the weights at your sides', 'Keep your torso tall.'],
      [.15, step, 'Set your front foot flat before lowering your rear knee.'],
      [1.85, 'Push through your front foot', 'Stand and bring your feet back together.']],
    'standing', 'dumbbells', 7.2);
  }

  for (const [id, name, neutral] of [
    ['Bent_Over_Two-Dumbbell_Row', 'Bent Over Two-Dumbbell Row', false],
    ['Bent_Over_Two-Dumbbell_Row_With_Palms_In', 'Bent Over Two-Dumbbell Row With Palms In', true],
  ]) {
    add(id, name, ['Upper back'], neutral ? ['Biceps', 'Upper back'] : ['Biceps', 'Upper back', 'Shoulders'], (a) => {
      torso(.815, -.24, 1.27, 1.02);
      for (const [side, sign] of sides) {
        leg(side, sign);
        const shoulder = point('Arm' + side);
        const wrist = shoulder.add(v(sign * lerp(.105, neutral ? .13 : .185, a),
          lerp(-.505, -.116, a), lerp(.016, -.205, a)));
        arm(side, sign, wrist, v(sign * (neutral ? .25 : .65), .13, -1),
          neutral ? v(-sign, 0, 0) : v(0, 0, -1));
      }
    }, lift, [[0, 'Set your hinge', neutral ? 'Hold your back still and face your palms toward each other.'
      : 'Hold your back still with your palms facing your thighs.'],
    [.25, 'Row toward your ribs', 'Drive your elbows back, then lower under control.']]);
  }

  add('Dumbbell_Floor_Press', 'Dumbbell Floor Press', ['Triceps'], ['Chest', 'Shoulders'], (a) => {
    torso(.124, .322, -Math.PI / 2, -Math.PI / 2 - .31);
    for (const [side, sign] of sides) {
      leg(side, sign, .68, 0, 0, true);
      const wrist = v(sign * lerp(.224, .42, a), lerp(.646, .287, a), lerp(-.175, .007, a));
      arm(side, sign, wrist, v(sign * .88, -.65, .86), v(0, 0, 1));
    }
  }, lower, [[0, 'Lie on the floor', 'Plant your feet and hold the weights above your chest.'],
    [.25, 'Lower your upper arms to the floor', 'Pause without bouncing and keep wrists above elbows.'],
    [1.9, 'Press back up', 'Bring the weights together as you straighten your arms.']], 'floor');

  for (const [id, name, single] of [
    ['Standing_Dumbbell_Upright_Row', 'Standing Dumbbell Upright Row', false],
    ['Dumbbell_One-Arm_Upright_Row', 'Dumbbell One-Arm Upright Row', true],
  ]) {
    add(id, name, single ? ['Shoulders'] : ['Upper back'],
      single ? ['Biceps', 'Upper back'] : ['Biceps', 'Shoulders'], (a) => {
        torso(.886, 0, 0);
        for (const [side, sign] of sides) {
          leg(side, sign);
          if (single && sign === -1) {
            hang(side, sign);
          } else {
            arm(side, sign, v(sign * lerp(single ? .17 : .24, single ? .14 : .25, a),
              lerp(.885, 1.305, a), lerp(.23, .277, a)), v(sign, .55, -.34), v(0, 0, -1), true);
          }
        }
      }, lift, [[0, 'Stand tall', 'Start with an overhand grip and the weights in front of your thighs.'],
        [.25, 'Lead with your elbows', single ? 'Keep the weight close and switch arms after the set.'
          : 'Keep the weights close and stop with your elbows higher than your wrists.']],
      'standing', single ? 'dumbbell-left' : 'dumbbells');
  }

  add('Standing_Palms-In_Dumbbell_Press', 'Standing Palms-In Dumbbell Press', ['Shoulders'], ['Triceps'], (a) => {
    torso(.886, 0, 0);
    for (const [side, sign] of sides) {
      leg(side, sign);
      const wrist = point('Arm' + side).add(v(sign * lerp(.285, .062, a), lerp(.235, .507, a), .11));
      arm(side, sign, wrist, v(sign, -.55, -.12), v(-sign, 0, 0));
    }
  }, lift, [[0, 'Face your palms inward', 'Start with elbows bent and forearms upright.'],
    [.25, 'Press overhead', 'Keep your palms facing each other as you lift and lower.']]);

  add('Cuban_Press', 'Cuban Press', ['Shoulders'], ['Upper back'], (_, t) => {
    torso(.886, 0, 0);
    const rotate = smoothstep(t, .25, 1.15) * (1 - smoothstep(t, 2.65, 3.55));
    const press = smoothstep(t, 1.15, 1.75) * (1 - smoothstep(t, 2, 2.65));
    for (const [side, sign] of sides) {
      leg(side, sign);
      const sweep = Math.PI * rotate;
      const upper = v(sign * lerp(1, .12, press), press, .17);
      const lower = v(-sign * .10 * press, -Math.cos(sweep), Math.sin(sweep) + .10 * press);
      const palm = v(0, -Math.sin(sweep), -Math.cos(sweep));
      armSegments(side, sign, upper, lower, lower, palm);
    }
  }, [[0, 'Setup'], [.25, 'Rotate up'], [1.15, 'Press'], [1.75, 'Pause'], [2, 'Lower'],
    [2.65, 'Rotate down'], [3.55, 'Reset']], [
    [0, 'Raise your elbows to shoulder height', 'Keep your forearms hanging with an overhand grip.'],
    [.25, 'Rotate at the shoulders', 'Keep your upper arms still until your wrists are above your elbows.'],
    [1.15, 'Press overhead', 'Lower to the goalpost position before rotating back down.'],
  ]);

  add('See-Saw_Press_Alternating_Side_Press', 'See-Saw Press (Alternating Side Press)',
    ['Shoulders'], ['Core', 'Triceps'], (_, time) => {
      const active = time < 3.6 ? 1 : -1;
      const t = time % 3.6;
      const effort = smoothstep(t, .25, 1.4) * (1 - smoothstep(t, 1.9, 3.35));
      const lean = new THREE.Quaternion().setFromAxisAngle(forward, active * .24 * effort);
      pelvis.position.set(active * .036 * effort, .886, 0);
      world('Pelvis', new THREE.Quaternion());
      for (const name of ['Lumbar', 'Chest', 'Head']) world(name, lean);
      for (const [side, sign] of sides) {
        leg(side, sign);
        const a = sign === active ? effort : 0;
        const wrist = point('Arm' + side).add(v(sign * lerp(.045, .065, a),
          lerp(.115, .496, a), lerp(.218, .136, a)).applyQuaternion(lean));
        const palm = v(sign * Math.sin(Math.PI * a), 0, -Math.cos(Math.PI * a)).applyQuaternion(lean);
        arm(side, sign, wrist, v(sign * .25, -1, .16).applyQuaternion(lean), palm, true);
      }
    }, [[0, 'Setup'], [.25, 'Press left'], [1.4, 'Pause'], [1.9, 'Lower'], [3.35, 'Center'],
      [3.85, 'Press right'], [5, 'Pause'], [5.5, 'Lower'], [6.95, 'Reset']], [
      [0, 'Rack both weights', 'Start with your palms facing your shoulders.'],
      [.25, 'Press and lean the other way', 'Turn the pressing palm forward as you reach overhead.'],
      [3.85, 'Switch arms', 'Bring the first weight back to your shoulder before the next press.'],
    ], 'standing', 'dumbbells', 7.2);

  return entries;
}
