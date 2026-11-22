import * as THREE from 'three';

/**
 * Loaded EZ curl bar in meters. The origin is the shaft midpoint, local X is the
 * overall bar axis, and the 28.5 mm shaft bends in the X/Z plane (Y = 0).
 * For either side s = ±1, endpoints run from the center toward the sleeve:
 *   Inner: (s*0.060, 0, 0.0075) to (s*0.150, 0, 0.0525).
 *   Outer: (s*0.180, 0, 0.0525) to (s*0.310, 0, -0.0125).
 * Grip centers are (s*0.105, 0, 0.030) and (s*0.245, 0, 0.020).
 * Outward unit axes are (s*2, 0, 1)/sqrt(5) and (s*2, 0, -1)/sqrt(5).
 * One 0.290 m diameter plate per side, centered at (s*0.470, 0, 0).
 * Place the shaft origin at Y = 0.145 for floor contact with local X horizontal.
 */
export function createEzCurlBar() {
  const bar = new THREE.Group();
  bar.name = 'EZ curl bar';
  const steel = new THREE.MeshStandardMaterial({ color: 0x868686, metalness: 0.5, roughness: 0.42 });
  const sleeveMaterial = new THREE.MeshStandardMaterial({ color: 0x656565, metalness: 0.48, roughness: 0.38 });
  const plateMaterial = new THREE.MeshStandardMaterial({ color: 0x414141, roughness: 0.83 });

  const bends = [
    [-0.430, 0], [-0.405, 0], [-0.325, -0.020], [-0.165, 0.060], [-0.045, 0],
    [0.045, 0], [0.165, 0.060], [0.325, -0.020], [0.405, 0], [0.430, 0],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));
  const shaftPath = new THREE.CurvePath();
  let start = bends[0];
  for (let i = 1; i < bends.length - 1; i++) {
    const bend = bends[i];
    const entry = bend.clone().lerp(bends[i - 1], 0.009 / bend.distanceTo(bends[i - 1]));
    const exit = bend.clone().lerp(bends[i + 1], 0.009 / bend.distanceTo(bends[i + 1]));
    shaftPath.add(new THREE.LineCurve3(start, entry));
    shaftPath.add(new THREE.QuadraticBezierCurve3(entry, bend, exit));
    start = exit;
  }
  shaftPath.add(new THREE.LineCurve3(start, bends[bends.length - 1]));
  const shaft = new THREE.Mesh(new THREE.TubeGeometry(shaftPath, 160, 0.01425, 24), steel);
  shaft.name = 'Shaft';
  bar.add(shaft);

  const sleeve = new THREE.CylinderGeometry(0.025, 0.025, 0.190, 24);
  const shoulder = new THREE.CylinderGeometry(0.034, 0.034, 0.018, 24);
  const collar = new THREE.CylinderGeometry(0.032, 0.032, 0.025, 24);
  const plate = new THREE.LatheGeometry([
    [0.025, -0.023], [0.049, -0.023], [0.056, -0.017], [0.120, -0.017],
    [0.126, -0.023], [0.140, -0.023], [0.145, -0.018], [0.145, 0.018],
    [0.140, 0.023], [0.126, 0.023], [0.120, 0.017], [0.056, 0.017],
    [0.049, 0.023], [0.025, 0.023], [0.025, -0.023],
  ].map(([radius, axial]) => new THREE.Vector2(radius, axial)), 48);

  function addLoadPart(name, geometry, material, x) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.rotation.z = Math.PI / 2;
    mesh.position.x = x;
    bar.add(mesh);
  }

  for (const side of [-1, 1]) {
    addLoadPart('Sleeve', sleeve, sleeveMaterial, side * 0.505);
    addLoadPart('Sleeve shoulder', shoulder, sleeveMaterial, side * 0.438);
    addLoadPart('Plate', plate, plateMaterial, side * 0.470);
    addLoadPart('Lock collar', collar, sleeveMaterial, side * 0.5055);
  }

  return bar;
}
