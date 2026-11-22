import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = v(0, 1, 0);
const tau = Math.PI * 2;
const materials = Object.fromEntries(Object.entries({
  foam: 0x287c83, edge: 0x16434a, steel: 0x566771, dark: 0x263239, rubber: 0x39484d,
  orange: 0xd66f38, rope: 0xa88755, line: 0xdec89f, trail: 0xa08567, wall: 0x9fadb1,
}).map(([key, color]) => [key, new THREE.MeshStandardMaterial({ color, roughness: .84 })]));
materials.wall.transparent = true;
materials.wall.opacity = .38;
materials.wall.depthWrite = false;

function mesh(root, name, geometry, material, at = [0, 0, 0]) {
  const object = new THREE.Mesh(geometry, materials[material]);
  object.name = name;
  object.position.fromArray(at);
  root.add(object);
  return object;
}

const block = (root, name, size, at, material) => mesh(root, name, new THREE.BoxGeometry(...size), material, at);
const drum = (root, name, radius, length, at, material) =>
  mesh(root, name, new THREE.CylinderGeometry(radius, radius, length, 24), material, at);

function group(root, name, at = [0, 0, 0]) {
  const object = new THREE.Group();
  object.name = name;
  object.position.fromArray(at);
  root.add(object);
  return object;
}

function segment(object, from, to) {
  const delta = to.clone().sub(from);
  object.position.copy(from).addScaledVector(delta, .5);
  object.scale.y = Math.max(.0001, delta.length());
  object.quaternion.setFromUnitVectors(Y, delta.normalize());
}

function tube(root, name, from, to, radius, material) {
  const object = drum(root, name, radius, 1, [0, 0, 0], material);
  segment(object, v(...from), v(...to));
  return object;
}

function cord(root, name, radius, count) {
  const links = Array.from({ length: count }, () => drum(root, name, radius, 1, [0, 0, 0], 'rope'));
  return (curve) => {
    let start = curve(0);
    links.forEach((link, i) => {
      const end = curve((i + 1) / count);
      segment(link, start, end);
      start = end;
    });
  };
}

function course(root, parts) {
  for (const { kind, x, z, height, width, depth } of parts) {
    if (kind === 'box') {
      block(root, 'Plyometric box', [width, height - .028, depth], [x, (height - .028) / 2, z], 'foam');
      block(root, 'Non-slip top', [width, .028, depth], [x, height - .014, z], 'edge');
      for (const sign of [-1, 1]) {
        block(root, 'Box handle', [.11, .032, .005], [x, height * .67, z + sign * depth / 2], 'edge');
      }
    } else if (kind === 'cone') {
      block(root, 'Cone base', [.19, .012, .19], [x, .006, z], 'dark');
      mesh(root, 'Agility cone', new THREE.CylinderGeometry(.014, .082, height - .012, 20), 'orange',
        [x, (height + .012) / 2, z]);
    } else if (kind === 'hurdle') {
      for (const sign of [-1, 1]) {
        block(root, 'Hurdle foot', [.054, .036, .31], [x + sign * .35, .018, z], 'dark');
        block(root, 'Hurdle upright', [.032, height - .02, .032], [x + sign * .35, (height - .02) / 2, z], 'steel');
      }
      block(root, 'Hurdle crossbar', [.73, .028, .036], [x, height - .014, z], 'orange');
    } else if (kind === 'line') {
      block(root, 'Starting line', [1.38, .002, .026], [x, .001, z], 'line');
    }
  }
}

