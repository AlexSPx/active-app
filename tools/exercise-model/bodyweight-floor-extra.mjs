import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSupportHands, forearmRoll, openHand, palmHeight, supportFingerNames } from './hand-frame.mjs';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const turn = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const pitch = (angle) => turn(v(1, 0, 0), angle);
const roll = (angle) => turn(v(0, 0, 1), angle);
const flat = Math.PI / 2;
const sides = [['L', 1], ['R', -1]];
const arms = ['Arm', 'Forearm', 'Hand'];
const legs = ['Thigh', 'Shin', 'Foot'];
const torsoNames = ['Pelvis', 'Lumbar', 'Chest', 'Head'];
const joints = [...torsoNames, ...supportFingerNames,
  ...sides.flatMap(([side]) => [...arms, ...legs].map((name) => name + side))];
const lerp = THREE.MathUtils.lerp;
const up = v(0, 1, 0);

function align(from, direction, facing) {
  const axis = direction.clone().normalize();
  const orientation = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), axis);
  const forward = v(0, 0, 1).applyQuaternion(orientation);
  const twist = Math.atan2(axis.dot(forward.clone().cross(facing)),
    forward.dot(facing) - axis.dot(forward) * axis.dot(facing));
  return orientation.premultiply(turn(axis, twist));
}

