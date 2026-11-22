import * as THREE from 'three';
import { createAuthor, cues, lerp, motion, pitch, rep, roll, sides, up, v, yaw } from './barbell-standing-more.mjs';
import { metadata } from './resistance-catalog.mjs';
import { createSupportHands, openHand, palmHeight, supportFingerNames } from './hand-frame.mjs';

export const groupLabel = 'Bodyweight support drills';

export function createBodyweightSupport(kind) {
  const root = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x666d75, roughness: .59 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x41474f, roughness: .86 });
  function box(name, size, location, material = steel) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...location);
    root.add(mesh);
  }
  if (kind === 'chair') {
    root.name = 'Chair';
    box('Seat', [.44, .063, .43], [0, .406, -.132], pad);
    box('Backrest', [.42, .29, .057], [0, .745, -.337], pad);
    for (const x of [-.177, .177]) {
      box('Back leg', [.043, .61, .043], [x, .305, -.337]);
      box('Front leg', [.043, .38, .043], [x, .19, .05]);
    }
  } else {
    root.name = 'Ankle restraint';
    box('Base', [.50, .062, .23], [0, .031, -.43]);
    for (const x of [-.223, .223]) box('Roller bracket', [.051, .247, .077], [x, .124, -.421]);
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(.054, .054, .46, 24), pad);
    roller.name = 'Padded ankle roller';
    roller.position.set(0, .191, -.421);
    roller.rotation.z = Math.PI / 2;
    root.add(roller);
  }
  return root;
}

