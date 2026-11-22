import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { sides, smoothstep, v } from './barbell-standing-more.mjs';

const frame = new MeshStandardMaterial({ color: 0x56616c, metalness: .38, roughness: .54 });
const chrome = new MeshStandardMaterial({ color: 0xa0a9ad, metalness: .60, roughness: .37 });
const pad = new MeshStandardMaterial({ color: 0x353c43, roughness: .87 });
const rubber = new MeshStandardMaterial({ color: 0x242c32, roughness: .94 });
const screen = new MeshStandardMaterial({ color: 0x43636e, roughness: .37 });
const yAxis = v(0, 1, 0);
const halfPi = Math.PI / 2;

function mesh(parent, name, geometry, position, material) {
  const part = new Mesh(geometry, material);
  part.name = name;
  part.position.fromArray(position);
  parent.add(part);
  return part;
}

function box(parent, name, dimensions, position, material = frame) {
  return mesh(parent, name, new BoxGeometry(...dimensions), position, material);
}

function cylinder(parent, name, radius, width, position, material = frame) {
  const part = mesh(parent, name, new CylinderGeometry(radius, radius, width, 24), position, material);
  part.rotation.z = Math.PI / 2;
  return part;
}

function align(part, from, to) {
  const vector = to.clone().sub(from);
  part.position.copy(from).addScaledVector(vector, .5);
  part.scale.y = vector.length();
  part.quaternion.setFromUnitVectors(yAxis, vector.normalize());
}

function rod(parent, name, width, from, to, material = frame) {
  const part = cylinder(parent, name, width, 1, [0, 0, 0], material);
  align(part, v(...from), v(...to));
  return part;
}

function console(root, y, z, width = .36) {
  box(root, 'Console housing', [width, .074, .198], [0, y, z], pad).rotation.x = .36;
  box(root, 'Display', [width * .69, .014, .085], [0, y + .041, z + .018], screen).rotation.x = .36;
}

function smith(root, { z, block, reverse, stabilizers }, bar) {
  const carriages = [];
  for (const [, s] of sides) {
    const x = s * .606;
    box(root, 'Smith base foot', [.135, .063, 1.16], [x, .034, z]);
    box(root, 'Smith upright', [.078, 2.077, .082], [x, 1.080, z - .202]);
    rod(root, 'Polished guide rail', .018, [x, .190, z], [x, 2.11, z], chrome);
    for (const y of [.25, 2.07]) {
      box(root, 'Guide rail mount', [.074, .069, .235], [x, y, z - .102]);
    }
    for (let i = 0; i < 13; i++) {
      box(root, 'Rack notch', [.054, .020, .060], [x, .431 + i * .119, z - .143], chrome);
    }
    box(root, 'Smith safety stop', [.084, .067, .128], [x, .322, z], pad);
    if (stabilizers) {
      box(root, 'Handhold bracket', [.274, .041, .043], [s * .50, .581, .088]);
      cylinder(root, 'Stabilizing grip', .025, .127, [s * .378, .581, .088], rubber);
    }
    const slide = new Group();
    slide.position.x = x;
    slide.position.z = z;
    root.add(slide);
    carriages.push(slide);
    box(slide, 'Bar carriage', [.088, .134, .087], [0, 0, 0], frame);
    box(slide, 'Smith hook', [.046, .043, .158], [0, .029, -.069], chrome);
  }
  box(root, 'Smith upper crossmember', [1.30, .081, .106], [0, 2.118, z - .202]);
  box(root, 'Smith rear crossmember', [1.28, .063, .081], [0, .144, z - .556]);
  if (block) calfBlock(root, block, reverse);
  const center = new Vector3();
  return () => {
    const height = bar.getWorldPosition(center).y;
    for (const slide of carriages) slide.position.y = height;
  };
}

function calfBlock(root, height, reverse) {
  const edge = .044 + (reverse ? -.060 : .135);
  box(root, 'Calf block', [.46, height, .176], [0, height / 2, edge + (reverse ? -.088 : .088)], pad);
}

