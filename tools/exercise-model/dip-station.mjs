import * as THREE from 'three';

/**
 * Freestanding dip station in meters, with Y = 0 at the floor and +Z at the open end.
 * The 30 mm grips run along +Z at X = ±0.260 and Y = 1.150. Use Z = -0.290 to 0.420
 * for hand contact, leaving room at the mounts and tips. Z = 0.100 is a starting grip target.
 * The standing and bent-knee envelope |X| <= 0.215, Y >= 0, Z >= -0.670 is clear up
 * through the open end. With the athlete facing +Z, keep tucked heels inside that envelope.
 */
export function createDipStation() {
  const station = new THREE.Group();
  station.name = 'Dip station';
  const frame = new THREE.MeshStandardMaterial({ color: 0x545454, metalness: 0.25, roughness: 0.56 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x373737, roughness: 0.88 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.46, roughness: 0.43 });

  function addPart(name, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    station.add(mesh);
    return mesh;
  }

  const runner = new THREE.BoxGeometry(0.065, 0.055, 1.310);
  const foot = new THREE.BoxGeometry(0.082, 0.058, 0.100);
  const upright = new THREE.BoxGeometry(0.060, 1.100, 0.060);
  const brace = new THREE.BoxGeometry(0.044, Math.hypot(0.275, 0.250), 0.044);
  const mount = new THREE.CylinderGeometry(0.027, 0.027, 0.104, 24);
  const grip = new THREE.CylinderGeometry(0.015, 0.015, 0.920, 24);

  addPart('Rear crossbar', new THREE.BoxGeometry(0.520, 0.050, 0.055), frame, 0, 0.0475, -0.720);
  for (const x of [-0.260, 0.260]) {
    addPart('Floor runner', runner, frame, x, 0.0445, -0.085);
    for (const z of [-0.725, 0.555]) {
      addPart('Rubber foot', foot, rubber, x, 0.029, z);
    }
    addPart('Upright', upright, frame, x, 0.620, -0.405);
    addPart('Rear brace', brace, frame, x, 0.2075, -0.530).rotation.x = Math.atan2(0.250, 0.275);
    addPart('Grip mount', mount, steel, x, 1.150, -0.405).rotation.x = Math.PI / 2;
    addPart('Grip', grip, steel, x, 1.150, 0.007).rotation.x = Math.PI / 2;
  }

  return station;
}
