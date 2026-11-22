import {
  X, Y, ankleHeight, createAuthor, cues, down, lerp, mix, motion, pitch, q, rep, sides, up, v, yaw,
} from './barbell-standing-more.mjs';
import { stepPlatformHeight } from './dumbbell-expansion.mjs';

export const groupLabel = 'Supported barbell techniques';

const flat = { equipment: 'bench-barbell', framing: 'bench' };
const floor = { framing: 'floor' };
const incline = (angle) => ({
  equipment: 'incline-bench-barbell', framing: 'bench', benchTransform: { position: [0, 0, 0], angle },
});
const platform = { equipment: 'step-platform-barbell' };
const halfPi = Math.PI / 2;

export function createEntries(asset, helpers) {
  const {
    add, entries, torso, world, point, bone, leg, arm, free, grip, bar, stance, backRack, armLength,
  } = createAuthor(asset, helpers, metadata);

  const flatFeet = (z, width = .234) => {
    for (const [side, sign] of sides) leg(side, v(sign * width, ankleHeight, z), yaw(sign * .17), v(sign * .14, 1, .3));
  };
  function supine(onFloor = false, arch = 0) {
    torso(v(0, onFloor ? .133 : .553, onFloor ? .34 : .38), pitch(-halfPi), pitch(-halfPi - .245));
    world('Lumbar', pitch(-halfPi - .041 - arch));
    world('Chest', pitch(-halfPi + arch * .96));
    flatFeet(onFloor ? .66 : .725 - .29 * arch, arch ? .285 : .234);
  }

  function recline(angle) {
    const facing = yaw(Math.PI);
    const lean = halfPi - angle + .068;
    torso(v(0, .564, -.069), pitch(lean).multiply(facing), pitch(lean + .085).multiply(facing));
    for (const [side, sign] of sides) {
      leg(side, v(-sign * .255, ankleHeight, angle > .8 ? -.56 : -.44), facing, v(-sign * .20, .85, -1));
    }
  }

  function pressTop(width, z, direction, frame = q()) {
    const { offset } = grip('L', X.clone().applyQuaternion(frame).negate(), direction);
    const shoulder = point('ArmL');
    const x = v(width, 0, 0).applyQuaternion(frame).x;
    return v(0, shoulder.y + offset.y + Math.sqrt((armLength - .002) ** 2 -
      (x - offset.x - shoulder.x) ** 2 - (z - offset.z - shoulder.z) ** 2), z);
  }

  // Build from fixed elbows or wrists where the exercise calls for an isolated joint.
  function anchoredBar(frame, width, directions, target, underhand = false) {
    const axis = X.clone().applyQuaternion(frame);
    const contacts = sides.map(([side, sign]) => {
      const { hand, offset } = grip(side, axis.clone().multiplyScalar(underhand ? 1 : -1), directions);
      const { wrist, pole } = target(side, sign, offset);
      arm(side, wrist, pole, hand);
      return wrist.clone().add(offset).addScaledVector(axis, -sign * width);
    });
    return [contacts[0].lerp(contacts[1], .5), frame];
  }

  add('Barbell_Curls_Lying_Against_An_Incline', up, cues(up, ['Set your chest against the pad', 'Let both arms hang and take a palms-up grip.'],
    ['Curl without swinging', 'Keep your upper arms hanging and squeeze your biceps.'],
    ['Lower to the hang', 'Straighten your elbows under control.']), (t) => {
    const a = rep(up, t);
    torso(v(0, .800, .204), pitch(Math.PI / 6), pitch(.43));
    for (const [side, sign] of sides) leg(side, v(sign * .30, ankleHeight, -.15), yaw(sign * .17), v(sign * .7, -.15, -.8));
    const angle = lerp(.25, 2.28, a);
    const direction = v(0, -Math.cos(angle), Math.sin(angle));
    return anchoredBar(q(), .214, direction, (side, sign, offset) => {
      const elbow = point('Arm' + side).addScaledVector(v(sign * .09, -1, .13).normalize(), bone('Forearm' + side).position.length());
      const length = bone('Hand' + side).position.length();
      const x = sign * .214 - offset.x - elbow.x;
      return { wrist: elbow.addScaledVector(direction, Math.sqrt(length ** 2 - x ** 2)).add(v(x, 0, 0)),
        pole: v(sign * .16, -1, -.3) };
    }, true);
  }, incline(Math.PI / 3));

  add('Barbell_Glute_Bridge', up, cues(up, ['Set the bar across your hips', 'Lie on the floor with both heels planted.'],
    ['Drive your hips up', 'Keep your upper back down as your hips rise beneath the shaft.'],
    ['Lower the hips', 'Guide the bar back down with both hands.']), (t) => {
    const a = rep(up, t);
    const tilt = pitch(lerp(-1.56, -1.94, a));
    const position = v(0, .140, -.134).sub(v(0, .493, -.005).applyQuaternion(tilt));
    torso(position, tilt, pitch(-1.65));
    flatFeet(.710, .221);
    const center = position.clone().add(v(0, .131 + .01 * a, .015));
    center.y = Math.max(.225, center.y);
    return bar(center, .244, v(0, -.57, .82), (sign) => v(sign, -.25, -.2));
  }, floor);

  const raiseAngle = Math.PI / 6;
  add('Barbell_Incline_Shoulder_Raise', up, cues(up, ['Lock your elbows above the incline pad', 'Set a medium-width overhand grip.'],
    ['Reach from your shoulder blades', 'Lift the bar a short distance while keeping your elbows straight.'],
    ['Settle into the pad', 'Lower your shoulders without bending your arms.']), (t) => {
    const a = rep(up, t);
    recline(raiseAngle);
    const frame = yaw(Math.PI);
    const shift = v(0, Math.cos(raiseAngle), -Math.sin(raiseAngle)).multiplyScalar(.055);
    for (const [side] of sides) {
      const socket = bone('Arm' + side);
      socket.position.copy(socket.parent.worldToLocal(point('Arm' + side).addScaledVector(shift, a)));
    }
    const width = .248;
    const direction = Y;
    return bar(pressTop(width, point('ArmL').z, direction, frame), width, direction,
      (sign) => v(-sign, -.45, -.2), { frame });
  }, incline(raiseAngle));

  for (const [id, supported, width] of [
    ['Barbell_Shoulder_Press', true, .284], ['Seated_Barbell_Military_Press', false, .309],
  ]) {
    const angle = Math.PI / 3;
    add(id, down, cues(down, [supported ? 'Set your back against the pad' : 'Sit tall and brace',
      'Take a grip wider than your shoulders and start with the bar overhead.'],
    ['Lower to the collarbone', 'Keep your wrists above your elbows and the shaft in front of your head.'],
    ['Press straight up', 'Finish with your arms extended over your shoulders.']), (t) => {
      if (supported) {
        // Turn the incline fixture to face +Z, matching the other seated press.
        torso(v(0, .553, .035), pitch(-.36), pitch(0));
        flatFeet(.55);
      } else {
        torso(v(0, .551, 0), pitch(-.07), pitch(0));
        flatFeet(.45);
      }
      const a = rep(down, t);
      const shoulder = point('ArmL');
      const direction = v(0, 1, -.32 * a);
      const top = pressTop(width, shoulder.z + .09, Y);
      const low = v(0, shoulder.y + .007, shoulder.z + .263);
      return bar(mix(top, low, a), width, direction, (sign) => v(sign, -.88, -.15));
    }, supported ? { ...incline(angle), benchTransform: { position: [0, 0, 0], angle, yaw: Math.PI } } : flat);
  }

  for (const [id, box] of [['Barbell_Squat_To_A_Bench', false], ['Box_Squat', true]]) {
    const phases = box ? [[0, 'Stand'], [.25, 'Sit back'], [1.46, 'Sit on box'], [2.12, 'Drive off box'], [3.35, 'Stand']]
      : [[0, 'Stand'], [.25, 'Sit back'], [1.77, 'Touch pad'], [1.85, 'Rise'], [3.35, 'Stand']];
    add(id, phases, cues(phases, ['Set the support behind you', 'Brace the bar across your upper back.'],
      [box ? 'Pause on the box' : 'Lightly touch the bench', box
        ? 'Stay braced and settle at the bottom before driving upward.' : 'Keep tension as your hips make contact with the pad.'],
      ['Drive up through both feet', 'Keep your knees tracking out and your chest lifted.']), (t) => {
      const a = rep(phases, t);
      torso(v(0, lerp(.861, box ? .426 : .551, a), lerp(-.03, box ? -.285 : -.239, a)),
        pitch(.07 + (box ? .50 : .42) * a), pitch(.16 * a));
      stance(box ? .262 : .174, .055, box ? .30 : .17);
      return backRack();
    }, box ? { ...platform, platformTransform: { position: [0, 0, -.83] } }
      : { ...flat, benchTransform: { position: [0, 0, -.562] } });
  }

  const step = [[0, 'Stand below platform'], [.7, 'Right foot plants'], [1.56, 'Both feet on top'],
    [2.02, 'Lower left foot'], [2.67, 'Left foot down'], [3.35, 'Reset']];
  add('Barbell_Step_Ups', step, [[0, 'Set the bar across your shoulders', 'Start close enough to plant your whole lead foot on the platform.'],
    [.70, 'Drive through your right foot', 'Extend the lead hip and knee to bring both feet onto the platform.'],
    [2.02, 'Step down under control', 'Lower the left foot first, then bring the right foot back.']], (t) => {
    const lead = motion([0, .70, 2.67, 3.35], [0, 1, 1, 0], t);
    const trail = motion([0, .78, 1.56, 2.02, 2.67], [0, 0, 1, 1, 0], t);
    const lift = motion([0, .45, 1.51, 1.97, 2.86, 3.60], [0, 0, 1, 1, 0, 0], t);
    torso(v(0, .855 + .30 * lift - .045 * Math.abs(lead - trail), -.213 + .57 * lift + .05 * (lead - trail)),
      pitch(.05 + .25 * Math.abs(lead - trail)), pitch(.04));
    for (const [side, sign] of sides) {
      const a = side === 'R' ? lead : trail;
      leg(side, v(sign * .145, ankleHeight + stepPlatformHeight * a + .25 * Math.sin(Math.PI * a),
        lerp(-.25, .382, a)), yaw(sign * .09));
    }
    return backRack();
  }, platform);

  for (const [id, width, touchZ, arch, tuck] of [
    ['Bench_Press_-_Powerlifting', .365, .218, .20, .67],
    ['Close-Grip_Barbell_Bench_Press', .157, .112, 0, .44],
    ['Wide-Grip_Barbell_Bench_Press', .370, .064, 0, .95],
    ['JM_Press', .158, -.026, 0, .25],
  ]) {
    const jm = id === 'JM_Press';
    add(id, down, cues(down, [arch ? 'Set your arch and tuck your feet' : 'Set your upper back and feet',
      jm ? 'Start with a close grip over the upper chest.' : 'Begin with the shaft above your shoulders.'],
    [jm ? 'Fold your elbows toward your ribs' : 'Pause at the bottom',
      jm ? 'Let the bar travel toward the upper chest as your elbows bend.' : arch
        ? 'Touch low on the chest while keeping your upper back tight.' : 'Lower to mid-chest with your wrists above your elbows.'],
    ['Press back to lockout', 'Return the bar over your shoulders.']), (t) => {
      const a = rep(down, t);
      supine(false, arch);
      const top = pressTop(width, point('ArmL').z + (jm ? .059 : .013), Y);
      const bottom = v(0, jm ? .827 : arch ? .765 : .721, touchZ);
      const center = mix(top, bottom, a);
      if (jm) center.z -= .099 * Math.sin(Math.PI * a);
      return bar(center, width, v(0, 1, a * (jm ? -.76 : .28)), (sign) => v(sign * tuck, -1, jm ? .5 : .90));
    }, flat);
  }

  add('Bent-Arm_Barbell_Pullover', down, cues(down, ['Start over your chest', 'Take a shoulder-width grip with your elbows softly bent.'],
    ['Sweep behind your head', 'Keep the elbow bend while moving through the shoulder joint.'],
    ['Return along the arc', 'Bring the shaft back over your chest without lifting your ribs.']), (t) => {
    supine();
    const angle = lerp(-.08, 1.46, rep(down, t));
    const direction = v(0, Math.cos(angle), -Math.sin(angle));
    const center = point('ArmL').addScaledVector(direction, .547);
    return bar(v(0, center.y, center.z), .214, direction, (sign) => v(sign * .20, -.42, -.9));
  }, flat);

  for (const [id, tilted] of [
    ['Incline_Barbell_Triceps_Extension', true], ['Lying_Close-Grip_Barbell_Triceps_Extension_Behind_The_Head', false],
  ]) {
    const angle = Math.PI / 4;
    add(id, down, cues(down, ['Line up your upper arms with your torso', 'Keep your elbows close and your grip even.'],
      ['Bend only at the elbows', 'Lower the shaft in an arc behind your head.'],
      ['Extend your elbows', 'Keep your upper arms in place through the return.']), (t) => {
      if (tilted) recline(angle);
      else supine();
      const a = rep(down, t);
      const frame = tilted ? yaw(Math.PI) : q();
      const upper = v(0, tilted ? .69 : .23, tilted ? .73 : -.973).normalize();
      const bend = lerp(tilted ? .75 : 1.38, tilted ? 2.81 : 3.09, a);
      const direction = v(0, Math.cos(bend), (tilted ? 1 : -1) * Math.sin(bend));
      return anchoredBar(frame, .188, direction, (side, sign, offset) => {
        const elbow = point('Arm' + side).addScaledVector(upper, bone('Forearm' + side).position.length());
        const x = (tilted ? -sign : sign) * .188 - offset.x - elbow.x;
        const length = bone('Hand' + side).position.length();
        return { wrist: elbow.addScaledVector(direction, Math.sqrt(length ** 2 - x ** 2)).add(v(x, 0, 0)), pole: upper };
      });
    }, tilted ? incline(angle) : flat);
  }

  add('One_Arm_Floor_Press', down, cues(down, ['Balance the shaft at its midpoint', 'Lie on the floor and bend your knees.'],
    ['Stop with your upper arm on the floor', 'Lower under control with the palm facing inward.'],
    ['Press above your shoulder', 'Keep the shaft level and your torso steady.']), (t) => {
    supine(true);
    const a = rep(down, t);
    free('L', v(.61, .057, -.17), v(1, 0, .1), v(0, .5, -.2));
    const shoulder = point('ArmR');
    return bar(shoulder.add(v(-.09 - .19 * a, .58 - .313 * a, -.008 + .22 * a)), 0, v(0, 1, .18 * a),
      () => v(-.95, -.67, .47), { frame: yaw(-halfPi), hands: 'R' });
  }, { ...floor, fingers: 'R' });

  for (const [id, underhand, seated] of [
    ['Palms-Down_Wrist_Curl_Over_A_Bench', false, false],
    ['Palms-Up_Barbell_Wrist_Curl_Over_A_Bench', true, false],
    ['Seated_Palm-Up_Barbell_Wrist_Curl', true, true],
  ]) {
    add(id, up, cues(up, [underhand ? 'Turn your palms up' : 'Turn your palms down',
      seated ? 'Brace your forearms on your thighs with your wrists just past your knees.'
        : 'Kneel beside the long edge and brace your forearms on the pad.'],
    ['Move at the wrists', 'Raise the shaft without lifting your forearms.'],
    ['Lower the bar slowly', 'Keep your forearms supported on the way back.']), (t) => {
      if (seated) {
        torso(v(0, .547, .055), pitch(.80), pitch(.19));
        flatFeet(.56, .255);
      } else {
        torso(v(0, .391, -.390), pitch(.69), pitch(.18));
        for (const [side, sign] of sides) {
          const hip = point('Thigh' + side);
          const upper = bone('Shin' + side).position.length();
          const lower = bone('Foot' + side).position.length();
          const drop = hip.y - .079;
          const knee = hip.add(v(sign * .035, -drop, Math.sqrt(upper ** 2 - drop ** 2 - .035 ** 2)));
          const ankle = knee.clone().add(v(0, -.016, -Math.sqrt(lower ** 2 - .016 ** 2)));
          leg(side, ankle, pitch(2.89), v(sign * .05, -.65, 1));
        }
      }
      const a = rep(up, t);
      const angle = lerp(-.61, .74, a);
      const direction = v(0, Math.sin(angle), Math.cos(angle));
      return anchoredBar(pitch((underhand ? 1 : -1) * angle), .202, direction, (side, sign, offset) =>
        ({ wrist: v(sign * .202 - offset.x, seated ? .484 : .477, seated ? .602 : .160), pole: v(sign * .16, -1, -.22) }),
        underhand);
    }, seated ? flat : { ...flat, benchTransform: { position: [0, 0, 0], yaw: halfPi } });
  }

  add('Seated_Close-Grip_Concentration_Barbell_Curl', up, cues(up, ['Set your elbows against your inner thighs',
    'Sit with your feet wide and take a narrow palms-up grip.'],
  ['Curl from the elbows', 'Keep your upper arms braced as the bar rises.'],
  ['Lower under control', 'Let the elbows straighten without changing your torso angle.']), (t) => {
    torso(v(0, .549, .043), pitch(.75), pitch(.21));
    flatFeet(.56, .347);
    const a = rep(up, t);
    const angle = lerp(.14, 2.03, a);
    const direction = v(0, -Math.cos(angle), Math.sin(angle));
    return anchoredBar(q(), .113, direction, (side, sign, offset) => {
      const pole = v(sign * .10, -.90, .43).normalize();
      const elbow = point('Arm' + side).addScaledVector(pole, bone('Forearm' + side).position.length());
      const x = sign * .113 - offset.x - elbow.x;
      const length = bone('Hand' + side).position.length();
      return { wrist: elbow.addScaledVector(direction, Math.sqrt(length ** 2 - x ** 2)).add(v(x, 0, 0)), pole };
    }, true);
  }, flat);

  return entries;
}