function calf(root, { block }, joint) {
  box(root, 'Calf machine base', [.777, .064, .80], [0, .035, -.315]);
  box(root, 'Weight tower', [.179, 1.70, .200], [0, .921, -.621]);
  box(root, 'Weight stack', [.264, .489, .236], [0, .367, -.644], pad);
  if (block) calfBlock(root, block, false);
  const yoke = new Group();
  root.add(yoke);
  for (const [, s] of sides) {
    box(yoke, 'Shoulder cushion', [.129, .084, .234], [s * .169, 0, .034], pad);
    rod(yoke, 'Yoke arm', .024, [s * .169, .067, .130], [s * .169, .18, -.415]);
  }
  box(yoke, 'Yoke crossbar', [.428, .056, .060], [0, .18, -.396]);
  const link = cylinder(root, 'Weight linkage', .014, 1, [0, 0, 0], chrome);
  return () => {
    yoke.position.y = (joint('ArmL').y + joint('ArmR').y) / 2 + .092;
    align(link, v(0, 1.732, -.590), v(0, yoke.position.y + .18, -.396));
  };
}

function sled(root, { theta, footZ, platform, laidBack }, joint, hand) {
  const track = laidBack ? [[.350, -.725], [.125, .389]] : [[.211, .029], [1.561, -.725]];
  for (const [, s] of sides) {
    const x = s * .441;
    const [[y0, z0], [y1, z1]] = track;
    box(root, 'Sled base runner', [.099, .072, 1.62], [x, .04, laidBack ? .046 : -.048]);
    rod(root, 'Sled guide rail', .030, [x, y0, z0], [x, y1, z1], chrome);
    rod(root, 'Rear brace', .028, [x, .070, z1], [x, y1, z1]);
  }
  const footAngle = laidBack ? -1.12 : -.24;
  const plate = box(root, 'Fixed footplate', [.777, .056, laidBack ? .426 : .47],
    [0, platform + .074 - .102 * Math.cos(footAngle) - .053 * Math.sin(footAngle),
      footZ + .053 * Math.cos(footAngle) - .102 * Math.sin(footAngle)], rubber);
  plate.rotation.x = footAngle;
  const carriage = new Group();
  root.add(carriage);
  const back = box(carriage, 'Backrest', [.317, .088, laidBack ? .789 : .730],
    [0, .269 * Math.cos(theta) + .127 * Math.sin(theta), .269 * Math.sin(theta) - .127 * Math.cos(theta)], pad);
  back.rotation.x = halfPi + theta;
  if (laidBack) {
    box(carriage, 'Headrest', [.250, .081, .251], [0, .019, -.682], pad).rotation.x = .20;
  }
  const grips = [];
  const posts = [];
  for (const [, s] of sides) {
    const at = [s * .163, .561 * Math.cos(theta) + .054, .561 * Math.sin(theta) + .022];
    box(carriage, 'Shoulder pad', [.121, .107, .196], at, pad).rotation.x = halfPi + theta;
    const wheelY = laidBack ? .166 : .194;
    const wheelZ = laidBack ? -.238 : -.096;
    if (s > 0) box(carriage, 'Slide crossmember', [.946, .059, .102], [0, -wheelY, wheelZ]);
    cylinder(carriage, 'Sled guide block', .067, .099, [s * .441, -wheelY, wheelZ], pad);
    grips.push(cylinder(root, 'Sled handgrip', .023, .125, [0, 0, 0], rubber));
    posts.push(cylinder(root, 'Grip bracket', .018, 1, [0, 0, 0], frame));
  }
  return () => {
    carriage.position.copy(joint('Pelvis'));
    sides.forEach(([side, s], i) => {
      const target = hand(side, i);
      const base = v(s * .24, .441 * Math.cos(theta), .441 * Math.sin(theta)).add(carriage.position);
      grips[i].position.copy(target);
      align(posts[i], base, target);
    });
  };
}

