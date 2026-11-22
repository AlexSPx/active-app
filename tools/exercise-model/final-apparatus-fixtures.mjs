import * as THREE from 'three';
import { createBarbell } from './barbell.mjs';
import { createDeclineBench } from './decline-bench-training.mjs';
import { createDumbbell } from './dumbbell.mjs';
import { createEzCurlBar } from './ez-curl-bar.mjs';
import { createFlatBench } from './flat-bench.mjs';
import { createInclineBench } from './incline-bench.mjs';
import { createMachineGuidedFixture } from './machine-guided-fixtures.mjs';
import { createPullUpBar } from './pull-up-bar.mjs';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const up = v(0, 1, 0);
const material = (color, roughness = .78, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const steel = material(0x566672, .5, .32);
const pad = material(0x293e48);
const gripMaterial = material(0x18252c);
const teal = material(0x2f8186);
const webbing = material(0xd38636);
const ropeMaterial = material(0xa98259);
const partnerMaterial = material(0x90a8b1);
const partnerClothes = material(0x485f6b);
const signs = [1, -1];
const sides = ['L', 'R'];

function mesh(root, name, geometry, position, surface) {
  const object = new THREE.Mesh(geometry, surface);
  object.name = name;
  object.position.fromArray(position);
  root.add(object);
  return object;
}

function box(root, name, size, position, surface = steel) {
  return mesh(root, name, new THREE.BoxGeometry(...size), position, surface);
}

function cylinder(root, name, radius, width, position, surface = steel, axis = 'X') {
  const object = mesh(root, name, new THREE.CylinderGeometry(radius, radius, width, 24), position, surface);
  if (axis === 'X') object.rotation.z = -Math.PI / 2;
  if (axis === 'Z') object.rotation.x = Math.PI / 2;
  return object;
}

function segment(root, name, radius, surface, flat = false) {
  const geometry = flat ? new THREE.BoxGeometry(radius * 2, 1, .004) : new THREE.CylinderGeometry(radius, radius, 1, 12);
  const part = mesh(root, name, geometry, [0, 0, 0], surface);
  return (from, to) => {
    const axis = to.clone().sub(from);
    part.position.copy(from).addScaledVector(axis, .5);
    part.scale.y = axis.length();
    part.quaternion.setFromUnitVectors(up, axis.normalize());
  };
}

function rod(root, name, radius, from, to, surface = steel) {
  segment(root, name, radius, surface)(v(...from), v(...to));
}

function place(root, name, object, position, yaw = 0) {
  object.name = name;
  object.position.fromArray(position);
  object.rotation.y = yaw;
  root.add(object);
  return object;
}

function seat(root) {
  box(root, 'Chair seat', [.415, .040, .425], [0, .408, -.05], pad);
  box(root, 'Chair backrest', [.43, .205, .033], [0, .772, -.236], pad);
  cylinder(root, 'Chair top rail', .019, .47, [0, .894, -.219]);
  for (const x of [-.184, .184]) {
    cylinder(root, 'Seat edge grip', .016, .16, [x / .184 * .214, .453, .053], gripMaterial, 'Z');
    rod(root, 'Front chair leg', .018, [x, .02, .137], [x, .391, .137]);
    rod(root, 'Rear chair upright', .019, [x, .02, -.260], [x, .894, -.219]);
  }
}

function rack(root, anchorX, height, z) {
  for (const x of [-anchorX, anchorX]) {
    box(root, 'Rack upright', [.05, height, .05], [x, height / 2, z]);
    box(root, 'Rack foot', [.065, .035, .88], [x, .018, z]);
  }
  cylinder(root, 'Overhead crossmember', .027, anchorX * 2, [0, height - .019, z]);
}

function stage(root, name, height, z, depth) {
  box(root, name, [.55, height, depth], [0, height / 2, z], pad);
  box(root, 'Grip surface', [.54, .011, depth - .01], [0, height - .0055, z], gripMaterial);
}

function animatedProp(root, kind) {
  if (kind === 'dumbbell') return place(root, 'Lap dumbbell', createDumbbell(), [0, 0, 0]);
  if (kind === 'smith-bar') return place(root, 'Smith bar', createBarbell(), [0, 0, 0]);
  if (kind === 'fly-bars') return place(root, 'Rolling EZ bar', createEzCurlBar(), [0, 0, 0]);
  const prop = new THREE.Group();
  prop.name = kind;
  root.add(prop);
  if (kind === 'ab-wheel') {
    cylinder(prop, 'Wheel axle', .015, .407, [0, 0, 0]);
    for (const s of signs) {
      cylinder(prop, 'Ab wheel tread', .088, .05, [s * .033, 0, 0], gripMaterial);
      cylinder(prop, 'Wheel hub', .056, .052, [s * .034, 0, 0], teal);
      cylinder(prop, 'Wheel grip', .019, .109, [s * .148, 0, 0], gripMaterial);
    }
  } else if (kind === 'pin') {
    cylinder(prop, 'Massage roller', .041, .22, [0, 0, 0], teal);
    cylinder(prop, 'Massage axle', .012, .405, [0, 0, 0]);
    for (const s of signs) cylinder(prop, 'Roller grip', .018, .096, [s * .154, 0, 0], gripMaterial);
    for (const x of [-.08, -.04, 0, .04, .08]) cylinder(prop, 'Massage ridge', .043, .009, [x, 0, 0], pad);
  } else if (kind === 'foot-roller') {
    cylinder(prop, 'Foot roller', .033, .212, [0, 0, 0], teal);
    for (const x of [-.095, -.057, -.019, .019, .057, .095]) cylinder(prop, 'Foot roller ridge', .033, .006, [x, 0, 0], pad);
  } else if (kind === 'board') {
    cylinder(prop, 'Balance deck', .335, .036, [0, -.018, 0], teal, 'Y');
    cylinder(prop, 'Grip surface', .315, .004, [0, -.002, 0], pad, 'Y');
    const rocker = mesh(prop, 'Rounded fulcrum', new THREE.SphereGeometry(.145, 32, 16, 0, Math.PI * 2, Math.PI / 2),
      [0, -.033, 0], gripMaterial);
    rocker.scale.y = .497;
  } else if (kind === 'calf-pad') {
    box(prop, 'Tailbone pad', [.48, .085, .213], [0, 0, 0], pad);
    box(prop, 'Pad mount', [.24, .055, .16], [0, .064, 0]);
  } else if (kind === 'slider') {
    box(prop, 'Heel slider', [.16, .015, .188], [0, 0, 0], teal);
  } else if (kind === 'stick' || kind === 'cable-bar') {
    cylinder(prop, kind === 'stick' ? 'Stretching stick' : 'Cable straight bar',
      kind === 'stick' ? .016 : .015, kind === 'stick' ? 1.15 : .43, [0, 0, 0],
      kind === 'stick' ? ropeMaterial : steel);
    if (kind === 'cable-bar') cylinder(prop, 'Cable swivel', .020, .048, [0, -.018, 0], pad, 'Y');
  }
  return prop;
}

function propSampler(prop, clip) {
  const [position, orientation] = clip.tracks.map((track) => track.createInterpolant());
  return (time) => {
    prop.position.fromArray(position.evaluate(time));
    prop.quaternion.fromArray(orientation.evaluate(time));
  };
}

function makePartner(root, contact, point, heel) {
  const isHeel = contact === 'heel';
  const x = isHeel ? .432 : 0;
  const z = isHeel ? -.74 : -.51;
  const hip = v(x, isHeel ? .31 : .20, z);
  const neck = v(x, isHeel ? .79 : .72, z + .06);
  segment(root, 'Partner torso', .126, partnerClothes)(hip, neck);
  mesh(root, 'Partner head', new THREE.SphereGeometry(.084, 16, 12), neck.clone().add(v(0, .108, .02)).toArray(), partnerMaterial)
    .scale.set(.9, 1.24, 1);
  const hands = signs.map((s, i) => {
    const shoulder = neck.clone().add(v(s * .153, -.09, .026));
    const knee = hip.clone().add(v(s * .14, isHeel ? -.17 : -.05, .244));
    const ankle = hip.clone().add(v(s * .14, -hip.y + .061, isHeel ? -.15 : .37));
    segment(root, 'Partner thigh', .068, partnerClothes)(hip.clone().add(v(s * .072, 0, 0)), knee);
    segment(root, 'Partner calf', .047, partnerClothes)(knee, ankle);
    box(root, 'Partner shoe', [.085, .062, .17], ankle.clone().add(v(0, -.02, .045)).toArray(), gripMaterial);
    const upper = segment(root, 'Partner upper arm', .043, partnerClothes);
    const lower = segment(root, 'Partner forearm', .032, partnerMaterial);
    const hand = mesh(root, 'Partner hand', new THREE.SphereGeometry(.040, 16, 12), [0, 0, 0], partnerMaterial);
    return () => {
      const target = isHeel ? (i ? heel('L') : knee.clone().add(v(0, .081, 0)))
        : point('Forearm' + sides[i]).add(v(s * .017, .016, -.057));
      const elbow = shoulder.clone().lerp(target, .47).add(v(s * .090, -.16, -.030));
      upper(shoulder, elbow);
      lower(elbow, target);
      hand.position.copy(target);
    };
  });
  return () => hands.forEach((update) => update());
}

export function createFinalApparatusFixture(entry, scene, _bar) {
  const config = entry.finalApparatusFixture;
  const root = new THREE.Group();
  root.name = entry.name + ' equipment';
  const updates = [];
  const joints = new Map();
  function bone(name) {
    if (!joints.has(name)) joints.set(name, scene.getObjectByName(name));
    return joints.get(name);
  }
  const point = (name) => bone(name).getWorldPosition(v());
  const local = (name, x, y, z) => bone(name).localToWorld(v(x, y, z));
  const hand = (i) => local('Hand' + sides[i], ...config.gripOffsets[i]);
  const foot = (side) => local('Foot' + side, 0, -.034, .092);
  const heel = (side) => local('Foot' + side, 0, -.047, -.040);
  const animated = config.animated && animatedProp(root, config.animated);
  if (animated) updates.push(propSampler(animated, entry.propClip));
  const secondAnimated = entry.secondPropClip && place(root, 'Second rolling EZ bar', createEzCurlBar(), [0, 0, 0]);
  if (secondAnimated) updates.push(propSampler(secondAnimated, entry.secondPropClip));

  switch (config.kind) {
    case 'chair':
      seat(root);
      break;
    case 'pull-up': {
      root.add(createPullUpBar());
      if (config.step) stage(root, 'Foot support step', .488, -.03, .56);
      if (config.band) {
        const cables = signs.map(() => segment(root, 'Assistance band', .010, teal, true));
        const loop = mesh(root, 'Band knee loop', new THREE.TorusGeometry(.076, .009, 10, 24), [0, 0, 0], teal);
        loop.rotation.x = Math.PI / 2;
        updates.push(() => {
          loop.position.copy(point('ShinL')).add(v(0, -.06, -.019));
          cables.forEach((link, i) => link(v(signs[i] * .019, 2.30, 0),
            loop.position.clone().add(v(signs[i] * .072, 0, 0))));
        });
      }
      if (config.weight) {
        const belt = mesh(root, 'Dip belt', new THREE.TorusGeometry(.155, .025, 12, 40), [0, 0, 0], pad);
        belt.scale.y = .78;
        belt.rotation.x = Math.PI / 2;
        const plate = cylinder(root, 'Hanging weight plate', .128, .044, [0, 0, 0], gripMaterial, 'Z');
        const lines = signs.map(() => segment(root, 'Dip belt chain', .005, steel));
        updates.push(() => {
          belt.position.copy(local('Pelvis', 0, .050, 0));
          plate.position.copy(belt.position).add(v(0, -.306, .183));
          lines.forEach((line, i) => line(belt.position.clone().add(v(signs[i] * .112, -.011, .105)), plate.position));
        });
      }
      break;
    }
    case 'donkey': {
      stage(root, 'Forefoot block', .17, -.08, .272);
      for (const s of signs) {
        box(root, 'Side base', [.07, .06, 1.31], [s * .39, .03, .17]);
        rod(root, 'Handle post', .025, [s * .425, .06, .459], [s * .425, .86, .459]);
        cylinder(root, 'Side handle', .023, .22, [s * .315, .86, .459], gripMaterial, 'X');
      }
      box(root, 'Weight stack housing', [.22, 1.38, .216], [0, .70, .744]);
      const lever = segment(root, 'Padded lever arm', .033, steel);
      updates.push(() => lever(v(0, 1.15, .644), animated.position.clone().add(v(0, .075, 0))));
      break;
    }
    case 'back-extension':
      for (const s of signs) {
        box(root, 'Upper thigh pad', [.218, .090, .299], [s * .116, .788, -.115], pad).rotation.x = -.47;
        rod(root, 'Inclined bench rail', .029, [s * .119, .491, -.67], [s * .119, .767, -.01]);
        rod(root, 'Bench upright', .039, [s * .119, .040, -.22], [s * .119, .802, -.12]);
      }
      box(root, 'Bench base', [.50, .060, .87], [0, .037, -.32]);
      cylinder(root, 'Ankle roller', .060, .45, [0, .654, -.685], pad);
      box(root, 'Footplate', [.40, .052, .189], [0, .495, -.70], pad).rotation.x = -.47;
      break;
    case 'belt-stretch': {
      const loop = mesh(root, 'Foot belt loop', new THREE.TorusGeometry(.053, .007, 8, 28), [0, 0, 0], webbing);
      const tails = signs.map(() => segment(root, 'Stretch belt', .009, webbing, true));
      updates.push(() => {
        loop.position.copy(foot('L'));
        loop.quaternion.copy(bone('FootL').getWorldQuaternion(new THREE.Quaternion()));
        tails.forEach((tail, i) => tail(loop.position.clone().add(v(signs[i] * .046, .02, 0).applyQuaternion(loop.quaternion)), hand(i)));
      });
      break;
    }
    case 'suspension': {
      rack(root, .70, config.anchors[0][1] + .019, config.anchors[0][2]);
      for (const [i, anchor] of config.anchors.entries()) {
        const end = config.endpoint === 'hands' ? () => hand(i) : () => foot(config.endpoint === 'footR' ? 'R' : sides[i]);
        const link = segment(root, config.rings ? 'Ring strap' : 'Suspension strap', .013, webbing, true);
        const top = v(...anchor);
        cylinder(root, 'Anchor collar', .034, .036, anchor, gripMaterial);
        const loop = config.rings || config.endpoint !== 'hands';
        const radius = config.rings ? .105 : .056;
        const handle = loop
          ? mesh(root, config.rings ? 'Gymnastic ring' : 'Foot cradle', new THREE.TorusGeometry(radius, config.rings ? .012 : .008, 10, 36),
            [0, 0, 0], config.rings ? ropeMaterial : gripMaterial)
          : cylinder(root, 'Suspension handle', .020, .115, [0, 0, 0], gripMaterial, config.axis);
        const risers = loop ? [] : [-1, 1].map(() => segment(root, 'Handle riser', .008, webbing, true));
        updates.push(() => {
          const contact = end();
          const away = top.clone().sub(contact).normalize();
          if (loop) {
            handle.position.copy(contact).addScaledVector(away, radius);
            if (config.ringGripAxes) {
              const tangent = v(...config.ringGripAxes[i]).transformDirection(bone('Hand' + sides[i]).matrixWorld);
              tangent.addScaledVector(away, -tangent.dot(away)).normalize();
              handle.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent, away, tangent.clone().cross(away)));
            } else {
              handle.quaternion.setFromUnitVectors(up, away);
              if (config.rings) handle.rotateY(Math.PI / 2);
            }
            link(top, contact.clone().addScaledVector(away, 2 * radius));
          } else {
            handle.position.copy(contact);
            const knot = contact.clone().addScaledVector(away, .105);
            risers.forEach((riser, j) => {
              riser(knot, contact.clone().add(config.axis === 'Z' ? v(0, 0, signs[j] * .051) : v(signs[j] * .051, 0, 0)));
            });
            link(top, knot);
          }
        });
      }
      break;
    }
    case 'rope': {
      const [x, y, z] = config.anchor;
      rack(root, .77, y + .019, z);
      cylinder(root, 'Rope anchor collar', .039, .095, [x, y, z], gripMaterial);
      const rope = segment(root, 'Climbing rope', .019, ropeMaterial);
      if (config.bridge) {
        stage(root, 'Stable box', .331, .30, .39);
        updates.push(() => rope(v(x, y, z), animated.position));
      } else {
        const wrap = ['Rope above the ankle', 'Rope around the ankle', 'Rope through the foot lock', 'Free rope tail']
          .map((name) => segment(root, name, .019, ropeMaterial));
        updates.push(() => {
          const ankle = point('FootL');
          const lock = THREE.MathUtils.smoothstep(.137 - ankle.x, .012, .080);
          const knots = [[x, y, z], [x, Math.max(.04, ankle.y + .19), z], [.099 * lock, ankle.y + .075, z + .027 * lock],
            [.068 * lock, ankle.y + .012, z + .111 * lock], [0, Math.max(.04, ankle.y - .035), z + .082 * lock], [0, .027, z]]
            .map(([x, y, z]) => v(x, y, z));
          rope(knots[0], knots[1]);
          wrap.forEach((link, i) => link(knots[i + 1], knots[i + 2]));
        });
      }
      break;
    }
    case 'captains-chair':
      box(root, 'Back support', [.33, .42, .072], [0, 1.175, -.174], pad);
      for (const s of signs) {
        const x = s * .254;
        box(root, 'Forearm pad', [.135, .076, .373], [x, 1.27, .102], pad);
        box(root, 'Back upright', [.061, 1.37, .061], [x, .706, -.144]);
        box(root, 'Station foot', [.068, .045, .71], [x, .024, .05]);
        rod(root, 'Arm support rail', .023, [x, 1.245, -.146], [x, 1.245, .314]);
        cylinder(root, 'Vertical hand grip', .022, .174, [x, 1.341, .314], gripMaterial, 'Y');
      }
      break;
    case 'seated-band': {
      place(root, 'Flat bench', createFlatBench(), [0, 0, -.045], Math.PI / 2);
      stage(root, 'Low band anchor', .10, 1.235, .16);
      for (const [i, s] of signs.entries()) {
        const anchor = v(s * .122, .089, 1.18);
        const strap = mesh(root, 'Ankle cuff', new THREE.TorusGeometry(.053, .008, 10, 24), [0, 0, 0], pad);
        strap.rotation.x = Math.PI / 2;
        const band = segment(root, 'Ankle resistance band', .011, teal, true);
        updates.push(() => {
          strap.position.copy(local('Foot' + sides[i], 0, .022, -.007));
          band(anchor, strap.position.clone().add(v(0, 0, .044)));
        });
      }
      break;
    }
    case 'quad-bench':
      place(root, 'Rear-foot bench', createFlatBench(), [0, 0, -.73], Math.PI / 2);
      break;
    case 'bench-dip':
      place(root, 'Hand support bench', createFlatBench(), [0, 0, -.264], Math.PI / 2);
      place(root, 'Heel support bench', createFlatBench(), [0, 0, .825], Math.PI / 2);
      break;
    case 'decline-band':
      root.add(createDeclineBench());
      for (const [i, s] of signs.entries()) {
        const anchor = v(s * .17, .11, -.58);
        const band = segment(root, 'Sit-up resistance band', .010, teal, true);
        const handle = cylinder(root, 'Band grip', .017, .107, [0, 0, 0], gripMaterial, 'X');
        updates.push(() => {
          const seat = hand(i);
          handle.position.copy(seat);
          handle.quaternion.copy(bone('Hand' + sides[i]).getWorldQuaternion(new THREE.Quaternion()));
          band(anchor, seat);
        });
      }
      break;
    case 'wrist-cable': {
      place(root, 'Cable curl bench', createFlatBench(), [0, 0, -.042]);
      const [x, y, z] = config.anchor;
      box(root, 'Low-pulley steel frame', [.42, 1.49, .29], [x, .764, z + .198]);
      box(root, 'Cable tower base', [.58, .071, .61], [x, .037, z + .115]);
      box(root, 'Pulley slot', [.08, 1.10, .023], [x, .721, z + .044], gripMaterial);
      cylinder(root, 'Low pulley', .060, .048, [x, y, z], pad);
      const cable = segment(root, 'Wrist curl cable', .004, steel);
      updates.push(() => cable(v(x, y, z), animated.position.clone().add(v(0, -.037, 0))));
      break;
    }
    case 'smith': {
      root.add(createInclineBench());
      const smith = createMachineGuidedFixture({ machineGuidedFixture: { kind: 'smith', z: config.z } }, scene, animated);
      root.add(smith.root);
      updates.push(smith.update);
      break;
    }
    case 'partner':
      updates.push(makePartner(root, config.contact, point, heel));
      break;
  }

  return { root, ...(animated && { animated }), ...(secondAnimated && { secondAnimated }), update(time) {
    for (const update of updates) update(time);
  } };
}
