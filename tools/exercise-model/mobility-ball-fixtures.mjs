import * as THREE from 'three';
import { handAlong } from './hand-frame.mjs';

const foam = new THREE.MeshStandardMaterial({ color: 0x237d83, roughness: .91 });
const trim = new THREE.MeshStandardMaterial({ color: 0x113d44, roughness: .81 });
const leather = new THREE.MeshStandardMaterial({ color: 0xc55732, roughness: .83 });
const seam = new THREE.MeshStandardMaterial({ color: 0x4f2725, roughness: .78 });
const belt = new THREE.MeshStandardMaterial({ color: 0xd99c3f, roughness: .92 });
const panel = new THREE.MeshStandardMaterial({ color: 0x8196a3, transparent: true, opacity: .38, depthWrite: false });
const frame = new THREE.MeshStandardMaterial({ color: 0x526572, roughness: .79 });
const Y = new THREE.Vector3(0, 1, 0);

function mesh(root, name, geometry, material) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  root.add(object);
  return object;
}

function wall(root, { position, size }) {
  const [width, height, depth] = size;
  const face = mesh(root, 'Wall contact panel', new THREE.BoxGeometry(...size), panel);
  face.position.fromArray(position);
  const sideways = width < depth;
  const edge = sideways ? [.027, height, .022] : [.022, height, .027];
  for (const sign of [-1, 1]) {
    const upright = mesh(root, 'Wall edge', new THREE.BoxGeometry(...edge), frame);
    upright.position.copy(face.position);
    if (sideways) upright.position.z += sign * (depth / 2 - .011);
    else upright.position.x += sign * (width / 2 - .011);
  }
}

function roller(root, radius) {
  const length = .44;
  mesh(root, 'Foam roller', new THREE.CylinderGeometry(radius, radius, length, 32), foam);
  for (const sign of [-1, 1]) {
    const cap = mesh(root, 'Roller end ring', new THREE.TorusGeometry(radius - .011, .008, 9, 28), trim);
    cap.position.y = sign * length / 2;
    cap.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI * 2 * i / 10;
    const rib = mesh(root, 'Foam roller grip rib', new THREE.CylinderGeometry(.0025, .0025, length - .028, 6), trim);
    rib.position.set(radius * Math.cos(angle), 0, radius * Math.sin(angle));
  }
}

function medicineBall(root, radius) {
  mesh(root, 'Medicine ball', new THREE.SphereGeometry(radius, 32, 20), leather);
  for (let i = 0; i < 3; i++) {
    const line = mesh(root, 'Ball seam', new THREE.TorusGeometry(radius - .0005, .0018, 6, 40), seam);
    line.rotation.set(i === 0 ? Math.PI / 2 : 0, i === 2 ? Math.PI / 2 : 0, 0);
  }
}

function ankleStrap(root, scene, side) {
  const foot = scene.getObjectByName('Foot' + side);
  const wrists = ['L', 'R'].map((s) => scene.getObjectByName('Hand' + s));
  const wrap = mesh(root, 'Strap loop around forefoot', new THREE.TorusGeometry(.058, .006, 8, 24), belt);
  const tails = wrists.map(() => mesh(root, 'Strap tail', new THREE.BoxGeometry(.018, 1, .003), belt));
  return () => {
    wrap.position.copy(foot.localToWorld(new THREE.Vector3(0, -.03, .101)));
    wrap.quaternion.copy(foot.getWorldQuaternion(new THREE.Quaternion()));
    tails.forEach((tail, i) => {
      const attach = wrap.localToWorld(new THREE.Vector3((1 - 2 * i) * .051, .02, 0));
      const hand = wrists[i].localToWorld(handAlong(1 - 2 * i).multiplyScalar(.079));
      const direction = hand.sub(attach);
      tail.position.copy(attach).addScaledVector(direction, .5);
      tail.scale.y = direction.length();
      tail.quaternion.setFromUnitVectors(Y, direction.normalize());
    });
  };
}

// Call update after sampling the body pose. Pass the clip time in seconds to update(time).
export function createMobilityBallFixture(entry, scene, _bar) {
  const config = entry.mobilityBallFixture;
  const root = new THREE.Group();
  root.name = 'Mobility and medicine ball equipment';
  if (config.kind === 'wall') {
    wall(root, config);
    return { root, update() {} };
  }
  if (config.kind === 'strap') return { root, update: ankleStrap(root, scene, config.side) };
  if (config.wall) wall(root, config.wall);
  const prop = new THREE.Group();
  root.add(prop);
  if (config.kind === 'ball') medicineBall(prop, config.radius);
  else roller(prop, config.radius);
  const [position, quaternion] = entry.propClip.tracks.map((track) => track.createInterpolant());
  return { root, animated: prop, update(time) {
    prop.position.fromArray(position.evaluate(time));
    prop.quaternion.fromArray(quaternion.evaluate(time));
  } };
}