function ghr(root) {
  box(root, 'GHD base rail', [.129, .080, 1.30], [0, .04, -.290]);
  for (const z of [-.704, .202]) box(root, 'GHD cross foot', [.735, .068, .115], [0, .04, z]);
  for (const [y, z] of [[.31, -.532], [.304, .102]]) {
    box(root, 'GHD upright', [.106, .55, .112], [0, y, z]);
  }
  for (const [, s] of sides) {
    cylinder(root, 'Contoured thigh pad', .165, .169, [s * .10, .577, .118], pad);
  }
  box(root, 'Foot plate', [.434, .325, .055], [0, .694, -.545], frame);
  for (const [y, z] of [[.624, -.425], [.818, -.416]]) {
    cylinder(root, 'Ankle roller', .054, .436, [0, y, z], pad);
  }
}

function treadmill(root) {
  box(root, 'Treadmill base', [.720, .134, 1.94], [0, .071, -.09]);
  box(root, 'Belt', [.538, .039, 1.76], [0, .1465, -.160], rubber);
  box(root, 'Motor cover', [.695, .083, .236], [0, .169, .827], pad);
  for (const [, s] of sides) {
    box(root, 'Side rail', [.074, .041, 1.80], [s * .310, .165, -.139], pad);
    rod(root, 'Console upright', .037, [s * .346, .17, .830], [s * .288, 1.241, .740]);
    rod(root, 'Handrail', .024, [s * .288, 1.231, .743], [s * .333, 1.122, .319], pad);
  }
  console(root, 1.247, .740, .492);
}

function bike(root, { crank, seat, recumbent }, joint, foot) {
  const [cy, cz] = crank;
  const [sy, sz] = seat;
  const housingZ = recumbent ? .564 : .236;
  box(root, 'Bike chassis', [.156, .124, recumbent ? 1.28 : .94], [0, .147, recumbent ? .181 : .118]);
  for (const z of recumbent ? [-.419, .824] : [-.310, .570]) {
    box(root, 'Bike cross foot', [.639, .071, .110], [0, .047, z]);
  }
  cylinder(root, 'Drive housing', .221, .180, [0, cy, housingZ], pad);
  cylinder(root, 'Flywheel inset', .158, .186, [0, cy, housingZ], frame);
  cylinder(root, 'Crank axle', .051, .316, [0, cy, cz], chrome);
  rod(root, 'Seat post', .046, [0, .209, sz - .12], [0, sy - .022, sz], chrome);
  box(root, 'Bike seat', recumbent ? [.435, .082, .412] : [.255, .072, .297],
    [0, sy - .040, sz], pad);
  if (recumbent) {
    box(root, 'Recumbent backrest', [.346, .092, .539], [0, .786, -.244], pad).rotation.x = 1.09;
    rod(root, 'Backrest brace', .026, [0, .164, -.336], [0, .829, -.318]);
    rod(root, 'Console stem', .026, [0, .301, .661], [0, .810, .611]);
    console(root, .810, .611, .224);
  } else {
    rod(root, 'Handlebar stem', .032, [0, .375, .382], [0, 1.103, .541]);
    console(root, 1.144, .582, .282);
  }
  const cranks = [];
  const pedals = [];
  const straps = [];
  for (const [, s] of sides) {
    const grip = recumbent ? [s * .265, .574, .099] : [s * .239, 1.098, .468];
    rod(root, 'Handlebar', .023, recumbent ? [s * .135, .459, -.077] : [0, 1.103, .541], grip);
    cylinder(root, 'Bike handgrip', .024, .120, grip, rubber);
    cranks.push(cylinder(root, 'Crank arm', .018, 1, [0, 0, 0], chrome));
    pedals.push(box(root, 'Bike pedal', [.118, .035, .147], [0, 0, 0], rubber));
    straps.push(box(root, 'Pedal foot strap', [.118, .024, .047], [0, 0, 0], pad));
  }
  return () => {
    sides.forEach(([side, s], i) => {
      const spindle = foot(side, [0, -.090, .092]);
      align(cranks[i], v(s * .141, cy, cz), spindle);
      pedals[i].position.copy(spindle);
      pedals[i].quaternion.copy(joint('Foot' + side, true));
      straps[i].position.copy(foot(side, [0, .002, .104]));
      straps[i].quaternion.copy(pedals[i].quaternion);
    });
  };
}

