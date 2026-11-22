import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { measurePalmContacts } from './hand-frame.mjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createEntries } from './bodyweight-standing.mjs';

const bytes = readFileSync(new URL('./anatomy.glb', import.meta.url));
const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .parseAsync(Uint8Array.from(bytes).buffer, '');
const catalog = new Map(JSON.parse(readFileSync(new URL('../../apps/client/lib/data/exercise-catalog.json',
  import.meta.url), 'utf-8')).map((entry) => [entry.id, entry]));
const { scene } = asset;
const entries = createEntries(asset);
const measurePalm = measurePalmContacts(scene);
const mixer = new THREE.AnimationMixer(scene);
const materials = new Set();
const feet = [[], []];
const soles = [[], []];
const footSurfaces = [[], []];
const fingertips = [[], []];
const heels = [[], []];
const glutes = [[], []];
const meshes = [];
const vertex = new THREE.Vector3();
scene.traverse((mesh) => {
  if (!mesh.isSkinnedMesh) return;
  meshes.push(mesh);
  materials.add(mesh.material.name);
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  const distalFingers = new Map(mesh.skeleton.bones.flatMap(({ name }, index) =>
    /^(Index|Middle)3[LR]$/.test(name) ? [[index, name.endsWith('L') ? 0 : 1]] : []));
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    const side = vertex.x > 0 ? 0 : 1;
    if (vertex.y < .12) feet[side].push([mesh, i]);
    if (mesh.material.name === 'Other anatomy' && vertex.y < .075) {
      footSurfaces[side].push([mesh, i]);
      if (vertex.y < .015) soles[side].push([mesh, i]);
    }
    if (vertex.z < .001 && vertex.y < .065 &&
        mesh.skeleton.bones[skinIndex.getX(i)].name === (side === 0 ? 'FootL' : 'FootR')) {
      heels[side].push([mesh, i]);
    }
    if (mesh.material.name === 'Glutes' && vertex.y > .84 && vertex.y < 1 && vertex.z < -.05) {
      glutes[side].push([mesh, i]);
    }
    const fingerSide = distalFingers.get(skinIndex.getX(i));
    if (fingerSide !== undefined && skinWeight.getX(i) > .7) fingertips[fingerSide].push([mesh, i]);
  }
});
assert.ok(feet.every((side) => side.length > 100));
assert.ok([...heels, ...glutes].every((side) => side.length > 20));
const surface = (vertices) => vertices.map(([mesh, i]) =>
  mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
const footprint = soles.map((sole) => {
  const points = surface(sole);
  return [
    points.reduce((a, b, i) => b.z < points[a].z ? i : a, 0),
    points.reduce((a, b, i) => b.z > points[a].z ? i : a, 0),
    points.reduce((a, b, i) => b.x > points[a].x ? i : a, 0),
  ].map((i) => sole[i]);
});
const soleNormal = (points) => {
  const [heel, toe, outer] = surface(points);
  return toe.sub(heel).cross(outer.sub(heel)).normalize();
};
const kneeAngle = (side) => point('Thigh' + side).sub(point('Shin' + side))
  .angleTo(point('Foot' + side).sub(point('Shin' + side)));
const point = (joint) => scene.getObjectByName(joint).getWorldPosition(new THREE.Vector3());
const floor = () => feet.map((side) => side.reduce((height, [mesh, i]) =>
  Math.min(height, mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld).y), Infinity));
const forward = (joint) => new THREE.Vector3(0, 0, 1)
  .applyQuaternion(scene.getObjectByName(joint).getWorldQuaternion(new THREE.Quaternion()));

