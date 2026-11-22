import * as THREE from 'three';
import { createFlatBench } from './flat-bench.mjs';

const steel = new THREE.MeshStandardMaterial({ color: 0x747c86, metalness: .43, roughness: .43 });
const dark = new THREE.MeshStandardMaterial({ color: 0x30383e, roughness: .84 });
const accent = new THREE.MeshStandardMaterial({ color: 0x9b5733, metalness: .19, roughness: .63 });
const wood = new THREE.MeshStandardMaterial({ color: 0x79634e, roughness: .88 });
const concrete = new THREE.MeshStandardMaterial({ color: 0x96928b, roughness: .96, flatShading: true });
const fabric = new THREE.MeshStandardMaterial({ color: 0x776d4f, roughness: 1 });
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = v(0, 1, 0);
const signs = [-1, 1];

function mesh(root, name, geometry, material, at) {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.position.copy(at);
  root.add(part);
  return part;
}

const box = (root, name, size, at, material = steel) =>
  mesh(root, name, new THREE.BoxGeometry(...size), material, v(...at));

function cylinder(root, name, radius, length, at, axis = Y, material = steel) {
  const part = mesh(root, name, new THREE.CylinderGeometry(radius, radius, length, 32), material, v(...at));
  part.quaternion.setFromUnitVectors(Y, axis.clone().normalize());
  return part;
}

function align(part, from, to) {
  const direction = to.clone().sub(from);
  part.position.copy(from).addScaledVector(direction, .5);
  part.scale.y = direction.length();
  part.quaternion.setFromUnitVectors(Y, direction.normalize());
}

function beam(root, name, from, to, width = .04, material = steel) {
  const part = box(root, name, [width, 1, width], [0, 0, 0], material);
  align(part, v(...from), v(...to));
  return part;
}

function plates(root, at, radius, axis = Y, count = 2) {
  for (let i = 0; i < count; i++) {
    const point = v(...at).addScaledVector(axis, (i - (count - 1) / 2) * .040);
    cylinder(root, 'Weight plate', radius - i * .003, .036, [...point], axis, dark);
  }
}

function tire(root, radius, height) {
  const profile = [[radius * .53, -.39], [radius * .63, -.50], [radius * .91, -.50],
    [radius * .98, -.39], [radius * .985, .38], [radius * .91, .50],
    [radius * .63, .50], [radius * .53, .39], [radius * .53, -.39]];
  mesh(root, 'Tire carcass', new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y * height)), 64), dark, v());
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16;
    for (const s of signs) {
      const lug = box(root, 'Tread lug', [.064, height * .45, .035],
        [Math.sin(angle) * (radius - .014), s * .061, Math.cos(angle) * (radius - .014)], dark);
      lug.rotation.set(0, angle, s * .24);
    }
  }
}

function chain(root, endpoint) {
  const length = 1.27;
  const spacing = .037;
  const links = Array.from({ length: 35 }, (_, i) => {
    const part = mesh(root, 'Chain link', new THREE.TorusGeometry(.013, .0032, 8, 14), steel, v());
    part.scale.y = 1.55;
    part.rotation.y = (i % 2) * Math.PI / 2;
    return part;
  });
  return () => {
    const top = endpoint();
    links.forEach((link, i) => {
      const drop = Math.abs(i * spacing - length / 2);
      const distance = length / 2 - drop;
      const branch = i < 17 ? -1 : 1;
      const slack = Math.max(0, distance - top.y + .024);
      link.position.set(top.x + branch * (.012 + distance * .014) + Math.sin(slack * 25) * .055,
        Math.max(.023, top.y - distance), top.z + slack * branch * .8);
      link.rotation.x = slack > 0 ? Math.PI / 2 : 0;
    });
  };
}

function sample(clip, prop) {
  const [position, quaternion] = clip.tracks.map((track) => track.createInterpolant());
  return (t) => {
    prop.position.fromArray(position.evaluate(t));
    prop.quaternion.fromArray(quaternion.evaluate(t));
  };
}