function elliptical(root, [pivotY, pivotZ], hand, foot) {
  box(root, 'Elliptical chassis', [.271, .113, 1.364], [0, .112, .135]);
  for (const z of [-.503, .772]) box(root, 'Elliptical cross foot', [.704, .065, .130], [0, .039, z]);
  cylinder(root, 'Elliptical flywheel', .273, .257, [0, .333, .612], pad);
  cylinder(root, 'Flywheel hub', .087, .280, [0, .333, .612]);
  rod(root, 'Console mast', .040, [0, .360, .602], [0, 1.377, .664]);
  console(root, 1.403, .684);
  const pedals = [];
  const links = [];
  const swings = [];
  const couplers = [];
  const levers = [];
  const grips = [];
  for (const [, s] of sides) {
    cylinder(root, 'Handle pivot', .052, .268, [s * .126, pivotY, pivotZ], chrome);
    pedals.push(box(root, 'Elliptical pedal', [.156, .042, .314], [0, 0, 0], rubber));
    links.push(cylinder(root, 'Pedal rail', .025, 1, [0, 0, 0], frame));
    swings.push(cylinder(root, 'Lower swing link', .021, 1, [0, 0, 0], frame));
    couplers.push(cylinder(root, 'Pedal linkage', .016, 1, [0, 0, 0], frame));
    levers.push(cylinder(root, 'Moving handle arm', .022, 1, [0, 0, 0], frame));
    grips.push(cylinder(root, 'Moving handgrip', .026, .119, [0, 0, 0], rubber));
  }
  return () => {
    sides.forEach(([side, s], i) => {
      const pedal = foot(side, [0, -.090, .048]);
      const target = hand(side, i);
      const pivot = v(s * .260, pivotY, pivotZ);
      const lower = pivot.clone().add(pivot.clone().sub(target).setLength(.570));
      pedals[i].position.copy(pedal);
      pedals[i].position.y -= .020;
      align(links[i], pedal, v(s * .188, .333, .612));
      align(swings[i], pivot, lower);
      align(couplers[i], lower, pedal);
      align(levers[i], pivot, target);
      grips[i].position.copy(target);
    });
  };
}

function stairs(root, mill, foot) {
  box(root, 'Stair trainer base', [.741, .081, 1.29], [0, .043, .080]);
  box(root, 'Stair trainer housing', [.506, mill ? .614 : .385, .285], [0, mill ? .334 : .222, .508], pad);
  for (const [, s] of sides) {
    const y = mill ? 1.427 : 1.295;
    rod(root, 'Stair console support', .028, [s * .322, .080, .652], [s * .322, y, .616]);
    rod(root, 'Stair handrail', .024, [s * .322, y, .616], [s * .322, y, .105], rubber);
    if (mill) rod(root, 'Step chain cover', .040, [s * .261, .215, -.455], [s * .261, .650, .313], pad);
  }
  console(root, mill ? 1.490 : 1.391, .645);
  if (mill) {
    const treadPitch = .280;
    const slope = .190 / treadPitch;
    const surface = (z) => .375 + (z + .110) * slope;
    const treads = Array.from({ length: 5 }, () => box(root, 'Moving stair tread', [.497, .074, .282], [0, 0, 0], rubber));
    return () => {
      const [left, right] = sides.map(([side]) => foot(side, [0, -.074, .044]));
      const aboveSlope = (point) => point.y - surface(point.z);
      const planted = aboveSlope(left) < aboveSlope(right) ? left : right;
      const phase = (planted.z + .110) / treadPitch;
      // Keep float noise at either end of the stride on the same side of the wrap.
      const shift = (phase - Math.floor(phase + .0003)) * treadPitch;
      treads.forEach((tread, index) => {
        const z = -.670 + index * treadPitch + shift;
        const exposed = smoothstep(z, -.480, -.295) * (1 - smoothstep(z, .300, .485));
        const height = Math.max(.001, exposed);
        tread.position.set(0, surface(z) - .037 * height, z);
        tread.scale.set(1, height, height);
        tread.visible = exposed > .001;
      });
    };
  }
  const pedals = [];
  const levers = [];
  for (const [, s] of sides) {
    pedals.push(box(root, 'Independent step pedal', [.212, .043, .311], [s * .141, .3, .114], rubber));
    levers.push(cylinder(root, 'Pedal lever', .026, 1, [0, 0, 0]));
    cylinder(root, 'Pedal pivot', .053, .110, [s * .142, .245, .427], chrome);
  }
  return () => {
    sides.forEach(([side, s], i) => {
      const top = foot(side, [0, -.074, .044]);
      pedals[i].position.copy(top);
      pedals[i].position.y -= .0215;
      align(levers[i], v(s * .142, .245, .427), top);
    });
  };
}

