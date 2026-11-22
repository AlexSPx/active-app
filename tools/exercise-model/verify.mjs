import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupLabel as conditioningLabel } from './final-conditioning.mjs';
import { groupLabel as strengthLabel } from './final-strength.mjs';
import { groupLabel as apparatusLabel } from './final-apparatus.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const threeRoot = dirname(dirname(require.resolve('three')));
const catalog = JSON.parse(await readFile(new URL('../../apps/client/lib/data/exercise-catalog.json', import.meta.url)));
const ids = ['Bodyweight_Squat', 'Freehand_Jump_Squat', 'Dumbbell_Squat'].map((key) => 'local:exercise:' + key);
const gripCheck = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-grip.mjs', import.meta.url))],
  { stdio: 'inherit' });
if (gripCheck.error) throw gripCheck.error;
assert.equal(gripCheck.status, 0, 'Calibrated dumbbell grip regression failed');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  args: ['--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Run the viewer's pinned Three.js version locally so the test does not need the CDN.
  await page.route('https://cdn.jsdelivr.net/npm/three@0.183.2/**', async (route) => {
    const filename = new URL(route.request().url()).pathname.split('/three@0.183.2/')[1];
    await route.fulfill({ contentType: 'text/javascript', body: await readFile(join(threeRoot, filename)) });
  });
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.goto(process.env.VIEWER_URL || 'http://localhost:8000');
  await page.locator('#exercise:enabled').waitFor();
  const menu = (page) => page.locator('#exercise option').evaluateAll((options) =>
    options.map((option) => [option.parentElement.label, option.value, option.textContent]));
  const sourceMenu = await menu(page);
  const allIds = sourceMenu.map(([, id]) => id);
  assert.deepEqual([...allIds].sort(), catalog.map(({ id }) => id).sort());
  assert.equal(new Set(allIds).size, allIds.length);
  assert.equal(new Set(sourceMenu.map(([, , name]) => name)).size, allIds.length);
  assert.ok(ids.every((id) => allIds.includes(id)));
  const addedGroups = [
    ['Bodyweight skills and stretches', [
      'Incline_Push-Up_Close-Grip', 'Incline_Push-Up_Medium', 'Incline_Push-Up_Wide',
      'Incline_Push-Up_Reverse_Grip', 'Lying_Crossover', 'Lying_Glute',
      'Lying_Bent_Leg_Groin', 'Lying_Hamstring', 'On-Your-Back_Quad_Stretch',
      'Flutter_Kicks', 'Lying_Prone_Quadriceps', 'Seated_Glute',
      'Seated_Biceps', 'Seated_Front_Deltoid', 'Seated_Hamstring',
      'Seated_Hamstring_and_Calf_Stretch', 'Intermediate_Groin_Stretch', 'Spinal_Stretch',
      'Overhead_Triceps', 'Overhead_Lat', 'Standing_Biceps_Stretch',
      'Hamstring_Stretch', 'Standing_Gastrocnemius_Calf_Stretch', 'Standing_Hamstring_and_Calf_Stretch',
      'Bench_Jump', 'Front_Box_Jump', 'Single-Leg_Lateral_Hop',
      'Gironda_Sternum_Chins', 'Side_To_Side_Chins', 'Moving_Claw_Series',
    ]],
    ['Dumbbell isolation and swings', [
      'Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench', 'Dumbbell_Lying_One-Arm_Rear_Lateral_Raise', 'Dumbbell_Lying_Rear_Lateral_Raise',
      'Lying_Rear_Delt_Raise', 'Dumbbell_Tricep_Extension_-Pronated_Grip', 'One_Arm_Pronated_Dumbbell_Triceps_Extension',
      'One_Arm_Supinated_Dumbbell_Triceps_Extension', 'Standing_One-Arm_Dumbbell_Triceps_Extension', 'Dumbbell_Seated_One-Leg_Calf_Raise',
      'Single_Dumbbell_Raise', 'Standing_Dumbbell_Triceps_Extension', 'Vertical_Swing',
    ]],
    ['Barbell lifts and support work', [
      'Clean', 'Power_Clean', 'Hang_Clean',
      'Hang_Clean_-_Below_the_Knees', 'Split_Clean', 'Clean_and_Press',
      'Clean_and_Jerk', 'Snatch', 'Power_Snatch',
      'Muscle_Snatch', 'Hang_Snatch', 'Hang_Snatch_-_Below_Knees',
      'Split_Snatch', 'Power_Jerk', 'Split_Jerk',
      'Squat_Jerk', 'Jerk_Balance', 'Jerk_Dip_Squat',
      'Heaving_Snatch_Balance', 'Snatch_Balance', 'Push_Press_-_Behind_the_Neck',
      'Standing_Barbell_Calf_Raise', 'Rocking_Standing_Calf_Raise', 'Barbell_Seated_Calf_Raise',
      'Seated_Good_Mornings', 'Elevated_Back_Lunge', 'One_Leg_Barbell_Squat',
      'Speed_Box_Squat', 'Front_Barbell_Squat_To_A_Bench', 'Bradford_Rocky_Presses',
      'Standing_Bradford_Press', 'Standing_Barbell_Press_Behind_Neck', 'Standing_Overhead_Barbell_Triceps_Extension',
      'Barbell_Guillotine_Bench_Press', 'Lying_Close-Grip_Barbell_Triceps_Press_To_Chin', 'Lying_Triceps_Press',
      'Reverse_Triceps_Bench_Press', 'Neck_Press', 'Incline_Bench_Pull',
      'Straight_Raises_on_Incline_Bench',
    ]],
    ['Kettlebell pairs and combinations', [
      'Two-Arm_Kettlebell_Military_Press', 'Alternating_Kettlebell_Press', 'Kettlebell_Seesaw_Press',
      'Double_Kettlebell_Push_Press', 'Double_Kettlebell_Jerk', 'Two-Arm_Kettlebell_Jerk',
      'Kettlebell_Thruster', 'Front_Squats_With_Two_Kettlebells', 'Alternating_Hang_Clean',
      'Double_Kettlebell_Alternating_Hang_Clean', 'Double_Kettlebell_Snatch', 'Two-Arm_Kettlebell_Clean',
      'One-Arm_Kettlebell_Clean_and_Jerk', 'One-Arm_Kettlebell_Split_Jerk', 'One-Arm_Kettlebell_Split_Snatch',
      'Alternating_Floor_Press', 'Alternating_Kettlebell_Row', 'Alternating_Renegade_Row',
    ]],
  ];
  const resistanceGroups = [
    ['Cable training', [
      'Alternating_Cable_Shoulder_Press', 'Bent_Over_Low-Pulley_Side_Lateral', 'Cable_Chest_Press',
      'Cable_Crossover', 'Cable_Crunch', 'Cable_Deadlifts', 'Cable_Hammer_Curls_-_Rope_Attachment',
      'Cable_Hip_Adduction', 'Cable_Incline_Pushdown', 'Cable_Incline_Triceps_Extension',
      'Cable_Internal_Rotation', 'Cable_Iron_Cross', 'Cable_Judo_Flip', 'Cable_Lying_Triceps_Extension',
      'Cable_One_Arm_Tricep_Extension', 'Cable_Rear_Delt_Fly', 'Cable_Reverse_Crunch',
      'Cable_Rope_Overhead_Triceps_Extension', 'Cable_Rope_Rear-Delt_Rows', 'Cable_Seated_Crunch',
      'Cable_Shoulder_Press', 'Cable_Shrugs', 'External_Rotation_with_Cable', 'Face_Pull',
      'Flat_Bench_Cable_Flyes', 'Front_Cable_Raise', 'Full_Range-Of-Motion_Lat_Pulldown', 'High_Cable_Curls',
      'Incline_Cable_Chest_Press', 'Incline_Cable_Flye', 'Kneeling_Cable_Crunch_With_Alternating_Oblique_Twists',
      'Kneeling_High_Pulley_Row', 'Kneeling_Single-Arm_High_Pulley_Row', 'Low_Cable_Crossover', 'Lying_Cable_Curl',
      'Lying_Close-Grip_Bar_Curl_On_High_Pulley', 'One-Arm_High-Pulley_Cable_Side_Bends',
      'One-Legged_Cable_Kickback', 'One_Arm_Lat_Pulldown', 'Pallof_Press', 'Pallof_Press_With_Rotation', 'Pull_Through',
      'Reverse_Cable_Curl', 'Rope_Straight-Arm_Pulldown', 'Seated_Cable_Rows', 'Seated_Cable_Shoulder_Press',
      'Seated_One-arm_Cable_Pulley_Rows', 'Shotgun_Row', 'Single-Arm_Cable_Crossover',
      'Standing_Biceps_Cable_Curl', 'Standing_Cable_Chest_Press', 'Standing_Cable_Lift',
      'Standing_Cable_Wood_Chop', 'Standing_Low-Pulley_Deltoid_Raise',
      'Standing_Low-Pulley_One-Arm_Triceps_Extension', 'Standing_One-Arm_Cable_Curl', 'Standing_Rope_Crunch', 'Straight-Arm_Pulldown',
      'Triceps_Pushdown', 'Triceps_Pushdown_-_Rope_Attachment', 'Underhand_Cable_Pulldowns', 'Upright_Cable_Row',
      'V-Bar_Pulldown', 'Wide-Grip_Lat_Pulldown', 'Wide-Grip_Pulldown_Behind_The_Neck',
    ]],
    ['Resistance band training', [
      'Back_Flyes_-_With_Bands', 'Band_Good_Morning', 'Band_Good_Morning_Pull_Through', 'Band_Hip_Adductions',
      'Band_Pull_Apart', 'Band_Skull_Crusher', 'Bench_Press_-_With_Bands', 'Calf_Raises_-_With_Bands',
      'Cross_Over_-_With_Bands', 'Hip_Extension_with_Bands', 'Hip_Flexion_with_Band', 'Hip_Lift_with_Band',
      'Internal_Rotation_with_Band', 'Lateral_Raise_-_With_Bands', 'Monster_Walk', 'Shoulder_Press_-_With_Bands',
      'Speed_Band_Overhead_Triceps', 'Squats_-_With_Bands', 'Upright_Row_-_With_Bands',
    ]],
    ['Decline bench training', [
      'Decline_Crunch', 'Decline_Oblique_Crunch', 'Decline_Reverse_Crunch', 'Decline_Dumbbell_Bench_Press',
      'Decline_Dumbbell_Flyes', 'Decline_Dumbbell_Triceps_Extension', 'Decline_Barbell_Bench_Press',
      'Decline_Close-Grip_Bench_To_Skull_Crusher', 'Decline_EZ_Bar_Triceps_Extension',
      'Wide-Grip_Decline_Barbell_Bench_Press', 'Wide-Grip_Decline_Barbell_Pullover',
    ]],
    ['Bodyweight support drills', [
      'Bodyweight_Mid_Row', 'One_Arm_Chin-Up', 'Chair_Lower_Back_Stretch', 'Floor_Glute-Ham_Raise', 'Inverted_Row',
    ]],
  ];
  const exactGroups = [
    ['Bodyweight mobility and bench', ['Ankle_On_The_Knee', 'Decline_Push-Up', 'Groin_and_Back_Stretch',
      'Iron_Crosses_stretch', 'Knee_Across_The_Body', 'Looking_At_Ceiling', 'One_Knee_To_Chest',
      'Overhead_Stretch', 'Runners_Stretch', 'Seated_Calf_Stretch', 'Seated_Flat_Bench_Leg_Pull-In',
      'Seated_Overhead_Stretch', 'Shoulder_Circles', 'Shoulder_Raise', 'Side_Lying_Groin_Stretch',
      'Side-Lying_Floor_Stretch', 'Split_Squats', 'Tricep_Side_Stretch', 'Upper_Back-Leg_Grab', 'Windmills']],
    ['Dumbbell bench and seated', ['Bent-Arm_Dumbbell_Pullover', 'Close-Grip_Dumbbell_Press',
      'Dumbbell_Lying_Supination', 'Dumbbell_Shoulder_Press', 'Flexor_Incline_Dumbbell_Curls',
      'Hammer_Grip_Incline_DB_Bench_Press', 'Incline_Dumbbell_Flyes', 'Lying_Supine_Dumbbell_Curl',
      'Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench', 'Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench',
      'Reverse_Flyes', 'Seated_Bent-Over_One-Arm_Dumbbell_Triceps_Extension',
      'Seated_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension', 'Seated_Dumbbell_Inner_Biceps_Curl',
      'Seated_Dumbbell_Palms-Up_Wrist_Curl', 'Seated_One-Arm_Dumbbell_Palms-Down_Wrist_Curl',
      'Seated_One-Arm_Dumbbell_Palms-Up_Wrist_Curl', 'Seated_Side_Lateral_Raise',
      'Standing_One-Arm_Dumbbell_Curl_Over_Incline_Bench', 'Straight-Arm_Dumbbell_Pullover']],
    ['Standing barbell techniques', ['Barbell_Lunge', 'Barbell_Side_Bend', 'Clean_Deadlift', 'Clean_Shrug',
      'Close-Grip_Standing_Barbell_Curl', 'Frankenstein_Squat', 'Front_Barbell_Squat', 'Jefferson_Squats',
      'Narrow_Stance_Squats', 'Olympic_Squat', 'Push_Press', 'Snatch_Deadlift', 'Snatch_Pull', 'Snatch_Shrug',
      'Standing_Front_Barbell_Raise_Over_Head', 'Stiff_Leg_Barbell_Good_Morning', 'Upright_Barbell_Row',
      'Wide_Stance_Stiff_Legs', 'Wide-Grip_Standing_Barbell_Curl', 'Wrist_Rotations_with_Straight_Bar']],
    ['Supported barbell techniques', ['Barbell_Curls_Lying_Against_An_Incline', 'Barbell_Glute_Bridge',
      'Barbell_Incline_Shoulder_Raise', 'Barbell_Shoulder_Press', 'Barbell_Squat_To_A_Bench',
      'Barbell_Step_Ups', 'Bench_Press_-_Powerlifting', 'Bent-Arm_Barbell_Pullover', 'Box_Squat',
      'Close-Grip_Barbell_Bench_Press', 'Incline_Barbell_Triceps_Extension', 'JM_Press',
      'Lying_Close-Grip_Barbell_Triceps_Extension_Behind_The_Head', 'One_Arm_Floor_Press',
      'Palms-Down_Wrist_Curl_Over_A_Bench', 'Palms-Up_Barbell_Wrist_Curl_Over_A_Bench',
      'Seated_Barbell_Military_Press', 'Seated_Close-Grip_Concentration_Barbell_Curl',
      'Seated_Palm-Up_Barbell_Wrist_Curl', 'Wide-Grip_Barbell_Bench_Press']],
    ['Kettlebell techniques', ['Advanced_Kettlebell_Windmill', 'Bent_Press', 'Kettlebell_Arnold_Press',
      'Kettlebell_Dead_Clean', 'Kettlebell_Figure_8', 'Kettlebell_Halo',
      'Kettlebell_Halo_With_Overhead_Extension', 'Kettlebell_Hang_Clean',
      'Kettlebell_Overhead_Triceps_Extension', 'Kettlebell_Pass_Between_The_Legs', 'Kettlebell_Pistol_Squat',
      'Kettlebell_Seated_Press', 'Kettlebell_Windmill', 'Leg-Over_Floor_Press', 'Lunge_Pass_Through',
      'One-Arm_Kettlebell_Clean', 'One-Arm_Kettlebell_Jerk', 'One-Arm_Kettlebell_Military_Press_To_The_Side',
      'One-Arm_Kettlebell_Push_Press', 'One-Arm_Kettlebell_Snatch']],
  ];
  const supplementalGroups = [
    ['Barbell overload and technique', [
      'Anti-Gravity_Press', 'Barbell_Ab_Rollout', 'Barbell_Rollout_from_Bench',
      'Bench_Press_with_Chains', 'Bent_Over_One-Arm_Long_Bar_Row', 'Bent_Over_Two-Arm_Long_Bar_Row',
      'Board_Press', 'Box_Squat_with_Bands', 'Box_Squat_with_Chains',
      'Clean_from_Blocks', 'Deadlift_with_Bands', 'Deadlift_with_Chains',
      'Deficit_Deadlift', 'Finger_Curls', 'Floor_Press_with_Chains',
      'Front_Raise_And_Pullover', 'Good_Morning_off_Pins', 'Hanging_Bar_Good_Morning',
      'Landmine_180s', 'Landmine_Linear_Jammer', 'Lying_High_Bench_Barbell_Curl',
      'One-Arm_Long_Bar_Row', 'Pin_Presses', 'Power_Clean_from_Blocks',
      'Power_Snatch_from_Blocks', 'Press_Sit-Up', 'Rack_Delivery',
      'Rack_Pull_with_Bands', 'Reverse_Band_Bench_Press', 'Reverse_Band_Box_Squat',
      'Reverse_Band_Deadlift', 'Reverse_Band_Power_Squat', 'Reverse_Band_Sumo_Deadlift',
      'Romanian_Deadlift_from_Deficit', 'Single-Arm_Linear_Jammer', 'Snatch_from_Blocks',
      'Squat_with_Bands', 'Squat_with_Chains', 'Squat_with_Plate_Movers',
      'Standing_Palms-Up_Barbell_Behind_The_Back_Wrist_Curl', 'Straight_Bar_Bench_Mid_Rows', 'Sumo_Deadlift_with_Bands',
      'Sumo_Deadlift_with_Chains', 'T-Bar_Row_with_Handle', 'Weighted_Jump_Squat',
    ]],
    ['Cable accessories and support', [
      'Bosu_Ball_Cable_Crunch_With_Side_Bends', 'Cable_Preacher_Curl', 'Cable_Russian_Twists',
      'Cable_Seated_Lateral_Raise', 'Close-Grip_Front_Lat_Pulldown',
      'Elevated_Cable_Rows', 'Kneeling_Cable_Triceps_Extension', 'Low_Cable_Triceps_Extension',
      'Low_Pulley_Row_To_Neck', 'Overhead_Cable_Curl', 'Reverse_Grip_Triceps_Pushdown',
      'Rope_Crunch', 'Seated_Two-Arm_Palms-Up_Low-Pulley_Wrist_Curl', 'Triceps_Overhead_Extension_with_Rope',
      'Triceps_Pushdown_-_V-Bar_Attachment',
    ]],
    ['Bench accessories and kettlebell drills', [
      'Calf_Raise_On_A_Dumbbell', 'Close-Grip_Push-Up_off_of_a_Dumbbell', 'Double_Kettlebell_Windmill',
      'Dumbbell_Seated_Box_Jump', 'Extended_Range_One-Arm_Kettlebell_Floor_Press', 'Hyperextensions_With_No_Hyperextension_Bench',
      'Kettlebell_Pirate_Ships', 'Natural_Glute_Ham_Raise', 'One_Arm_Dumbbell_Preacher_Curl',
      'Preacher_Curl', 'Preacher_Hammer_Dumbbell_Curl', 'Reverse_Barbell_Preacher_Curls',
      'Spider_Curl', 'Two-Arm_Dumbbell_Preacher_Curl', 'Two-Arm_Kettlebell_Row',
      'V-Bar_Pullup', 'Zottman_Preacher_Curl',
    ]],
    ['Exercise ball stability and strength', [
      'Ball_Leg_Curl', 'Chest_Stretch_on_Stability_Ball', 'Crunch_-_Legs_On_Exercise_Ball',
      'Downward_Facing_Balance', 'Exercise_Ball_Crunch', 'Exercise_Ball_Pull-In',
      'Hug_A_Ball', 'Physioball_Hip_Bridge', 'Push-Ups_With_Feet_On_An_Exercise_Ball',
      'Pyramid', 'Torso_Rotation', 'Weighted_Ball_Hyperextension',
      'Weighted_Ball_Side_Bend',
    ]],
    ['Plate, band and medicine ball accessories', [
      'Car_Drivers', 'Close-Grip_EZ-Bar_Curl_with_Band', 'External_Rotation_with_Band',
      'Front_Plate_Raise', 'Reverse_Plate_Curls', 'Plate_Pinch',
      'Plate_Twist', 'Svend_Press', 'Weighted_Crunches',
      'Weighted_Sissy_Squat',
    ]],
  ];
  for (const [label, keys] of [
    ['Pull-up bar', ['Pullups', 'Chin-Up', 'Mixed_Grip_Chin', 'Wide-Grip_Rear_Pull-Up', 'Scapular_Pull-Up',
      'Hanging_Leg_Raise', 'Wind_Sprints', 'Gorilla_Chin_Crunch']],
    ['EZ curl bar', ['EZ-Bar_Curl', 'Close-Grip_EZ_Bar_Curl', 'Close-Grip_EZ-Bar_Press', 'EZ-Bar_Skullcrusher']],
    ['Dip station', ['Dips_-_Chest_Version', 'Dips_-_Triceps_Version', 'Parallel_Bar_Dip']],
    ['Bodyweight conditioning', ['Frog_Hops', 'Frog_Sit-Ups', 'Jackknife_Sit-Up', 'Mountain_Climbers',
      'Push_Up_to_Side_Plank', 'Side_Standing_Long_Jump', 'Spider_Crawl']],
    ['Supine core', ['Air_Bike', 'Alternate_Heel_Touchers', 'Bent-Knee_Hip_Raise', 'Bottoms_Up',
      'Cocoons', 'Scissor_Kick', 'Toe_Touchers', 'Tuck_Crunch']],
    ['Upright bodyweight', ['Elbow_Circles', 'Elbows_Back', 'Isometric_Chest_Squeezes', 'Middle_Back_Stretch',
      'Side_Neck_Stretch', 'Standing_Lateral_Stretch', 'Triceps_Stretch', 'Upper_Back_Stretch', 'Sit_Squats',
      'Fast_Skipping']],
    ['Additional dumbbell', ['Alternating_Deltoid_Raise', 'Dumbbell_Raise', 'Dumbbell_Scaption',
      'Standing_Dumbbell_Straight-Arm_Front_Delt_Raise_Above_Head', 'Side_Laterals_to_Front_Raise',
      'Standing_Bent-Over_One-Arm_Dumbbell_Triceps_Extension', 'Standing_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension',
      'Dumbbell_One-Arm_Triceps_Extension', 'Dumbbell_Side_Bend', 'Spell_Caster']],
    ['Floor bodyweight extra', ['Body-Up', 'Butt-Ups', 'Isometric_Wipers', 'Plyo_Push-up',
      'Pushups_Close_and_Wide_Hand_Positions', 'Groiners', 'Glute_Kickback', 'Leg_Pull-In', 'Side_Bridge',
      'Oblique_Crunches_-_On_The_Floor']],
    ['Floor and core', ['3_4_Sit-Up', 'Sit-Up', 'Janda_Sit-Up', 'Russian_Twist', 'Elbow_to_Knee',
      'Oblique_Crunches', 'Side_Jackknife', 'Single-Arm_Push-Up', 'Clock_Push-Up', 'Handstand_Push-Ups']],
    ['Standing mobility', ['Front_Leg_Raises', 'Side_Leg_Raises', 'Standing_Hip_Circles', 'Leg_Lift',
      'Isometric_Neck_Exercise_-_Front_And_Back', 'Isometric_Neck_Exercise_-_Sides', 'Stomach_Vacuum',
      'Step-up_with_Knee_Raise', 'Body_Tricep_Press', 'Standing_Towel_Triceps_Extension']],
    ['Dumbbell strength', ['Power_Partials', 'One-Arm_Side_Laterals', 'Standing_Concentration_Curl',
      'Tricep_Dumbbell_Kickback', 'Standing_Palm-In_One-Arm_Dumbbell_Press', 'Arnold_Dumbbell_Press',
      'Standing_Dumbbell_Calf_Raise', 'Plie_Dumbbell_Squat', 'Iron_Cross', 'Dumbbell_Clean']],
    ['Barbell strength', ['Barbell_Ab_Rollout_-_On_Knees', 'Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Hack_Squat',
      'Barbell_Hip_Thrust', 'Barbell_Incline_Bench_Press_-_Medium_Grip', 'Barbell_Side_Split_Squat',
      'Barbell_Walking_Lunge', 'Clean_Pull', 'Drag_Curl', 'Floor_Press', 'Front_Squat_Clean_Grip',
      'Kneeling_Squat', 'One-Arm_Side_Deadlift', 'Overhead_Squat', 'Rack_Pulls', 'Reverse_Grip_Bent-Over_Rows',
      'Seated_Barbell_Twist', 'Seated_Palms-Down_Barbell_Wrist_Curl', 'Standing_Military_Press', 'Zercher_Squats']],
    ['Bodyweight movement and stretching', ['All_Fours_Quad_Stretch', 'Alternate_Leg_Diagonal_Bound', 'Ankle_Circles', 'Bench_Dips', 'Carioca_Quick_Step',
      'Childs_Pose', 'Chin_To_Chest_Stretch', 'Dancers_Stretch', 'Hanging_Pike', 'Hug_Knees_To_Chest', 'Inchworm',
      'Incline_Push-Up', 'Kneeling_Arm_Drill', 'On_Your_Side_Quad_Stretch', 'One_Half_Locust',
      'Push-Ups_With_Feet_Elevated', 'Seated_Floor_Hamstring_Stretch', 'Seated_Leg_Tucks', 'Side_Wrist_Pull',
      'Worlds_Greatest_Stretch']],
    ['Dumbbell bench and step', ['Around_The_Worlds', 'Concentration_Curls', 'Dumbbell_Incline_Shoulder_Raise', 'Dumbbell_Lying_Pronation',
      'Dumbbell_Squat_To_A_Bench', 'Dumbbell_Step_Ups', 'External_Rotation', 'Incline_Inner_Biceps_Curl',
      'Lying_Dumbbell_Tricep_Extension', 'Lying_One-Arm_Lateral_Raise', 'Middle_Back_Shrug',
      'One-Arm_Incline_Lateral_Raise', 'Reverse_Flyes_With_External_Rotation', 'Seated_Bent-Over_Rear_Delt_Raise',
      'Seated_Dumbbell_Curl', 'Seated_Dumbbell_Palms-Down_Wrist_Curl', 'Seated_Dumbbell_Press',
      'Seated_Triceps_Press', 'Split_Squat_with_Dumbbells', 'Tate_Press']],
    ...exactGroups,
    ...addedGroups,
    ...resistanceGroups,
    ...supplementalGroups,
  ]) {
    const actual = await page.locator(`#exercise optgroup[label="${label}"] option`).evaluateAll(
      (options) => options.map((option) => option.value));
    const expected = keys.map((key) => 'local:exercise:' + key);
    if (!exactGroups.some(([group]) => group === label)) {
      actual.sort();
      expected.sort();
    }
    assert.deepEqual(actual, expected, label);
  }
  const trainingGroups = [
    ['Smith, guided machines and cardio', 36],
    ['Machine strength', 31],
    ['Foam rolling, mobility and medicine ball', 33],
  ];
  const trainingMenu = sourceMenu.filter(([label]) => trainingGroups.some(([group]) => group === label));
  const finalGroups = [[conditioningLabel, 38], [strengthLabel, 34], [apparatusLabel, 40]];
  assert.deepEqual(await page.locator('#exercise optgroup').evaluateAll((groups) => groups.map((group) => group.label)),
    ['Standing bodyweight', 'Floor bodyweight', 'Standing dumbbell',
      'Standing barbell', 'Flat bench', 'Mobility', 'Compound dumbbell', 'Pull-up bar', 'Kettlebell',
      'Squat rack', 'Incline bench', 'EZ curl bar', 'Dip station', 'Bodyweight conditioning', 'Supine core',
      'Upright bodyweight', 'Additional dumbbell', 'Floor bodyweight extra',
      'Floor and core', 'Standing mobility', 'Dumbbell strength', 'Barbell strength',
      'Bodyweight movement and stretching', 'Dumbbell bench and step',
      ...[...exactGroups, ...addedGroups, ...resistanceGroups, ...supplementalGroups, ...trainingGroups, ...finalGroups]
        .map(([label]) => label)]);
  const names = new Map(catalog.map(({ id, name }) => [id, name]));
  for (const [, id, name] of sourceMenu) assert.equal(name, names.get(id), id);
  const mobilityKeys = new Set(['Adductor_Groin', 'Calf_Stretch_Elbows_Against_Wall',
    'Calf_Stretch_Hands_Against_Wall', 'One_Arm_Against_Wall', 'Peroneals_Stretch', 'Posterior_Tibialis_Stretch']);
  const previousIds = new Set(allIds.slice(0, 664));
  const expectedTrainingIds = catalog
    .filter(({ equipment, sourceKey }) => ['MACHINE', 'FOAM_ROLL', 'MEDICINE_BALL'].includes(equipment) ||
      mobilityKeys.has(sourceKey))
    .map(({ id }) => id).filter((id) => !previousIds.has(id)).sort();
  assert.equal(expectedTrainingIds.length, 100);
  assert.deepEqual(trainingMenu.map(([, id]) => id).sort(), expectedTrainingIds);
  for (const [label, count] of trainingGroups) {
    assert.equal(trainingMenu.filter(([group]) => group === label).length, count, label);
  }

  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(async () => {
    const THREE = await import('three');
    const { asset, camera } = await import('./viewer.mjs');
    const select = document.getElementById('exercise');
    const view = (name) => document.querySelector(`[data-view=${name}]`).click();
    const choose = (key) => {
      select.value = 'local:exercise:' + key;
      select.dispatchEvent(new Event('change'));
    };
    const check = (condition, message) => { if (!condition) throw Error(message); };
    for (const [key, parts] of [
      ['Cable_Iron_Cross', ['Pulley mast']],
      ['Smith_Machine_Bench_Press', ['Polished guide rail', 'Plate']],
      ['Pullups', ['Upright']],
      ['One_Handed_Hang', ['Upright']],
      ['Rope_Climb', ['Rack upright']],
      ['Lying_Triceps_Press', ['Plate']],
      ['Hanging_Bar_Good_Morning', ['Chain suspension mount']],
    ]) {
      choose(key);
      const objects = [];
      asset.scene.parent.traverseVisible((object) => {
        if (object.isMesh && parts.includes(object.name)) objects.push([object, object.material]);
      });
      check(parts.every((name) => objects.some(([object]) => object.name === name)), key + ' has the intended equipment');
      view('side');
      check(objects.every(([object, original]) => object.material !== original && object.material.transparent &&
        !object.material.depthWrite && object.material.opacity < .5), key + ' Side reveals anatomy through equipment');
      view('angle');
      check(objects.every(([object, original]) => object.material === original), key + ' restores equipment outside Side');
    }

    choose('Neck-SMR');
    view('side');
    const toggle = document.querySelector('#legend [data-muscle="Other anatomy"]');
    const canvas = document.querySelector('#stage canvas');
    const sample = document.createElement('canvas');
    sample.width = canvas.width;
    sample.height = canvas.height;
    const context = sample.getContext('2d', { willReadFrequently: true });
    const pixels = () => new Promise((resolve) => requestAnimationFrame(() => {
      context.clearRect(0, 0, sample.width, sample.height);
      context.drawImage(canvas, 0, 0);
      resolve(context.getImageData(0, 0, sample.width, sample.height).data);
    }));
    const on = await pixels();
    toggle.click();
    const off = await pixels();
    const head = asset.scene.getObjectByName('Head').getWorldPosition(new THREE.Vector3()).project(camera);
    const radius = .18 * sample.height / (camera.top - camera.bottom);
    let changed = 0;
    for (let i = 0; i < on.length; i += 4) {
      if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) < 12) continue;
      const x = i / 4 % sample.width;
      const y = Math.floor(i / 4 / sample.width);
      check(Math.hypot(x - (head.x + 1) * sample.width / 2, y - (1 - head.y) * sample.height / 2) < radius,
        'Neck-SMR highlight stays near the neck');
      changed++;
    }
    check(changed > 20, 'Neck-SMR visibly highlights the neck');
  });
  const coverage = await page.evaluate(async () => {
    const THREE = await import('three');
    const viewer = await import('./viewer.mjs');
    const { dumbbellGripTransform } = await import('./clips.mjs');
    const { asset, bounds, camera, entries, left, right, barbell, bench, kettlebell, pullUpBar,
      ezCurlBar, dipStation, inclineBenches, racks, cradleDumbbell, stepPlatform, secondKettlebell, declineBench } = viewer;
    const select = document.getElementById('exercise');
    const timeline = document.getElementById('timeline');
    const play = document.getElementById('play');
    const groups = {};
    let dumbbellClips = 0;
    const finishBounds = {};
    const check = (condition, message) => { if (!condition) throw new Error(select.value + ': ' + message); };
    const scrub = (at) => {
      timeline.value = at;
      timeline.dispatchEvent(new Event('input'));
    };
    const bones = [];
    const materials = new Set();
    const meshes = [];
    asset.scene.traverse((object) => {
      if (object.isBone) bones.push(object);
      if (object.isSkinnedMesh) {
        materials.add(object.material.name);
        meshes.push(object);
      }
    });
    const worldBones = () => {
      asset.scene.updateMatrixWorld(true);
      return bones.flatMap((bone) => bone.matrixWorld.toArray());
    };
    select.value = 'local:exercise:Barbell_Squat';
    select.dispatchEvent(new Event('change'));
    const chest = asset.scene.getObjectByName('Chest').getWorldQuaternion(new THREE.Quaternion());
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(chest).setY(0).normalize();
    const center = bounds.getCenter(new THREE.Vector3());
    for (const [view, sign] of [['front', 1], ['back', -1]]) {
      document.querySelector(`[data-view="${view}"]`).click();
      const direction = camera.position.clone().sub(center).setY(0).normalize();
      check(direction.dot(forward) * sign > .99, view + ' follows the setup heading');
    }
    for (const option of select.options) {
      const previous = viewer.resistanceFixture?.root;
      const previousSupport = viewer.bodyweightSupport;
      const previousSupplement = viewer.supplementalFixture?.root;
      const previousTrainingFixture = viewer.trainingFixture?.root;
      const geometries = new Set();
      for (const root of [previous, previousSupplement, previousTrainingFixture]) root?.traverse(({ geometry }) => {
        if (!geometry) return;
        geometries.add(geometry);
        geometry.addEventListener('dispose', () => geometries.delete(geometry));
      });
      select.value = option.value;
      select.dispatchEvent(new Event('change'));
      const { clip, name, primary, supporting, cues, phases, equipment = '', propClip, oneShot, framing,
        benchTransform, rackTransform, platformTransform, dumbbellOffsets, secondPropClip, resistance, bodyweightSupport, animatedFixture, fixtures: extraFixtures, barLoad } = entries[option.value];
      const key = option.value.split(':').at(-1);
      const expansionOneShot = ['Alternate_Leg_Diagonal_Bound', 'Carioca_Quick_Step', 'Inchworm'].includes(key);
      if (option.parentElement.label === 'Bodyweight movement and stretching') {
        const usesBench = ['Bench_Dips', 'Incline_Push-Up', 'Push-Ups_With_Feet_Elevated', 'Seated_Leg_Tucks'].includes(key);
        const usesBar = ['Ankle_Circles', 'Hanging_Pike'].includes(key);
        check(equipment === (usesBench ? 'bench' : usesBar ? 'pull-up-bar' : ''), 'bodyweight equipment');
        check(Boolean(oneShot) === expansionOneShot, 'bodyweight one-shot metadata');
      }
      if (option.parentElement.label === 'Bodyweight mobility and bench') {
        const usesBench = ['Decline_Push-Up', 'Seated_Flat_Bench_Leg_Pull-In'].includes(key);
        check(equipment === (usesBench ? 'bench' : ''), 'bodyweight mobility equipment');
      }
      if (option.parentElement.label === 'Dumbbell bench and step') {
        check((equipment === 'step-platform-dumbbells') === (key === 'Dumbbell_Step_Ups'), 'step-up equipment');
        check((equipment === 'incline-bench-dumbbell-left') === (key === 'One-Arm_Incline_Lateral_Raise'), 'incline left grip');
        check((equipment === 'incline-bench-cradle-dumbbell') === (key === 'Seated_Triceps_Press'), 'cradle equipment');
        check(!oneShot, 'dumbbell expansion loops');
      }
      if (key === 'Ankle_Circles') check(framing === 'standing', 'ankle circles uses the upright while standing');
      const group = option.parentElement.label;
      groups[group] = (groups[group] ?? 0) + 1;
      check(clip.duration > 0 && clip.validate(), 'valid animation tracks');
      check(document.getElementById('exercise-name').textContent === name, 'heading');
      check(timeline.valueAsNumber === 0 && play.textContent === 'Play', 'switch must reset transport');
      check(cues.length > 0 && phases[0]?.[0] === 0, 'cues and setup phase are required');
      for (const annotations of [cues, phases]) {
        check(annotations.every(([at, ...labels], index) =>
          at >= 0 && at <= clip.duration && (!index || at > annotations[index - 1][0]) &&
          labels.every((label) => typeof label === 'string' && label.trim())), 'annotation times and text');
      }
      const cueButtons = [...document.querySelectorAll('#cues button')];
      check(cueButtons.length === cues.length && cueButtons.every((button, index) =>
        button.querySelector('strong').textContent === cues[index][1] &&
        button.querySelector('small').textContent === cues[index][2]), 'cue text');
      check([...document.querySelectorAll('#legend .secondary')].map((button) => button.dataset.muscle).join() ===
        [...new Set(supporting)].filter((muscle) => !primary.includes(muscle)).join(), 'supporting muscle legend');
      check([...document.querySelectorAll('#legend .primary')].map((button) => button.dataset.muscle).join() ===
        primary.join(), 'primary muscle legend');
      check([...primary, ...supporting].every((muscle) => materials.has(muscle)), 'unknown muscle in atlas');
      const incline = [...inclineBenches.values()].filter((prop) => prop.visible);
      const rack = [...racks.values()].filter((prop) => prop.visible);
      const resistanceRoot = viewer.resistanceFixture?.root;
      const scene = asset.scene.parent;
      const resistanceNames = { cable: 'Cable station', band: 'Resistance band', towel: 'Assistance towel' };
      check(Boolean(resistanceRoot) === Boolean(resistance), 'resistance fixture selection');
      check(!previous?.parent && !previousSupplement?.parent && !previousTrainingFixture?.parent && !geometries.size, 'previous equipment removed and disposed');
      const trainingRoot = viewer.trainingFixture?.root;
      const trainingEntry = entries[option.value];
      check(Boolean(trainingRoot) === Boolean(trainingEntry.machineGuidedFixture ||
        trainingEntry.machineStrengthFixture || trainingEntry.mobilityBallFixture ||
        trainingEntry.finalConditioningFixture || trainingEntry.finalStrengthFixture ||
        trainingEntry.finalApparatusFixture), 'training equipment selection');
      if (trainingRoot) check(trainingRoot.parent === scene, 'training equipment in scene');
      const supplement = viewer.supplementalFixture;
      check(Boolean(supplement) === Boolean(extraFixtures?.length || animatedFixture || barLoad), 'additional equipment selection');
      if (supplement) check(supplement.root.parent === scene, 'additional equipment in scene');
      check(scene.children.filter(({ name }) => Object.values(resistanceNames).includes(name)).length ===
        Number(Boolean(resistance)), 'only the current resistance fixture is in the scene');
      if (resistance) check(resistanceRoot.parent === scene && resistanceRoot.name === resistanceNames[resistance.mode],
        'resistance fixture attached to the scene');
      const support = viewer.bodyweightSupport;
      const supportNames = { chair: 'Chair', 'ankle-restraint': 'Ankle restraint' };
      check(!previousSupport || previousSupport === support || !previousSupport.visible, 'previous support hidden');
      check(!support || (support.parent === scene && support.name === supportNames[bodyweightSupport]), 'bodyweight support in scene');
      const fixtures = [
        [declineBench, equipment.startsWith('decline-bench')],
        [support, Boolean(bodyweightSupport)],
        [bench, equipment.startsWith('bench'), benchTransform],
        [incline[0], equipment.startsWith('incline-bench'), benchTransform],
        [rack[0], (equipment === 'rack-barbell' || Boolean(rackTransform)), rackTransform],
        [dipStation, equipment === 'dip-station'],
        [stepPlatform, equipment.startsWith('step-platform-') || equipment === 'bench-platform-dumbbell-right', platformTransform],
      ];
      check(incline.length <= 1 && rack.length <= 1, 'only one variant per fixture');
      for (const [fixture, visible, transform] of fixtures) {
        check(Boolean(fixture?.visible) === visible, 'fixture visibility');
        if (!visible) continue;
        check(fixture.position.toArray().join() === (transform?.position ?? [0, 0, 0]).join() &&
          fixture.rotation.y === (transform?.yaw ?? 0), 'fixture placement');
      }
      if (dipStation.visible) check(dipStation.quaternion.angleTo(new THREE.Quaternion()) === 0 &&
        dipStation.scale.equals(new THREE.Vector3(1, 1, 1)), 'dip station uses identity transform');
      if (!stepPlatform.visible) check(stepPlatform.position.lengthSq() === 0 &&
        stepPlatform.rotation.y === 0, 'step platform reset');
      if (!bench.visible) check(bench.position.lengthSq() === 0 && bench.rotation.y === 0, 'flat bench reset');
      if (incline.length) check(incline[0].getObjectByName('Backrest').rotation.x ===
        -(benchTransform?.angle ?? Math.PI / 6), 'incline angle');
      if (rack.length) {
        check(!rack[0].getObjectByName('Barbell'), 'rack must contain no static barbell');
        check(Math.abs(rack[0].getObjectByName('Hook bed').position.y + .02425 -
          (rackTransform?.hookHeight ?? 1.38)) < 1e-6, 'rack hook height');
      }
      const expected = [
        equipment.endsWith('dumbbells') || equipment.endsWith('dumbbell-left'),
        equipment.endsWith('dumbbells') || equipment.endsWith('dumbbell-right'),
        equipment.endsWith('barbell'),
        equipment === 'kettlebell' || equipment === 'two-kettlebells',
        equipment === 'pull-up-bar',
        equipment.endsWith('ez-curl-bar'),
        equipment.endsWith('cradle-dumbbell'),
        equipment === 'two-kettlebells',
      ];
      const props = [left, right, barbell, kettlebell, pullUpBar, ezCurlBar, cradleDumbbell, secondKettlebell];
      check(props.every((prop, i) => prop.visible === expected[i]), 'equipment visibility');
      for (const [i, prop] of [left, right].entries()) {
        const { position, quaternion } = dumbbellGripTransform(1 - 2 * i);
        position.add(new THREE.Vector3(dumbbellOffsets?.[i] ?? 0, 0, 0).applyQuaternion(quaternion));
        check(prop.position.distanceTo(position) < 1e-6, 'attached dumbbell placement');
      }
      if (expected[0] || expected[1]) dumbbellClips++;
      if (pullUpBar.visible) check(pullUpBar.getObjectByName('Shaft').getWorldPosition(new THREE.Vector3())
        .distanceTo(new THREE.Vector3(0, 2.3, 0)) < 1e-6, 'static pull-up shaft height');
      if (stepPlatform.visible) {
        const platformBounds = new THREE.Box3().setFromObject(stepPlatform);
        check(platformBounds.min.distanceTo(new THREE.Vector3(-.30, 0, .22).add(stepPlatform.position)) < 1e-6 &&
          platformBounds.max.distanceTo(new THREE.Vector3(.30, .30, .74).add(stepPlatform.position)) < 1e-6, 'platform dimensions and placement');
        check(bounds.containsBox(platformBounds), 'camera bounds include the step platform');
      }
      const movableProps = [barbell, kettlebell, ezCurlBar, cradleDumbbell, secondKettlebell];
      const animatedProp = movableProps.find((prop) => prop.visible) ?? (animatedFixture && supplement.animated) ??
        viewer.trainingFixture?.animated;
      check(Boolean(propClip) === Boolean(animatedProp), 'animated equipment binding');
      if (animatedProp) check(propClip.duration === clip.duration, 'prop clip duration');
      for (const prop of movableProps) {
        if (!prop.visible) check(prop.position.lengthSq() === 0 &&
          prop.quaternion.angleTo(new THREE.Quaternion()) === 0, 'inactive prop reset');
      }
      const secondProp = secondKettlebell.visible ? secondKettlebell :
        animatedFixture ? supplement.animated : viewer.trainingFixture?.secondAnimated;
      check(!secondPropClip || secondProp, 'second prop binding');
      check(!secondKettlebell.visible || secondPropClip, 'second kettlebell binding');
      if (secondPropClip) check(secondPropClip.duration === clip.duration, 'second prop duration');
      const endpoint = (ref) => {
        if (Array.isArray(ref)) return new THREE.Vector3(...ref);
        if (typeof ref === 'string') return asset.scene.getObjectByName('Hand' + ref)
          .localToWorld(dumbbellGripTransform(ref === 'L' ? 1 : -1).position);
        return asset.scene.getObjectByName(ref.bone).localToWorld(new THREE.Vector3(...ref.offset));
      };
      const checkProp = (seconds) => {
        if (resistance?.attachment?.kind === 'stirrup') {
          const grips = resistanceRoot.children.filter(({ name }) => name === 'Handle grip');
          resistance.attachment.hands.forEach((side, i) => {
            check(grips[i].position.distanceTo(endpoint(side)) < 1e-6, 'cable grip follows the sampled hand');
          });
        }
        if (resistance?.mode === 'band') {
          const sides = [...new Set(resistance.links.flat().filter((ref) => typeof ref === 'string'))];
          const grips = resistanceRoot.children.filter(({ name }) => name === 'Band grip');
          check(grips.length === sides.length && sides.every((side, i) =>
            grips[i].position.distanceTo(endpoint(side)) < 1e-6), 'band grips follow both hand endpoints');
        }
        if (resistance?.links) {
          const segmentName = { cable: 'Cable', band: 'Elastic band', towel: 'Folded towel' }[resistance.mode];
          const segments = resistanceRoot.children.filter(({ name }) => name === segmentName);
          check(segments.length === resistance.links.length, 'all resistance links are rendered');
          resistance.links.forEach(([from, to], i) => {
            const start = endpoint(from);
            const finish = endpoint(to);
            const segment = segments[i];
            check(segment.position.distanceTo(start.clone().lerp(finish, .5)) < 1e-6 &&
              Math.abs(segment.scale.y - start.distanceTo(finish)) < 1e-6, 'resistance link follows sampled endpoints');
          });
        }
        if (animatedProp) checkPropTransform(animatedProp, propClip, seconds);
        if (secondPropClip) checkPropTransform(secondProp, secondPropClip, seconds);
      };
      function checkPropTransform(prop, propClip, seconds) {
        const position = propClip.tracks.find((track) => track.name === '.position').createInterpolant().evaluate(seconds);
        check(prop.position.distanceTo(new THREE.Vector3().fromArray(position)) < 1e-6, 'prop position sync');
        const rotation = propClip.tracks.find((track) => track.name === '.quaternion');
        if (rotation) {
          const expectedRotation = new THREE.Quaternion().fromArray(rotation.createInterpolant().evaluate(seconds));
          check(1 - Math.abs(prop.quaternion.dot(expectedRotation)) < 1e-6, 'prop rotation sync');
        }
      }
      const additionalOneShot = ['Bench_Jump', 'Front_Box_Jump', 'Moving_Claw_Series'].includes(key);
      const traveling = ['Bodyweight_Walking_Lunge', 'Barbell_Walking_Lunge', 'Standing_Long_Jump',
        'Frog_Hops', 'Side_Standing_Long_Jump', 'Fast_Skipping'].includes(key);
      const verifyFit = traveling || !['Standing bodyweight', 'Floor bodyweight', 'Standing dumbbell',
        'Standing barbell', 'Flat bench'].includes(group);
      const setup = worldBones();
      const actual = new THREE.Box3();
      let moved = false;
      for (const at of [0, .08, .22, .40, .62, .82, 1].map((fraction) => fraction * clip.duration)) {
        scrub(at);
        const current = worldBones();
        moved ||= current.some((value, i) => Math.abs(value - setup[i]) > 1e-4);
        if (verifyFit) {
          for (const mesh of meshes) actual.expandByObject(mesh, true);
          for (const prop of [...props, bench, dipStation, stepPlatform, declineBench, support,
            resistanceRoot, supplement?.root, trainingRoot, ...incline, ...rack]) {
            if (prop?.visible) {
              prop.updateWorldMatrix(true, true);
              actual.expandByObject(prop);
            }
          }
        }
        for (const fixture of [resistanceRoot, declineBench, support, supplement?.root, trainingRoot].filter((prop) => prop?.visible)) {
          check(bounds.clone().expandByScalar(.015).containsBox(new THREE.Box3().setFromObject(fixture)),
            'sampled camera bounds include ' + fixture.name);
        }
        const { seconds } = viewer;
        check(document.getElementById('phase').textContent === phases.findLast(([start]) => seconds >= start)?.[1],
          'scrub phase');
        checkProp(seconds);
        if (cradleDumbbell.visible) {
          const propBounds = new THREE.Box3().setFromObject(cradleDumbbell);
          check(bounds.clone().expandByScalar(.01).containsBox(propBounds), 'camera bounds include the cradle dumbbell');
        }
      }
      for (const button of document.querySelectorAll('[data-view]')) {
        if (!verifyFit && button.dataset.view !== 'angle') continue;
        button.click();
        const point = new THREE.Vector3();
        const box = verifyFit ? actual : bounds;
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
              point.set(x, y, z).project(camera);
              check(Math.abs(point.x) < .98 && Math.abs(point.y) < .98 && Math.abs(point.z) < 1, 'model fits ' + button.dataset.view);
            }
          }
        }
      }
      if (traveling || expansionOneShot || additionalOneShot || oneShot) {
        const root = asset.scene.getObjectByName('Pelvis');
        const finish = root.position.clone();
        finishBounds[name] = { min: bounds.min.toArray(), max: bounds.max.toArray() };
        scrub(0);
        if (traveling) check(Math.hypot(finish.x - root.position.x, finish.z - root.position.z) > .5, 'root must travel');
        scrub(clip.duration - .04);
        play.click();
        const deadline = performance.now() + 10000;
        while (play.textContent === 'Pause' && performance.now() < deadline) {
          await new Promise(requestAnimationFrame);
        }
        check(play.textContent === 'Play', 'one-shot playback stops automatically');
        check(viewer.seconds === clip.duration && Math.abs(timeline.valueAsNumber - clip.duration) < 1e-10,
          'playback reaches the end of the timeline');
        check(root.position.distanceTo(finish) < .005, 'playback stops at the finish');
        play.click();
        check(timeline.valueAsNumber === 0, 'play again jumps straight to setup');
      } else {
        for (const loop of [clip, propClip, secondPropClip].filter(Boolean)) {
          for (const track of loop.tracks) {
            const sample = track.createInterpolant();
            const quaternion = track.name.endsWith('.quaternion');
            const Value = quaternion ? THREE.Quaternion : THREE.Vector3;
            const start = new Value().fromArray(sample.evaluate(0));
            const end = new Value().fromArray(sample.evaluate(clip.duration));
            const gap = quaternion ? start.angleTo(end) : start.distanceTo(end);
            check(gap <= (quaternion ? .035 : .015), 'visible loop seam in ' + track.name + ': ' + gap);
          }
        }
      }
      check(moved || phases.every(([, label]) => label === 'Hold'), 'pose must change or be an explicit hold');
      scrub(0);
      check(worldBones().every((value, i) => Math.abs(value - setup[i]) < 1e-6), 'scrub back should restore setup');
      play.click();
      const deadline = performance.now() + 10000;
      while (timeline.valueAsNumber === 0 && performance.now() < deadline) {
        await new Promise(requestAnimationFrame);
      }
      check(timeline.valueAsNumber > 0, 'playback advances');
      checkProp(viewer.seconds);
    }
    return { groups, dumbbellClips, finishBounds };
  });
  assert.equal(Object.keys(coverage.groups).length, 48);
  for (const [label, keys] of [...exactGroups, ...addedGroups, ...resistanceGroups, ...supplementalGroups]) assert.equal(coverage.groups[label], keys.length, label);
  for (const [label, count] of finalGroups) assert.equal(coverage.groups[label], count, label);
  assert.equal(coverage.dumbbellClips, 114);
  console.log('Catalog clips exercised in Chrome', JSON.stringify(coverage));
  console.log(`Verified all ${allIds.length} catalog exercises.`);

  if (process.env.OFFLINE_HTML) {
    const offline = await browser.newPage({ offline: true, viewport: page.viewportSize() });
    const offlineErrors = [];
    offline.on('pageerror', (error) => offlineErrors.push(error.message));
    await offline.goto(new URL(process.env.OFFLINE_HTML, import.meta.url).href);
    await offline.locator('#exercise:enabled').waitFor();
    assert.deepEqual(await menu(offline), sourceMenu);
    assert.match(await offline.locator('#download-model').getAttribute('href'), /^blob:/);
    const representatives = new Map(sourceMenu.map(([group, id, name]) => [group, [id, name]]));
    representatives.set('Bodyweight conditioning', ['local:exercise:Side_Standing_Long_Jump', 'Side Standing Long Jump']);
    const extraIds = ['Double_Kettlebell_Jerk', 'Bench_Jump', 'Single_Dumbbell_Raise', 'Clean_and_Jerk', 'Ankle_Circles', 'Bench_Dips', 'Hanging_Pike', 'Inchworm', 'Dumbbell_Step_Ups',
      'One-Arm_Incline_Lateral_Raise', 'Seated_Triceps_Press', 'Decline_Push-Up',
      'Seated_Flat_Bench_Leg_Pull-In', 'Bent-Arm_Dumbbell_Pullover', 'Flexor_Incline_Dumbbell_Curls',
      'Seated_One-Arm_Dumbbell_Palms-Up_Wrist_Curl', 'Barbell_Curls_Lying_Against_An_Incline',
      'Box_Squat', 'Barbell_Step_Ups', 'Kettlebell_Figure_8'].map((key) => 'local:exercise:' + key);
    for (const [id, name] of [...representatives.values(), ...extraIds.map((id) => [id, names.get(id)])]) {
      await offline.selectOption('#exercise', id);
      assert.equal(await offline.locator('#exercise-name').textContent(), name);
      assert.equal(await offline.locator('#timeline').inputValue(), '0');
      const at = await page.evaluate(async (id) => {
        const { entries } = await import('./viewer.mjs');
        return entries[id].phases.findLast(([start]) => start <= 1)[1];
      }, id);
      await offline.locator('#timeline').fill('1');
      assert.equal(await offline.locator('#phase').textContent(), at);
      await offline.locator('#play').click();
      await offline.waitForFunction(() => document.getElementById('timeline').valueAsNumber > 1);
    }
    const equipmentCases = ['Smith_Machine_Squat', 'Leg_Press', 'Medicine_Ball_Chest_Pass',
      'Calves-SMR', 'Cable_Crossover', 'Band_Pull_Apart', 'Monster_Walk', 'One_Arm_Chin-Up', 'Decline_Barbell_Bench_Press',
      'Decline_Dumbbell_Bench_Press', 'Decline_EZ_Bar_Triceps_Extension', 'Chair_Lower_Back_Stretch',
      'Floor_Glute-Ham_Raise', 'Inverted_Row', 'Bodyweight_Squat', 'Cable_Crossover',
      'Deadlift_with_Chains', 'T-Bar_Row_with_Handle', 'Cable_Preacher_Curl', 'Ball_Leg_Curl', 'Car_Drivers',
      'Squat_with_Plate_Movers', 'Sled_Push', 'Rope_Jumping', 'Tire_Flip', 'Ring_Dips'];
    // Fix layout and hide the overlaid hint so the comparison measures the WebGL output.
    const [sourceStyle] = await Promise.all([page, offline].map((viewerPage) => viewerPage.addStyleTag({
      content: '.stage { width: 320px } .hint { visibility: hidden }',
    })));
    for (const key of equipmentCases) {
      const id = 'local:exercise:' + key;
      const canvases = await Promise.all([page, offline].map(async (viewerPage) => {
        await viewerPage.selectOption('#exercise', id);
        await viewerPage.locator('#timeline').fill(key === 'Squat_with_Plate_Movers' ? '3.85' : '1');
        await viewerPage.locator('[data-view=angle]').click();
        return viewerPage.locator('#stage canvas').screenshot({ scale: 'css' });
      }));
      assert.ok(canvases[0].equals(canvases[1]), key + ' offline equipment and camera render');
    }
    await sourceStyle.evaluate((style) => style.remove());
    assert.deepEqual(offlineErrors, []);
    console.log('Offline HTML matches the source catalog and plays with networking disabled.');
    await offline.close();
  }
  await page.setViewportSize({ width: 1200, height: 900 });
  const originalPoses = new Map();
  for (const id of [...ids, ids[0], ids[2], ids[1]]) {
    await page.selectOption('#exercise', id);
    const entry = catalog.find((exercise) => exercise.id === id);
    assert.equal(await page.locator('#exercise-name').textContent(), entry.name);
    const legend = await page.locator('#legend button[aria-pressed=true]').evaluateAll((buttons) =>
      buttons.map((button) => button.dataset.muscle));
    assert.deepEqual(legend.sort(), [...entry.primaryMuscles, ...entry.secondaryMuscles]
      .map((name) => name === 'lower back' ? 'Upper back' : name[0].toUpperCase() + name.slice(1)).sort());
    const timeline = page.locator('#timeline');
    assert.equal(await timeline.inputValue(), '0');
    const stage = page.locator('#stage');
    const setup = await stage.screenshot();
    const poseTime = id === ids[1] ? '1.51' : '2';
    await timeline.fill(poseTime);
    assert.equal(await page.locator('#phase').textContent(), id === ids[1] ? 'Flight' : 'Bottom');
    const posed = await stage.screenshot();
    assert.ok(!setup.equals(posed), entry.name + ' rendered pose should change');
    await timeline.fill('0');
    assert.ok(setup.equals(await stage.screenshot()), entry.name + ' should scrub back to its setup');
    const previous = originalPoses.get(id);
    if (previous) {
      assert.ok(setup.equals(previous.setup) && posed.equals(previous.posed),
        entry.name + ' should render the same poses after switching clips');
    } else originalPoses.set(id, { setup, posed });
    await timeline.fill(poseTime);
    await page.locator('#play').click();
    await page.waitForFunction((initial) => document.getElementById('timeline').value !== initial,
      poseTime);
    // Switching while playing must cancel the previous clip.
  }
  await page.selectOption('#exercise', ids[1]);
  assert.equal(await page.locator('#play').textContent(), 'Play');
  await page.locator('#cues button').last().click();
  assert.equal(await page.locator('#phase').textContent(), 'Landing');
  assert.deepEqual(errors, []);

  const measurements = await page.evaluate(async ([bodyweight, jump, dumbbell]) => {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
    const { createExerciseClips, createDumbbellGripTracks, attachDumbbells } = await import('./clips.mjs');
    const { createDumbbell } = await import('./dumbbell.mjs');
    const asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('./anatomy.glb');
    const figure = asset.scene;
    const clips = createExerciseClips(asset);
    const props = attachDumbbells(figure, createDumbbell);
    const mixer = new THREE.AnimationMixer(figure);
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    check(clips[bodyweight] === asset.animations[0], 'Bodyweight clip must reuse the GLB');
    const digits = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
    const gripTracks = createDumbbellGripTracks(figure);
    const hands = ['L', 'R'].map((side) => figure.getObjectByName('Hand' + side));
    const fingers = hands.flatMap((hand, side) => digits.flatMap((digit) => {
      let parent = hand;
      return [1, 2, 3].map((joint) => {
        const bone = figure.getObjectByName(digit + joint + (side === 0 ? 'L' : 'R'));
        check(bone?.isBone && bone.parent === parent, 'invalid digit chain for ' + hand.name + digit);
        parent = bone;
        return bone;
      });
    }));
    const neutral = fingers.map((bone) => bone.quaternion.clone());
    const grip = new Map(gripTracks.map((track) => [track.name, new THREE.Quaternion().fromArray(track.values)]));
    check(grip.size === 30, 'dumbbell grip must author 30 finger tracks');
    const checkFingers = (pose) => fingers.forEach((bone, i) => {
      const expected = pose?.get(bone.name + '.quaternion') ?? neutral[i];
      check(1 - Math.abs(bone.quaternion.dot(expected)) < 1e-6, 'unexpected finger pose for ' + bone.name);
    });
    const meshes = [];
    figure.traverse((object) => { if (object.isSkinnedMesh) meshes.push(object); });
    figure.updateMatrixWorld(true);
    const vertices = [];
    const bind = new THREE.Vector3();
    for (const mesh of meshes) {
      check(mesh.skeleton.bones.length === 46, 'expected a 46-joint skin');
      const { position } = mesh.geometry.attributes;
      for (let i = 0; i < position.count; i++) {
        bind.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        if (bind.y < .034) vertices.push([mesh, i, bind.x > 0 ? 0 : 1]);
      }
    }
    const v = new THREE.Vector3();
    const joint = (name) => figure.getObjectByName(name);
    const point = (name) => joint(name).getWorldPosition(new THREE.Vector3());
    let maxJump = 0;
    let minDumbbellFloor = Infinity;
    const headRadius = .055;
    const dumbbellHalfLength = .112;
    const handleAxis = new THREE.Vector3(1, 0, 0);
    const worldRotation = new THREE.Quaternion();
    const axis = new THREE.Vector3();
    let ground;
    for (const id of [dumbbell, bodyweight, dumbbell, jump]) {
      const clip = clips[id];
      const fingerTracks = clip.tracks.filter((track) => grip.has(track.name));
      check(fingerTracks.length === (id === bodyweight ? 0 : 30), id + ' finger track isolation');
      const fingerPose = id === jump ? new Map(fingerTracks.map((track) =>
        [track.name, new THREE.Quaternion().fromArray(track.values)])) : id === dumbbell ? grip : null;
      if (id === jump) fingers.forEach((bone, i) => {
        check(neutral[i].angleTo(fingerPose.get(bone.name + '.quaternion')) > .05, bone.name + ' should relax into the cross');
      });
      check(clip.validate(), id + ' has invalid tracks');
      const action = mixer.clipAction(clip).play();
      action.paused = true;
      const seek = (time) => {
        action.time = time;
        mixer.update(0);
        figure.updateMatrixWorld(true);
        checkFingers(fingerPose);
      };
      seek(0);
      const standing = point('Pelvis');
      const ankles = [point('FootL'), point('FootR')];
      seek(clip.duration);
      check(point('Pelvis').distanceTo(standing) < .001, id + ' loop closure');
      seek(id === jump ? .87 : 2);
      check(standing.y - point('Pelvis').y > .35, id + ' squat depth');
      if (id === jump) {
        seek(1.51);
        const extendedHeight = point('Pelvis').y - point('FootL').y;
        for (const contact of [1.26, 1.76]) {
          seek(contact);
          const contactHeight = point('Pelvis').y - point('FootL').y;
          check(extendedHeight - contactHeight > .04, 'extend in flight and soften the knees for landing');
        }
        seek(2.09);
        let previousHeight = point('Pelvis').y;
        for (const recover of [2.2, 2.35, 2.5, 2.7, 2.86]) {
          seek(recover);
          const height = point('Pelvis').y;
          check(height >= previousHeight - .001, 'rise without a second dip after landing');
          previousHeight = height;
        }
      }
      const sampleTimes = Array.from({ length: Math.round(clip.duration * 20) + 1 }, (_, frame) => frame / 20);
      if (id === jump) sampleTimes.push(1.26, 1.51, 1.76);
      for (const t of sampleTimes) {
        seek(t);
        const foot = [point('FootL'), point('FootR')];
        const flight = id === jump && t > 1.26 && t < 1.76;
        foot.forEach((ankle, side) => {
          check(Math.hypot(ankle.x - ankles[side].x, ankle.z - ankles[side].z) < .002, 'ankle drift');
          if (!flight) check(Math.abs(ankle.y - ankles[side].y) < .002, 'planted ankle height');
        });
        const sole = [Infinity, Infinity];
        for (const [mesh, vertex, side] of vertices) {
          mesh.getVertexPosition(vertex, v).applyMatrix4(mesh.matrixWorld);
          sole[side] = Math.min(sole[side], v.y);
        }
        ground ??= sole;
        check(ground.every((height) => Math.abs(height) < .015), 'standing soles must meet the floor');
        sole.forEach((height, side) => {
          if (flight) {
            maxJump = Math.max(maxJump, height - ground[side]);
            check(height > ground[side], 'sole penetrates floor in flight');
          } else check(Math.abs(height - ground[side]) < .008, `sole height changed during contact: ${id} ${t} ${height} ${ground[side]}`);
        });
        if (id === jump) {
          const chest = joint('Chest');
          check(chest.worldToLocal(point('HandL')).x < -.06 && chest.worldToLocal(point('HandR')).x > .06,
            'wrists should stay crossed in chest space');
          if (t === 1.95) check(standing.y - point('Pelvis').y > .2, 'landing must absorb into a squat');
        }
        if (id === dumbbell) {
          props.forEach((prop, side) => {
            const center = prop.getWorldPosition(new THREE.Vector3());
            check(prop.parent === hands[side] && Math.abs(center.x) > .29, 'dumbbells must stay at the hands and sides');
            axis.copy(handleAxis).applyQuaternion(prop.getWorldQuaternion(worldRotation));
            minDumbbellFloor = Math.min(minDumbbellFloor,
              center.y - dumbbellHalfLength * Math.abs(axis.y) - headRadius * Math.hypot(axis.x, axis.z));
          });
        }
      }
      action.stop();
      checkFingers(null);
    }
    check(maxJump > .28, 'jump has insufficient sole lift');
    check(minDumbbellFloor > .25, 'dumbbell floor clearance: ' + minDumbbellFloor);
    return { maxJump, minDumbbellFloor };
  }, ids);
  console.log('Verified original squat variants in Chrome, including rendered pose changes, cue seeks, and switching.');
  console.log('20 Hz geometry checks in meters', measurements);
} finally {
  await browser.close();
}
