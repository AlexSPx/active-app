import assert from 'node:assert/strict';
import { createKettlebell } from './kettlebell.mjs';
import { dumbbellGripTransform } from './clips.mjs';
import { createEntries } from './kettlebell-more.mjs';
import { X, q, sides, v } from './barbell-standing-more.mjs';
import { handAlong } from './hand-frame.mjs';
import { checkBarGrip } from './verify-barbell.mjs';
import { verifyFamily } from './verify-barbell-standing-more.mjs';

await verifyFamily(createEntries, createKettlebell, [
  'Advanced_Kettlebell_Windmill', 'Bent_Press', 'Kettlebell_Arnold_Press', 'Kettlebell_Dead_Clean',
  'Kettlebell_Figure_8', 'Kettlebell_Halo', 'Kettlebell_Halo_With_Overhead_Extension', 'Kettlebell_Hang_Clean',
  'Kettlebell_Overhead_Triceps_Extension', 'Kettlebell_Pass_Between_The_Legs', 'Kettlebell_Pistol_Squat',
  'Kettlebell_Seated_Press', 'Kettlebell_Windmill', 'Lunge_Pass_Through', 'One-Arm_Kettlebell_Clean',
  'One-Arm_Kettlebell_Jerk', 'One-Arm_Kettlebell_Military_Press_To_The_Side', 'One-Arm_Kettlebell_Push_Press',
  'One-Arm_Kettlebell_Snatch', 'Leg-Over_Floor_Press',
], 'KETTLEBELLS', ({ id, entry, at, scene, prop, point, floor }) => {
  assert.equal(entry.equipment, 'kettlebell', id);
  const transferred = /Figure_8|Pass_Between|Lunge_Pass/.test(id);
  const horns = /Halo|Overhead_Triceps|Pistol/.test(id);
  const path = prop.getObjectByName('Handle').geometry.parameters.path;
  const checkHands = (held, skin = false) => {
    const inverse = prop.matrixWorld.clone().invert();
    const seats = sides.filter(([side]) => held.includes(side)).map(([side, sign]) => ({
      side, sign, hand: scene.getObjectByName('Hand' + side), ...dumbbellGripTransform(sign),
    }));
    for (const { side, sign, hand, position, quaternion } of seats) {
      const seat = hand.localToWorld(position.clone()).applyMatrix4(inverse);
      const axis = X.clone().applyQuaternion(quaternion).applyQuaternion(hand.getWorldQuaternion(q())).transformDirection(inverse);
      const curve = path.curves[horns ? sign > 0 ? 2 : 0 : 1];
      const u = horns ? sign > 0 ? .32 : .68 : (seat.x + .105) / .21;
      assert.ok(u >= 0 && u <= 1 && seat.distanceTo(curve.getPoint(u)) < .003, id + ' handle seat ' + side + ' ' + seat.toArray());
      assert.ok(Math.abs(axis.dot(curve.getTangent(u))) > .997, id + ' tangent ' + side);
    }
    if (skin) checkBarGrip(scene)(seats, id, (world) => {
      const local = world.clone().applyMatrix4(inverse);
      return Math.hypot(local.y, local.z) - .0145;
    });
  };
  if (transferred) {
    const times = id === 'Lunge_Pass_Through' ? [1.205, 1.81, 3.015] : [.90, 1.69, 2.63];
    for (const [time, held] of [[0, 'R'], [times[0], 'LR'], [times[1], 'L'], [times[2], 'LR'], [3.60, 'R']]) {
      at(time);
      checkHands(held);
    }
    const frameCount = Math.ceil(entry.clip.duration * 60);
    const dt = entry.clip.duration / frameCount;
    for (const [side] of sides) {
      at(0);
      let previous = point('Hand' + side);
      for (let i = 1; i <= frameCount; i++) {
        at(i * dt);
        const wrist = point('Hand' + side);
        assert.ok(wrist.distanceTo(previous) / dt < 4, id + ' smooth hand transfer ' + side);
        previous = wrist;
      }
    }
  } else {
    const cleanWrist = id.endsWith('_Clean') ? scene.getObjectByName('HandR') : undefined;
    for (let frame = 0; frame <= 36; frame++) {
      at((frame + .3) * entry.clip.duration / 37);
      checkHands(horns ? 'LR' : 'R', !horns && frame === 12);
      if (cleanWrist) {
        assert.ok(cleanWrist.position.angleTo(handAlong(-1).applyQuaternion(cleanWrist.quaternion)) < 1.4,
          id + ' avoids extreme wrist bend during turnover');
      }
    }
  }
  at(0);
  const start = prop.position.clone(), hip = point('Pelvis');
  if (id === 'Kettlebell_Dead_Clean' || id === 'Kettlebell_Hang_Clean') {
    assert.ok(id.includes('Dead') ? Math.abs(floor) < .003 : floor > .13, id + ' different starts');
    at(1.26);
    assert.ok(prop.position.y > point('ArmR').y && prop.position.y < point('Head').y, id + ' rack height');
  } else if (id === 'One-Arm_Kettlebell_Jerk' || id === 'One-Arm_Kettlebell_Push_Press') {
    at(.38);
    assert.ok(point('Pelvis').y < hip.y - .10, id + ' dip');
    at(.95);
    assert.ok(id.endsWith('Jerk') ? point('Pelvis').y < hip.y - .13 : point('Pelvis').y > hip.y - .015, id + ' knees at catch');
    at(1.45);
    assert.ok(prop.position.y > start.y + .46, id + ' overhead');
  } else if (horns && !id.includes('Pistol')) {
    for (const track of entry.clip.tracks.filter(({ name }) => /^Forearm[LR]\.quaternion$/.test(name))) {
      for (let i = 4; i < track.values.length; i += 4) {
        const angle = q().fromArray(track.values, i - 4).normalize().angleTo(q().fromArray(track.values, i).normalize());
        assert.ok(angle < .34, id + ' continuous forearm motion');
      }
    }
    const skull = [];
    scene.traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return;
      const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
      const headIndex = mesh.skeleton.bones.findIndex(({ name }) => name === 'Head');
      if (headIndex < 0) return;
      for (let vertex = 0; vertex < position.count; vertex++) {
        if ([0, 1, 2, 3].some((i) =>
          skinIndex.getComponent(vertex, i) === headIndex && skinWeight.getComponent(vertex, i) > .55)) {
          skull.push([mesh, vertex]);
        }
      }
    });
    assert.ok(skull.length > 0, id + ' skinned head vertices');
    const profile = prop.getObjectByName('Bell').geometry.parameters.points;
    const vertex = v();
    for (let time = 0; time <= entry.clip.duration; time += 1 / 30) {
      at(time);
      if (id === 'Kettlebell_Overhead_Triceps_Extension') {
        for (const [side, sign] of sides) {
          const hand = scene.getObjectByName('Hand' + side);
          assert.ok(hand.position.angleTo(handAlong(sign).applyQuaternion(hand.quaternion)) < .45,
            id + ' wrist follows the forearm');
        }
      }
      const inverse = prop.matrixWorld.clone().invert();
      for (const [mesh, index] of skull) {
        mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
        const upper = profile.findIndex(({ y }) => y >= vertex.y);
        if (upper <= 0) continue;
        const a = profile[upper - 1], b = profile[upper];
        const radius = a.x + (b.x - a.x) * (vertex.y - a.y) / (b.y - a.y);
        assert.ok(Math.hypot(vertex.x, vertex.z) > radius, id + ' bell clears the head');
      }
    }
    if (id === 'Kettlebell_Overhead_Triceps_Extension') {
      at(1.65);
      assert.ok(prop.position.z < point('Head').z - .20, id + ' lowers behind the head');
      return;
    }
    const wrists = sides.map(([side, sign]) => [scene.getObjectByName('Hand' + side), handAlong(sign)]);
    const samples = Math.ceil(entry.clip.duration * 120);
    for (let frame = 0; frame <= samples; frame++) {
      const time = frame * entry.clip.duration / samples;
      at(time);
      checkHands('LR');
      for (const [hand, along] of wrists) {
        assert.ok(hand.position.angleTo(along.clone().applyQuaternion(hand.quaternion)) < .72,
          id + ' wrist bend ' + hand.name + ' at ' + time);
      }
    }
    at(id.endsWith('Extension') ? 1.32 : 1.14);
    const behind = prop.position.clone();
    assert.ok(behind.z < point('Head').z - .20, id + ' passes behind the head');
    if (id.endsWith('Extension')) {
      at(2.1);
      assert.ok(prop.position.y > behind.y + .23, id + ' overhead extension');
    }
  } else if (id.includes('Windmill') || id === 'Bent_Press') {
    at(id === 'Bent_Press' ? 1.53 : 1.65);
    assert.ok(point('HandR').y - point('ArmR').y > .48, id + ' overhead elbow extension');
    assert.ok(id.includes('Advanced') ? point('HandL').y > .30 : point('HandL').y < .20, id + ' free hand path');
  } else if (id.includes('Pistol')) {
    at(1.65);
    assert.ok(point('Pelvis').y < hip.y - .48 && point('FootL').y > .18 && Math.abs(point('FootR').y - .074) < .005, id + ' single-leg depth');
  } else if (id === 'One-Arm_Kettlebell_Snatch') {
    assert.ok(floor < .003, id + ' ground setup');
    at(.43);
    assert.ok(prop.position.z < start.z - .12, id + ' hikes the bell backward');
    at(1.26);
    assert.ok(prop.position.y > point('ArmR').y + .52, id + ' single-motion overhead lockout');
  } else if (id === 'Leg-Over_Floor_Press') {
    assert.ok(point('FootR').x > point('FootL').x && point('ForearmR').y < .13, id + ' crossed legs and floor contact');
    at(1.4);
    assert.ok(prop.position.y > start.y + .32, id + ' floor press lockout');
  }
});