export function createEntries(asset, helpers) {
  const { add, entries, torso, leg, arm, grip, point, world, bone } = createAuthor(asset, helpers, metadata);
  const normal = (setup, peak, detail) => cues(up, [setup, 'Take a stable position before moving.'],
    [peak, detail], ['Return under control', 'Reverse the motion smoothly.']);
  const hang = { equipment: 'pull-up-bar' };
  add('Bodyweight_Mid_Row', up,
    normal('Hang from the bar with both knees tucked', 'Row your torso up toward the bar', 'Keep the tuck and lead with your elbows.'), (t) => {
      const a = rep(up, t);
      torso(v(0, lerp(1.597, 1.98, a), lerp(.397, .230, a)), pitch(-1.33), pitch(-.83));
      for (const [side, s] of sides) {
        leg(side, v(s * .125, 1.86 + .39 * a, .62 - .42 * a), pitch(-.65), v(s * .11, .91, -.30));
        const { hand, offset } = grip(side, v(-1, 0, 0), v(0, 1, -.63));
        arm(side, v(s * .258, 2.30, 0).sub(offset), v(s * .62, -.65, -.42), hand);
      }
    }, hang);

  const towelStart = [.255, 2.299, 0];
  add('One_Arm_Chin-Up', up,
    normal('Take an underhand grip with one hand and hold the towel with the other',
      'Pull your chest up toward the bar', 'Keep the bar-side elbow close and use the towel for assistance.'), (t) => {
      const a = rep(up, t);
      torso(v(lerp(-.095, -.18, a), 1.243 + .37 * a, lerp(.042, .245, a)), pitch(-.19 - .30 * a));
      for (const [side, s] of sides) {
        leg(side, v(s * .113 - .11, .437 + .38 * a, -.102 + .081 * a), pitch(.27), v(s * .09, -.15, .85));
        const towel = side === 'L';
        const { hand, offset } = grip(side, towel ? v(0, 1, 0) : v(1, 0, 0),
          towel ? v(-.18, 0, 1) : v(0, 1 - .65 * a, .38 + .63 * a));
        arm(side, (towel ? v(.248, 2.048, .031) : v(-.232, 2.30, 0)).sub(offset), v(s * .65, -.62, -.54), hand);
      }
    }, { ...hang, resistance: { mode: 'towel', anchors: [], links: [[towelStart, 'L']] } });

  add('Inverted_Row', up, normal('Hang beneath a waist-high bar with your heels planted', 'Pull your chest toward the stationary bar',
    'Keep your hips in line and bring the elbows back.'), (t) => {
    const a = rep(up, t);
    torso(v(0, lerp(.396, .552, a), lerp(.510, .449, a)), pitch(lerp(-1.24, -1.00, a)), pitch(-.92));
    for (const [side, s] of sides) {
      leg(side, v(s * .132, .092, 1.205), pitch(-.75), v(s * .06, 1, .05));
      const { hand, offset } = grip(side, v(-1, 0, 0), v(0, 1, -.36));
      arm(side, v(s * .277, 1.043, .10).sub(offset), v(s * .83, -.57, .17), hand);
    }
    return [v(0, 1.043, .10)];
  }, { equipment: 'rack-barbell', framing: 'floor', rackTransform: { hookHeight: 1.043 } });

  const stretch = [[0, 'Sit tall'], [.34, 'Reach'], [1.02, 'First side'], [1.83, 'Center'], [2.35, 'Other side'], [3.57, 'Reset']];
  add('Chair_Lower_Back_Stretch', stretch,
    [[0, 'Sit upright on the chair', 'Place both feet flat on the floor.'],
      [1.02, 'Reach overhead and bend sideways', 'Hold the seat with the other hand, then repeat to the opposite side.']], (t) => {
      const a = motion([0, .60, 1.02, 1.26, 1.63, 2.06, 2.48, 2.72, 3.09, 3.57],
        [0, 0, 1, 1, 0, 0, -1, -1, 0, 0], t);
      torso(v(0, .55, -.126), pitch(.06));
      world('Lumbar', roll(.18 * a));
      world('Chest', roll(.47 * a));
      world('Head', roll(.51 * a));
      for (const [side, s] of sides) {
        leg(side, v(s * .162, .074, .343), yaw(s * .12), v(s * .14, .88, .42));
        const at = t - (s > 0 ? 0 : 1.46);
        const amount = motion([.14, .88, 1.39, 1.91], [0, 1, 1, 0], at);
        const arc = roll(s * 3.61 * amount);
        const shoulder = point('Arm' + side);
        const seat = v(s * .209, .477, -.035);
        const wrist = seat.clone().sub(shoulder).applyQuaternion(arc).add(shoulder);
        arm(side, wrist, v(s * .62, .12, -.68).applyQuaternion(arc), (forearm) =>
          openHand(s, forearm.lerp(v(0, 0, 1), .50 * (1 - amount)),
            v(s * .55, 1, .45).applyQuaternion(arc)), true, v(0, 0, 1));
      }
    }, { equipment: '', bodyweightSupport: 'chair', fingers: '' });

  const raise = [[0, 'Tall kneel'], [.30, 'Lower'], [1.34, 'Catch'], [1.73, 'Push up'], [2.43, 'Raise'], [3.40, 'Reset']];
  const support = createSupportHands(bone);
  add('Floor_Glute-Ham_Raise', raise,
    [[0, 'Kneel with your ankles secured', 'Keep your trunk in line with your thighs.'],
      [1.34, 'Catch yourself with your hands', 'Use a light push from the floor before the hamstrings finish the return.']], (t) => {
      const a = motion([0, .30, 1.34, 1.65, 2.45, 3.4], [0, 0, 1, 1, .44, 0], t);
      const angle = .025 + 1.27 * a;
      const knee = v(0, .110, .007);
      const hip = knee.clone().addScaledVector(v(0, Math.cos(angle), Math.sin(angle)), bone('ShinL').position.length());
      torso(hip.add(v(0, .010, -.007)), pitch(angle), pitch(.88 * angle));
      for (const [side, s] of sides) {
        leg(side, v(s * .097, .093, -.407), pitch(2.94), v(s * .09, -.92, .27));
        const target = point('Arm' + side).add(v(s * .104, -.237 - .093 * a, .326));
        const hand = target.lerp(v(s * .209, palmHeight + .004, .825), a ** 2);
        arm(side, hand, v(s * .6, -.44, -.37), support.pose(s, v(s * .07, 0, 1), v(0, 1, 0)));
      }
    }, { equipment: '', bodyweightSupport: 'ankle-restraint', fingers: '', framing: 'floor' });
  entries['local:exercise:Floor_Glute-Ham_Raise']?.clip.tracks.push(...supportFingerNames.map((name) =>
    new THREE.QuaternionKeyframeTrack(name + '.quaternion', [0], bone(name).quaternion.toArray())));
  return entries;
}
