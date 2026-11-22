import * as THREE from 'three';

const up = new THREE.Vector3(0, 1, 0);
const x = new THREE.Vector3(1, 0, 0);
const steel = new THREE.MeshStandardMaterial({ color: 0x666d75, metalness: .36, roughness: .56 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x303942, roughness: .8 });
const bandMaterial = new THREE.MeshStandardMaterial({ color: 0xd47724, roughness: .85 });
const towelMaterial = new THREE.MeshStandardMaterial({ color: 0xb4b9bf, roughness: .94 });
const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x40464c, roughness: .7 });
const footBrace = [0, .150, .602];
const braceTilt = .32;
const braceDepth = .075;
export const bracedFootPitch = braceTilt - Math.PI / 2;
export const bracedFoot = new THREE.Vector3(...footBrace)
  .add(new THREE.Vector3(0, 0, -braceDepth / 2).applyAxisAngle(x, braceTilt))
  .sub(new THREE.Vector3(0, -.074, .095).applyAxisAngle(x, bracedFootPitch));

function box(parent, name, size, position, material = steel) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.fromArray(position);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, name, radius, material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 12), material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function span(mesh, from, to) {
  const direction = to.clone().sub(from);
  mesh.position.copy(from).addScaledVector(direction, .5);
  mesh.scale.y = direction.length();
  mesh.quaternion.setFromUnitVectors(up, direction.normalize());
}

function tower(root, anchor) {
  const [x, y, z] = anchor;
  const height = Math.max(y + .15, 1.02);
  box(root, 'Pulley mast', [.096, height, .104], [x, height / 2, z]);
  box(root, 'Tower base', [.38, .06, .46], [x, .03, z], rubber);
  box(root, 'Weight stack', [.21, .33, .22], [x, .205, z], rubber);
  const wheel = cylinder(root, 'Pulley', .058, rubber);
  wheel.position.fromArray(anchor);
  wheel.rotation.z = Math.PI / 2;
  wheel.scale.y = .12;
}

function bandAnchor(root, [x, y, z], support) {
  if (y < .09) {
    box(root, 'Band anchor', [.15, .085, .14], [x, .0425, z], rubber);
    return;
  }
  const height = support === 'post' ? 1.35 : y + .15;
  box(root, 'Anchor post', [.077, height, .077], [x, height / 2, z]);
  box(root, 'Anchor base', [.35, .06, .32], [x, .03, z], rubber);
}

