import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';

const materials = {
  steel: new MeshStandardMaterial({ color: 0x697986, metalness: .45, roughness: .46 }),
  pad: new MeshStandardMaterial({ color: 0x252e36, roughness: .86 }),
  weight: new MeshStandardMaterial({ color: 0x475562, metalness: .28, roughness: .57 }),
  pin: new MeshStandardMaterial({ color: 0xb57e39, metalness: .38, roughness: .42 }),
};
const vertical = new Vector3(0, 1, 0);

export function createMachineStrengthFixture(entry, scene, _bar) {
  const root = new Group();
  root.name = entry.machineStrengthFixture.name;
  const updates = [];
  function endpoint(ref) {
    if (Array.isArray(ref)) {
      const fixed = new Vector3(...ref);
      return () => fixed.clone();
    }
    if (ref.at) {
      const at = endpoint(ref.at);
      const shift = new Vector3(...ref.shift);
      return () => at().add(shift);
    }
    if (ref.from) {
      const from = endpoint(ref.from);
      const to = endpoint(ref.to);
      const shift = new Vector3(...ref.shift);
      return () => from().lerp(to(), ref.fraction).add(shift);
    }
    const bone = scene.getObjectByName(ref.bone);
    const local = new Vector3(...ref.offset);
    return () => bone.localToWorld(local.clone());
  }

  for (const { name, size, at, angle = 0, follow, from, to, radius, material = 'steel' } of
    entry.machineStrengthFixture.parts) {
    const segment = Boolean(from);
    const geometry = radius ? new CylinderGeometry(radius, radius, 1, 20)
      : new BoxGeometry(...(segment ? [size[0], 1, size[1]] : size));
    const mesh = new Mesh(geometry, materials[material]);
    mesh.name = name;
    root.add(mesh);
    if (segment) {
      const start = endpoint(from);
      const end = endpoint(to);
      updates.push(() => {
        const a = start();
        const axis = end().sub(a);
        mesh.position.copy(a).addScaledVector(axis, .5);
        mesh.scale.y = axis.length();
        mesh.quaternion.setFromUnitVectors(vertical, axis.normalize());
      });
    } else {
      const position = endpoint(at);
      const joint = follow && scene.getObjectByName(follow);
      const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle);
      updates.push(() => {
        mesh.position.copy(position());
        if (joint) joint.getWorldQuaternion(mesh.quaternion).multiply(rotation);
        else mesh.quaternion.copy(rotation);
      });
    }
  }
  return { root, update: () => updates.forEach((update) => update()) };
}
