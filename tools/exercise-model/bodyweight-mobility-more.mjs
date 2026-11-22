import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSupportHands, openHand, palmHeight, supportFingerNames } from './hand-frame.mjs';

export const groupLabel = 'Bodyweight mobility and bench';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const turn = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const up = v(0, 1, 0);
const forward = v(0, 0, 1);
const pitch = (angle) => turn(v(1, 0, 0), angle);
const yaw = (angle) => turn(up, angle);
const roll = (angle) => turn(forward, angle);
const flat = Math.PI / 2;
const sides = [['L', 1], ['R', -1]];
const arms = ['Arm', 'Forearm', 'Hand'];
const legs = ['Thigh', 'Shin', 'Foot'];
const spine = ['Pelvis', 'Lumbar', 'Chest', 'Head'];
const jointNames = [...spine, ...supportFingerNames,
  ...sides.flatMap(([side]) => [...arms, ...legs].map((name) => name + side))];
const { clamp, lerp, smoothstep } = THREE.MathUtils;
const swing = (from, to) => new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());

function align(from, direction, face) {
  const axis = direction.clone().normalize();
  const rotation = swing(from, axis);
  const actual = forward.clone().applyQuaternion(rotation);
  return rotation.premultiply(turn(axis, Math.atan2(axis.dot(actual.clone().cross(face)),
    actual.dot(face) - axis.dot(actual) * axis.dot(face))));
}

