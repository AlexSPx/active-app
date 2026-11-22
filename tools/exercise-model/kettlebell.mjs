import * as THREE from 'three';

/**
 * Kettlebell in meters, with the origin at the center of the horizontal grip.
 * The straight grip runs along local X from -0.105 to 0.105 m. Set the origin
 * 0.254 m above the floor to rest the bell upright.
 */
export function createKettlebell() {
  const kettlebell = new THREE.Group();
  const gripHalfLength = 0.105;
  const leftGrip = new THREE.Vector3(-gripHalfLength, 0, 0);
  const rightGrip = new THREE.Vector3(gripHalfLength, 0, 0);
  const handlePath = new THREE.CurvePath();
  handlePath.add(new THREE.CubicBezierCurve3(
    new THREE.Vector3(-0.066, -0.127, 0),
    new THREE.Vector3(-0.105, -0.100, 0),
    new THREE.Vector3(-0.166, 0, 0),
    leftGrip,
  ));
  handlePath.add(new THREE.LineCurve3(leftGrip, rightGrip));
  handlePath.add(new THREE.CubicBezierCurve3(
    rightGrip,
    new THREE.Vector3(0.166, 0, 0),
    new THREE.Vector3(0.105, -0.100, 0),
    new THREE.Vector3(0.066, -0.127, 0),
  ));
  const handle = new THREE.Mesh(
    new THREE.TubeGeometry(handlePath, 96, 0.0145, 24),
    new THREE.MeshStandardMaterial({ color: 0x737373, metalness: 0.4, roughness: 0.5 }),
  );
  handle.name = 'Handle';
  kettlebell.add(handle);

  const bell = new THREE.Mesh(
    new THREE.LatheGeometry([
      new THREE.Vector2(0, -0.254),
      new THREE.Vector2(0.052, -0.254),
      new THREE.Vector2(0.062, -0.250),
      new THREE.Vector2(0.076, -0.240),
      new THREE.Vector2(0.089, -0.223),
      new THREE.Vector2(0.096, -0.203),
      new THREE.Vector2(0.098, -0.181),
      new THREE.Vector2(0.095, -0.157),
      new THREE.Vector2(0.087, -0.135),
      new THREE.Vector2(0.074, -0.115),
      new THREE.Vector2(0.056, -0.098),
      new THREE.Vector2(0.042, -0.090),
      new THREE.Vector2(0, -0.090),
    ], 40),
    new THREE.MeshStandardMaterial({ color: 0x434343, metalness: 0.15, roughness: 0.8 }),
  );
  bell.name = 'Bell';
  kettlebell.add(bell);

  return kettlebell;
}