const flights = {
  Rocket_Jump: [[.76, 1.24]],
  Star_Jump: [[.76, 1.24]],
  Double_Leg_Butt_Kick: [[.60, 1.20]],
  Single_Leg_Butt_Kick: [[.63, 1.15]],
  Knee_Tuck_Jump: [[.63, 1.17]],
  Standing_Long_Jump: [[.77, 1.33]],
  Split_Jump: [[.39, .89]],
  Scissors_Jump: [[.39, .89], [1.57, 2.07]],
  Lateral_Bound: [[.32, .80], [1.31, 1.79]],
};
assert.equal(Object.keys(entries).length, 15);
for (const [id, { name, clip, primary, supporting, phases, cues, framing }] of Object.entries(entries)) {
  const key = catalog.get(id)?.sourceKey;
  assert.equal(name, catalog.get(id)?.name, id);
  assert.ok([null, 'BODY_ONLY'].includes(catalog.get(id)?.equipment), id);
  assert.equal(framing, 'standing', id);
  assert.ok(primary.length && [...primary, ...supporting].every((muscle) => materials.has(muscle)), id);
  assert.equal(phases[0][0], 0, id);
  for (const times of [phases, cues]) {
    times.forEach(([time], i) => assert.ok(time >= 0 && time <= clip.duration
      && (!i || time > times[i - 1][0]), id));
  }
  assert.ok(clip.validate(), id);
  const joints = clip.tracks.filter(({ name }) => name.endsWith('.quaternion')).map(({ name }) => {
    const joint = scene.getObjectByName(name.split('.')[0]);
    assert.ok(joint?.isBone, id + ' ' + name);
    return joint;
  });
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
  action.paused = true;
  const seek = (time) => {
    action.time = time;
    mixer.update(0);
    scene.updateMatrixWorld(true);
  };
  let previous;
  let minimum = Infinity;
  let motion = 0;
  seek(0);
  const initial = joints.map((joint) => joint.getWorldPosition(new THREE.Vector3()));
  const planted = key === 'Knee_Circles' && footSurfaces.map((side, i) => ({
    sole: surface(soles[i]),
    shoe: surface(side),
    normal: soleNormal(footprint[i]),
  }));
  const seconds = Math.ceil(clip.duration * (planted ? 240 : 120));
  for (let i = 0; i <= seconds; i++) {
    const time = clip.duration * i / seconds;
    seek(time);
    const skin = floor();
    const nearFloor = Math.min(...skin);
    minimum = Math.min(minimum, nearFloor);
    assert.ok(nearFloor >= -.004, id + ' sole penetration at ' + time);
    const inFlight = flights[key]?.some(([from, to]) => time > from && time < to);
    if (!inFlight) assert.ok(nearFloor < .005, id + ' missing contact at ' + time);
    if (planted) {
      planted.forEach(({ sole, shoe, normal }, i) => {
        const label = `${name} foot ${i + 1} at ${time}`;
        assert.ok(Math.abs(skin[i]) < .001, label + ' sole reaches the floor');
        assert.ok(surface(soles[i]).every((p, j) => p.distanceTo(sole[j]) < .001),
          label + ' skinned sole drifts');
        assert.ok(soleNormal(footprint[i]).angleTo(normal) < .005, label + ' sole tilts');
        assert.ok(surface(footSurfaces[i]).every((p, j) => p.distanceTo(shoe[j]) < .009),
          label + ' visible foot deforms around the planted sole');
      });
    }
    if (key === 'Knee_Tuck_Jump') {
      for (const side of ['L', 'R']) {
        const { dorsal, bend, deviation, wristRoll } = measurePalm(side);
        assert.ok(dorsal.y > .95 && bend < .45 && deviation < .03 && wristRoll < .02,
          `${name} Hand${side} palm and forearm alignment at ${time}`);
      }
    }
    const positions = joints.map((joint) => joint.getWorldPosition(new THREE.Vector3()));
    joints.forEach((joint, j) => {
      assert.ok(joint.matrixWorld.elements.every(Number.isFinite), id + ' ' + joint.name);
      assert.ok(Math.abs(joint.quaternion.lengthSq() - 1) < 1e-5, id + ' ' + joint.name);
      assert.ok(!previous || positions[j].distanceTo(previous[j]) < .075,
        id + ' discontinuity at ' + time + ' ' + joint.name);
      motion = Math.max(motion, positions[j].distanceTo(initial[j]));
    });
    previous = positions;
  }
  assert.ok(motion > .025, id + ' insufficient motion');
  for (const time of new Set([...phases.map(([time]) => time), clip.duration])) {
    seek(time);
    for (const mesh of meshes) {
      const count = mesh.geometry.attributes.position.count;
      for (let i = 0; i < count; i += 11) {
        mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
        assert.ok(Number.isFinite(vertex.lengthSq()) && vertex.y >= -.008,
          id + ' invalid sampled skin at ' + time);
      }
    }
  }
  for (const [start, end] of flights[key] ?? []) {
    seek(start);
    assert.ok(Math.min(...floor()) < .005, id + ' launch');
    seek((start + end) / 2);
    assert.ok(Math.min(...floor()) > .2, id + ' apex');
    seek(end);
    assert.ok(Math.min(...floor()) < .005, id + ' landing');
  }

  seek(0);
  const startPelvis = point('Pelvis');
  const startLead = point('FootL').z - point('FootR').z;
  seek(clip.duration);
  const travel = point('Pelvis').distanceTo(startPelvis);
  if (key === 'Bodyweight_Walking_Lunge' || key === 'Standing_Long_Jump') {
    assert.ok(point('Pelvis').z - startPelvis.z > 1, id + ' forward travel');
  } else {
    assert.ok(travel < .001, id + ' pelvis loop closure');
    joints.forEach((joint, i) => assert.ok(point(joint.name).distanceTo(initial[i]) < .001, id + ' loop pose'));
  }
  if (key === 'Bodyweight_Walking_Lunge') {
    seek(.60);
    const leadFoot = point('FootL');
    for (const time of [.8, 1.07, 1.52, 1.85]) {
      seek(time);
      assert.ok(point('FootL').distanceTo(leadFoot) < .002, id + ' planted lead slide');
    }
    seek(1.07);
    assert.ok(point('ShinR').y < .15 && point('ShinL').y > .35, id + ' left lunge depth');
    seek(2.68);
    assert.ok(point('ShinL').y < .15 && point('ShinR').y > .35, id + ' right lunge depth');
  }
  if (key === 'Crossover_Reverse_Lunge') {
    seek(1.05);
    assert.ok(forward('Chest').x > .5 && point('FootR').z < -.4, id);
    seek(3.33);
    assert.ok(forward('Chest').x < -.5 && point('FootL').z < -.4, id);
  }
  if (key === 'Standing_Hip_Flexors' || key === 'Standing_Soleus_And_Achilles_Stretch') {
    seek(.9);
    assert.ok(key === 'Standing_Hip_Flexors' ? forward('FootR').y < -.5 : Math.abs(forward('FootR').y) < .001, id);
    assert.ok(Math.max(...floor()) < .005, id + ' both contact');
  }
  if (key === 'Standing_Toe_Touches') {
    seek(1.8);
    assert.ok(forward('Chest').y < -.8, id + ' forward fold');
    for (const [side, vertices] of fingertips.entries()) {
      const toes = feet[side].map(([mesh, i]) =>
        mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)).filter(({ z }) => z > .11);
      const fingers = vertices.map(([mesh, i]) =>
        mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
      assert.ok(fingers.some((finger) => toes.some((toe) => toe.distanceTo(finger) < .02)),
        id + ' fingertips reach the toes');
      assert.ok(fingers.every(({ y }) => y > -.002), id + ' fingertips clear the floor');
    }
  }
  if (key === 'Knee_Circles') {
    for (const side of ['L', 'R']) {
      const orbit = [0, .6, 1.2, 1.8].map((time) => {
        seek(time);
        const { bend, deviation, direction, wristRoll } = measurePalm(side);
        assert.ok(bend < .4 && deviation < .25 && direction.y < -.58 && wristRoll < .02,
          id + ' relaxed hands follow the hips');
        return point('Shin' + side);
      });
      assert.ok(orbit[1].x - orbit[3].x > .20 && orbit[0].z - orbit[2].z > .13,
        id + ' both knees sweep laterally and fore-aft');
    }
  }
  if (key === 'Rocket_Jump') {
    for (const time of [.86, .92, 1, 1.08, 1.13]) {
      seek(time);
      for (const side of ['L', 'R']) {
        const reach = point('Hand' + side).sub(point('Arm' + side)).normalize();
        assert.ok(reach.y > .96 && Math.abs(reach.z) < .18 && kneeAngle(side) > 2.82,
          id + ' both arms reach vertically and both knees extend through flight at ' + time);
      }
    }
  }
  if (key === 'Star_Jump') {
    seek(1);
    assert.ok(point('HandL').x > .6 && point('FootL').x - point('FootR').x > 1, id);
  }
  if (key === 'Double_Leg_Butt_Kick') {
    for (const time of [.85, .90, .95, clip.duration / 2]) {
      seek(time);
      ['L', 'R'].forEach((side, i) => {
        const glute = surface(glutes[i]);
        const heel = surface(heels[i]);
        const gap = Math.min(...heel.map((heel) =>
          Math.min(...glute.map((point) => point.distanceTo(heel)))));
        const heelHeight = Math.max(...heel.map(({ y }) => y));
        const gluteHeight = Math.min(...glute.map(({ y }) => y));
        assert.ok(gap < .018 && heelHeight - gluteHeight > .035 && kneeAngle(side) < .50,
          id + ' both heels tuck toward the skinned glutes at ' + time + ' gap ' + gap);
      });
    }
  }
  if (key === 'Single_Leg_Butt_Kick') {
    const raised = point('ShinL').sub(point('Pelvis'));
    seek(.89);
    assert.ok(point('FootR').z < point('ShinR').z - .15 && point('FootR').y > point('ShinR').y + .2, id);
    assert.ok(point('ShinL').sub(point('Pelvis')).distanceTo(raised) < .11, id + ' free knee stays raised');
    seek(1.15);
    const [free, support] = floor();
    assert.ok(free > .25 && support < .005, id + ' single-leg landing');
  }
  if (key === 'Knee_Tuck_Jump') {
    seek(.9);
    assert.ok(point('ShinL').y > point('Pelvis').y + .15 && point('ShinL').distanceTo(point('HandL')) < .23, id);
  }
  if (key === 'Split_Jump' || key === 'Scissors_Jump') {
    seek(.64);
    assert.ok(Math.abs(point('FootL').z - point('FootR').z) < .025, id + ' close feet in flight');
    seek(.89);
    const lead = point('FootL').z - point('FootR').z;
    assert.ok(startLead > .4 && (key === 'Split_Jump' ? lead > .4 : lead < -.4), id + ' lead on landing');
  }
  if (key === 'Lateral_Bound') {
    seek(.8);
    const foot = point('FootL');
    assert.ok(point('Pelvis').x - startPelvis.x > 1 && floor()[1] > .06, id);
    seek(1.05);
    assert.ok(point('FootL').distanceTo(foot) < .002, id + ' landing foot slide');
    seek(1.79);
    assert.ok(point('Pelvis').distanceTo(startPelvis) < .15 && floor()[0] > .06, id);
  }

  action.stop();
  mixer.uncacheClip(clip);
  console.log(name + ' | ' + (seconds + 1) + ' samples | minimum sole height ' + minimum.toFixed(4) + ' m');
}