export function createEntries({ scene, onlyExercises }) {
  const figure = clone(scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const pelvis = bone('Pelvis');
  const { reset, pose: supportHand, includeTrack } = createSupportHands(bone);
  const footPoints = { L: [], R: [] };
  const shoulderSockets = sides.map(([side]) => bone('Arm' + side).position.clone());
  figure.updateMatrixWorld(true);
  figure.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    for (const [side] of sides) {
      const foot = bone('Foot' + side);
      const index = mesh.skeleton.bones.indexOf(foot);
      const inverse = foot.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
      for (let i = 0; i < position.count; i++) {
        if (skinIndex.getX(i) === index && skinWeight.getX(i) > .999) {
          footPoints[side].push(v().fromBufferAttribute(position, i).applyMatrix4(inverse));
        }
      }
    }
  });

  function world(name, rotation) {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  }

  function torso(position, hip, waist = hip, chest = waist, head = chest) {
    pelvis.position.copy(position);
    [hip, waist, chest, head].forEach((rotation, i) => world(spine[i], rotation));
  }

  function limb(chain, side, target, pole, endRotation) {
    const [first, second, third] = chain.map((name) => name + side);
    const axis = target.clone().sub(point(first));
    const upper = bone(second).position.length();
    const lower = bone(third).position.length();
    const length = clamp(axis.length(), Math.abs(upper - lower) + .0001, upper + lower - .0001);
    axis.normalize();
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length);
    const proximal = axis.clone().multiplyScalar(along).addScaledVector(bend, Math.sqrt(upper ** 2 - along ** 2));
    const distal = axis.clone().multiplyScalar(length).sub(proximal);
    const normal = axis.cross(bend);
    world(first, align(bone(second).position, proximal, normal.clone().cross(proximal)));
    const end = typeof endRotation === 'function' ? endRotation(distal) : endRotation;
    const bind = bone(third).position;
    world(second, chain === arms ? swing(bind.clone().applyQuaternion(end), distal).multiply(end)
      : align(bind, distal, normal.cross(distal)));
    world(third, end);
  }

  function ankle(side, x, z, foot, height) {
    const low = Math.min(...footPoints[side].map((vertex) => vertex.clone().applyQuaternion(foot).y));
    return v(x, height - low, z);
  }

  function leg(side, x, z, foot = pitch(0), height = 0, knee = forward) {
    limb(legs, side, ankle(side, x, z, foot, height), knee, foot);
  }

  function arm(side, s, wrist, pole, along, dorsal = up) {
    limb(arms, side, wrist, pole, along ? openHand(s, along, dorsal)
      : (distal) => openHand(s, distal, dorsal));
  }

  function palm(side, s, wrist, pole, direction = forward) {
    limb(arms, side, wrist, pole, supportHand(s, direction, up));
  }

  function relaxed(side, s) {
    arm(side, s, point('Arm' + side).add(v(s * .066, -.506, .011)), v(s * .28, .04, -.92),
      null, v(s, 0, -.13));
  }

  // Aim the center of the palm at a contact point, accounting for the wrist offset.
  function touch(side, s, contact, pole, fingers, dorsal) {
    const wrist = contact.clone().addScaledVector(fingers.clone().normalize(), -.082)
      .addScaledVector(dorsal.clone().normalize(), .025);
    arm(side, s, wrist, pole, fingers, dorsal);
  }

  const entries = {};
  function add(key, name, primary, supporting, keys, pose, cues, metadata = {}, movingSockets = false) {
    if (onlyExercises && !onlyExercises.includes(key)) return;
    const duration = keys.at(-1)[0];
    const frames = Math.round(duration * 60);
    const times = Array.from({ length: frames + 1 }, (_, i) => i * duration / frames);
    const rotations = jointNames.map(() => []);
    const positionNames = movingSockets ? ['Pelvis', 'ArmL', 'ArmR'] : ['Pelvis'];
    const positions = positionNames.map(() => []);
    let segment = 1;
    for (const time of times) {
      while (segment < keys.length - 1 && time > keys[segment][0]) segment++;
      const [[start, , from], [end, , to]] = keys.slice(segment - 1, segment + 1);
      reset();
      pose(lerp(from, to, smoothstep(time, start, end)), time);
      positionNames.forEach((joint, i) => positions[i].push(...bone(joint).position));
      jointNames.forEach((joint, i) => {
        const rotation = bone(joint).quaternion;
        const values = rotations[i];
        const last = values.length - 4;
        const sign = last >= 0 && rotation.dot(new THREE.Quaternion().fromArray(values, last)) < 0 ? -1 : 1;
        values.push(rotation.x * sign, rotation.y * sign, rotation.z * sign, rotation.w * sign);
      });
    }
    sides.forEach(([side], i) => bone('Arm' + side).position.copy(shoulderSockets[i]));
    const tracks = jointNames.flatMap((joint, i) => includeTrack(joint, rotations[i])
      ? [new THREE.QuaternionKeyframeTrack(joint + '.quaternion', times, rotations[i])] : []);
    positionNames.forEach((joint, i) => tracks.push(new THREE.VectorKeyframeTrack(joint + '.position', times, positions[i])));
    entries['local:exercise:' + key] = {
      name, primary, supporting, framing: 'floor', cues, ...metadata,
      phases: keys.flatMap(([time, label]) => label ? [[time, label]] : []),
      clip: new THREE.AnimationClip(name, duration, tracks).optimize(),
    };
  }

  const standingFrame = { framing: 'standing' };
  const bench = (position, yawAngle = 0) => ({
    framing: 'bench', equipment: 'bench', benchTransform: { position, yaw: yawAngle },
  });
  const core = ['Core'];
  const back = ['Upper back'];
  const glutes = ['Glutes'];
  const shoulders = ['Shoulders'];
  const hold = (setup, reach, seconds = 2) =>
    [[0, setup, 0], [1.2, reach, 1], [1.2 + seconds, 'Release', 1], [2.4 + seconds, '', 0]];

  function standing() {
    torso(v(0, .880, 0), pitch(0));
    for (const [side, s] of sides) leg(side, s * .118, 0);
  }

  function supine(r = 0, head = 0) {
    const onBack = pitch(-flat);
    torso(v(0, .129 + .027 * Math.abs(r), 0), roll(r).multiply(onBack),
      roll(r * .32).multiply(pitch(-flat - .25 * Math.abs(r))),
      onBack, roll(head).multiply(pitch(-flat - .31)));
  }

  function floorArms(prone = false) {
    for (const [side, s] of sides) {
      palm(side, s, v(s * .634, palmHeight, prone ? .476 : -.473), v(0, 0, prone ? -1 : 1), v(s, 0, 0));
    }
  }

  function butterfly() {
    for (const [side, s] of sides) {
      leg(side, s * .066, .373, yaw(-s * .18).multiply(roll(s * 1.37)), 0, v(s, .16, .37));
    }
  }

  add('Ankle_On_The_Knee', 'Ankle On The Knee', glutes, [],
    [[0, 'Feet planted', 0], [.65, 'Cross ankle over knee', .43], [1.65, 'Pull both legs in', 1],
      [11.65, 'Release', 1], [12.65, 'Uncross the ankle', .43], [13.3, '', 0]],
    (a) => {
      supine();
      const pull = smoothstep(a, .43, 1);
      const cross = smoothstep(a, 0, .43);
      leg('R', -.125, .425 - .23 * pull, pitch(-.35 * pull), .30 * pull, up);
      const knee = point('ShinR');
      const ankle = v(.129, .075, .429).lerp(knee.clone().add(v(.035, .051, .059)), cross);
      limb(legs, 'L', ankle, v(.94, .62, .18), pitch(-.28 * cross).multiply(yaw(-1.19 * cross)));
      for (const [side, s] of sides) {
        const ready = v(s * .285, .125, -.17);
        const contact = knee.clone().add(v(s * .058, -.036, -.105));
        touch(side, s, ready.lerp(contact, pull), v(s, -.52, -.36), v(-s * .41, .35, .85), v(s, -.17, 0));
      }
    },
    [[0, 'Lie back with both knees bent', 'Keep your head and shoulders on the floor.'],
      [.65, 'Rest one ankle across the opposite knee', 'Let the crossed knee open away from you.'],
      [1.65, 'Hold behind the supporting thigh', 'Draw both legs toward you. Hold, then switch sides.']]);

  add('Groin_and_Back_Stretch', 'Groin and Back Stretch', ['Adductors'], back,
    hold('Sit with soles together', 'Curl between thighs', .38),
    (a) => {
      torso(v(0, .135, 0), pitch(.12 + .62 * a), pitch(.13 + 1.13 * a),
        pitch(.12 + 1.35 * a), pitch(.08 + 1.48 * a));
      butterfly();
      for (const [side, s] of sides) {
        const at = bone('Head').localToWorld(v(s * .030, .094, -.089));
        const reach = v(-s, .12, .11).applyQuaternion(bone('Head').getWorldQuaternion(new THREE.Quaternion()));
        touch(side, s, at, v(s * (1 - a), -.08 - .61 * a, .58), reach, v(0, .35 + .25 * a, -.9));
      }
    },
    [[0, 'Sit tall with your soles together', 'Interlace your fingers behind your head.'],
      [1.2, 'Bring both elbows inside your thighs', 'Curl forward, pause briefly, then sit tall again.']]);

  add('Iron_Crosses_stretch', 'Iron Crosses (stretch)', ['Quadriceps'], ['Glutes', 'Core'],
    [[0, 'Lie face down', 0], [.86, 'Right foot reaches across', -1], [1.64, 'Return to center', 0],
      [2.50, 'Left foot reaches across', 1], [3.28, '', 0]],
    (a) => {
      const active = Math.abs(a);
      torso(v(0, .168 + .061 * active, 0), roll(.89 * a).multiply(pitch(flat)),
        roll(.29 * a).multiply(pitch(flat + .23 * active)), pitch(flat), pitch(1.30));
      floorArms(true);
      for (const [side, s] of sides) {
        const reach = Math.max(0, s * a);
        const across = smoothstep(reach, .25, 1);
        const lift = smoothstep(reach, 0, .64);
        const foot = pitch(2.40 + 1.13 * lift).multiply(yaw(-s * 1.28 * across));
        leg(side, s * (.103 - .480 * across), -.819 + .743 * lift, foot,
          .36 * lift - .30 * across, v(s * .45, .79, -.40));
      }
    },
    [[0, 'Set your palms out at shoulder height', 'Keep your chest facing the floor.'],
      [.86, 'Bend a knee and reach across behind you', 'Aim the foot toward the opposite hand, then return and alternate.']]);

  add('Knee_Across_The_Body', 'Knee Across The Body', glutes, back,
    hold('Lie back with right leg long', 'Lower left knee across', 5),
    (a) => {
      supine(1.07 * a, -.56 * a);
      leg('R', -.099, .821, pitch(-.66), 0, up);
      const foot = roll(.70 * a).multiply(pitch(-.30 - .82 * a));
      leg('L', .162 - .265 * a, .410 - .073 * a, foot, .038 + .028 * a, v(-.75 * a, 1 - .72 * a, -.20 - .38 * a));
      palm('L', 1, v(.615, palmHeight, -.52), v(.14, 0, 1), v(1, 0, .08));
      const shin = point('ShinL');
      touch('R', -1, v(-.286, .079, -.13).lerp(shin.add(v(.014, .047, -.033)), a),
        v(-.92, -.47, -.17), v(.26, -.06, 1), up);
    },
    [[0, 'Keep your right leg long', 'Bend your left knee and rest your left arm on the floor.'],
      [1.2, 'Guide the left knee across with your right hand', 'Turn your head left and keep your shoulders down. Repeat on the other side.']]);

  add('Looking_At_Ceiling', 'Looking At Ceiling', ['Quadriceps'], ['Core'],
    hold('Kneel and take both heels', 'Lift hips and look up', 3),
    (a) => {
      const angle = .96 - .81 * a;
      torso(v(0, .058 + .445 * Math.cos(angle), -.061 - .445 * Math.sin(angle)), pitch(-.46 - .18 * a),
        pitch(-.87 - .18 * a), pitch(-1.11 - .13 * a), pitch(-1.12 - .29 * a));
      for (const [side, s] of sides) {
        leg(side, s * .112, -.438, pitch(2.48), 0, v(s * .045, -.43, 1));
        const heel = bone('Foot' + side).localToWorld(v(s * .017, -.007, -.025));
        touch(side, s, heel, v(s * .82, -.27, -.57), v(-s * .24, -1, -.13), v(s, .08, 0));
      }
    },
    [[0, 'Kneel with your hands on your heels', 'Rest the tops of your feet on the floor.'],
      [1.2, 'Lift your hips up and forward', 'Open your chest and look up while keeping both knees down.']]);

  add('One_Knee_To_Chest', 'One Knee To Chest', glutes, ['Hamstrings', 'Upper back'],
    hold('Lie back with one leg long', 'Draw knee toward chest', 5),
    (a) => {
      supine();
      leg('R', -.10, .817, pitch(-.61), 0, up);
      leg('L', .124, .443 - .30 * a, pitch(-.32 - .38 * a), .30 * a, v(.12, 1, -.61 * a));
      const knee = point('ShinL');
      for (const [side, s] of sides) {
        const at = knee.clone().add(v(s * .066, -.047, .005));
        touch(side, s, at, v(s * .57, -.83, -.20), v(-s * .53, .55, .52), v(s, -.08, -.25));
      }
    },
    [[0, 'Lie on your back and keep one leg straight', 'Place both hands behind the other knee.'],
      [1.2, 'Gently pull the bent knee toward your chest', 'Keep your head down and your straight leg long. Repeat on the other side.']]);

  add('Overhead_Stretch', 'Overhead Stretch', core, ['Chest', 'Forearms', 'Upper back', 'Triceps'],
    hold('Clasp hands in front', 'Reach palms up', 4),
    (a) => {
      standing();
      for (const [side, s] of sides) {
        const reach = v(-s, -.40 * (1 - a), .22 * (1 - a));
        touch(side, s, v(s * .006, 1.43 + .485 * a, .365 - .343 * a),
          v(s * .87, -.44, .06), reach, v(0, -a, -1 + a));
      }
    },
    [[0, 'Lace your fingers and turn your palms outward', 'Stand tall and keep your ribs over your pelvis.'],
      [1.2, 'Press your palms toward the ceiling', 'Lengthen through the torso and let your shoulders stay away from your ears.']], standingFrame);

  add('Runners_Stretch', "Runner's Stretch", ['Hamstrings'], ['Calves', 'Glutes', 'Quadriceps'],
    hold('Low lunge with both palms down', 'Lift hips to lengthen front leg', 2),
    (a) => {
      const tilt = 1.37 + .51 * a;
      torso(v(-.013, .365 + .253 * a, -.159 - .104 * a), pitch(tilt), pitch(tilt + .08),
        pitch(tilt + .03), pitch(tilt - .20));
      leg('L', .091, .308, pitch(0), 0, v(.12, .16, 1));
      leg('R', -.136, -.930, pitch(1.08 - .26 * a), 0, v(.02, -.91, .45));
      palm('L', 1, v(.308, palmHeight, .422), v(.85, .1, -.39));
      palm('R', -1, v(-.109, palmHeight, .421), v(-.85, .1, -.39));
    },
    [[0, 'Frame your front foot with your hands', 'Step the other foot well back. Keep the front heel down.'],
      [1.2, 'Lift your hips and lengthen your front leg', 'Keep the front heel and both hands down as you return to the lunge. Repeat on the other side.']]);

  add('Seated_Calf_Stretch', 'Seated Calf Stretch', ['Calves'], ['Hamstrings', 'Upper back'],
    hold('Sit with one knee bent', 'Draw toes toward shin', 10),
    (a) => {
      torso(v(0, .133, 0), pitch(.56 + .19 * a), pitch(.82 + .19 * a),
        pitch(1.07 + .12 * a), pitch(.96 + .12 * a));
      leg('L', .100, .819, pitch(-.33 - .47 * a), 0, up);
      leg('R', -.195, .344, pitch(0), 0, v(-.55, 1, .19));
      palm('R', -1, v(-.373, palmHeight, .270), v(-.75, -.11, -.18), v(.10, 0, 1));
      const foot = bone('FootL');
      const attitude = foot.getWorldQuaternion(new THREE.Quaternion());
      touch('L', 1, foot.localToWorld(v(.005, -.020, .138)),
        v(.73, -.62, -.13), v(.02, -.34, .94).applyQuaternion(attitude), v(0, 1, 0).applyQuaternion(attitude));
    },
    [[0, 'Bend one knee and plant that foot', 'Leave the other leg long with its heel on the floor.'],
      [1.2, 'Draw the toes of the long leg toward you', 'Use your hand if you can reach comfortably. Keep the knee straight and repeat on the other side.']]);

  add('Seated_Overhead_Stretch', 'Seated Overhead Stretch', core, ['Upper back'],
    hold('Sit tall with soles together', 'Lift elbow and side bend', 10),
    (a) => {
      torso(v(0, .132, 0), pitch(.06), roll(.21 * a), roll(.43 * a), roll(.47 * a));
      butterfly();
      palm('R', -1, v(-.267, palmHeight, .040), v(-.86, -.28, -.61), v(-.91, 0, .39));
      const head = point('Head');
      touch('L', 1, head.add(v(-.04 * a, .080, -.105)), v(.92 - .40 * a, .18 + .75 * a, -.11),
        v(-.79, .19, .17), v(0, 0, -1));
    },
    [[0, 'Put your right palm beside you and your left hand behind your head', 'Sit tall with your soles together.'],
      [1.2, 'Lift your left elbow and lean right', 'Keep both hips down. Hold, then repeat on the other side.']]);

  function shrug(x, y, z) {
    standing();
    // The rig has no clavicles, so move the shoulder sockets while the trunk stays still.
    for (const [side, s] of sides) {
      bone('Arm' + side).position.copy(shoulderSockets[s > 0 ? 0 : 1]).add(v(s * x, y, z));
      relaxed(side, s);
    }
  }

  add('Shoulder_Circles', 'Shoulder Circles', shoulders, back,
    [[0, 'Roll forward', 0], [1.8, 'Complete forward circle', 1], [3.6, 'Reverse direction', 2],
      [5.4, 'Complete backward circle', 1], [7.2, '', 0]],
    (a) => {
      const angle = 2 * Math.PI * a;
      shrug(.011 * Math.sin(angle), .059 * (1 - Math.cos(angle)) / 2, .049 * Math.sin(angle));
    },
    [[0, 'Let your arms hang', 'Roll both shoulders forward, up, back, and down.'],
      [3.6, 'Reverse the circles', 'Move the shoulders smoothly while your arms stay relaxed.']], standingFrame, true);

  add('Shoulder_Raise', 'Shoulder Raise', shoulders, back,
    hold('Relax your shoulders', 'Shrug toward ears', .35),
    (a) => shrug(-.010 * a, .078 * a, 0),
    [[0, 'Let your arms hang at your sides', 'Stand tall with your head still.'],
      [1.2, 'Lift both shoulders toward your ears', 'Pause briefly, then lower without rolling forward.']], standingFrame, true);

  const rightSide = pitch(-.22).multiply(roll(flat)).multiply(pitch(flat));
  function sideLying(chest = rightSide, head = rightSide) {
    torso(v(0, .210, 0), rightSide, rightSide, chest, head);
    leg('R', .332, -.421, roll(flat), 0, v(1, .12, -.04));
  }

  add('Side-Lying_Floor_Stretch', 'Side-Lying Floor Stretch', back, core,
    hold('Lie on left side', 'Lengthen top side', 5),
    (a) => {
      const leftSide = pitch(-.22).multiply(roll(-flat)).multiply(pitch(flat));
      torso(v(0, .210, 0), leftSide, pitch(-.09 * a).multiply(leftSide),
        pitch(-.16 * a).multiply(leftSide), pitch(-.13 * a).multiply(leftSide));
      leg('L', -.333, -.425, roll(-flat), 0, v(-1, .12, -.05));
      leg('R', .235 + .03 * a, -.757, roll(-flat).multiply(pitch(-.54)), 0, v(-.05, .7, .2));
      arm('R', -1, v(-.123, .350 - .076 * a, .684 + .173 * a),
        v(-.74, .11, -.42), null, v(.07, .97, .18));
      const wrist = point('HandR').add(v(.009, .024, -.012));
      touch('L', 1, wrist, v(.86, -.23, .34), v(-.89, .16, .41), v(.13, .91, .03));
    },
    [[0, 'Lie on your left side with the bottom knee bent', 'Rest the straight top leg behind the bent knee.'],
      [1.2, 'Reach the top arm past your ear', 'Gently draw the wrist farther overhead with your bottom hand, then switch sides.']]);

  add('Side_Lying_Groin_Stretch', 'Side Lying Groin Stretch', ['Adductors'], ['Hamstrings'],
    hold('Lie on right side and hold top thigh', 'Draw top knee toward shoulder', 5),
    (a) => {
      sideLying(pitch(-.02).multiply(rightSide), pitch(.18).multiply(rightSide));
      const shin = v(.213 + .098 * a, .431 + .019 * a, -.300 + .342 * a);
      world('ThighL', align(bone('ShinL').position, shin.clone().sub(point('ThighL')), v(.86, .50, 0)));
      world('ShinL', align(bone('FootL').position, v(.33, -.81 - .37 * a, -.76 + .90 * a), v(.97, .31, 0)));
      world('FootL', roll(.70).multiply(pitch(-1.06)));
      const at = point('ShinL').add(v(-.046, -.031, -.047));
      touch('L', 1, at, v(.92, .27, -.34), v(.31, -.11, -.94), v(-.91, -.12, .39));
      touch('R', -1, point('Head').add(v(.01, .013, .085)), v(.79, -.32, -.45),
        v(-.35, .19, .91), v(0, -1, 0));
    },
    [[0, 'Bend your bottom knee and support your head', 'Use your top hand behind the top knee.'],
      [1.2, 'Draw the top knee toward its shoulder', 'Let the top foot reach down. Hold, then repeat on the other side.']]);

  const splitKeys = [[0, 'Stand with feet together', 0], [.30, 'Jump from parallel stance', 0],
    [.64, 'Land left foot forward', 1], [.81, 'Quick knee bend', 1], [.98, 'Take off to switch', 1],
    [1.32, 'Land right foot forward', -1], [1.49, 'Quick knee bend', -1], [1.66, 'Take off to return', -1],
    [2, 'Land with feet together', 0], [2.28, '', 0]];
  add('Split_Squats', 'Split Squats', ['Hamstrings'], ['Quadriceps', 'Glutes', 'Calves'], splitKeys,
    (lead, time) => {
      const pulse = (start, peak, end) => smoothstep(time, start, peak) * (1 - smoothstep(time, peak, end));
      const air = Math.max(0, ...[[.30, .64], [.98, 1.32], [1.66, 2]].map(([from, to]) =>
        4.9 * (time - from) * (to - time)));
      const sink = .124 * (pulse(.64, .81, .98) + pulse(1.32, 1.49, 1.66))
        + .063 * (pulse(0, .17, .30) + pulse(2, 2.12, 2.28));
      torso(v(0, .861 - .059 * Math.abs(lead) - sink + air, -.034 * Math.abs(lead)),
        pitch(.10 + sink * .65), pitch(.14), pitch(.12), pitch(.03));
      for (const [side, s] of sides) {
        const stance = s * lead;
        leg(side, s * .123, .320 * stance, pitch(Math.max(0, -.89 * stance)), air, v(s * .09, 0, 1));
        touch(side, s, pelvis.position.clone().add(v(s * .123, .108, .070)),
          v(s * .90, -.09, -.59), v(-s * .12, -.87, .51), v(s, 0, 0));
      }
    },
    [[0, 'Start with feet under your hips', 'Soften your knees and keep your hands at your hips.'],
      [.64, 'Land in a shallow split stance', 'Bend both knees to absorb the landing.'],
      [1.32, 'Switch your lead leg in the air', 'Keep the jumps quick and land softly on both sides.']], standingFrame);

  add('Tricep_Side_Stretch', 'Tricep Side Stretch', ['Triceps'], shoulders,
    hold('Bring right arm in front', 'Draw right elbow across', 5),
    (a) => {
      standing();
      arm('R', -1, v(.097 + .055 * a, 1.432 + .048 * a, .207 - .072 * a),
        v(.25 + .57 * a, -.74 + .22 * a, .76), v(.46, -.47, -.73), v(-.21, .9, .09));
      const elbow = point('ForearmR');
      touch('L', 1, elbow.add(v(.041, -.014, .019)), v(.91, -.62, -.27),
        v(-.64, .65, -.33), v(.88, .03, .34));
    },
    [[0, 'Reach your right hand toward your left shoulder', 'Bend the right elbow in front of your chest and hold it with your left hand.'],
      [1.2, 'Draw the elbow gently farther across', 'Relax the right shoulder. Hold, then repeat with the other arm.']], standingFrame);

  add('Upper_Back-Leg_Grab', 'Upper Back-Leg Grab', ['Hamstrings'], back,
    hold('Sit with legs long and together', 'Fold over thighs', 4),
    (a) => {
      torso(v(0, .135, 0), pitch(.45 + .53 * a), pitch(.65 + .74 * a),
        pitch(.83 + .68 * a), pitch(.91 + .65 * a));
      for (const [side, s] of sides) leg(side, s * .079, .816, pitch(-.59), 0, v(0, 1, -.08));
      for (const [side, s] of sides) {
        const thigh = point('Thigh' + side).lerp(point('Shin' + side), .67 + .15 * a);
        touch(side, s, thigh.add(v(-s * .047, -.038, .006)), v(s, -.64, .09), v(-s, .19, .04), v(0, -1, 0));
      }
    },
    [[0, 'Keep your knees together and reach under your thighs', 'Sit with your legs extended in front of you.'],
      [1.2, 'Bring your chest toward your knees', 'Hug your thighs from underneath as you fold forward.']]);

  add('Windmills', 'Windmills', glutes, ['Hamstrings', 'Upper back'],
    [[0, 'Lie with arms out', 0], [1, 'Sweep left leg across', 1], [2, 'Return to center', 0],
      [3, 'Sweep right leg across', -1], [4, '', 0]],
    (a) => {
      supine(1.27 * a);
      floorArms();
      for (const [side, s] of sides) {
        const reach = Math.max(0, a * s);
        const lift = Math.sin(Math.PI * reach);
        const foot = roll(1.05 * a).multiply(pitch(-.54 - .79 * reach));
        const target = ankle(side, s * (.106 - .668 * reach), .806 - 1.35 * reach, foot,
          .055 * reach + .60 * lift);
        const hip = point('Thigh' + side);
        const extended = target.clone().sub(hip).setLength(.820).add(hip);
        target.lerp(extended, smoothstep(reach, 0, .18));
        target.y = Math.max(target.y, ankle(side, 0, 0, foot, 0).y);
        limb(legs, side, target, v(0, .83, -.58), foot);
      }
    },
    [[0, 'Lie on your back and extend both arms', 'Keep both legs long and your shoulders on the floor.'],
      [1, 'Sweep one long leg toward the opposite hand', 'Let the hips rotate, then return to center and switch legs.']]);

  add('Decline_Push-Up', 'Decline Push-Up', ['Chest'], ['Shoulders', 'Triceps', 'Core'],
    [[0, 'Wide high plank', 0], [.25, 'Lower with control', 0], [1.45, 'Chest near floor', 1],
      [1.72, 'Press away', 1], [2.74, 'Lock out', 0], [3, '', 0]],
    (a) => {
      const tilt = 1.68 + .221 * a;
      const body = pitch(tilt);
      torso(v(0, .592, -.776).add(v(0, .812, 0).applyQuaternion(body)), body, body, body, pitch(1.17 - .10 * a));
      for (const [side, s] of sides) {
        leg(side, s * .101, -.776, pitch(1.18), .430, v(0, -.93, .16));
        palm(side, s, v(s * .449, palmHeight, .432), v(s * .83, .14, -.59), v(-s * .07, 0, 1));
      }
    },
    [[0, 'Set your toes on the bench and plant your hands wide', 'Brace your trunk and keep a straight line from shoulders to heels.'],
      [1.45, 'Lower your chest toward the floor', 'Keep your hips in line, then press back to straight arms.']],
    bench([0, 0, -.886], flat));

  add('Seated_Flat_Bench_Leg_Pull-In', 'Seated Flat Bench Leg Pull-In', core, [],
    [[0, 'Legs long, torso reclined', 0], [1.13, 'Draw both knees in', 1], [2.13, 'Re-extend with control', 1],
      [3.53, '', 0]],
    (a) => {
      torso(v(0, .557 - .039 * a, .424 + .018 * a), pitch(-.36 + .42 * a),
        pitch(-.66 + .92 * a), pitch(-.77 + 1.14 * a), pitch(-.37 + .56 * a));
      for (const [side, s] of sides) {
        arm(side, s, v(s * .203, .473, .310), v(s * .70, -.30, -.88),
          v(s * .13, -.96, .06), v(s, .12, 0));
        world('Thigh' + side, pitch(-1.37 - 1.01 * a));
        world('Shin' + side, pitch(-1.36 + 1.48 * a));
        world('Foot' + side, pitch(-1.30 + 1.24 * a));
      }
    },
    [[0, 'Sit near the end and grip both sides of the bench', 'Lean back about 45 degrees with both legs long and off the floor.'],
      [1.13, 'Bring your knees and torso toward each other', 'Pause, then lean back and extend your legs with control.']],
    bench([0, 0, 0]));

  return entries;
}
