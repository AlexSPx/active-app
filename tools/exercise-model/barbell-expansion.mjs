import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createEntries as createStandingBodyweight } from './bodyweight-standing.mjs';
import { forearmRoll, openHand } from './hand-frame.mjs';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const xAxis = v(1, 0, 0);
const yAxis = v(0, 1, 0);
const turn = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const pitch = (angle) => turn(xAxis, angle);
const yaw = (angle) => turn(yAxis, angle);
const relative = (parent, world) => parent.clone().invert().multiply(world);
const swing = (from, to) => new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
const { lerp, smoothstep } = THREE.MathUtils;
const halfPi = Math.PI / 2;
const sides = [['L', 1], ['R', -1]];
const plateRadius = .225;
const joints = ['Pelvis', 'Lumbar', 'Chest', 'Head',
  ...sides.flatMap(([side]) => ['Thigh', 'Shin', 'Foot', 'Arm', 'Forearm', 'Hand'].map((name) => name + side))];

function bend(target, pole, upper, lower) {
  const distance = target.length();
  if (distance > upper + lower + 1e-6 || distance < Math.abs(upper - lower)) {
    throw new RangeError('unreachable endpoint at distance ' + distance.toFixed(4));
  }
  const axis = target.clone().normalize();
  const along = (upper ** 2 - lower ** 2 + distance ** 2) / (2 * distance);
  const offset = pole.clone().addScaledVector(axis, -axis.dot(pole)).normalize();
  return axis.multiplyScalar(along).addScaledVector(offset, Math.sqrt(Math.max(0, upper ** 2 - along ** 2)));
}

const down = [[0, 'Setup'], [.25, 'Lower'], [1.75, 'Bottom'], [2.05, 'Rise'], [3.30, 'Reset']];
const press = [[0, 'Lockout'], [.25, 'Lower'], [1.95, 'Pause'], [2.25, 'Press'], [3.20, 'Lockout']];
const pull = [[0, 'Setup'], [.25, 'Lift'], [1.33, 'Pause'], [1.85, 'Lower'], [3.35, 'Reset']];
const quads = ['Quadriceps'];
const back = ['Upper back'];
const posterior = ['Glutes', 'Hamstrings'];
const lowerBody = ['Calves', ...posterior];
const pressSupport = ['Shoulders', 'Triceps'];