const metadata = {
  'Barbell_Curls_Lying_Against_An_Incline': ['Barbell Curls Lying Against An Incline', ['Biceps'], []],
  'Barbell_Glute_Bridge': ['Barbell Glute Bridge', ['Glutes'], ['Calves', 'Hamstrings']],
  'Barbell_Incline_Shoulder_Raise': ['Barbell Incline Shoulder Raise', ['Shoulders'], ['Chest']],
  'Barbell_Shoulder_Press': ['Barbell Shoulder Press', ['Shoulders'], ['Chest', 'Triceps']],
  'Barbell_Squat_To_A_Bench': ['Barbell Squat To A Bench', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings', 'Upper back']],
  'Barbell_Step_Ups': ['Barbell Step Ups', ['Quadriceps'], ['Calves', 'Glutes', 'Hamstrings']],
  'Bench_Press_-_Powerlifting': ['Bench Press - Powerlifting', ['Triceps'], ['Chest', 'Forearms', 'Upper back', 'Shoulders']],
  'Bent-Arm_Barbell_Pullover': ['Bent-Arm Barbell Pullover', ['Upper back'], ['Chest', 'Shoulders', 'Triceps']],
  'Close-Grip_Barbell_Bench_Press': ['Close-Grip Barbell Bench Press', ['Triceps'], ['Chest', 'Shoulders']],
  'Incline_Barbell_Triceps_Extension': ['Incline Barbell Triceps Extension', ['Triceps'], ['Forearms']],
  'JM_Press': ['JM Press', ['Triceps'], ['Chest', 'Shoulders']],
  'Lying_Close-Grip_Barbell_Triceps_Extension_Behind_The_Head': ['Lying Close-Grip Barbell Triceps Extension Behind The Head', ['Triceps'], []],
  'One_Arm_Floor_Press': ['One Arm Floor Press', ['Triceps'], ['Chest', 'Shoulders']],
  'Palms-Down_Wrist_Curl_Over_A_Bench': ['Palms-Down Wrist Curl Over A Bench', ['Forearms'], []],
  'Palms-Up_Barbell_Wrist_Curl_Over_A_Bench': ['Palms-Up Barbell Wrist Curl Over A Bench', ['Forearms'], []],
  'Seated_Barbell_Military_Press': ['Seated Barbell Military Press', ['Shoulders'], ['Triceps']],
  'Seated_Close-Grip_Concentration_Barbell_Curl': ['Seated Close-Grip Concentration Barbell Curl', ['Biceps'], []],
  'Box_Squat': ['Box Squat', ['Quadriceps'], ['Adductors', 'Calves', 'Glutes', 'Hamstrings', 'Upper back']],
  'Seated_Palm-Up_Barbell_Wrist_Curl': ['Seated Palm-Up Barbell Wrist Curl', ['Forearms'], []],
  'Wide-Grip_Barbell_Bench_Press': ['Wide-Grip Barbell Bench Press', ['Chest'], ['Shoulders', 'Triceps']],
};
