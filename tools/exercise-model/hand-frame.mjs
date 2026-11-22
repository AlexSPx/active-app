import { Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';

// Same palm frame as atlas_hand in build_model.py, mirrored across X.
export const handAlong = (sign) => new Vector3(sign * .025, -.137, .065).normalize();
export const handDorsal = () => new Vector3(0, -.065, -.137).normalize();

export function openHand(sign, along, dorsal) {
  const axis = along.clone().normalize();
  const turn = new Quaternion().setFromUnitVectors(handAlong(sign), axis);
  const actual = handDorsal().applyQuaternion(turn);
  const twist = Math.atan2(axis.dot(actual.clone().cross(dorsal)), actual.dot(dorsal));
  return turn.premultiply(new Quaternion().setFromAxisAngle(axis, twist));
}

export function relaxedFingerTracks(scene, curl) {
  const axis = new Vector3(1, 0, 0);
  return ['L', 'R'].flatMap(side => ['Thumb', 'Index', 'Middle', 'Ring', 'Little'].flatMap(digit =>
    [1, 2, 3].map((joint, index) => {
      const bone = scene.getObjectByName(digit + joint + side);
      const flex = [1, 1.25, .75][index] * curl * (digit === 'Thumb' ? .34 : 1);
      const pose = bone.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(axis, flex));
      return new QuaternionKeyframeTrack(bone.name + '.quaternion', [0], pose.toArray());
    })));
}

// Wrist height for the flattened, skinned palm on Y = 0.
export const palmHeight = .0435;

export const supportFingerNames = ['L', 'R'].flatMap((side) =>
  ['Thumb', 'Index', 'Middle', 'Ring', 'Little'].map((digit) => digit + '1' + side));

export function createSupportHands(bone) {
  const digits = supportFingerNames.map((name) => {
    const joint = bone(name);
    return { joint, rest: joint.quaternion.clone() };
  });
  const dorsal = handDorsal();
  for (const digit of digits) {
    const segment = digit.joint.children[0].position.clone().applyQuaternion(digit.rest).normalize();
    digit.axis = segment.cross(dorsal).normalize();
    digit.angle = digit.joint.name.startsWith('Thumb') ? .77 : .20;
  }
  function pose(sign, along, targetDorsal, pressure = 1) {
    const start = sign === 1 ? 0 : 5;
    // Open the opposed thumb and straighten the fingers that curl below the palm in bind pose.
    for (const { joint, rest, axis, angle } of digits.slice(start, start + 5)) {
      joint.quaternion.copy(rest).premultiply(new Quaternion().setFromAxisAngle(axis, angle * pressure));
    }
    const direction = along.clone().addScaledVector(targetDorsal, -.09 * pressure);
    return openHand(sign, direction, targetDorsal);
  }
  const bind = new Map(digits.map(({ joint, rest }) => [joint.name, rest.toArray().map(Math.fround)]));
  function includeTrack(name, values) {
    const rest = bind.get(name);
    return !rest || values.some((value, i) => Math.fround(value) !== rest[i % 4]);
  }
  return { reset: () => digits.forEach(({ joint, rest }) => joint.quaternion.copy(rest)), pose, includeTrack };
}

// Match the forearm's radial/ulnar axis to the hand across the wrist hinge.
export function forearmRoll(side, forearm, distal, hand) {
  const across = handDorsal().cross(handAlong(side === 'L' ? 1 : -1));
  const target = across.clone().applyQuaternion(hand);
  const current = across.applyQuaternion(forearm);
  const axis = distal.clone().normalize();
  current.addScaledVector(axis, -current.dot(axis));
  target.addScaledVector(axis, -target.dot(axis));
  const angle = Math.atan2(axis.dot(current.clone().cross(target)), current.dot(target));
  return forearm.premultiply(new Quaternion().setFromAxisAngle(axis, angle));
}

// Bind-space regions keep the heel and the metacarpals independent of fingertip or thumb contact.
export function measurePalmContacts(scene) {
  const hands = ['L', 'R'].map((side, index) => {
    const joint = scene.getObjectByName('Hand' + side);
    const forearm = scene.getObjectByName('Forearm' + side);
    const sign = 1 - 2 * index;
    const along = handAlong(sign);
    const across = along.clone().cross(handDorsal()).multiplyScalar(sign);
    const phalanges = new RegExp(`^(Index|Middle|Ring|Little)[123]${side}$`);
    const vertices = [];
    scene.traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return;
      const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
      const names = mesh.skeleton.bones.map((bone) => bone.name);
      const axes = ['getX', 'getY', 'getZ', 'getW'];
      const inverse = joint.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
      for (let i = 0; i < position.count; i++) {
        const axis = axes.reduce((best, axis) => skinWeight[axis](i) > skinWeight[best](i) ? axis : best);
        const name = names[skinIndex[axis](i)];
        if (name !== joint.name && !phalanges.test(name)) continue;
        const local = new Vector3().fromBufferAttribute(position, i).applyMatrix4(inverse);
        if (local.dot(across) > .068) continue;
        const distance = local.dot(along);
        if (distance >= .020 && distance < .052) vertices.push({ mesh, i, region: 'heel' });
        if (distance >= .072 && distance < .110) vertices.push({ mesh, i, region: 'knuckles' });
      }
    });
    return { joint, forearm, along, vertices };
  });
  const vertex = new Vector3();
  return (side) => {
    const { joint, forearm, along, vertices } = hands[side === 'L' ? 0 : 1];
    const rotation = joint.getWorldQuaternion(new Quaternion());
    const dorsal = handDorsal().applyQuaternion(rotation);
    const direction = along.clone().applyQuaternion(rotation);
    const distal = joint.getWorldPosition(new Vector3()).sub(forearm.getWorldPosition(vertex)).normalize();
    const across = handDorsal().cross(along);
    const handAcross = across.clone().applyQuaternion(rotation);
    const forearmAcross = across.applyQuaternion(forearm.getWorldQuaternion(new Quaternion()));
    const projected = (axis) => axis.clone().addScaledVector(distal, -axis.dot(distal)).normalize();
    const contact = { heel: Infinity, knuckles: Infinity, dorsal, direction, rotation,
      bend: distal.angleTo(direction), deviation: Math.abs(distal.dot(handAcross)),
      wristRoll: projected(handAcross).angleTo(projected(forearmAcross)) };
    for (const { mesh, i, region } of vertices) {
      const height = mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld).y;
      contact[region] = Math.min(contact[region], height);
    }
    return contact;
  };
}