export function createEntries({ scene, onlyExercises }, { createDumbbellGripTracks, dumbbellGripTransform }) {
  const figure = clone(scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const rotation = (name) => bone(name).getWorldQuaternion(new THREE.Quaternion());
  const pelvis = bone('Pelvis');
  const grips = createDumbbellGripTracks(figure);
  const seats = sides.map(([, sign]) => dumbbellGripTransform(sign));
  const entries = {};
  const armLength = bone('ForearmL').position.length() + bone('HandL').position.length();
  const ankleHeight = point('FootL').y;
  const shoulders = sides.map(([side]) => bone('Arm' + side).position.clone());
  figure.updateMatrixWorld(true);
  const soles = sides.map(([side]) => {
    const foot = bone('Foot' + side);
    const inverse = foot.matrixWorld.clone().invert();
    const points = [];
    figure.traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return;
      const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
      const index = mesh.skeleton.bones.indexOf(foot);
      for (let i = 0; i < position.count; i++) {
        if (skinIndex.getX(i) === index && skinWeight.getX(i) > .999) {
          points.push(v().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
        }
      }
    });
    return points;
  });

  function world(name, target) {
    const joint = bone(name);
    joint.quaternion.copy(relative(joint.parent.getWorldQuaternion(new THREE.Quaternion()), target));
  }

  function torso(position, lean = 0, head = lean * .65) {
    pelvis.position.copy(position);
    pelvis.quaternion.copy(pitch(lean));
    bone('Lumbar').quaternion.identity();
    bone('Chest').quaternion.identity();
    world('Head', pitch(head));
  }

  function stance(width = .15, z = -.004, toe = .16, heel = 0) {
    for (const [i, [side, sign]] of sides.entries()) {
      const foot = yaw(sign * toe).multiply(pitch(heel));
      // Keep the front of the foot in place as the heel rises.
      const tip = v(0, -ankleHeight, .178);
      const shift = tip.clone().applyQuaternion(yaw(sign * toe)).sub(tip.applyQuaternion(foot));
      const height = heel ? -Math.min(...soles[i].map((point) => point.y * Math.cos(heel) - point.z * Math.sin(heel)))
        : ankleHeight;
      leg(side, v(sign * width + shift.x, height, z + shift.z), v(sign * .13, 0, 1), foot);
    }
  }

  function leg(side, ankle, pole, foot) {
    const shin = bone('Shin' + side);
    const end = bone('Foot' + side);
    const target = ankle.clone().sub(point('Thigh' + side));
    const upper = bend(target, pole, shin.position.length(), end.position.length());
    world('Thigh' + side, swing(shin.position, upper));
    world('Shin' + side, swing(end.position, target.sub(upper)));
    world('Foot' + side, foot);
  }

  function arm(side, wrist, pole, hand, { elbow, frame } = {}) {
    const shoulder = point('Arm' + side);
    const upperBone = bone('Forearm' + side);
    const lowerBone = bone('Hand' + side);
    const target = wrist.clone().sub(shoulder);
    const upper = elbow ? elbow.clone().sub(shoulder)
      : bend(target, pole, upperBone.position.length(), lowerBone.position.length());
    const lower = target.sub(upper);
    const lowerRotation = forearmRoll(side, swing(lowerBone.position, lower), lower, hand);
    const upperRotation = frame
      ? frame.clone().multiply(swing(upperBone.position, upper.clone().applyQuaternion(frame.clone().invert())))
      : swing(upperBone.position, upper);
    world('Arm' + side, upperRotation);
    world('Forearm' + side, lowerRotation);
    world('Hand' + side, hand);
  }

  // The calibrated seat stays on the shaft as the hands rotate around it.
  function grip(index, direction, underhand = false, frame = yaw(0)) {
    const { position, quaternion } = seats[index];
    const align = swing(xAxis.clone().applyQuaternion(quaternion), v(underhand ? 1 : -1, 0, 0));
    const sign = sides[index][1];
    const along = v(sign * .025, -.137, .065).applyQuaternion(align);
    const roll = Math.atan2(along.y * direction.z - along.z * direction.y,
      along.y * direction.y + along.z * direction.z);
    const hand = frame.clone().multiply(pitch(roll)).multiply(align);
    return { hand, offset: position.clone().applyQuaternion(hand) };
  }

  function hold(center, width, direction, pole, { underhand = false, frame = yaw(0) } = {}) {
    for (const [i, [side, sign]] of sides.entries()) {
      const { hand, offset } = grip(i, direction, underhand, frame);
      const wrist = v(sign * width, 0, 0).applyQuaternion(frame).add(center).sub(offset);
      arm(side, wrist, pole(sign), hand);
    }
  }

  function hangHeight(z, width, direction, underhand = false) {
    const shoulder = point('ArmL');
    const { offset } = grip(0, direction, underhand);
    return shoulder.y + offset.y - Math.sqrt(
      (armLength - .002) ** 2 - (width - offset.x - shoulder.x) ** 2 - (z - offset.z - shoulder.z) ** 2);
  }

  function backRack() {
    const frame = rotation('Chest');
    const center = v(0, .231, -.074).applyQuaternion(frame).add(point('Chest'));
    hold(center, .310, v(0, 1, -.36), (sign) => v(sign * .65, -1, -.25).applyQuaternion(frame), { frame });
    return [center, frame];
  }

  function add(id, name, primary, supporting, phases, cues, pose, options = {}) {
    if (onlyExercises && !onlyExercises.includes(id)) return;
    const { duration = 3.6, fingers = grips, shrug = false, ...metadata } = options;
    const times = Array.from({ length: Math.ceil(duration * 60) + 1 }, (_, i) => Math.min(i / 60, duration));
    const positions = [];
    const shoulderPositions = [[], []];
    const rotations = joints.map(() => []);
    const bar = [];
    const barRotations = [];
    function sampleQuaternion(track, quaternion) {
      const previous = track.length ? new THREE.Quaternion().fromArray(track, track.length - 4) : quaternion;
      const sign = previous.dot(quaternion) < 0 ? -1 : 1;
      track.push(...quaternion.toArray().map((value) => value * sign));
    }

    const [, [start], [extreme], [resume], [reset]] = phases;
    for (const time of times) {
      const amount = smoothstep(time, start, extreme) * (1 - smoothstep(time, resume, reset));
      if (shrug) sides.forEach(([side], i) => bone('Arm' + side).position.copy(shoulders[i]));
      try {
        const [center, frame = yaw(0)] = pose(amount, time);
        const tilt = Math.abs(xAxis.clone().applyQuaternion(frame).y);
        const plateBottom = center.y - .745 * tilt - plateRadius * Math.sqrt(1 - tilt ** 2);
        if (!Number.isFinite(plateBottom) || plateBottom < -.001) throw new Error('plate crosses the floor');
        bar.push(...center.toArray());
        sampleQuaternion(barRotations, frame);
      } catch (error) {
        throw new Error(name + ' at ' + time.toFixed(3) + ' s', { cause: error });
      }
      positions.push(...pelvis.position.toArray());
      if (shrug) sides.forEach(([side], i) => shoulderPositions[i].push(...bone('Arm' + side).position.toArray()));
      joints.forEach((name, i) => sampleQuaternion(rotations[i], bone(name).quaternion));
    }
    entries['local:exercise:' + id] = {
      name, primary, supporting, phases, cues, equipment: 'barbell', framing: 'standing', ...metadata,
      clip: new THREE.AnimationClip(name, duration, [
        new THREE.VectorKeyframeTrack('Pelvis.position', times, positions),
        ...joints.map((name, i) => new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, rotations[i])),
        ...(shrug ? sides.map(([side], i) => new THREE.VectorKeyframeTrack(
          'Arm' + side + '.position', times, shoulderPositions[i])) : []),
        ...fingers,
      ]),
      propClip: new THREE.AnimationClip(name + ' barbell', duration, [
        new THREE.VectorKeyframeTrack('.position', times, bar),
        new THREE.QuaternionKeyframeTrack('.quaternion', times, barRotations),
      ]),
    };
  }

  const flatBench = { equipment: 'bench-barbell', framing: 'bench' };
  const inclineBench = { equipment: 'incline-bench-barbell', framing: 'bench',
    benchTransform: { position: [0, 0, 0], angle: Math.PI / 6 } };
  const floor = { framing: 'floor' };
  const seatedFeet = (z) => {
    for (const [side, sign] of sides) {
      leg(side, v(sign * .235, ankleHeight, z), v(sign * .14, .30, 1), yaw(sign * .19));
    }
  };

  function kneel(lean, thighAngle) {
    const thigh = pitch(-thighAngle);
    const knee = v(.15, .058, 0);
    const upperLength = bone('ShinL').position.length();
    const hipToKnee = v(0, -1, 0).applyQuaternion(thigh).setLength(Math.sqrt(upperLength ** 2 - (knee.x - bone('ThighL').position.x) ** 2));
    const hip = knee.clone().sub(hipToKnee).sub(bone('ThighL').position.clone().applyQuaternion(pitch(lean)));
    torso(v(0, hip.y, hip.z), lean, lean * .85);
    for (const [side, sign] of sides) {
      const kneePosition = v(sign * knee.x, knee.y, knee.z);
      const upper = kneePosition.clone().sub(point('Thigh' + side));
      world('Thigh' + side, swing(bone('Shin' + side).position, upper));
      world('Shin' + side, pitch(1.51));
      world('Foot' + side, pitch(2.89));
    }
  }

  add('Barbell_Ab_Rollout_-_On_Knees', 'Barbell Ab Rollout - On Knees', ['Core'], ['Upper back', 'Shoulders'],
    [[0, 'Kneeling setup'], [.25, 'Roll out'], [1.63, 'Full reach'], [2.02, 'Roll back'], [3.38, 'Reset']],
    [[0, 'Brace over the bar', 'Start on both knees with the plates on the floor.'],
      [1.63, 'Reach without sagging', 'Extend your hips and shoulders together. Stop before your torso touches the floor.'],
      [2.02, 'Pull the bar back', 'Keep your ribs down as the plates roll back toward your knees.']], (amount) => {
      kneel(lerp(1.10, 1.43, amount), lerp(.05, -1.20, amount));
      const direction = v(0, lerp(-1, -.24, amount), lerp(.08, 1, amount));
      const width = .25;
      const shoulder = point('ArmL');
      const { offset } = grip(0, direction);
      const z = shoulder.z + offset.z + Math.sqrt((armLength - .009) ** 2 -
        (width - offset.x - shoulder.x) ** 2 - (plateRadius - offset.y - shoulder.y) ** 2);
      const center = v(0, plateRadius, z);
      hold(center, width, direction, (sign) => v(sign * .14, -.6, -1));
      return [center, pitch((z - .55) / plateRadius)];
    }, floor);

  for (const [id, name, style] of [
    ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell Bench Press - Medium Grip', 'flat'],
    ['Barbell_Incline_Bench_Press_-_Medium_Grip', 'Barbell Incline Bench Press - Medium Grip', 'incline'],
    ['Floor_Press', 'Floor Press', 'floor'],
  ]) {
    const incline = style === 'incline';
    const onFloor = style === 'floor';
    add(id, name, onFloor ? ['Triceps'] : ['Chest'], onFloor ? ['Chest', 'Shoulders'] : pressSupport, press,
      [[0, onFloor ? 'Set your shoulders on the floor' : 'Set your base on the pad',
        'Plant both feet and begin with the bar held over your shoulders.'],
      [1.95, onFloor ? 'Pause with elbows down' : 'Lower to your chest', onFloor
        ? 'Keep your elbows tucked and let the backs of your upper arms settle lightly on the floor.'
        : incline ? 'Touch the upper chest with your wrists over your elbows.'
          : 'Touch the middle of your chest with control and keep your wrists over your elbows.'],
      [2.25, 'Press to lockout', 'Extend your elbows and bring the bar back over your shoulders.']], (amount) => {
      if (incline) {
        const facing = yaw(Math.PI);
        torso(v(0, .56457, -.06901));
        pelvis.quaternion.copy(pitch(halfPi - Math.PI / 6 + .06).multiply(facing));
        for (const joint of ['Lumbar', 'Chest', 'Head']) {
          world(joint, pitch(halfPi - Math.PI / 6 + (joint === 'Head' ? .15 : .07)).multiply(facing));
        }
        for (const [side, sign] of sides) {
          leg(side, v(-sign * .255, ankleHeight, -.44), v(-sign * .20, .85, -1), facing);
        }
      } else {
        torso(v(0, onFloor ? .133 : .56, onFloor ? .34 : .38), -halfPi, -halfPi - .245);
        world('Lumbar', pitch(-halfPi - .041));
        seatedFeet(onFloor ? .66 : .725);
      }
      const shoulder = point('ArmL');
      const frame = yaw(incline ? Math.PI : 0);
      const width = onFloor ? .229 : .296;
      const direction = v(0, 1, lerp(.06, incline ? -.62 : .32, amount));
      const { offset } = grip(0, direction, false, frame);
      const topZ = shoulder.z + (incline ? -.012 : .005);
      const topY = shoulder.y + offset.y + Math.sqrt((armLength - .002) ** 2 -
        ((incline ? -width : width) - offset.x - shoulder.x) ** 2 - (topZ - offset.z - shoulder.z) ** 2);
      const low = incline ? v(0, .898, .273) : onFloor ? v(0, .327, .058) : v(0, .730, .066);
      const center = v(0, topY, topZ).lerp(low, amount);
      hold(center, width, direction, (sign) => v(sign * (onFloor ? .37 : .72), -.25, onFloor ? .98 : .78)
        .applyQuaternion(frame), { frame });
      return [center, frame];
    }, incline ? inclineBench : onFloor ? floor : flatBench);
  }

  add('Barbell_Hip_Thrust', 'Barbell Hip Thrust', ['Glutes'], ['Calves', 'Hamstrings'], pull,
    [[0, 'Brace your upper back', 'Set your shoulder blades against the bench and center the bar over your hips.'],
      [1.33, 'Drive through your feet', 'Raise your hips until your shoulders, hips, and knees form a line.'],
      [1.85, 'Lower your hips', 'Keep your feet set and guide the bar down with your pelvis.']], (amount) => {
      const lean = lerp(-.66, -1.47, amount);
      const angle = pitch(lean);
      // Keep the shoulder line supported over the front edge as the torso pivots.
      const shoulder = v(0, lerp(.598, .525, amount), .535);
      const offset = v(0, .493, -.005).applyQuaternion(angle);
      torso(shoulder.sub(offset), lean, -1.07);
      seatedFeet(1.40);
      const center = v(0, lerp(.099, .025, amount), lerp(.149, .132, amount)).applyQuaternion(angle).add(pelvis.position);
      hold(center, .236, v(0, lerp(-1, -.60, amount), lerp(.65, .92, amount)), (sign) => v(sign * .55, 0, -1));
      return [center];
    }, { ...flatBench, benchTransform: { position: [0, 0, -.074] } });

  add('Barbell_Hack_Squat', 'Barbell Hack Squat', quads, ['Calves', 'Forearms', 'Hamstrings'], down,
    [[0, 'Hold the bar behind your thighs', 'Start tall with your feet shoulder width and your arms extended.'],
      [1.75, 'Squat with the bar behind you', 'Bend your knees and hips together while keeping the shaft clear of your calves.'],
      [2.05, 'Stand through your heels', 'Keep the bar behind you as you straighten your legs.']], (amount) => {
      torso(v(0, lerp(.879, .438, amount), lerp(-.01, -.17, amount)), lerp(.08, .43, amount));
      stance(.166);
      const width = .258;
      const z = lerp(-.168, -.293, amount);
      const direction = v(0, -1, lerp(-.22, -.53, amount));
      const center = v(0, Math.max(.225, hangHeight(z, width, direction)), z);
      hold(center, width, direction, (sign) => v(sign * .30, 0, -1));
      return [center];
    });

  add('Barbell_Side_Split_Squat', 'Barbell Side Split Squat', quads, ['Calves', 'Hamstrings', 'Upper back'], down,
    [[0, 'Set a wide stance', 'Place the bar across your upper back and turn the working foot slightly out.'],
      [1.75, 'Sit over the working leg', 'Bend the left hip and knee while keeping the right leg long.'],
      [2.05, 'Push back to center', 'Extend your working leg. Switch sides after the set.']], (amount) => {
      torso(v(.27 * amount, lerp(.803, .591, amount), -.092 * amount), lerp(.09, .32, amount));
      stance(.413, -.004, .30);
      return backRack();
    });

  const walking = createStandingBodyweight({ scene, onlyExercises: ['Bodyweight_Walking_Lunge'] })[
    'local:exercise:Bodyweight_Walking_Lunge'];
  const stride = walking.clip.tracks.filter((track) => !/^(Arm|Forearm|Hand)/.test(track.name))
    .map((track) => [track.name, track.createInterpolant()]);
  add('Barbell_Walking_Lunge', 'Barbell Walking Lunge', quads, lowerBody,
    walking.phases, [[0, 'Set the bar across your upper back', 'Brace before stepping forward.'],
      [1.07, 'Lower the rear knee', 'Keep your torso upright and your front foot planted.'],
      [1.85, 'Step through', 'Drive through the lead foot and step into the next lunge.'],
      [3.86, 'Finish upright', 'Bring both feet under you to finish the second step.']], (_, time) => {
      for (const [name, interpolant] of stride) {
        const [joint, property] = name.split('.');
        bone(joint)[property].fromArray(interpolant.evaluate(time));
      }
      return backRack();
    }, { duration: walking.clip.duration, oneShot: true });

  add('Clean_Pull', 'Clean Pull', quads, ['Forearms', ...posterior, 'Upper back'],
    [[0, 'Floor setup'], [.25, 'First pull'], [1.17, 'Above the knees'], [1.48, 'Second pull'],
      [1.67, 'Triple extension'], [2.07, 'Lower'], [3.35, 'Floor reset']],
    [[0, 'Start over the bar', 'Set the bar close to your shins and grip just outside your legs.'],
      [1.17, 'Push through the floor', 'Clear your knees with your arms long and your back angle steady.'],
      [1.67, 'Extend and shrug', 'Drive through your hips, knees, and ankles, and let your shoulders rise with straight arms.']], (_, time) => {
      const first = smoothstep(time, .25, 1.17);
      const sweep = smoothstep(time, 1.17, 1.48);
      const drive = smoothstep(time, 1.48, 1.67);
      const decel = smoothstep(time, 1.67, 1.99);
      const lower = smoothstep(time, 2.07, 3.35);
      const amount = 1 - lower;
      const lean = (1.02 - .075 * first - .55 * sweep - .45 * drive + .132 * decel) * amount + 1.02 * lower;
      const z = .247 + (-.060 * first - .068 * sweep + .031 * drive) * amount;
      const y = .225 + (.261 * first + .168 * sweep + .224 * drive - .091 * decel) * amount;
      const width = .243;
      const direction = v(0, -1, -.12 + .32 * drive * (1 - decel));
      const back = -.237 + (.031 * first + .073 * sweep + .148 * drive - .036 * decel) * amount;
      torso(v(0, .7, back), lean);
      for (const [side] of sides) bone('Arm' + side).position.y += .037 * drive * (1 - decel) * amount;
      pelvis.position.y += y - hangHeight(z, width, direction);
      stance(.145, -.004, .12, .49 * drive * (1 - decel) * amount);
      const center = v(0, y, z);
      hold(center, width, direction, (sign) => v(sign * .25, 0, -1));
      return [center];
    }, { shrug: true });
  sides.forEach(([side], i) => bone('Arm' + side).position.copy(shoulders[i]));

  add('Drag_Curl', 'Drag Curl', ['Biceps'], ['Forearms'], pull,
    [[0, 'Take a palms-up grip', 'Start with the bar close to the front of your thighs.'],
      [1.33, 'Drive your elbows back', 'Drag the bar close to your torso without shrugging or leaning back.'],
      [1.85, 'Lower along the same path', 'Let your elbows return forward as the bar slides down.']], (amount) => {
      torso(v(0, .881, -.018), .025);
      stance(.144);
      const center = v(0, lerp(.817, 1.245, amount), lerp(.110, .169, amount));
      hold(center, .219, v(0, lerp(-.84, .57, amount), lerp(.54, .88, amount)),
        (sign) => v(sign * .13, -.50, -1), { underhand: true });
      return [center];
    });

  const fingertipGrip = grips.map((track) => {
    const name = track.name.split('.')[0];
    const closed = new THREE.Quaternion().fromArray(track.values);
    const rest = new THREE.Quaternion().fromArray(walking.clip.tracks.find((item) => item.name === track.name).values);
    const curl = name.startsWith('Thumb') ? .15 : name.startsWith('Little') ? .45 : name.startsWith('Ring') ? .42 : /[23][LR]$/.test(name) ? .62 : .26;
    return new THREE.QuaternionKeyframeTrack(track.name, [0], rest.slerp(closed, curl).toArray());
  });
  const cleanPads = sides.map(([side], i) => {
    const hand = bone('Hand' + side);
    for (const track of fingertipGrip.filter((track) => track.name.endsWith(side + '.quaternion'))) {
      bone(track.name.split('.')[0]).quaternion.fromArray(track.values);
    }
    const pad = (digit) => {
      const tip = bone(digit + '3' + side);
      const base = tip.position.clone().setLength(tip.position.length() * .66);
      return hand.worldToLocal(tip.localToWorld(base));
    };
    return pad('Index').lerp(pad('Middle'), .5).lerp(seats[i].position, .08);
  });

  add('Front_Squat_Clean_Grip', 'Front Squat (Clean Grip)', quads, ['Core', ...posterior], down,
    [[0, 'Set a clean front rack', 'Rest the bar on your front deltoids and support it lightly with your fingertips.'],
      [1.75, 'Keep your elbows high', 'Sit between your legs while keeping the bar on your shoulders.'],
      [2.05, 'Drive through both feet', 'Keep your chest up and lead out of the bottom with your elbows.']], (amount) => {
      torso(v(0, lerp(.875, .349, amount), lerp(-.008, -.112, amount)), lerp(.08, .34, amount));
      stance(.181, -.004, .28);
      const frame = rotation('Chest');
      const center = v(0, .190, .145).applyQuaternion(frame).add(point('Chest'));
      for (const [i, [side, sign]] of sides.entries()) {
        const { hand } = grip(i, v(0, -.43, -1), false, frame);
        const contact = v(sign * .205, .006, .023).applyQuaternion(frame).add(center);
        const wrist = contact.sub(cleanPads[i].clone().applyQuaternion(hand));
        arm(side, wrist, v(sign * .10, .30, 1).applyQuaternion(frame), hand, { frame });
      }
      return [center, frame];
    }, { fingers: fingertipGrip });

  add('Kneeling_Squat', 'Kneeling Squat', ['Glutes'], ['Core', 'Hamstrings', 'Upper back'], down,
    [[0, 'Start tall on your knees', 'Brace the bar across your upper back with both shins on the floor.'],
      [1.75, 'Sit back toward your calves', 'Hinge at the hips while keeping your knees and shins down.'],
      [2.05, 'Extend your hips', 'Squeeze your glutes as you return to tall kneeling.']], (amount) => {
      kneel(lerp(.12, .39, amount), lerp(.04, 1.28, amount));
      return backRack();
    }, floor);

  add('One-Arm_Side_Deadlift', 'One-Arm Side Deadlift', quads, ['Core', ...lowerBody, 'Upper back'], pull,
    [[0, 'Grip the center beside you', 'Set the bar parallel to your feet and take a suitcase grip.'],
      [1.33, 'Stand square', 'Extend your hips and knees together and keep the bar level with one straight arm.'],
      [1.85, 'Set it down with control', 'Bend your hips and knees to return the plates to the floor. Switch hands after the set.']], (amount) => {
      const lean = lerp(1.02, .04, amount);
      torso(v(0, .72, lerp(-.210, -.014, amount)), lean);
      const frame = yaw(-halfPi);
      const direction = v(0, -1, .02);
      const { hand, offset } = grip(0, direction, false, frame);
      const shoulder = point('ArmL');
      const x = .322;
      const z = lerp(.160, .036, amount);
      const y = shoulder.y + offset.y - Math.sqrt((armLength - .003) ** 2 -
        (x - offset.x - shoulder.x) ** 2 - (z - offset.z - shoulder.z) ** 2);
      const center = v(x, lerp(plateRadius, .776, amount), z);
      pelvis.position.y += center.y - y;
      stance(.137);
      arm('L', center.clone().sub(offset), v(.30, 0, -1), hand);
      const free = point('ArmR').add(v(-.070, -.484, .071));
      arm('R', free, v(-.4, 0, -1), openHand(-1, v(0, -1, 0), v(-1, 0, 0)));
      return [center, frame];
    }, { fingers: grips.filter((track) => track.name.endsWith('L.quaternion')) });

  function overhead(z, width, direction) {
    const shoulder = point('ArmL');
    const { offset } = grip(0, direction);
    const y = shoulder.y + offset.y + Math.sqrt((armLength - .002) ** 2 -
      (width - offset.x - shoulder.x) ** 2 - (z - offset.z - shoulder.z) ** 2);
    return v(0, y, z);
  }

  add('Overhead_Squat', 'Overhead Squat', quads, ['Core', ...lowerBody, 'Upper back', 'Shoulders', 'Triceps'], down,
    [[0, 'Lock the bar overhead', 'Set a wide grip and keep the shaft above the middle of your feet.'],
      [1.75, 'Sit between your knees', 'Lower to about parallel while keeping the bar overhead and your heels planted.'],
      [2.05, 'Drive up under the bar', 'Keep your elbows extended as you rise.']], (amount) => {
      torso(v(0, lerp(.861, .432, amount), lerp(-.01, -.218, amount)), lerp(.04, .38, amount));
      stance(.25, -.004, .28);
      const direction = v(0, 1, .18);
      const center = overhead(.036, .445, direction);
      hold(center, .445, direction, (sign) => v(sign * .55, .4, -1));
      return [center];
    });

  const rackHeight = .490;
  const rackStartZ = .197;
  add('Rack_Pulls', 'Rack Pulls', back, ['Forearms', ...posterior], pull,
    [[0, 'Start with the shaft on the pins', 'Set the supports just above knee height. Hinge back and take a shoulder-width grip.'],
      [1.33, 'Stand tall', 'Extend your hips and knees together without leaning back.'],
      [1.85, 'Return to the pins', 'Hinge under control until the shaft settles onto the supports.']], (amount) => {
      const lean = lerp(.981, .035, amount);
      const z = lerp(rackStartZ, .155, smoothstep(amount, .27, 1));
      const y = lerp(rackHeight, .800, amount);
      const width = .231;
      const direction = v(0, -1, .15);
      torso(v(0, .81, lerp(-.211, -.016, amount)), lean);
      pelvis.position.y += y - hangHeight(z, width, direction);
      stance(.139);
      const center = v(0, y, z);
      hold(center, width, direction, (sign) => v(sign * .20, 0, -1));
      return [center];
    }, { equipment: 'rack-barbell', rackTransform: { position: [0, 0, rackStartZ + .1], yaw: Math.PI, hookHeight: rackHeight } });

  add('Reverse_Grip_Bent-Over_Rows', 'Reverse Grip Bent-Over Rows', back, ['Biceps', 'Shoulders'], pull,
    [[0, 'Hinge and take a palms-up grip', 'Hold your torso still with the bar hanging from straight arms.'],
      [1.33, 'Pull to your lower ribs', 'Drive your elbows back close to your sides and squeeze your back.'],
      [1.85, 'Lower to the hang', 'Extend your elbows fully while holding your hip hinge.']], (amount) => {
      torso(v(0, .829, -.203), 1.245, .88);
      stance(.128);
      const shoulder = point('ArmL');
      const width = .220;
      const direction = v(0, -1, lerp(.10, .75, amount));
      const startZ = shoulder.z + .032;
      const y = hangHeight(startZ, width, direction, true);
      const center = v(0, lerp(y, shoulder.y - .240, amount), lerp(startZ, shoulder.z - .137, amount));
      hold(center, width, direction, (sign) => v(sign * .02, .40, -1), { underhand: true });
      return [center];
    });

  add('Seated_Barbell_Twist', 'Seated Barbell Twist', ['Core'], [],
    [[0, 'Center'], [.25, 'Turn left'], [1.0, 'Left turn'], [1.38, 'Return through center'],
      [2.44, 'Right turn'], [2.75, 'Return'], [3.4, 'Center']],
    [[0, 'Plant your feet', 'Sit near the end of the bench with the bar on your upper back.'],
      [1, 'Turn from the waist', 'Keep your pelvis, feet, and gaze steady while you rotate.'],
      [2.44, 'Turn the other way', 'Use the same comfortable range on the other side.']], (_, time) => {
      const angle = .59 * (smoothstep(time, .25, 1) * (1 - smoothstep(time, 1.38, 1.83)) -
        smoothstep(time, 1.83, 2.44) * (1 - smoothstep(time, 2.75, 3.40)));
      torso(v(0, .550, .467), .06, 0);
      seatedFeet(.885);
      bone('Lumbar').quaternion.copy(yaw(angle * .52));
      bone('Chest').quaternion.copy(yaw(angle * .48));
      world('Head', yaw(0));
      return backRack();
    }, flatBench);

  add('Seated_Palms-Down_Barbell_Wrist_Curl', 'Seated Palms-Down Barbell Wrist Curl', ['Forearms'], [], pull,
    [[0, 'Rest your forearms on your thighs', 'Set your wrists at the ends of your knees with your palms down.'],
      [1.33, 'Curl at the wrists', 'Raise your knuckles without lifting your forearms.'],
      [1.85, 'Lower your knuckles', 'Keep your elbows and forearms still as the bar comes back down.']], (amount) => {
      torso(v(0, .509, .464), .72, .35);
      seatedFeet(.92);
      const direction = v(0, lerp(-.61, .43, amount), lerp(.78, .90, amount));
      const wrist = v(.211, .547, .984);
      for (const [i, [side, sign]] of sides.entries()) {
        const hand = grip(i, direction).hand;
        arm(side, v(sign * wrist.x, wrist.y, wrist.z), v(sign * .03, -1, -.34), hand);
      }
      const center = wrist.add(grip(0, direction).offset).setX(0);
      return [center, pitch(Math.atan2(-direction.y, direction.z) - Math.atan2(.61, .78))];
    }, flatBench);

  add('Standing_Military_Press', 'Standing Military Press', ['Shoulders'], ['Triceps'], press,
    [[0, 'Stand tall under the bar', 'Brace your trunk and start with your elbows extended overhead.'],
      [1.95, 'Lower to your collarbone', 'Guide the bar past your face while keeping your knees straight.'],
      [2.25, 'Press without leg drive', 'Press up, then bring your head through as the bar clears it.']], (amount) => {
      const lean = .12 * Math.sin(amount * Math.PI / 2);
      torso(v(0, .88, -.009), -lean, -.12 * Math.sin(amount * Math.PI));
      stance(.145);
      const direction = v(0, 1, lerp(.10, -.36, amount));
      const top = overhead(.019, .246, direction);
      const center = top.lerp(v(0, 1.381, .045), amount);
      center.z += .147 * Math.sin(amount * Math.PI);
      hold(center, .246, direction, (sign) => v(sign * .50, -1, .44));
      return [center];
    });

  add('Zercher_Squats', 'Zercher Squats', quads, lowerBody, down,
    [[0, 'Cradle the bar in your elbow creases', 'Bring your hands together and support the bar on your bent arms.'],
      [1.75, 'Sit between your feet', 'Keep the bar close to your body and your elbows inside your knees.'],
      [2.05, 'Stand with the cradle intact', 'Drive through your feet without letting the bar roll out of your elbows.']], (amount) => {
      torso(v(0, lerp(.872, .383, amount), lerp(-.012, -.143, amount)), lerp(.04, .28, amount));
      stance(.206, -.004, .25);
      const frame = rotation('Chest');
      const center = v(0, -.008, .221).applyQuaternion(frame).add(point('Chest'));
      for (const [side, sign] of sides) {
        const shoulder = point('Arm' + side);
        const upper = v(-sign * .013, -.245, .145).setLength(bone('Forearm' + side).position.length());
        const elbow = shoulder.add(upper.applyQuaternion(frame));
        const lower = v(-sign * .097, .207, -.027).setLength(bone('Hand' + side).position.length());
        const hand = openHand(sign, v(-sign * .85, .08, .14).applyQuaternion(frame),
          v(-sign * .16, 0, .95).applyQuaternion(frame));
        arm(side, elbow.clone().add(lower.applyQuaternion(frame)), null, hand, { elbow });
      }
      return [center, frame];
    }, { fingers: [] });

  return entries;
}