export function createEntries({ scene, onlyExercises }) {
  const figure = clone(scene);
  const bone = (name) => figure.getObjectByName(name);
  const point = (name) => bone(name).getWorldPosition(v());
  const pelvis = bone('Pelvis');
  const { reset, pose: supportHand, includeTrack } = createSupportHands(bone);
  // Anchor rotated feet against their skinned sole geometry.
  const footPoints = { L: [], R: [] };
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

  function ankle(side, x, z, rotation, clearance = 0) {
    const low = Math.min(...footPoints[side].map((vertex) => vertex.clone().applyQuaternion(rotation).y));
    return v(x, clearance - low, z);
  }

  function world(name, rotation) {
    const joint = bone(name);
    joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  }

  function torso(position, hip, waist = hip, chest = waist, head = chest) {
    pelvis.position.copy(position);
    [hip, waist, chest, head].forEach((rotation, i) => world(torsoNames[i], rotation));
  }

  function limb(chain, side, target, pole, facing, endRotation) {
    const [first, second, third] = chain.map((name) => name + side);
    const axis = target.clone().sub(point(first));
    const upper = bone(second).position.length();
    const lower = bone(third).position.length();
    const length = THREE.MathUtils.clamp(axis.length(), Math.abs(upper - lower) + .0001, upper + lower - .0001);
    axis.normalize();
    const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length);
    const proximal = axis.clone().multiplyScalar(along).addScaledVector(bend, Math.sqrt(upper ** 2 - along ** 2));
    const bendNormal = axis.clone().cross(bend);
    const distal = axis.multiplyScalar(length).sub(proximal);
    const orientation = align(bone(third).position, distal, facing ?? bendNormal.clone().cross(distal));
    world(first, align(bone(second).position, proximal, facing ?? bendNormal.cross(proximal)));
    world(second, chain === arms ? forearmRoll(side, orientation, distal, endRotation) : orientation);
    world(third, endRotation);
  }

  function palm(side, s, target, pole, direction = v(-s * .10, 0, 1), pressure = 1) {
    limb(arms, side, target, pole, direction, supportHand(s, direction, up, pressure));
  }

  const entries = {};
  function add(key, name, primary, supporting, keys, pose, cues) {
    if (onlyExercises && !onlyExercises.includes(key)) return;
    reset();
    const duration = keys.at(-1)[0];
    const frames = Math.round(duration * 60);
    const times = [...new Set([
      ...Array.from({ length: frames + 1 }, (_, i) => Math.fround(i * duration / frames)),
      ...keys.map(([time]) => Math.fround(time)),
    ])].sort((a, b) => a - b);
    const rotations = joints.map(() => []);
    const positions = [];
    let segment = 1;
    for (const time of times) {
      while (segment < keys.length - 1 && time > keys[segment][0]) segment++;
      const [[start, , from], [end, , to]] = keys.slice(segment - 1, segment + 1);
      const amount = THREE.MathUtils.smoothstep(time, start, end);
      pose(...from.map((value, i) => lerp(value, to[i], amount)));
      positions.push(...pelvis.position.toArray());
      joints.forEach((joint, i) => bone(joint).quaternion.toArray(rotations[i], rotations[i].length));
    }
    const tracks = joints.flatMap((joint, i) => includeTrack(joint, rotations[i])
      ? [new THREE.QuaternionKeyframeTrack(joint + '.quaternion', times, rotations[i])] : []);
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, positions));
    entries['local:exercise:' + key] = {
      name, primary, supporting, framing: 'floor', cues,
      phases: keys.slice(0, -1).map(([time, label]) => [time, label]),
      clip: new THREE.AnimationClip(name, duration, tracks).optimize(),
    };
  }

  const chest = ['Chest'];
  const core = ['Core'];
  const press = ['Shoulders', 'Triceps'];
  const toes = pitch(1.18);
  const plank = (height, shift = 0, bank = 0) => {
    const slope = Math.asin((height - .19) / .82);
    const orientation = roll(bank).multiply(pitch(flat - slope));
    const x = shift * .60;
    const z = Math.sqrt((.82 * Math.cos(slope)) ** 2 - x ** 2);
    torso(v(x, height, -.824 + z), orientation);
  };
  function plankFeet() {
    for (const [side, s] of sides) {
      limb(legs, side, ankle(side, s * .094, -.824, toes), v(0, -1, .1), v(0, -1, .1), toes);
    }
  }

  add('Body-Up', 'Body-Up', ['Triceps'], ['Core', 'Forearms'],
    [[0, 'Forearm plank', [0]], [1.15, 'Arms extended', [1]], [1.65, 'Lower onto forearms', [1]], [2.8, '', [0]]],
    (a) => {
      plank(lerp(.260, .398, a));
      plankFeet();
      for (const [side, s] of sides) palm(side, s, v(s * .192, palmHeight, .617), v(s * .10, -.13, -1));
    },
    [[0, 'Start on forearms and toes', 'Set both hands flat and brace your trunk.'],
      [.55, 'Press through both palms', 'Extend both elbows together, then lower your forearms to the floor.']]);

  add('Butt-Ups', 'Butt-Ups', core, [],
    [[0, 'Forearm plank', [0]], [1.2, 'Hips high', [1]], [1.8, 'Lower hips', [1]], [3, '', [0]]],
    (a) => {
      const hip = pitch(flat - .115 + .66 * a);
      const waist = pitch(flat - .115 + .51 * a);
      const upper = pitch(flat - .115 + .36 * a);
      const shoulder = v(0, .317 + .005 * a, .481 - .115 * a);
      const center = bone('ArmL').position.clone().setX(0);
      const position = shoulder.sub(center.applyQuaternion(upper))
        .sub(bone('Chest').position.clone().applyQuaternion(waist))
        .sub(bone('Lumbar').position.clone().applyQuaternion(hip));
      torso(position, hip, waist, upper, pitch(flat + .02 + .30 * a));
      plankFeet();
      for (const [side, s] of sides) palm(side, s, v(s * .192, palmHeight, .645), v(s * .10, -.13, -1));
    },
    [[0, 'Set your forearms and toes', 'Keep your forearms on the floor throughout the rep.'],
      [.65, 'Pike your hips', 'Draw your ribs toward your pelvis, then lower to a straight plank.']]);

  add('Isometric_Wipers', 'Isometric Wipers', chest, ['Core', ...press],
    [[0, 'High plank', [0]], [.9, 'Lower left', [1]], [1.2, 'Press to center', [1]], [2, 'High plank', [0]],
      [2.9, 'Lower right', [-1]], [3.2, 'Press to center', [-1]], [4, '', [0]]],
    (a) => {
      plank(.378 - .132 * Math.abs(a), .37 * a, -.13 * a);
      plankFeet();
      for (const [side, s] of sides) palm(side, s, v(s * .382, palmHeight, .51), v(s * .65, .22, -.8));
    },
    [[0, 'Set both hands wide', 'Brace your trunk and keep your toes and palms in place.'],
      [.9, 'Shift over one hand', 'Bend the elbow on that side. Press through center before lowering to the other side.']]);

  add('Plyo_Push-up', 'Plyo Push-up', chest, press,
    [[0, 'High plank', [0, 0]], [.75, 'Bottom', [1, 0]], [1, 'Takeoff', [0, 0]],
      [1.13, 'Hands airborne', [0, 1]], [1.26, 'Land softly', [0, 0]], [1.49, 'Absorb landing', [.24, 0]],
      [1.9, '', [0, 0]]],
    (lower, flight) => {
      plank(.413 - .227 * lower + .085 * flight);
      plankFeet();
      for (const [side, s] of sides) {
        palm(side, s, v(s * .23, palmHeight + .135 * flight, .49), v(s * .36, .04, -1));
      }
    },
    [[0, 'Lower from a high plank', 'Keep your hips in line with your shoulders.'],
      [1, 'Press explosively', 'Let both hands leave the floor, then land with soft elbows.']]);

  add('Pushups_Close_and_Wide_Hand_Positions', 'Pushups (Close and Wide Hand Positions)', chest, press,
    [[0, 'Wide stance', [0, 0, 0]], [.85, 'Wide bottom', [1, 0, 0]], [1.65, 'Press up', [0, 0, 0]],
      [2.12, 'Left hand in', [0, 1, 0]], [2.59, 'Close stance', [0, 1, 1]], [3.44, 'Close bottom', [1, 1, 1]],
      [4.24, 'Press up', [0, 1, 1]], [4.71, 'Right hand out', [0, 1, 0]], [5.18, '', [0, 0, 0]]],
    (lower, left, right) => {
      plank(.375 - .184 * lower, (right - left) * .068);
      plankFeet();
      for (const [side, s] of sides) {
        const close = s === 1 ? left : right;
        palm(side, s, v(s * lerp(.40, .130, close), palmHeight + .062 * Math.sin(Math.PI * close), .48),
          v(s * lerp(.90, .04, close), 0, -1));
      }
    },
    [[0, 'Perform a wide push-up', 'Set your hands outside shoulder width.'],
      [1.65, 'Walk your hands inward at the top', 'Move one hand at a time, then keep your elbows close through the second rep.']]);

  add('Groiners', 'Groiners', ['Adductors'], [],
    [[0, 'High plank', [0]], [.58, 'Land outside the hands', [1]], [1.04, 'Jump back', [1]], [1.62, '', [0]]],
    (a) => {
      const flight = Math.sin(Math.PI * a);
      const spine = pitch(flat - .27 + .57 * a);
      torso(v(0, .408 + .059 * a + .038 * flight, -.035 - .051 * a), spine,
        pitch(flat - .27 + .13 * a), pitch(flat - .27 + .06 * a), pitch(flat - .30 - .17 * a));
      for (const [side, s] of sides) {
        palm(side, s, v(s * .202, palmHeight, .46), v(s * .15, 0, -1));
        const foot = pitch(lerp(1.18, .0, a));
        const target = ankle(side, s * lerp(.094, .395, a), lerp(-.824, .29, a), foot, .17 * flight);
        const travel = target.clone().sub(point('Thigh' + side)).normalize();
        const sagittal = travel.clone().cross(v(1, 0, 0)).normalize();
        const outward = sagittal.clone().cross(travel).multiplyScalar(s);
        const knee = sagittal.addScaledVector(outward, .18 + .54 * a);
        limb(legs, side, target, knee, null, foot);
      }
    },
    [[0, 'Brace in a high plank', 'Keep both palms flat and your arms straight.'],
      [.58, 'Land with both feet outside your hands', 'Let the knees open, then jump both feet back to the plank.']]);

  add('Glute_Kickback', 'Glute Kickback', ['Glutes'], ['Hamstrings'],
    [[0, 'Hands and knees', [0]], [.9, 'Left thigh lifts', [1]], [1.9, 'Left knee lowers', [1]],
      [2.8, 'Hands and knees', [0]], [3.7, 'Right thigh lifts', [-1]], [4.7, 'Right knee lowers', [-1]], [5.6, '', [0]]],
    (a) => {
      torso(v(0, .490, -.16), pitch(1.54), pitch(1.56), pitch(1.52), pitch(1.07));
      for (const [side, s] of sides) {
        palm(side, s, v(s * .191, palmHeight, .38), v(s * .18, 0, -1));
        const amount = Math.max(0, s * a);
        const angle = flat * amount;
        const thigh = pitch(angle);
        const shin = pitch(Math.PI / 2 + angle);
        world('Thigh' + side, thigh);
        world('Shin' + side, shin);
        world('Foot' + side, pitch(Math.PI + .21 * amount));
      }
    },
    [[0, 'Set up on both hands and knees', 'Stack shoulders over hands and keep your hips square.'],
      [.9, 'Lift the bent leg', 'Stop when your thigh lines up with your torso and your shin points up. Alternate legs.']]);

  add('Leg_Pull-In', 'Leg Pull-In', core, [],
    [[0, 'Legs long', [0]], [1.08, 'Knees toward chest', [1]], [2.08, 'Extend legs', [1]], [3.2, '', [0]]],
    (a) => {
      torso(v(0, .129, 0), pitch(-flat), pitch(-flat), pitch(-flat), pitch(-flat - .31));
      for (const [side, s] of sides) {
        palm(side, s, v(s * .31, palmHeight, -.005), v(s, .1, 0), v(s * .18, 0, 1));
        world('Thigh' + side, pitch(-flat - lerp(-.013, 1.97, a)));
        world('Shin' + side, pitch(-flat - .016));
        world('Foot' + side, pitch(-flat + .16 * a));
      }
    },
    [[0, 'Lie back with legs extended', 'Keep your palms on the floor and your back supported.'],
      [1.08, 'Draw both knees inward', 'Keep your shins parallel to the floor as you tuck and extend.']]);

  const sideFrame = (slope) => pitch(-slope).multiply(roll(flat)).multiply(pitch(flat));
  const sideAnkle = roll(flat).multiply(pitch(1.18));

  add('Side_Bridge', 'Side Bridge', core, ['Shoulders'],
    [[0, 'Set up on right forearm', [0]], [1.12, 'Lift hips', [1]], [2.62, 'Lower hips', [1]], [3.74, '', [0]]],
    (a) => {
      torso(v(0, .202 + .130 * a, -.04), sideFrame(.20 + .07 * a),
        sideFrame(.64 - .37 * a), sideFrame(.67 - .40 * a), sideFrame(.42 - .15 * a));
      for (const [side, s] of sides) {
        const target = ankle(side, .005 + s * .024, -.805, sideAnkle, s === 1 ? .130 : 0);
        limb(legs, side, target, v(.95, .12, 0), v(1, 0, 0), sideAnkle);
      }
      palm('R', -1, v(.246, palmHeight, .485), v(-.44, lerp(-1.19, -.84, a), -.94), v(1, 0, .17));
      limb(arms, 'L', point('Pelvis').add(v(.057, .151, .03)), v(-1, .36, -.06), up,
        openHand(1, v(0, -.10, -.99), up));
    },
    [[0, 'Set your right forearm and stack your feet', 'Keep your chest facing sideways.'],
      [1.12, 'Lift your hips into line', 'Hold briefly, then lower. Repeat on the left side after your reps.']]);

  add('Oblique_Crunches_-_On_The_Floor', 'Oblique Crunches - On The Floor', core, [],
    [[0, 'Lie on your right side', [0]], [1.12, 'Curl left elbow up', [1]],
      [2.12, 'Lower shoulders', [1]], [3.24, '', [0]]],
    (a) => {
      torso(v(0, .205, 0), sideFrame(.03), sideFrame(.15 + .18 * a),
        sideFrame(.22 + .47 * a), sideFrame(.02 + .56 * a));
      for (const [side, s] of sides) {
        const foot = ankle(side, .075, -.77, sideAnkle, s === 1 ? .130 : 0);
        limb(legs, side, foot, v(.96, .10, 0), v(1, 0, 0), sideAnkle);
      }
      palm('R', -1, v(.438, palmHeight, .441), v(.06, -.06, -.9), v(1, 0, .04));
      const wrist = bone('Head').localToWorld(v(.106, .061, -.045));
      limb(arms, 'L', wrist, v(-.62, 1, .12), up, openHand(1, v(.24, -.27, .91), v(-1, 0, 0)));
    },
    [[0, 'Stack your legs and lightly support your head', 'Keep your knees softly bent.'],
      [1.12, 'Lift your top elbow toward the ceiling', 'Curl sideways, pause, then lower. Switch sides after your reps.']]);

  return entries;
}