// Endpoints are world coordinates or bone-local points. Hand references use
// the same calibrated handle center and axis as the dumbbell meshes.
export function createResistanceFixture({ mode, anchors, links, attachment, support }, figure, gripTransform) {
  const root = new THREE.Group();
  root.name = { cable: 'Cable station', band: 'Resistance band', towel: 'Assistance towel' }[mode];
  for (const anchor of anchors) (mode === 'cable' ? tower : bandAnchor)(root, anchor, support);
  if (support === 'knees' || support === 'knees-behind') {
    const pad = cylinder(root, 'Thigh restraint', .048, rubber);
    span(pad, new THREE.Vector3(-.25, .67, .22), new THREE.Vector3(.25, .67, .22));
    box(root, 'Thigh restraint mount', [.037, .64, .037], [.265, .32, .22]);
  }
  if (support === 'knees-behind') {
    const [x, y, z] = anchors[0];
    const rear = attachment.feeds[0][2];
    box(root, 'Pulley crosshead', [.082, .088, z - rear], [x, y + .037, (z + rear) / 2]);
    const wheel = cylinder(root, 'Overhead pulley', .039, rubber);
    wheel.position.set(x, y, rear);
    wheel.rotation.z = Math.PI / 2;
    wheel.scale.y = .09;
  }
  if (support === 'hands') {
    const brace = cylinder(root, 'Frame handhold', .016, rubber);
    span(brace, new THREE.Vector3(-.21, .99, .566), new THREE.Vector3(.21, .99, .566));
    box(root, 'Handhold mount', [.06, .054, .157], [0, .99, .642]);
  }
  if (support === 'feet') {
    box(root, 'Foot brace', [.49, .30, braceDepth], footBrace, rubber).rotation.x = braceTilt;
  }
  const line = { band: bandMaterial, cable: cableMaterial, towel: towelMaterial }[mode];
  const handles = new Map();
  const bone = (name) => figure.getObjectByName(name);
  function hand(side) {
    if (!handles.has(side)) {
      const joint = bone('Hand' + side);
      const grip = gripTransform(side === 'L' ? 1 : -1);
      handles.set(side, {
        at: () => joint.localToWorld(grip.position.clone()),
        axis: () => x.clone().applyQuaternion(grip.quaternion)
          .applyQuaternion(joint.getWorldQuaternion(new THREE.Quaternion())),
      });
    }
    return handles.get(side);
  }
  function point(ref) {
    if (typeof ref === 'string') return hand(ref).at;
    if (Array.isArray(ref)) return () => new THREE.Vector3(...ref);
    const joint = bone(ref.bone);
    return () => joint.localToWorld(new THREE.Vector3(...ref.offset));
  }
  const segments = [];
  function segment(name, radius, material, from, to) {
    const mesh = cylinder(root, name, radius, material);
    segments.push(() => span(mesh, from(), to()));
  }
  for (const [from, to] of links ?? []) {
    if (mode === 'towel') {
      const mesh = box(root, 'Folded towel', [.052, 1, .023], [0, 0, 0], line);
      segments.push(() => span(mesh, point(from)(), point(to)()));
    } else segment(mode === 'band' ? 'Elastic band' : 'Cable', mode === 'band' ? .011 : .006, line, point(from), point(to));
    if (Array.isArray(from) && to?.bone?.startsWith('Foot')) {
      const cuff = cylinder(root, 'Ankle cuff', .053, rubber);
      cuff.scale.y = .042;
      segments.push(() => cuff.position.copy(point(to)()));
    }
  }
  if (mode === 'band') {
    const sides = new Set(links.flat().filter((ref) => typeof ref === 'string'));
    for (const side of sides) {
      const { at, axis } = hand(side);
      segment('Band grip', .014, rubber, () => at().addScaledVector(axis(), -.053), () => at().addScaledVector(axis(), .053));
    }
  }
  if (attachment) {
    const { kind, hands, feeds } = attachment;
    const feed = feeds.map(point);
    const towardFeed = (at, source, length) => at.clone().add(source().sub(at).setLength(length));
    if (kind === 'stirrup') {
      hands.forEach((side, i) => {
        const { at, axis } = hand(side);
        const source = feed[i];
        const eye = () => towardFeed(at(), source, .12);
        for (const end of [-1, 1]) {
          const tip = () => at().addScaledVector(axis(), .064 * end);
          segment('Stirrup frame', .007, steel, tip, eye);
        }
        segment('Handle grip', .014, rubber, () => at().addScaledVector(axis(), -.072),
          () => at().addScaledVector(axis(), .072));
        segment('Cable', .006, cableMaterial, source, eye);
      });
    } else {
      const [left, right] = hands.map((side) => hand(side).at);
      const center = () => left().lerp(right(), .5);
      const eye = () => towardFeed(center(), feed[0], kind === 'rope' ? .245 : .070);
      const handleTip = (at, other) => () => at().add(at().sub(other()).setLength(.043));
      if (kind === 'straight' || kind === 'shared') {
        segment(kind === 'shared' ? 'Shared handle' : 'Straight bar', .014, steel, handleTip(left, right), handleTip(right, left));
        segment('Bar connector', .012, steel, center, eye);
      } else {
        hands.forEach((side) => {
          const { at, axis } = hand(side);
          segment('Grip', .014, rubber, () => at().addScaledVector(axis(), -.045),
            () => at().addScaledVector(axis(), .045));
          segment(kind === 'rope' ? 'Rope end' : 'Angled handle', .012,
            kind === 'rope' ? rubber : steel, at, eye);
        });
      }
      segment('Cable', .006, cableMaterial, feed[0], eye);
    }
  }

  return { root, update: () => segments.forEach((update) => update()) };
}
