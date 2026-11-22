import * as THREE from 'three';
import { createBarbell } from './barbell.mjs';

/**
 * Squat stand in meters, with its origin on the floor and its open front toward +Z.
 * hookHeight is the shaft center height, supported from 0.49 to 1.60 m inclusive.
 * The loaded bar lies along X with its center at (0, hookHeight, 0.100).
 * Hooks support the shaft at |X| = 0.565–0.635. Lift the shaft by at least 0.025 m
 * before moving it toward +Z over the lips. The plates start at |X| = 0.685.
 * With the bar unracked, |X| < 0.565, Z >= 0.040, and Y >= 0 is clear for the athlete.
 */
export function createSquatRack({ hookHeight = 1.38 } = {}) {
  if (!Number.isFinite(hookHeight) || hookHeight < 0.49 || hookHeight > 1.60) {
    throw new RangeError('hookHeight must be between 0.49 and 1.60 meters');
  }

  const rack = new THREE.Group();
  rack.name = 'Squat rack';
  const frame = new THREE.MeshStandardMaterial({ color: 0x575757, metalness: 0.25, roughness: 0.52 });
  const feet = new THREE.MeshStandardMaterial({ color: 0x363636, roughness: 0.9 });
  const hooks = new THREE.MeshStandardMaterial({ color: 0x434343, metalness: 0.25, roughness: 0.55 });
  const shaftCenterZ = 0.100;
  const shaftRadius = 0.01425;
  const shaftBottom = hookHeight - shaftRadius;
  const hookBackStart = 0.020;
  const hookBackDepth = shaftCenterZ - shaftRadius - hookBackStart;

  function addBox(name, material, width, height, depth, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    rack.add(mesh);
    return mesh;
  }

  addBox('Rear crossbar', frame, 1.200, 0.050, 0.060, 0, 0.040, -0.310);
  for (const x of [-0.600, 0.600]) {
    addBox('Floor runner', frame, 0.070, 0.050, 0.980, x, 0.040, 0.150);
    for (const z of [-0.310, 0.610]) {
      addBox('Rubber foot', feet, 0.070, 0.065, 0.100, x, 0.0325, z);
    }
    addBox('Upright', frame, 0.060, 1.660, 0.060, x, 0.895, 0);
    const brace = addBox('Rear brace', frame, 0.040, Math.hypot(0.240, 0.240), 0.040,
      x, 0.195, -0.145);
    brace.rotation.x = Math.PI / 4;

    addBox('Hook bed', hooks, 0.070, 0.020, 0.125, x, shaftBottom - 0.010, 0.0825);
    addBox('Hook back', hooks, 0.070, 0.075, hookBackDepth,
      x, shaftBottom + 0.0275, hookBackStart + hookBackDepth / 2);
    addBox('Hook lip', hooks, 0.070, 0.020 + shaftRadius, 0.024, x, hookHeight - shaftRadius / 2, 0.133);
  }

  const barbell = createBarbell();
  barbell.name = 'Barbell';
  barbell.position.set(0, hookHeight, shaftCenterZ);
  rack.add(barbell);
  return rack;
}
