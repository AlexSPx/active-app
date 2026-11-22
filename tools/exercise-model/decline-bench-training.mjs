import * as THREE from 'three';
import { createAuthor, cues, down, lerp, motion, pitch, rep, sides, up, v, yaw } from './barbell-standing-more.mjs';
import { openHand } from './hand-frame.mjs';
import { metadata } from './resistance-catalog.mjs';

export const groupLabel = 'Decline bench training';
const angle = Math.PI / 9;
const basePitch = -Math.PI / 2 - angle;
const padHeight = .422;
const rollerZ = .65;
const rollerHeight = .58;
const crunchGrip = [0, .243, -.685];
const decline = { framing: 'bench' };

export function createDeclineBench() {
  const root = new THREE.Group();
  root.name = 'Decline bench';
  const steel = new THREE.MeshStandardMaterial({ color: 0x62666b, roughness: .61, metalness: .33 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x3d4145, roughness: .88 });
  function box(name, dimensions, center, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
    mesh.name = name;
    mesh.position.set(...center);
    root.add(mesh);
    return mesh;
  }
  const rest = box('Decline pad', [.28, .065, 1.16], [0, padHeight - .031, -.08], pad);
  rest.rotation.x = -angle;
  for (const [z, h] of [[-.50, .176], [.43, .497]]) {
    box('Crossbar', [.47, .059, .108], [0, .036, z], steel);
    box('Upright', [.07, h, .073], [0, h / 2 + .059, z], steel);
  }
  box('Base rail', [.076, .066, 1.15], [0, .102, .006], steel);
  box('Roller mount', [.068, .09, .235], [0, rollerHeight, .57], steel);
  for (const [y, z] of [[rollerHeight + .13, rollerZ - .235], [rollerHeight, rollerZ]]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(.052, .052, .38, 24), pad);
    roller.name = 'Leg roller';
    roller.rotation.z = Math.PI / 2;
    roller.position.set(0, y, z);
    root.add(roller);
  }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .38, 24), pad);
  handle.name = 'Reverse crunch handhold';
  handle.position.fromArray(crunchGrip);
  handle.rotation.z = Math.PI / 2;
  root.add(handle);
  box('Handhold bracket', [.067, .045, .18], [0, .224, -.606], steel);
  return root;
}