export function createFinalStrengthFixture(entry, _scene, _bar) {
  const { kind } = entry.finalStrengthFixture;
  const root = new THREE.Group();
  root.name = entry.name + ' equipment';
  const prop = new THREE.Group();
  prop.name = entry.name + ' implement';
  root.add(prop);
  const second = new THREE.Group();
  if (entry.secondPropClip) root.add(second);
  const x = v(1, 0, 0);
  const z = v(0, 0, 1);
  let follow = () => {};

  switch (kind) {
    case 'axle':
      cylinder(prop, 'Thick axle', .027, 1.96, [0, 0, 0], x);
      for (const s of signs) plates(prop, [s * .791, 0, 0], .225, x, 3);
      break;
    case 'car': {
      const pivot = 1.715;
      box(root, 'Pivot base', [1.52, .08, .38], [0, .04, pivot], dark);
      for (const s of signs) {
        box(root, 'Pivot pedestal', [.16, .265, .27], [s * .58, .1325, pivot]);
        cylinder(root, 'Pivot pin', .043, .23, [s * .58, .285, pivot], x, accent);
        beam(prop, 'Car deadlift lever', [s * .58, 0, 0], [s * .58, 0, 1.62], .095);
        beam(prop, 'Handle mount', [s * .58, 0, 0], [s * .355, 0, 0], .047);
        cylinder(prop, 'Neutral handle', .019, .26, [s * .355, 0, 0], z, dark);
        cylinder(prop, 'Load tire', .255, .20, [s * .58, .267, 1.16], x, dark);
        cylinder(prop, 'Wheel hub', .128, .216, [s * .58, .267, 1.16], x);
      }
      box(prop, 'Axle cradle', [1.22, .07, .37], [0, .048, 1.16], accent);
      break;
    }
    case 'trap':
    case 'rickshaw': {
      const rickshaw = kind === 'rickshaw';
      const w = rickshaw ? .372 : .32;
      for (const s of signs) {
        cylinder(prop, 'Neutral handle', .016, .265, [s * w, 0, 0], z);
        if (rickshaw) {
          for (const end of signs) {
            beam(prop, 'Handle riser', [s * w, 0, end * .13], [s * w, -.196, end * .34]);
            box(prop, 'Frame skid', [.14, .028, .15], [s * w, -.221, end * .41], dark);
          }
          box(prop, 'Rickshaw rail', [.066, .05, .98], [s * w, -.192, 0]);
          plates(prop, [s * w, -.118, -.36], .146, Y, 3);
          cylinder(prop, 'Plate post', .022, .18, [s * w, -.112, -.36]);
        } else {
          for (const end of signs) {
            beam(prop, 'Hex frame', [s * w, 0, end * .13], [s * .176, 0, end * .36], .032);
          }
          cylinder(prop, 'Sleeve', .024, .41, [s * .56, 0, 0], x);
          plates(prop, [s * .64, 0, 0], .225, x);
        }
      }
      for (const end of rickshaw ? [-1] : signs) {
        box(prop, rickshaw ? 'Rear cross rail' : 'Hex crossbar', [rickshaw ? .80 : .36, .036, .036],
          [0, rickshaw ? -.192 : 0, end * .36]);
      }
      break;
    }
    case 'farmer':
      for (const hand of [prop, second]) {
        cylinder(hand, 'Carry handle', .018, .264, [0, 0, 0], z);
        for (const end of signs) {
          box(hand, 'Handle mount', [.044, .105, .048], [0, -.052, end * .118]);
          plates(hand, [0, -.109, end * .362], .125, z);
        }
        cylinder(hand, 'Carry shaft', .026, .85, [0, -.109, 0], z);
      }
      break;
    case 'yoke':
      cylinder(prop, 'Shoulder crossbar', .039, 1.02, [0, 0, 0], x);
      for (const s of signs) {
        box(prop, 'Yoke post', [.068, 1.285, .068], [s * .46, -.614, 0]);
        box(prop, 'Yoke skid', [.122, .048, .77], [s * .46, -1.261, 0], dark);
        for (const end of signs) {
          plates(prop, [s * .46, -1.194, end * .284], .134, Y, 2);
          cylinder(prop, 'Loading pin', .022, .195, [s * .46, -1.14, end * .284]);
        }
      }
      break;
    case 'wheel': {
      const pivot = v(1.25, .65, 0);
      cylinder(root, 'Fixed pivot column', .091, .65, [1.25, .325, 0], Y, dark);
      cylinder(root, 'Pivot base', .29, .052, [1.25, .026, 0], Y, accent);
      const shaft = box(root, 'Pivoting wheel beam', [.071, 1, .071], [0, 0, 0], accent);
      cylinder(prop, 'Elbow cradle', .041, .51, [0, .015, 0], x);
      const basket = new THREE.Group();
      basket.position.set(.64, -.63, -.13);
      prop.add(basket);
      box(basket, 'Weight basket', [.46, .074, .38], [0, 0, 0], dark);
      plates(basket, [0, .121, 0], .162, Y, 4);
      beam(prop, 'Basket hanger', [.64, 0, -.13], [.64, -.65, -.13]);
      follow = () => align(shaft, pivot, prop.position);
      break;
    }
    case 'trainer':
      cylinder(prop, 'Loading pin', .027, .45, [0, 0, 0]);
      plates(prop, [0, -.063, 0], .151, Y, 5);
      cylinder(prop, 'Trainer foot', .086, .048, [0, -.201, 0], Y, dark);
      break;
    case 'stone':
      mesh(prop, 'Atlas stone', new THREE.IcosahedronGeometry(.216, 3), concrete, v());
      box(root, 'Stone platform', [.67, 1.054, .49], [0, .527, 1.105], wood);
      break;
    case 'keg':
      mesh(prop, 'Keg shell', new THREE.LatheGeometry([
        [.137, -.259], [.16, -.248], [.171, -.14], [.18, 0], [.171, .14], [.16, .248], [.137, .259],
      ].map(([r, y]) => new THREE.Vector2(r, y)), 48), steel, v());
      for (const s of signs) {
        cylinder(prop, 'Keg end cap', .143, .019, [0, s * .245, 0], Y, dark);
        for (const side of signs) box(prop, 'Rim handle', [.151, .037, .025], [0, s * .23, side * .133]);
      }
      box(root, 'Keg platform', [.70, 1.038, .49], [0, .519, 1.118], wood);
      break;
    case 'sandbag': {
      const sack = mesh(prop, 'Sandbag', new THREE.SphereGeometry(1, 28, 20), fabric, v());
      sack.scale.set(.278, .128, .181);
      for (const s of signs) box(prop, 'Sandbag seam', [.015, .13, .18], [s * .237, -.014, 0], dark);
      box(root, 'Sandbag platform', [.75, 1.052, .49], [0, .526, 1.13], wood);
      break;
    }
    case 'stairs':
      for (let i = 0; i < 3; i++) {
        const height = .432 * (i + 1);
        box(root, 'Power stair ' + (i + 1), [.69, height, .435], [0, height / 2, 1.075 + .435 * i], wood);
      }
      box(prop, 'Stair implement', [.36, .259, .29], [0, -.185, 0], dark);
      for (const s of signs) box(prop, 'Handle upright', [.035, .09, .04], [s * .147, -.06, 0]);
      cylinder(prop, 'Top handle', .019, .33, [0, 0, 0], x);
      break;
    case 'log':
      cylinder(prop, 'Center log section', .145, .30, [0, 0, 0], x, accent);
      for (const s of signs) {
        cylinder(prop, 'Outer log section', .145, .38, [s * .511, 0, 0], x, accent);
        for (const rail of signs) box(prop, 'Grip cutout wall', [.174, .142, .028], [s * .237, 0, rail * .124], accent);
        cylinder(prop, 'Neutral handle', .021, .242, [s * .237, 0, 0], z);
        cylinder(prop, 'Log sleeve', .026, .21, [s * .778, 0, 0], x);
        plates(prop, [s * .805, 0, 0], .14, x);
      }
      break;
    case 'circus':
      cylinder(prop, 'Oversized handle', .027, .27, [0, 0, 0], x);
      for (const s of signs) cylinder(prop, 'Circus bell head', .16, .177, [s * .222, 0, 0], x, dark);
      break;
    case 'chains': {
      const updates = [prop, second].flatMap((handle) => {
        cylinder(handle, 'Pronated chain handle', .018, .148, [0, 0, 0], x, dark);
        for (const s of signs) beam(handle, 'Handle triangle', [s * .074, 0, 0], [0, -.12, 0], .015);
        return [chain(root, () => handle.position.clone().add(v(0, -.12, 0)))];
      });
      follow = () => updates.forEach((update) => update());
      break;
    }
    case 'neck-plate':
      cylinder(prop, 'Neck resistance plate', .131, .028, [0, 0, 0], Y, dark);
      cylinder(prop, 'Plate hub', .049, .033, [0, 0, 0], Y);
      break;
    case 'harness': {
      const strap = mesh(prop, 'Head harness band', new THREE.TorusGeometry(.100, .011, 10, 36), dark, v());
      strap.rotation.x = Math.PI / 2;
      const top = mesh(prop, 'Crown strap', new THREE.TorusGeometry(.096, .009, 8, 32, Math.PI), dark, v());
      top.rotation.y = Math.PI / 2;
      const load = new THREE.Group();
      root.add(load);
      plates(load, [0, 0, 0], .122, Y, 1);
      const straps = signs.map(() => box(root, 'Harness drop strap', [.019, 1, .007], [0, 0, 0], dark));
      follow = () => {
        const start = v(0, -.056, .080).applyQuaternion(prop.quaternion).add(prop.position);
        load.position.copy(start).add(v(0, -.49, .045));
        straps.forEach((strap, i) => align(strap, start.clone().add(v(signs[i] * .09, 0, 0)),
          load.position.clone().add(v(signs[i] * .017, .023, 0))));
      };
      break;
    }
    case 'cambered':
      for (const s of signs) {
        cylinder(prop, 'Pronated grip', .014, .42, [s * .35, 0, 0], x);
        plates(prop, [s * .515, 0, 0], .17, x);
        beam(prop, 'Camber bend', [s * .222, 0, 0], [s * .171, -.229, 0], .027);
      }
      cylinder(prop, 'Dropped center section', .014, .344, [0, -.229, 0], x);
      break;
    case 'otis':
      cylinder(prop, 'Press plate', .151, .04, [0, 0, 0], z, dark);
      for (const s of signs) box(root, 'Foot anchor base', [.080, .078, .32], [s * .26, .039, .68], dark);
      cylinder(root, 'Padded foot restraint', .044, .55, [0, .153, .72], x, dark);
      break;
    case 'belt':
      for (const s of signs) {
        const stand = createFlatBench();
        stand.position.set(s * .24, 0, 0);
        root.add(stand);
      }
      mesh(prop, 'Dip belt', new THREE.TorusGeometry(.150, .028, 8, 36), dark, v(0, .055, 0))
        .rotation.x = Math.PI / 2;
      beam(prop, 'Belt chain', [0, .048, .145], [0, -.34, .075], .020);
      plates(prop, [0, -.345, .075], .117, Y, 3);
      break;
    case 'crucifix':
      for (const hammer of [prop, second]) {
        cylinder(hammer, 'Hammer grip', .017, .22, [0, -.014, 0], x);
        box(hammer, 'Hammer haft', [.039, .30, .039], [0, -.156, 0], wood);
        box(hammer, 'Hammer head', [.178, .084, .075], [0, -.33, 0], accent);
      }
      break;
    case 'pinch':
      for (const plate of [prop, second]) {
        cylinder(plate, 'Pinch plate', .178, .047, [0, 0, 0], x, dark);
        mesh(plate, 'Olympic bore', new THREE.TorusGeometry(.031, .009, 8, 24), steel, v(.025, 0, 0))
          .rotation.y = Math.PI / 2;
      }
      break;
    case 'roller': {
      cylinder(prop, 'Wrist roller shaft', .024, .60, [0, 0, 0], x);
      cylinder(prop, 'Rope spool', .039, .071, [0, 0, 0], x, dark);
      plates(second, [0, 0, 0], .116, Y, 1);
      const rope = box(root, 'Hanging rope', [.008, 1, .008], [0, 0, 0], dark);
      follow = () => align(rope, prop.position, second.position);
      break;
    }
    case 'tire':
      tire(prop, .48, .29);
      break;
    case 'sledge': {
      cylinder(prop, 'Sledgehammer handle', .018, .87, [.255, 0, 0], x, wood);
      box(prop, 'Sledgehammer head', [.103, .19, .115], [.69, 0, 0], steel);
      const target = new THREE.Group();
      target.position.set(0, .089, .80);
      target.scale.y = .60;
      tire(target, .39, .29);
      root.add(target);
      break;
    }
    default:
      throw new Error('Unknown final strength fixture: ' + kind);
  }
  const move = sample(entry.propClip, prop);
  const moveSecond = entry.secondPropClip && sample(entry.secondPropClip, second);
  const update = (time = 0) => {
    move(time);
    moveSecond?.(time);
    follow();
  };
  update();
  return { root, animated: prop, ...(moveSecond && { secondAnimated: second }), update };
}
