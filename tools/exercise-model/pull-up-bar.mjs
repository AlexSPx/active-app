import * as THREE from 'three';

/**
 * Freestanding pull-up bar in meters, with local Y = 0 at the floor.
 * The shaft is centered at (0, 2.300, 0) and usable from X = -0.731 to 0.731 m.
 */
export function createPullUpBar() {
  const bar = new THREE.Group();
  const shaftHeight = 2.300;
  const postOffset = 0.790;
  const footHeight = 0.050;
  const postTop = 2.350;
  const shaftMaterial = new THREE.MeshStandardMaterial({ color: 0x858585, metalness: 0.5, roughness: 0.42 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x515151, metalness: 0.25, roughness: 0.55 });

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0145, 0.0145, postOffset * 2, 24), shaftMaterial,
  );
  shaft.name = 'Shaft';
  shaft.rotation.z = Math.PI / 2;
  shaft.position.y = shaftHeight;
  bar.add(shaft);

  const post = new THREE.BoxGeometry(0.050, postTop - footHeight, 0.050);
  const foot = new THREE.BoxGeometry(0.070, footHeight, 1.180);
  const collar = new THREE.CylinderGeometry(0.032, 0.032, 0.074, 24);
  for (const side of [-1, 1]) {
    const upright = new THREE.Mesh(post, frameMaterial);
    upright.name = 'Upright';
    upright.position.set(side * postOffset, (postTop + footHeight) / 2, 0);
    bar.add(upright);

    const base = new THREE.Mesh(foot, frameMaterial);
    base.name = 'Foot';
    base.position.set(side * postOffset, footHeight / 2, -0.100);
    bar.add(base);

    const joint = new THREE.Mesh(collar, frameMaterial);
    joint.name = 'Shaft collar';
    joint.rotation.z = Math.PI / 2;
    joint.position.set(side * 0.768, shaftHeight, 0);
    bar.add(joint);
  }

  return bar;
}