function bike(root, { crank: [crankY, crankZ], radius, period }) {
  for (const z of [-.56, .74]) {
    block(root, 'Bike stabilizer', [.56, .049, .10], [0, .0245, z], 'dark');
  }
  tube(root, 'Bike base', [0, .065, -.56], [0, .065, .74], .037, 'steel');
  tube(root, 'Seat tube', [0, .07, -.39], [0, .92, -.19], .045, 'steel');
  tube(root, 'Bike frame', [0, .35, -.32], [0, .58, .53], .064, 'foam');
  tube(root, 'Handlebar stem', [0, .093, .56], [0, 1.20, .564], .036, 'steel');
  tube(root, 'Handlebar', [-.325, 1.20, .564], [.325, 1.20, .564], .019, 'dark');
  block(root, 'Saddle', [.224, .049, .31], [0, .905, -.17], 'rubber');
  const wheel = group(root, 'Bike flywheel', [0, .38, .39]);
  drum(wheel, 'Flywheel', .26, .075, [0, 0, 0], 'dark').rotation.z = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const a = tau * i / 5;
    block(wheel, 'Flywheel inset', [.079, .011, .022], [0, .17 * Math.cos(a), .17 * Math.sin(a)], 'steel');
  }
  const pedals = [1, -1].map((sign) => {
    const crank = drum(root, 'Pedal crank', .015, 1, [0, 0, 0], 'steel');
    const plate = block(root, 'Pedal', [.15, .034, .195], [0, 0, 0], 'rubber');
    return { sign, crank, plate };
  });
  return (t) => {
    wheel.rotation.x = -tau * t / period * 3;
    for (const { sign, crank, plate } of pedals) {
      const a = tau * t / period + (sign < 0 ? Math.PI : 0);
      const y = crankY + radius * Math.cos(a);
      const z = crankZ + radius * Math.sin(a);
      plate.position.set(sign * .145, y, z);
      segment(crank, v(sign * .080, crankY, crankZ), v(sign * .117, y, z));
    }
  };
}

function skates(root, scene) {
  const boots = ['L', 'R'].map((side) => {
    const foot = scene.getObjectByName('Foot' + side);
    const skate = group(root, 'Inline skate ' + side);
    block(skate, 'Skate boot sole', [.124, .029, .295], [0, -.077, .058], 'dark');
    block(skate, 'Skate heel cup', [.113, .117, .09], [0, -.010, -.044], 'foam');
    block(skate, 'Skate foot strap', [.126, .040, .050], [0, -.017, .093], 'foam');
    block(skate, 'Wheel rail', [.036, .048, .276], [0, -.105, .058], 'steel');
    const wheels = [-.048, .020, .088, .156].map((z) => {
      const axle = group(skate, 'Wheel axle', [0, -.140, z]);
      drum(axle, 'Roller wheel', .034, .031, [0, 0, 0], 'rubber').rotation.z = Math.PI / 2;
      drum(axle, 'Wheel hub', .014, .034, [0, 0, 0], 'orange').rotation.z = Math.PI / 2;
      return axle;
    });
    return { foot, skate, wheels };
  });
  return (t) => {
    for (const { foot, skate, wheels } of boots) {
      foot.getWorldPosition(skate.position);
      foot.getWorldQuaternion(skate.quaternion);
      wheels.forEach((wheel) => { wheel.rotation.x = 21 * t; });
    }
  };
}

