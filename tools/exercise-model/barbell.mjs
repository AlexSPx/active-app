import * as THREE from 'three';

/**
 * Loaded Olympic bar, in meters. Local X follows the shaft and the origin is its midpoint.
 * With the shaft horizontal, place its origin 0.225 m above the floor.
 */
export function createBarbell() {
  const barbell = new THREE.Group();
  const shaftMaterial = new THREE.MeshStandardMaterial({ color: 0x858585, metalness: 0.5, roughness: 0.42 });
  const sleeveMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5, roughness: 0.36 });
  const plateMaterial = new THREE.MeshStandardMaterial({ color: 0x434343, roughness: 0.85 });
  const collarMaterial = new THREE.MeshStandardMaterial({ color: 0x515151, metalness: 0.25, roughness: 0.55 });

  function addPart(name, geometry, material, x = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.rotation.z = Math.PI / 2;
    mesh.position.x = x;
    barbell.add(mesh);
  }

  addPart('Shaft', new THREE.CylinderGeometry(0.01425, 0.01425, 1.31, 24), shaftMaterial);
  const sleeve = new THREE.CylinderGeometry(0.025, 0.025, 0.445, 24);
  const shoulder = new THREE.CylinderGeometry(0.043, 0.043, 0.030, 24);
  const collar = new THREE.CylinderGeometry(0.036, 0.036, 0.036, 24);
  const plate = new THREE.LatheGeometry([
    new THREE.Vector2(0.0255, -0.030),
    new THREE.Vector2(0.057, -0.030),
    new THREE.Vector2(0.064, -0.023),
    new THREE.Vector2(0.199, -0.023),
    new THREE.Vector2(0.205, -0.030),
    new THREE.Vector2(0.218, -0.030),
    new THREE.Vector2(0.225, -0.023),
    new THREE.Vector2(0.225, 0.023),
    new THREE.Vector2(0.218, 0.030),
    new THREE.Vector2(0.205, 0.030),
    new THREE.Vector2(0.199, 0.023),
    new THREE.Vector2(0.064, 0.023),
    new THREE.Vector2(0.057, 0.030),
    new THREE.Vector2(0.0255, 0.030),
    new THREE.Vector2(0.0255, -0.030),
  ], 48);

  for (const side of [-1, 1]) {
    addPart('Sleeve', sleeve, sleeveMaterial, side * 0.8775);
    addPart('Sleeve shoulder', shoulder, sleeveMaterial, side * 0.670);
    addPart('Plate', plate, plateMaterial, side * 0.715);
    addPart('Lock collar', collar, collarMaterial, side * 0.763);
  }

  return barbell;
}