function rower(root, joint, hand) {
  box(root, 'Rower monorail', [.112, .091, 1.49], [0, .236, -.240], chrome);
  for (const z of [-.891, .371]) {
    box(root, 'Rower cross foot', [.615, .068, .108], [0, .038, z]);
    box(root, 'Rower rail support', [.097, .200, .086], [0, .127, z]);
  }
  cylinder(root, 'Rower flywheel cage', .278, .214, [0, .347, .943], pad);
  cylinder(root, 'Rower flywheel face', .208, .230, [0, .347, .943], frame);
  rod(root, 'Rower monitor arm', .025, [0, .535, .946], [0, .884, .945]);
  console(root, .883, .943, .230);
  for (const [, s] of sides) {
    box(root, 'Angled rowing footplate', [.154, .036, .293], [s * .147, .181, .474], rubber).rotation.x = -.58;
    box(root, 'Foot strap', [.154, .042, .067], [s * .147, .259, .500], pad).rotation.x = -.58;
  }
  const seat = new Group();
  root.add(seat);
  box(seat, 'Sliding rower seat', [.347, .076, .275], [0, .079, 0], pad);
  for (const z of [-.079, .079]) cylinder(seat, 'Seat roller', .045, .154, [0, .030, z], frame);
  const grip = cylinder(root, 'Rower handle', .020, 1, [0, 0, 0], rubber);
  const chain = cylinder(root, 'Rower chain', .006, 1, [0, 0, 0], chrome);
  const feed = v(0, .609, .844);
  return () => {
    seat.position.set(0, .257, joint('Pelvis').z);
    const left = hand('L', 0);
    const right = hand('R', 1);
    align(grip, left.clone().add(v(.052, 0, 0)), right.clone().add(v(-.052, 0, 0)));
    align(chain, feed, left.lerp(right, .5));
  };
}

export function createMachineGuidedFixture(entry, scene, bar) {
  const options = entry.machineGuidedFixture;
  const root = new Group();
  const kind = options.kind;
  root.name = {
    smith: 'Smith machine', calf: 'Standing calf machine', sled: 'Squat sled', ghr: 'Glute-ham developer',
    treadmill: 'Treadmill', bike: options.recumbent ? 'Recumbent bike' : 'Stationary bike', elliptical: 'Elliptical trainer',
    stepper: 'Stair stepper', stepmill: 'Step mill', rower: 'Stationary rower',
  }[kind];
  const bones = new Map();
  function bone(name) {
    if (!bones.has(name)) bones.set(name, scene.getObjectByName(name));
    return bones.get(name);
  }
  const joint = (name, orientation = false) => orientation
    ? bone(name).getWorldQuaternion(root.quaternion.clone()) : bone(name).getWorldPosition(v());
  const foot = (side, offset) => bone('Foot' + side).localToWorld(v(...offset));
  const hand = (side, index) => bone('Hand' + side).localToWorld(v(...options.gripOffsets[index]));
  const update = {
    smith: () => smith(root, options, bar),
    calf: () => calf(root, options, joint),
    sled: () => sled(root, options, joint, hand),
    ghr: () => ghr(root),
    treadmill: () => treadmill(root),
    bike: () => bike(root, options, joint, foot),
    elliptical: () => elliptical(root, options.pivot, hand, foot),
    stepper: () => stairs(root, false, foot),
    stepmill: () => stairs(root, true, foot),
    rower: () => rower(root, joint, hand),
  }[kind]();
  return { root, update: update ?? (() => {}) };
}