function sled(root, config, pelvis, hands, sample) {
  const { ahead, pusher, harness, handleHeight } = config;
  const prop = group(root, pusher ? 'Pushing sled' : 'Weight drag sled');
  const length = pusher ? .85 : .68;
  for (const sign of [-1, 1]) {
    block(prop, 'Sled runner', [.101, .045, length], [sign * .33, .024, 0], 'dark');
    block(prop, 'Runner nose', [.097, .038, .10], [sign * .33, .053, length / 2 - .025], 'steel').rotation.x = -.48;
    if (pusher) {
      drum(prop, 'Sled upright', .023, handleHeight + .09, [sign * .33, (handleHeight + .09) / 2, -.30], 'steel');
      drum(prop, 'Upright grip', .029, .165, [sign * .33, handleHeight, -.30], 'rubber');
    }
  }
  block(prop, 'Sled deck', [.65, .058, length - .12], [0, .070, 0], 'steel');
  drum(prop, 'Plate horn', .030, .38, [0, .24, 0], 'steel');
  for (let i = 0; i < 4; i++) drum(prop, 'Weight plate', .192, .039, [0, .110 + .040 * i, 0], 'dark');
  for (const sign of [-1, 1]) drum(prop, 'Tow eye', .025, .042, [sign * .13, .11, ahead ? -.32 : .32], 'orange');
  const tethers = (pusher ? [] : harness ? [0] : [-1, 1]).map(() => cord(root, 'Sled tether', .010, 12));
  const waist = harness && mesh(root, 'Towing belt', new THREE.TorusGeometry(.139, .014, 10, 38), 'orange');
  return { animated: prop, update(t) {
    sample(prop, t);
    if (pusher) return;
    const center = pelvis.getWorldPosition(v());
    if (waist) {
      waist.position.copy(center);
      pelvis.getWorldQuaternion(waist.quaternion);
      waist.rotateX(Math.PI / 2);
    }
    tethers.forEach((line, i) => {
      const start = waist ? center.clone().add(v(0, 0, -.135)) : hands[i]();
      const end = prop.position.clone().add(v(waist ? 0 : (1 - i * 2) * .13, .11, ahead ? -.32 : .32));
      line((u) => start.clone().lerp(end, u).add(v(0, -.025 * Math.sin(Math.PI * u), 0)));
    });
  } };
}

