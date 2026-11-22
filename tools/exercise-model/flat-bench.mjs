import * as THREE from 'three';

/**
 * Flat bench, in meters. Local Z follows the pad and the origin is centered at floor level.
 * The pad's flat surface is at local Y = 0.430 m.
 */
export function createFlatBench() {
  const bench = new THREE.Group();
  const padMaterial = new THREE.MeshStandardMaterial({ color: 0x434343, roughness: 0.88 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x575757, metalness: 0.25, roughness: 0.52 });
  const footMaterial = new THREE.MeshStandardMaterial({ color: 0x363636, roughness: 0.9 });

  const halfWidth = 0.134;
  const halfLength = 0.594;
  const corner = 0.030;
  const outline = new THREE.Shape();
  outline.moveTo(-halfWidth + corner, -halfLength);
  outline.lineTo(halfWidth - corner, -halfLength);
  outline.quadraticCurveTo(halfWidth, -halfLength, halfWidth, -halfLength + corner);
  outline.lineTo(halfWidth, halfLength - corner);
  outline.quadraticCurveTo(halfWidth, halfLength, halfWidth - corner, halfLength);
  outline.lineTo(-halfWidth + corner, halfLength);
  outline.quadraticCurveTo(-halfWidth, halfLength, -halfWidth, halfLength - corner);
  outline.lineTo(-halfWidth, -halfLength + corner);
  outline.quadraticCurveTo(-halfWidth, -halfLength, -halfWidth + corner, -halfLength);

  const pad = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, {
    depth: 0.058, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 4,
  }), padMaterial);
  pad.name = 'Pad';
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.366;
  bench.add(pad);

  function addBox(name, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    bench.add(mesh);
  }

  const upright = new THREE.BoxGeometry(0.070, 0.270, 0.070);
  const crossbar = new THREE.BoxGeometry(0.440, 0.050, 0.080);
  const foot = new THREE.BoxGeometry(0.060, 0.070, 0.100);
  addBox('Pad rail', new THREE.BoxGeometry(0.060, 0.060, 0.980), frameMaterial, 0, 0.333, 0);
  for (const z of [-0.450, 0.450]) {
    addBox('Upright', upright, frameMaterial, 0, 0.190, z);
    addBox('Crossbar', crossbar, frameMaterial, 0, 0.040, z);
    for (const x of [-0.210, 0.210]) {
      addBox('Rubber foot', foot, footMaterial, x, 0.035, z);
    }
  }

  return bench;
}
