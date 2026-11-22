import assert from 'node:assert/strict';
import { Box3 } from 'three';
import { createEntries } from './barbell-supported-more.mjs';
import { createBarbell } from './barbell.mjs';
import { createFlatBench } from './flat-bench.mjs';
import { createInclineBench } from './incline-bench.mjs';
import { createStepPlatform } from './dumbbell-expansion.mjs';
import { verifyFamily, barGripVerifier } from './verify-barbell-standing-more.mjs';

await verifyFamily(createEntries, createBarbell, [
  'Barbell_Curls_Lying_Against_An_Incline', 'Barbell_Glute_Bridge', 'Barbell_Incline_Shoulder_Raise',
  'Barbell_Shoulder_Press', 'Barbell_Squat_To_A_Bench', 'Barbell_Step_Ups', 'Bench_Press_-_Powerlifting',
  'Bent-Arm_Barbell_Pullover', 'Close-Grip_Barbell_Bench_Press', 'Incline_Barbell_Triceps_Extension', 'JM_Press',
  'Lying_Close-Grip_Barbell_Triceps_Extension_Behind_The_Head', 'One_Arm_Floor_Press', 'Palms-Down_Wrist_Curl_Over_A_Bench',
  'Palms-Up_Barbell_Wrist_Curl_Over_A_Bench', 'Seated_Barbell_Military_Press', 'Seated_Close-Grip_Concentration_Barbell_Curl',
  'Box_Squat', 'Seated_Palm-Up_Barbell_Wrist_Curl', 'Wide-Grip_Barbell_Bench_Press',
], 'BARBELL', ({ id, entry, at, scene, prop, point }) => {
  const checkGrip = barGripVerifier(scene, prop);
  for (let frame = 0; frame <= 36; frame++) {
    at(frame * entry.clip.duration / 36);
    checkGrip(id, id === 'One_Arm_Floor_Press' ? 'R' : 'LR', frame % 12 === 0);
  }
  const { equipment, benchTransform, platformTransform } = entry;
  if (id === 'Barbell_Incline_Shoulder_Raise') {
    const elbowAngle = (side) => {
      const elbow = point('Forearm' + side);
      return elbow.clone().sub(point('Arm' + side)).angleTo(point('Hand' + side).sub(elbow));
    };
    at(0);
    const height = prop.position.y;
    assert.ok(elbowAngle('L') < .21, id + ' starts with straight arms');
    at(1.4);
    assert.ok(prop.position.y > height + .043 && elbowAngle('L') < .21, id + ' scapular reach with straight arms');
  }
  const fixture = equipment === 'bench-barbell' ? createFlatBench()
    : equipment === 'incline-bench-barbell' ? createInclineBench({ angle: benchTransform.angle })
      : equipment === 'step-platform-barbell' ? createStepPlatform() : null;
  if (fixture) {
    const transform = benchTransform ?? platformTransform;
    fixture.position.fromArray(transform?.position ?? [0, 0, 0]);
    fixture.rotation.y = transform?.yaw ?? 0;
    const bounds = new Box3().setFromObject(fixture);
    assert.ok(Math.abs(bounds.min.y) < .007, id + ' grounded support');
    if (id === 'Barbell_Step_Ups') {
      at(1.56);
      for (const side of ['R', 'L']) {
        const foot = point('Foot' + side);
        assert.ok(Math.abs(foot.y - bounds.max.y - .074) < .015, id + ' sole reaches platform');
        assert.ok(foot.z > bounds.min.z && foot.z + .17 < bounds.max.z, id + ' foot inside platform');
      }
    }
    if (id === 'Box_Squat' || id === 'Barbell_Squat_To_A_Bench') {
      at(entry.phases[2][0]);
      const hip = point('Pelvis');
      assert.ok(Math.abs(hip.y - bounds.max.y - .125) < .018 && hip.z > bounds.min.z && hip.z < bounds.max.z, id + ' hip reaches support');
    }
    if (id.includes('Wrist_Curl')) {
      at(0);
      const grip = point('HandL');
      const base = point('ForearmL');
      at(1.4);
      assert.ok(point('HandL').distanceTo(grip) < .003 && point('ForearmL').distanceTo(base) < .003, id + ' isolated wrist rotation');
      if (id.includes('Over_A_Bench')) {
        const pad = new Box3().setFromObject(fixture.getObjectByName('Pad'));
        assert.ok(grip.z > pad.max.z && base.z < pad.max.z && base.y > pad.max.y, id + ' forearm over pad');
      }
    }
  } else {
    assert.equal(entry.framing, 'floor', id);
    at(0);
    const initial = point('Pelvis');
    at(entry.phases[2][0]);
    if (id === 'Barbell_Glute_Bridge') assert.ok(point('Pelvis').y > initial.y + .17, id + ' hip extension');
    else assert.ok(point('ForearmR').y < .14, id + ' working elbow approaches floor');
  }
});