export function createFinalConditioningFixture(entry, scene, _bar) {
  const config = entry.finalConditioningFixture;
  const root = new THREE.Group();
  root.name = 'Conditioning equipment';
  course(root, config.parts ?? []);
  const noop = () => {};
  const pelvis = scene.getObjectByName('Pelvis');
  const handBones = ['L', 'R'].map((side) => scene.getObjectByName('Hand' + side));
  const hands = config.gripFrames.map(({ position }, i) => () => handBones[i].localToWorld(v(...position)));
  function handles(name, radius, length) {
    const grips = hands.map(() => drum(root, name, radius, length, [0, 0, 0], 'dark'));
    return () => {
      grips.forEach((grip, i) => {
        grip.position.copy(hands[i]());
        handBones[i].getWorldQuaternion(grip.quaternion);
        grip.quaternion.multiply(new THREE.Quaternion().fromArray(config.gripFrames[i].quaternion));
        grip.quaternion.multiply(new THREE.Quaternion().setFromUnitVectors(Y, v(1, 0, 0)));
      });
    };
  }
  const [position, rotation] = entry.propClip?.tracks.map((track) => track.createInterpolant()) ?? [];
  const sample = (object, t) => {
    object.position.fromArray(position.evaluate(t));
    object.quaternion.fromArray(rotation.evaluate(t));
  };

  switch (config.kind) {
    case 'trail':
      for (let i = 1; i < config.trail.length; i++) {
        const [fromZ, fromY] = config.trail[i - 1];
        const [toZ, toY] = config.trail[i];
        const length = Math.hypot(toZ - fromZ, toY - fromY);
        const angle = Math.atan2(toY - fromY, toZ - fromZ);
        const dirt = block(root, 'Trail surface', [.92, .043, length + .002],
          [0, (toY + fromY) / 2 - .0215 * Math.cos(angle), (toZ + fromZ) / 2 + .0215 * Math.sin(angle)], 'trail');
        dirt.rotation.x = -angle;
      }
      break;
    case 'wall':
      block(root, 'Wall contact panel', [1.25, 1.82, .083], [0, .91, config.z + .0415], 'wall');
      for (const sign of [-1, 1]) {
        block(root, 'Panel upright', [.044, 1.82, .083], [sign * .62, .91, config.z + .0415], 'steel');
      }
      break;
    case 'rackBand': {
      for (const sign of [-1, 1]) {
        block(root, 'Rack upright', [.057, 2.31, .057], [sign * .47, 1.155, .41], 'steel');
        block(root, 'Rack foot', [.069, .045, .94], [sign * .47, .0225, .26], 'dark');
      }
      tube(root, 'Rack crossbar', [-.49, 2.28, .41], [.49, 2.28, .41], .027, 'steel');
      const bands = hands.map(() => drum(root, 'Balance band', .011, 1, [0, 0, 0], 'rope'));
      return { root, update() {
        bands.forEach((band, i) => segment(band, v((1 - 2 * i) * .10, 2.28, .41), hands[i]()));
      } };
    }
    case 'bike':
      return { root, update: bike(root, config) };
    case 'skates':
      return { root, update: skates(root, scene) };
    case 'sled': {
      const fixture = sled(root, config, pelvis, hands, sample);
      if (config.pusher || config.harness) return { root, ...fixture };
      const syncHandles = handles('Sled strap grip', .016, .123);
      return { root, animated: fixture.animated, update(t) {
        fixture.update(t);
        syncHandles();
      } };
    }
    case 'bag': {
      const [x, y, z] = config.pivot;
      block(root, 'Heavy bag stand upright', [.073, y + .03, .073], [x + .56, (y + .03) / 2, z + .36], 'steel');
      block(root, 'Heavy bag stand foot', [.56, .049, .89], [x + .56, .0245, z + .36], 'dark');
      tube(root, 'Heavy bag hanger', [x + .56, y, z + .36], [x, y, z], .038, 'steel');
      const prop = group(root, 'Hanging heavy bag assembly');
      drum(prop, 'Heavy bag', config.radius, .99, [0, -.87, 0], 'orange');
      for (const y of [-.42, -1.30]) drum(prop, 'Heavy bag trim', config.radius + .002, .043, [0, y, 0], 'dark');
      for (const sign of [-1, 1]) tube(prop, 'Hanging strap', [0, 0, 0], [sign * .155, -.38, 0], .014, 'dark');
      return { root, animated: prop, update: (t) => sample(prop, t) };
    }
    case 'battleRopes': {
      const [x, y, z] = config.anchor;
      block(root, 'Rope anchor base', [.49, .072, .40], [x, .036, z], 'dark');
      drum(root, 'Rope anchor', .043, .18, [x, .09, z], 'steel');
      const ropes = hands.map(() => cord(root, 'Battle rope', .022, 44));
      const syncHandles = handles('Battle rope grip', .020, .133);
      return { root, boundsSampleRate: 30, update(t) {
        syncHandles();
        ropes.forEach((rope, i) => {
          const a = hands[i]();
          const b = v(x + (1 - 2 * i) * .03, y, z);
          const phase = tau * t / config.period + Math.PI * i;
          rope((u) => {
            const p = a.clone().lerp(b, u);
            const wave = .31 * Math.sin(phase - 5 * Math.PI * u) * Math.sin(Math.PI * u);
            p.y = Math.max(.022, p.y - .64 * Math.sin(Math.PI * u) + wave);
            return p;
          });
        });
      } };
    }
    case 'jumpRope': {
      const rope = cord(root, 'Jump rope', .009, 48);
      const syncHandles = handles('Jump rope handle', .014, .127);
      return { root, boundsSampleRate: 30, update(t) {
        syncHandles();
        const a = hands[0]();
        const b = hands[1]();
        const angle = tau * (t / config.period - .40);
        rope((u) => {
          const p = a.clone().lerp(b, u);
          const arch = Math.sin(Math.PI * u);
          const radial = Math.cos(angle);
          p.y = Math.max(.010, p.y - (1.00 + .41 * Math.max(0, -radial)) * radial * arch);
          p.z += (-1.10 * Math.sin(angle) - .08 * Math.max(0, radial)) * arch;
          p.x += .19 * Math.sin(2 * Math.PI * u);
          return p;
        });
      } };
    }
  }
  return { root, update: noop };
}
