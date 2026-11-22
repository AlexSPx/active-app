import * as THREE from 'three';

export function createDumbbell() {
  const dumbbell = new THREE.Group();
  const gripLength = 0.132;
  const headHalfWidth = 0.023;
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, gripLength + 0.002, 16),
    new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.45, roughness: 0.38 }),
  );
  grip.rotation.z = Math.PI / 2;
  dumbbell.add(grip);

  const headGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(0, -headHalfWidth),
    new THREE.Vector2(0.050, -headHalfWidth),
    new THREE.Vector2(0.055, -0.018),
    new THREE.Vector2(0.055, 0.018),
    new THREE.Vector2(0.050, headHalfWidth),
    new THREE.Vector2(0, headHalfWidth),
  ], 6);
  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0x434343, roughness: 0.85, flatShading: true,
  });
  const headOffset = gripLength / 2 + headHalfWidth;
  for (const x of [-headOffset, headOffset]) {
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.rotation.z = Math.PI / 2;
    head.position.x = x;
    dumbbell.add(head);
  }

  return dumbbell;
}
