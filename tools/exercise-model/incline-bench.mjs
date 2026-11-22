import * as THREE from 'three';

/**
 * Incline bench in meters, with its origin on the floor below the backrest hinge.
 * The seat surface is Y = 0.430, X = ±0.140, Z from -0.380 to -0.025.
 * The backrest rises toward +Z at angle radians (default π/6, range 0 to π/3).
 * Its hinge is (0, 0.400, 0). For |X| <= 0.140 and 0.035 <= s <= 0.855,
 * the backrest surface is (X, 0.400 + 0.030 cos(angle) + s sin(angle),
 * s cos(angle) - 0.030 sin(angle)). The outward normal is (0, cos(angle), -sin(angle)).
 */
export function createInclineBench({ angle = Math.PI / 6 } = {}) {
  if (!Number.isFinite(angle) || angle < 0 || angle > Math.PI / 3) {
    throw new RangeError('angle must be between 0 and π/3 radians');
  }

  const bench = new THREE.Group();
  bench.name = 'Incline bench';
  const pad = new THREE.MeshStandardMaterial({ color: 0x434343, roughness: 0.88 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x575757, metalness: 0.25, roughness: 0.52 });
  const feet = new THREE.MeshStandardMaterial({ color: 0x363636, roughness: 0.9 });

  function addBox(parent, name, material, width, height, depth, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  for (const z of [-0.290, 0.680]) {
    addBox(bench, 'Crossbar', frame, 0.440, 0.050, 0.080, 0, 0.040, z);
    for (const x of [-0.210, 0.210]) {
      addBox(bench, 'Rubber foot', feet, 0.060, 0.070, 0.100, x, 0.035, z);
    }
  }
  addBox(bench, 'Base rail', frame, 0.060, 0.065, 0.970, 0, 0.0975, 0.195);
  addBox(bench, 'Seat post', frame, 0.070, 0.195, 0.070, 0, 0.2275, -0.235);
  addBox(bench, 'Seat rail', frame, 0.060, 0.042, 0.340, 0, 0.345, -0.180);
  addBox(bench, 'Seat pad', pad, 0.280, 0.064, 0.355, 0, 0.398, -0.2025);
  addBox(bench, 'Hinge bracket', frame, 0.060, 0.088, 0.044, 0, 0.368, -0.018);

  const backrest = new THREE.Group();
  backrest.name = 'Backrest';
  backrest.position.y = 0.400;
  backrest.rotation.x = -angle;
  bench.add(backrest);
  addBox(backrest, 'Backrest pad', pad, 0.280, 0.064, 0.820, 0, -0.002, 0.445);
  addBox(backrest, 'Backrest rail', frame, 0.060, 0.055, 0.735, 0, -0.0615, 0.3425);

  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.090, 16), frame);
  pivot.name = 'Hinge pin';
  pivot.position.copy(backrest.position);
  pivot.rotation.z = Math.PI / 2;
  bench.add(pivot);

  const lower = new THREE.Vector3(0, 0.130, 0.395);
  const upper = new THREE.Vector3(0, -0.082, 0.560).applyEuler(backrest.rotation).add(backrest.position);
  const strut = addBox(bench, 'Backrest strut', frame, 0.038, lower.distanceTo(upper), 0.038,
    0, (lower.y + upper.y) / 2, (lower.z + upper.z) / 2);
  strut.rotation.x = Math.atan2(upper.z - lower.z, upper.y - lower.y);
  return bench;
}
