import * as THREE from 'three';

const steel = new THREE.MeshStandardMaterial({ color: 0x586069, metalness: .4, roughness: .55 });
const pad = new THREE.MeshStandardMaterial({ color: 0x343a43, roughness: .82 });
const wood = new THREE.MeshStandardMaterial({ color: 0x926b48, roughness: .85 });
const ball = new THREE.MeshStandardMaterial({ color: 0x577990, roughness: .72 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x343b44, roughness: .85 });
const elastic = new THREE.MeshStandardMaterial({ color: 0xe3873b, roughness: .74 });
const vertical = new THREE.Vector3(0, 1, 0);

function mesh(parent, name, geometry, material, position = [0, 0, 0]) {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.position.fromArray(position);
  parent.add(part);
  return part;
}

function box(parent, name, size, position, material = steel) {
  return mesh(parent, name, new THREE.BoxGeometry(...size), material, position);
}

function cylinder(parent, name, radius, length, material, position) {
  return mesh(parent, name, new THREE.CylinderGeometry(radius, radius, length, 24), material, position);
}

function plate(parent, radius, position = [0, 0, 0]) {
  const profile = [[.027, -.018], [radius, -.018], [radius, .018], [.027, .018], [.027, -.018]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  return mesh(parent, 'Weight plate', new THREE.LatheGeometry(profile, 36), rubber, position);
}

function shape(parent, { kind, position, size, angle = 0, handle }) {
  switch (kind) {
    case 'box':
    case 'block':
    case 'wall':
      box(parent, kind, size, position, kind === 'wall' ? pad : wood).rotation.x = angle;
      break;
    case 'ball':
      mesh(parent, 'Exercise ball', new THREE.SphereGeometry(size, 32, 18), ball, position);
      break;
    case 'medicine-ball':
      mesh(parent, 'Medicine ball', new THREE.SphereGeometry(size, 24, 16), rubber, position);
      break;
    case 'bosu': {
      const dome = new THREE.SphereGeometry(size, 32, 12, 0, 2 * Math.PI, 0, Math.PI / 2);
      mesh(parent, 'Balance trainer dome', dome, ball, position).scale.y = .53;
      cylinder(parent, 'Balance trainer base', size + .015, .04, pad, [position[0], .025, position[2]]);
      break;
    }
    case 'plate':
      plate(parent, size, position).rotation.x = angle;
      break;
    case 'plate-pair':
      for (const sign of [-1, 1]) plate(parent, size, [position[0], position[1] + sign * .019, position[2]]);
      break;
    case 'v-handle': {
      const [x, y, z] = position;
      for (const sign of [-1, 1]) {
        const grip = cylinder(parent, 'V grip', .016, .23, steel, [x + sign * .098, y, z]);
        grip.quaternion.setFromUnitVectors(vertical, new THREE.Vector3(sign * .61, 0, .792).normalize());
      }
      cylinder(parent, 'V handle hanger', .018, .14, steel, [x, y + .068, z - .106]);
      box(parent, 'V handle saddle', [.105, .038, .098], [x, y + .129, z], steel);
      break;
    }
    case 'pivot':
      box(parent, 'Landmine base', [.35, .06, .34], position, pad);
      break;
    case 'landmine':
      cylinder(parent, 'Pivoting shaft', .015, 1.72, steel, [-.82, 0, 0]).rotation.z = Math.PI / 2;
      plate(parent, .18, [-.18, 0, 0]).rotation.z = Math.PI / 2;
      cylinder(parent, 'Sleeve', .025, .24, steel, [-.08, 0, 0]).rotation.z = Math.PI / 2;
      if (handle) cylinder(parent, 'Landmine cross handle', .017, .30, steel).rotation.x = Math.PI / 2;
      break;
    case 'preacher': {
      const [x, y, z] = position;
      box(parent, 'Preacher arm pad', [.54, .067, .41], position, pad).rotation.x = .87 * (angle || 1);
      box(parent, 'Preacher pad post', [.075, y, .075], [x, y / 2, z], steel);
      box(parent, 'Preacher pad base', [.48, .055, .61], [x, .03, z], rubber);
      break;
    }
    case 'dumbbell':
      cylinder(parent, 'Balance handle', .015, .37, steel, position).rotation.z = Math.PI / 2;
      for (const side of [-1, 1]) {
        cylinder(parent, 'Dumbbell head', .086, .088, rubber,
          [position[0] + side * .142, position[1], position[2]]).rotation.z = Math.PI / 2;
      }
      break;
  }
}

function followBar(root, bar, load) {
  const updaters = [-1, 1].map((side) => {
    const curl = load === 'curl-bands';
    const sleeve = new THREE.Vector3(side * (curl ? .48 : .80), 0, 0);
    const top = () => bar.localToWorld(sleeve.clone());
    if (load === 'chains' || load === 'suspended') {
      if (load === 'suspended') box(root, 'Chain suspension mount', [.12, 1.98, .15],
        [sleeve.x, .99, -.32], pad);
      const links = Array.from({ length: 46 }, () =>
        mesh(root, 'Chain link', new THREE.TorusGeometry(.021, .005, 7, 12), steel));
      return () => {
        const start = top();
        links.forEach((link, i) => {
          if (load === 'suspended') {
            const anchor = new THREE.Vector3(sleeve.x, 1.97, -.32);
            const fraction = i * .032 / anchor.distanceTo(start);
            link.visible = fraction <= 1;
            link.position.copy(start).lerp(anchor, Math.min(fraction, 1));
          } else {
            const y = start.y - i * .032;
            const slack = Math.max(0, .027 - y);
            link.position.set(start.x + side * Math.min(.22, slack * .61), Math.max(.027, y),
              start.z + Math.max(0, slack - .34) * .54);
          }
          link.rotation.set(link.position.y < .028 ? Math.PI / 2 : 0, i % 2 * Math.PI / 2, 0);
        });
      };
    }
    const anchor = new THREE.Vector3(side * (curl ? .14 : .80), load === 'assisted' ? 1.98 : .063, 0);
    if (!curl) {
      const height = load === 'assisted' ? 1.98 : .07;
      box(root, load === 'assisted' ? 'Overhead band mount' : 'Floor band anchor',
        [.12, height, .14], [anchor.x, height / 2, anchor.z], pad);
    }
    const band = cylinder(root, 'Bar resistance band', .012, 1, elastic);
    return () => {
      const end = top();
      const direction = end.clone().sub(anchor);
      band.position.copy(anchor).lerp(end, .5);
      band.scale.y = direction.length();
      band.quaternion.setFromUnitVectors(vertical, direction.normalize());
    };
  });
  return () => updaters.forEach((update) => update());
}

export function createSupplementalFixture({ fixtures = [], animatedFixture, barLoad }, bar) {
  const root = new THREE.Group();
  root.name = 'Additional exercise equipment';
  const animated = new THREE.Group();
  for (const fixture of fixtures) shape(root, fixture);
  if (animatedFixture) {
    shape(animated, { position: [0, 0, 0], ...animatedFixture });
    root.add(animated);
  }
  return { root, animated, update: barLoad ? followBar(root, bar, barLoad) : () => {} };
}
