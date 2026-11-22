import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { forearmRoll, openHand, palmHeight, supportFingerNames, createSupportHands } from './hand-frame.mjs';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const pitch = (angle) => new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), angle);
const flat = Math.PI / 2;
const rep = [[0, 0], [.25, 0], [1.35, 1], [2, 1], [3.1, 0], [3.4, 0]];
const alternate = [[0, 0], [.9, 1], [1.4, 1], [2.3, 0], [3.2, -1], [3.7, -1], [4.6, 0]];

function align(from, to, forward, up) {
  const axis = to.clone().normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), axis);
  const actual = forward.clone().applyQuaternion(turn);
  actual.addScaledVector(axis, -actual.dot(axis));
  const target = up.clone().addScaledVector(axis, -up.dot(axis));
  const twist = Math.atan2(axis.dot(actual.clone().cross(target)), actual.dot(target));
  return turn.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, twist));
}

export function createEntries({ scene, onlyExercises }) {
  const figure = clone(scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const sides = ['L', 'R'];
  const pelvis = bone('Pelvis');
  const jointNames = ['Pelvis', 'Lumbar', 'Chest', 'Head', ...supportFingerNames, ...sides.flatMap((side) =>
    ['Arm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot'].map((name) => name + side))];
  const { reset: resetFingers, pose: supportHand, includeTrack } = createSupportHands(bone);

  const world = (name, rotation) => {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  };
  const torso = (position, hip, waist = hip, chest = waist, head = chest) => {
    pelvis.position.copy(position);
    world('Pelvis', pitch(hip));
    world('Lumbar', pitch(waist));
    world('Chest', pitch(chest));
    world('Head', pitch(head));
  };

  function limb(names, end, pole, proximalFacing, distalFacing, endRotation, fitPalm = false) {
    const [first, second, third] = names;
    const origin = point(first);
    const axis = end.clone().sub(origin);
    const upper = bone(second).position.length();
    const lower = bone(third).position.length();
    const length = THREE.MathUtils.clamp(axis.length(), Math.abs(upper - lower) + .0001, upper + lower - .0001);
    axis.normalize();
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length);
    const firstSegment = axis.clone().multiplyScalar(along)
      .addScaledVector(bend, Math.sqrt(upper ** 2 - along ** 2));
    const secondSegment = axis.multiplyScalar(length).sub(firstSegment);
    world(first, proximalFacing ? align(bone(second).position, firstSegment, v(0, 0, 1), proximalFacing) :
      align(bone(second).position, firstSegment, v(1, 0, 0), v(1, 0, 0)));
    const handRotation = typeof endRotation === 'function' ? endRotation(secondSegment.clone().normalize()) : endRotation;
    const distal = distalFacing ? align(bone(third).position, secondSegment, v(0, 0, 1), distalFacing) :
      align(bone(third).position, secondSegment, v(1, 0, 0), v(1, 0, 0));
    world(second, fitPalm ? forearmRoll(third.at(-1), distal, secondSegment, handRotation) : distal);
    world(third, handRotation);
  }

  const flatHand = (sign) => supportHand(sign, v(-sign * .10, 0, 1), v(0, 1, 0));
  const arms = (side, end, pole, rotation, facing = v(0, 0, 1), fitPalm = false) =>
    limb(['Arm', 'Forearm', 'Hand'].map((name) => name + side), end, pole, facing, facing, rotation, fitPalm);
  const legs = (side, end, pole, rotation, facing = pole) =>
    limb(['Thigh', 'Shin', 'Foot'].map((name) => name + side), end, pole, facing, facing, rotation);

  const entries = {};
  function add(key, name, primary, supporting, keys, pose, phases, cues) {
    if (onlyExercises && !onlyExercises.includes(key)) return;
    resetFingers();
    const duration = keys.at(-1)[0];
    const frameCount = Math.round(duration * 60);
    const times = Array.from({ length: frameCount + 1 }, (_, i) => i * duration / frameCount);
    const rotations = jointNames.map(() => []);
    const positions = [];
    let segment = 1;
    for (const time of times) {
      while (segment < keys.length - 1 && time > keys[segment][0]) segment++;
      const [[start, from], [end, to]] = keys.slice(segment - 1, segment + 1);
      const amount = THREE.MathUtils.smoothstep(time, start, end);
      pose(THREE.MathUtils.lerp(from, to, amount));
      positions.push(...pelvis.position.toArray());
      jointNames.forEach((joint, i) => bone(joint).quaternion.toArray(rotations[i], rotations[i].length));
    }
    const tracks = jointNames.flatMap((joint, i) => includeTrack(joint, rotations[i])
      ? [new THREE.QuaternionKeyframeTrack(joint + '.quaternion', times, rotations[i])] : []);
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions));
    entries['local:exercise:' + key] = {
      name, primary, supporting, phases, cues, framing: 'floor',
      clip: new THREE.AnimationClip(name, duration, tracks).optimize(),
    };
  }

  const pressPhases = [[0, 'Setup'], [.25, 'Lower'], [1.35, 'Bottom'], [2, 'Press']];
  const liftPhases = [[0, 'Setup'], [.25, 'Lift'], [1.35, 'Hold'], [2, 'Lower']];
  const alternatePhases = [[0, 'Setup'], [.15, 'Left'], [1.4, 'Return'],
    [2.3, 'Switch sides'], [3.2, 'Right'], [3.7, 'Return']];
  const stretchPhases = [[0, 'Setup'], [.25, 'Stretch'], [1.35, 'Hold'], [2, 'Release']];
  const core = ['Core'];
  const back = ['Upper back'];
  const posterior = ['Glutes', 'Hamstrings'];

  function prone(width, angleFromFloor, plank = false) {
    const ankle = .207;
    const angle = flat - angleFromFloor;
    const body = pitch(angle);
    torso(v(0, .190, -.824).add(v(0, .824, 0).applyQuaternion(body)), angle);
    sides.forEach((side, i) => {
      const s = i === 0 ? 1 : -1;
      legs(side, v(s * .078, ankle, -.824), v(0, -1, 0), pitch(1.18), v(0, -1, .1));
      const wrist = plank ? v(s * .178, palmHeight, .647) : v(s * width, palmHeight, .420);
      arms(side, wrist, plank ? v(s * .085, -1, -.6) : v(s * Math.max(0, width - .14) * 4.2, .08, -1),
        flatHand(s), v(s * .20, 0, 1), true);
    });
  }
  for (const [key, name, width, top, bottom, primary, supporting, setup] of [
    ['Pushups', 'Pushups', .43, .220, .002, ['Chest'], ['Shoulders', 'Triceps'],
      'Place your hands wide and balance on your toes.'],
    ['Push-Up_Wide', 'Push-Up Wide', .49, .191, .002, ['Chest'], ['Core', 'Shoulders', 'Triceps'],
      'Set your hands well outside shoulder width.'],
    ['Push-Ups_-_Close_Triceps_Position', 'Push-Ups - Close Triceps Position', .132, .250, .002,
      ['Triceps'], ['Chest', 'Shoulders'], 'Place your hands inside shoulder width and keep elbows close.'],
  ]) {
    add(key, name, primary, supporting, rep, (a) => prone(width, THREE.MathUtils.lerp(top, bottom, a)),
      pressPhases, [[0, 'Set your hands', setup], [.65, 'Lower together', 'Keep your hips in line with your chest.'],
        [2, 'Press the floor away', 'Raise your chest and hips together.']]);
  }
  add('Plank', 'Plank', core, [], [[0, 0], [8, 0]], () => prone(.19, .085, true), [[0, 'Hold']],
    [[0, 'Brace on forearms and toes', 'Keep your elbows under your shoulders and your hips in line.']]);

  const floorBack = .129;
  const restingHead = -flat - .31;
  const planted = (side, s) => legs(side, v(s * .143, .073, .438), v(0, 1, 0), pitch(0));
  function sideHands(side, s) {
    arms(side, v(s * .297, palmHeight, .006), v(s, -.1, 0), flatHand(s), v(0, 1, 0), true);
  }

  function bridge(amount, tilt = 0, lifted = false) {
    const hip = -flat - .51 * amount + .29 * tilt;
    const waist = -flat - .49 * amount - .27 * tilt;
    const anchor = v(0, floorBack - .0327, -.308);
    const position = anchor.sub(bone('Lumbar').position.clone().applyQuaternion(pitch(hip)))
      .sub(bone('Chest').position.clone().applyQuaternion(pitch(waist)));
    torso(position, hip, waist, -flat, restingHead);
    sides.forEach((side, i) => {
      const s = i === 0 ? 1 : -1;
      if (lifted && i === 0) {
        legs(side, position.clone().add(v(.124, .205, .102)), v(0, 1, -.3), pitch(-.24));
      } else planted(side, s);
      sideHands(side, s);
    });
  }

  add('Butt_Lift_Bridge', 'Butt Lift (Bridge)', ['Glutes'], ['Hamstrings'], rep, bridge, liftPhases,
    [[0, 'Plant both heels', 'Keep your knees bent and arms at your sides.'],
      [.85, 'Lift your hips', 'Drive through both heels and straighten through your hips.']]);
  add('Pelvic_Tilt_Into_Bridge', 'Pelvic Tilt Into Bridge', back, [],
    [[0, 0], [.8, .45], [1.2, .45], [2.3, 1], [2.9, 1], [4, 0]],
    (a) => bridge(Math.max(0, (a - .45) / .55), Math.min(a / .45, (1 - a) / .55)),
    [[0, 'Setup'], [.3, 'Pelvic tilt'], [1.2, 'Bridge'], [2.9, 'Lower']],
    [[.35, 'Tilt your pelvis', 'Draw your belly in and curl your tailbone before lifting your back.'],
      [1.6, 'Lift into the bridge', 'Keep your shoulders and head supported.']]);
  add('Single_Leg_Glute_Bridge', 'Single Leg Glute Bridge', ['Glutes'], ['Hamstrings'], rep,
    (a) => bridge(a, 0, true), liftPhases,
    [[0, 'Bring one knee toward your chest', 'Keep the other heel planted.'],
      [.85, 'Drive through the planted heel', 'Lift your hips without rolling to either side.'],
      [3.1, 'Repeat on the other side', 'Complete your reps before switching legs.']]);

  function crunch(amount, overhead, twist = 0, crossBody = false) {
    torso(v(0, floorBack, 0), -flat, -flat + (crossBody ? .28 : .11) * amount,
      -flat + (crossBody ? .49 : .31) * amount, restingHead + (crossBody ? .82 : .65) * amount);
    if (twist) {
      // Excess rotation between the lumbar spine and chest stretches the obliques at the lower ribs.
      bone('Lumbar').rotateY(.28 * twist);
      bone('Chest').rotateY(.19 * twist);
    }
    const chest = bone('Chest');
    const head = bone('Head');
    sides.forEach((side, i) => {
      const s = i === 0 ? 1 : -1;
      const kneeLift = Math.max(0, twist * s);
      if (crossBody) {
        legs(side, v(s * (.143 + .049 * kneeLift), .073 + .245 * kneeLift, .438 - .400 * kneeLift),
          v(s * .060 * kneeLift, 1 - .70 * kneeLift, -.325 * kneeLift), pitch(-.24 * kneeLift), null);
      } else planted(side, s);
      if (overhead) {
        const wrist = chest.localToWorld(v(s * .035, .701, .064 + i * .036));
        const along = v(-s * .53, 0, -1).applyQuaternion(pitch(.31 * amount));
        arms(side, wrist, v(s, .2, .2), (forearm) => openHand(s, forearm.lerp(along, .60), v(0, 1, 0)),
          v(0, 1, 0), true);
      } else {
        if (crossBody) {
          const wrist = head.localToWorld(v(s * .136, .059, .090));
          const reach = Math.max(0, -twist * s);
          const pole = v(s * (1 - 2.9 * reach), 1.15 - .50 * reach, 1.55 * reach);
          const behind = v(s * .36, 1, 0).normalize().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
          arms(side, wrist, pole,
            (forearm) => openHand(s, forearm.lerp(behind, .50), v(s, .55, 0)), v(0, 1, 0), true);
        } else {
          const wrist = head.localToWorld(v(s * .134, .054, .080));
          const towardTemple = v(-s * .12, .97, .15).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
          arms(side, wrist, v(s * .72, .83, .07),
            (forearm) => openHand(s, forearm.lerp(towardTemple, .39), v(s, .5, 0)), v(0, 1, 0), true);
        }
      }
    });
  }

  add('Crunches', 'Crunches', core, [], rep, (a) => crunch(a, false), liftPhases,
    [[0, 'Hands beside your head', 'Keep your feet flat and touch the sides of your head lightly.'],
      [.75, 'Curl your shoulders up', 'Keep your lower back down and avoid pulling on your neck.']]);
  add('Crunch_-_Hands_Overhead', 'Crunch - Hands Overhead', core, [], rep,
    (a) => crunch(a, true), liftPhases,
    [[0, 'Reach overhead', 'Cross your hands and keep your arms near your ears.'],
      [.75, 'Curl up', 'Let your arms follow your shoulders and keep your feet planted.']]);

  add('Cross-Body_Crunch', 'Cross-Body Crunch', core, [], alternate,
    (a) => crunch(Math.abs(a), false, a, true), alternatePhases,
    [[0, 'Set up with bent knees', 'Keep your hands light at the sides of your head.'],
      [.7, 'Curl diagonally', 'Bring one shoulder and elbow toward the opposite knee as it comes in.'],
      [2.3, 'Switch sides', 'Lower your shoulder and foot before curling to the other side.']]);

  add('Reverse_Crunch', 'Reverse Crunch', core, [], rep, (a) => {
    const hip = -flat + .26 * a;
    const waist = -flat - .71 * a;
    torso(v(0, floorBack, 0), hip, waist, -flat, restingHead);
    const chest = point('Chest');
    torso(pelvis.position.clone().add(v(0, floorBack - .0327 - chest.y, -.308 - chest.z)), hip, waist, -flat, restingHead);
    sides.forEach((side, i) => {
      const s = i === 0 ? 1 : -1;
      legs(side, v(s * .096, .477 + .120 * a, .342 - .31 * a), v(s * .25, 1, -.15), pitch(-.06), null);
      sideHands(side, s);
    });
  }, liftPhases, [[0, 'Start with knees above hips', 'Keep your arms on the floor and bring your feet together.'],
    [.75, 'Roll your pelvis up', 'Draw your knees toward your rib cage without swinging.']]);

  add('Dead_Bug', 'Dead Bug', core, [], alternate, (a) => {
    torso(v(0, floorBack, 0), -flat, -flat, -flat, restingHead);
    sides.forEach((side, i) => {
      const s = i === 0 ? 1 : -1;
      const extension = Math.max(0, a * s);
      const kneeAngle = flat - 1.56 * extension;
      const shinAngle = .10 - .08 * extension;
      const end = point('Thigh' + side).add(v(s * -.007, .446 * Math.sin(kneeAngle), .446 * Math.cos(kneeAngle)))
        .add(v(0, .377 * Math.sin(shinAngle), .377 * Math.cos(shinAngle)));
      legs(side, end, v(0, 1, -.03), pitch(-.1 - 1.24 * extension));
      arms(side, point('Arm' + side).add(v(0, .518, 0)), v(s, 0, .2),
        (forearm) => openHand(s, forearm, v(s, 0, 0)), v(0, 0, 1), true);
    });
  }, alternatePhases, [[0, 'Stack your limbs', 'Reach toward the ceiling and keep your knees above your hips.'],
    [.75, 'Extend one leg', 'Reach just above the floor while your lower back stays down.'],
    [2.3, 'Switch legs', 'Bring the first knee back over your hip before extending the other leg.']]);

  add('90_90_Hamstring', '90/90 Hamstring', ['Hamstrings'], ['Calves'], rep, (a) => {
    torso(v(0, floorBack, 0), -flat, -flat, -flat, restingHead);
    sideHands('L', 1);
    sideHands('R', -1);
    const knee = point('ThighL').add(v(-.007, .443, .006));
    legs('L', knee.add(v(0, .376 * Math.sin(1.43 * a), .376 * Math.cos(1.43 * a))),
      v(0, 1, -.1), pitch(-1.31 * a));
    legs('R', v(-.096, .061, .815), v(0, 1, 0), pitch(-flat), v(0, 1, 0));
  }, stretchPhases, [[0, 'Start at ninety degrees', 'Keep one leg down and bring your other knee above your hip.'],
    [.8, 'Straighten the raised leg', 'Hold briefly, then bend your knee again. Switch legs after your reps.']]);

  function allFours(round, reach = 0) {
    torso(v(0, .525 - .006 * round, -.16 + .040 * round), flat - .82 * round, flat - .39 * round,
      flat + .86 * round, flat + 1.13 * round);
    sides.forEach((side, i) => {
      const s = i === 0 ? 1 : -1;
      arms(side, v(s * .19, palmHeight, .33), v(s * .10, 0, -1), flatHand(s), v(0, 0, 1), true);
      const lift = Math.max(0, reach * s);
      const end = v(s * .108, .041 + .55 * lift, -.553 - .425 * lift);
      legs(side, end, v(s * .14 * lift, -1, .22), pitch(Math.PI - .6 * lift), null);
    });
  }
  add('Cat_Stretch', 'Cat Stretch', back, [], [[0, 0], [1.35, 1], [16.35, 1], [17.7, 0]],
    (a) => allFours(a), [[0, 'Setup'], [.2, 'Round'], [1.35, 'Hold'], [16.35, 'Release']],
    [[0, 'Set up on hands and knees', 'Keep your hands beneath your shoulders.'],
      [1.35, 'Round your back', 'Draw your belly in, let your head drop and hold for 15 seconds.']]);
  add('Rear_Leg_Raises', 'Rear Leg Raises', ['Quadriceps'], [], alternate,
    (a) => allFours(0, a), alternatePhases,
    [[0, 'Start on hands and knees', 'Keep your hips level and your hands planted.'],
      [.65, 'Extend one leg behind you', 'Straighten your hip and knee together.'],
      [2.3, 'Switch legs', 'Return to both knees before lifting the other leg.']]);

  add('Superman', 'Superman', back, posterior,
    [[0, 0], [.25, 0], [1.35, 1], [3.35, 1], [4.45, 0], [4.75, 0]], (a) => {
      const angle = flat - .31 * a;
      torso(v(0, .171 - .024 * a, 0), flat, flat - .10 * a, angle, flat + .075 - .29 * a);
      sides.forEach((side, i) => {
        const s = i === 0 ? 1 : -1;
        legs(side, v(s * .101, .041 + .34 * a, -.810 + .017 * a),
          v(0, -1, 0), pitch(3.01 - .30 * a), v(0, -1, 0));
        arms(side, v(s * .183, palmHeight + (.456 - palmHeight) * a, .975 - .025 * a), v(s * .6, .1, 0),
          supportHand(s, v(0, .35 * a, 1), v(0, 1, 0), 1 - a), v(0, 0, 1), true);
      });
    }, [[0, 'Setup'], [.25, 'Lift'], [1.35, 'Hold'], [3.35, 'Lower']],
    [[0, 'Reach forward', 'Lie face down with your arms extended and legs long.'],
      [.9, 'Lift together', 'Raise your chest, arms, and legs and keep your gaze down.'],
      [1.35, 'Hold for two seconds', 'Lower with control after the pause.']]);

  return entries;
}