export function createEntries(asset, helpers) {
  const { add, entries, arm, leg, bone, torso, world, point, rotation, grip, bar, pelvis } = createAuthor(asset, helpers, metadata);
  const support = (hip = .611, z = .105, tilt = basePitch) => {
    torso(v(0, hip, z), pitch(tilt));
    for (const [side, s] of sides) leg(side, v(s * .137, rollerHeight - .052, rollerZ + .037), pitch(.34), v(s * .09, 1, .09));
  };
  const exercise = (id, equipment, phases, peak, detail, pose) =>
    add(id, phases, cues(phases, [id === 'Decline_Reverse_Crunch' ? 'Lie down and grasp the bench above your head' :
      'Lie back with your legs secured on the rollers', 'Set your shoulders and brace before the rep.'],
    [peak, detail], ['Return under control', 'Keep the movement smooth on the way back.']), pose,
    { ...decline, equipment, fingers: equipment !== 'decline-bench' || id === 'Decline_Reverse_Crunch' ? 'LR' : '' });

  for (const [id, gear, mode, width] of [
    ['Decline_Dumbbell_Bench_Press', 'dumbbells', 'press', .233],
    ['Decline_Dumbbell_Flyes', 'dumbbells', 'fly', .218],
    ['Decline_Dumbbell_Triceps_Extension', 'dumbbells', 'extension', .162],
    ['Decline_Barbell_Bench_Press', 'barbell', 'press', .255],
    ['Wide-Grip_Decline_Barbell_Bench_Press', 'barbell', 'press', .365],
    ['Decline_Close-Grip_Bench_To_Skull_Crusher', 'barbell', 'combo', .127],
    ['Decline_EZ_Bar_Triceps_Extension', 'ez-curl-bar', 'extension', .105],
    ['Wide-Grip_Decline_Barbell_Pullover', 'barbell', 'pullover', .321],
  ]) {
    const combo = mode === 'combo';
    const phases = combo ? [[0, 'Lockout'], [.25, 'Lower to chest'], [.94, 'Press'],
      [1.57, 'Lower to forehead'], [2.35, 'Extend'], [3.44, 'Reset']] : down;
    const labels = { press: ['Lower the load toward the lower chest', 'Keep the wrists over your elbows as you press.'],
      fly: ['Open both arms in a wide arc', 'Keep a soft elbow bend and bring the weights back together over the chest.'],
      extension: ['Bend the elbows toward your forehead', 'Hold your upper arms steady as you lower and extend.'],
      combo: ['Alternate a close-grip press with a skull crusher', 'Return to lockout between the two movements.'],
      pullover: ['Arc the bar back past your head', 'Keep the elbows softly bent and avoid lifting the ribs.'] };
    exercise(id, 'decline-bench-' + gear, phases, ...labels[mode], (t) => {
      support();
      const a = rep(down, t);
      const press = combo ? motion([0, .24, .87, 1.36, 3.6], [0, 0, 1, 0, 0], t) : mode === 'press' ? a : 0;
      const extension = combo ? motion([0, 1.57, 2.20, 2.98, 3.6], [0, 0, 1, 0, 0], t) : mode === 'extension' ? a : 0;
      const theta = lerp(.12, 1.96, extension);
      const extensionDir = v(0, Math.cos(theta), -Math.sin(theta));
      if (gear === 'dumbbells') {
        for (const [side, s] of sides) {
          const shoulder = point('Arm' + side);
          const fly = mode === 'fly';
          const out = 1.35 * a;
          const direction = fly ? v(s * Math.sin(out), Math.cos(out), .10) : mode === 'extension' ? extensionDir : v(0, 1, .10);
          const target = fly ? shoulder.addScaledVector(direction, .502).add(v(-s * .073 * (1 - a), .015, .025))
            : mode === 'extension' ? shoulder.add(v(-s * .026, .266, .021)).addScaledVector(direction, .251)
              : shoulder.add(v(s * lerp(.01, width, press), lerp(.515, .172, press), lerp(.066, .19, press)));
          const axis = fly ? v(.12 * s, 0, 1) : mode === 'extension' ? v(0, Math.sin(theta), Math.cos(theta)) : v(-1, 0, 0);
          arm(side, target, mode === 'extension' ? v(-s * .07, 1, .045) : v(s * .97, -.24, .48),
            grip(side, axis.normalize(), direction).hand);
        }
      } else {
        const shoulder = point('ArmL');
        const pullover = mode === 'pullover';
        const path = lerp(-.17, 1.56, a);
        const direction = pullover ? v(0, Math.cos(path), -Math.sin(path)) : mode === 'extension' || combo
          ? extensionDir.clone().lerp(v(0, 1, .15), press) : v(0, 1, .15);
        const center = pullover ? v(0, shoulder.y, shoulder.z).addScaledVector(direction, .497)
          : v(0, shoulder.y + lerp(.539, .19, press) - .253 * (1 - Math.cos(theta)),
            shoulder.z + lerp(.094, .273, press) - .263 * Math.sin(theta));
        const pole = (s) => mode === 'extension' ? v(s * .35, 1, .14)
          : combo ? v(s * .34, .73, .08).lerp(v(s * .76, -.21, .73), press)
          : v(s * .91, -.23, .73);
        if (gear === 'ez-curl-bar') {
          const frame = pitch(.30 - .51 * extension);
          const hands = sides.map(([side, s]) => {
            const seat = v(s * .105, 0, .03).applyQuaternion(frame);
            const fit = grip(side, v(-2, 0, -s).normalize().applyQuaternion(frame), direction);
            return { side, s, delta: seat.sub(fit.offset), hand: fit.hand };
          });
          const upper = v(-.03, .26, -.07).setLength(bone('ForearmL').position.length());
          const elbow = shoulder.add(upper);
          const span = hands[0].delta.x - elbow.x;
          const reach = Math.sqrt(bone('HandL').position.length() ** 2 - span ** 2);
          const wrist = v(hands[0].delta.x, elbow.y, elbow.z).addScaledVector(direction, reach);
          const barCenter = wrist.sub(hands[0].delta);
          for (const { side, s, delta, hand } of hands) {
            arm(side, barCenter.clone().add(delta), v(s * upper.x, upper.y, upper.z), hand, true);
          }
          return [barCenter, frame];
        }
        return bar(center, width, direction, pole);
      }
    });
  }

  for (const [id, mode] of [['Decline_Crunch', 'crunch'], ['Decline_Oblique_Crunch', 'oblique'], ['Decline_Reverse_Crunch', 'reverse']]) {
    const reverse = mode === 'reverse';
    const oblique = mode === 'oblique';
    exercise(id, 'decline-bench', up, reverse ? 'Bring the knees toward your chest' : oblique ? 'Curl and turn toward the opposite knee' :
      'Curl the shoulders off the pad', reverse ? 'Roll the pelvis up while the shoulders stay supported.' :
      'Move from your rib cage and keep your lower back against the pad.', (t) => {
      const a = rep(up, t);
      support();
      const chest = point('Chest');
      if (reverse) world('Pelvis', pitch(basePitch - .55 * a));
      world('Lumbar', pitch(basePitch + (reverse ? -.42 * a : (oblique ? .33 : .20) * a)));
      if (reverse) pelvis.position.add(chest.sub(point('Chest')));
      world('Chest', pitch(basePitch + (reverse ? 0 : oblique ? .65 + .47 * a : .50 * a))
        .multiply(yaw(oblique ? -.66 * a : 0)));
      world('Head', pitch(basePitch + (reverse ? 0 : oblique ? .75 + .38 * a : .66 * a)));
      for (const [side, s] of sides) {
        if (reverse) {
          leg(side, v(s * .112, lerp(.916, .876, a), lerp(.795, .342, a)), pitch(-.22 + .30 * a), v(s * .08, .81, -.22));
          const { hand, offset } = grip(side, v(-1, 0, 0), v(0, -.46, -.89));
          arm(side, v(...crunchGrip).add(v(s * .149, 0, 0)).sub(offset), v(s * .62, .25, .45), hand);
        } else if (oblique && s > 0) {
          const target = point('ShinL').add(v(.085, .045, -.135));
          arm(side, target, v(.70, -.28, .30),
            openHand(s, target.clone().sub(point('ArmL')), v(.5, .8, 0)));
        } else {
          const head = rotation('Head');
          const wrist = point('Head').add(v(s * .179, .052, .074).applyQuaternion(head));
          const aroundTemple = v(-s * .48, .92, -.25).normalize().applyQuaternion(head);
          arm(side, wrist, v(s * .87, .34, .15), (forearm) =>
            openHand(s, forearm.lerp(aroundTemple, .45), v(s, 0, .23).applyQuaternion(head)));
        }
      }
    });
  }
  return entries;
}
