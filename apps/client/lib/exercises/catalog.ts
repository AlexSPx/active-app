import { z } from 'zod'
import artifact from '../data/exercise-catalog.json'
import { exerciseSchema } from '../schemas/api'

const catalogSchema = z.array(exerciseSchema.extend({ sourceKey: z.string().min(1) }))

// Reviewed against the catalog instructions for the setup-dependent DEV examples.
const reviewedSetup: Record<string, { anchors?: string[]; supports?: string[]; blocks?: string[]; minimumEquipmentQuantity?: number; fixedLoadsKg?: number[] }> = {
  External_Rotation_with_Band: { anchors: ['fixed post'] },
  Internal_Rotation_with_Band: { anchors: ['fixed post'] },
  'Back_Flyes_-_With_Bands': { anchors: ['fixed post'] },
  Band_Hip_Adductions: { anchors: ['fixed post'] },
  Band_Skull_Crusher: { anchors: ['fixed anchor'], supports: ['bench'] },
  Alternating_Floor_Press: { minimumEquipmentQuantity: 2 },
  Leg_Lift: { supports: ['stable support surface'] },
  '3_4_Sit-Up': { supports: ['secured feet'] },
  'Dumbbell_Seated_One-Leg_Calf_Raise': { supports: ['bench'], blocks: ['elevated block'] },
  Alternate_Hammer_Curl: { minimumEquipmentQuantity: 2 },
  Alternate_Incline_Dumbbell_Curl: { supports: ['bench'], minimumEquipmentQuantity: 2 },
  'Close-Grip_Dumbbell_Press': { supports: ['bench'], minimumEquipmentQuantity: 1 },
  Concentration_Curls: { supports: ['bench'], minimumEquipmentQuantity: 1 },
  Decline_Dumbbell_Triceps_Extension: { supports: ['bench', 'secured feet'], minimumEquipmentQuantity: 2 },
  Dumbbell_Alternate_Bicep_Curl: { minimumEquipmentQuantity: 2 },
  Dumbbell_Bicep_Curl: { minimumEquipmentQuantity: 2 },
  'Dumbbell_Tricep_Extension_-Pronated_Grip': { supports: ['bench'], minimumEquipmentQuantity: 2 },
  Incline_Dumbbell_Curl: { supports: ['bench'], minimumEquipmentQuantity: 2 },
  Incline_Inner_Biceps_Curl: { supports: ['bench'], minimumEquipmentQuantity: 2 },
  Lying_Supine_Dumbbell_Curl: { supports: ['bench'], minimumEquipmentQuantity: 2 },
  One_Arm_Dumbbell_Preacher_Curl: { supports: ['bench'], minimumEquipmentQuantity: 1 },
  One_Arm_Pronated_Dumbbell_Triceps_Extension: { supports: ['bench'], minimumEquipmentQuantity: 1 },
  One_Arm_Supinated_Dumbbell_Triceps_Extension: { supports: ['bench'], minimumEquipmentQuantity: 1 },
  'Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench': { supports: ['bench'], minimumEquipmentQuantity: 2 },
  'Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench': { supports: ['bench'], minimumEquipmentQuantity: 2 },
  Preacher_Hammer_Dumbbell_Curl: { supports: ['bench'], minimumEquipmentQuantity: 2 },
  'Seated_Bent-Over_One-Arm_Dumbbell_Triceps_Extension': { supports: ['bench'], minimumEquipmentQuantity: 1 },
  Seated_Dumbbell_Curl: { supports: ['bench'], minimumEquipmentQuantity: 2 },
  Seated_Dumbbell_Inner_Biceps_Curl: { supports: ['bench'], minimumEquipmentQuantity: 2 },
  'Seated_Dumbbell_Palms-Down_Wrist_Curl': { supports: ['bench'], minimumEquipmentQuantity: 2 },
  'Seated_Dumbbell_Palms-Up_Wrist_Curl': { supports: ['bench'], minimumEquipmentQuantity: 2 },
  'Seated_One-Arm_Dumbbell_Palms-Up_Wrist_Curl': { supports: ['bench'], minimumEquipmentQuantity: 1 },
  Seated_Triceps_Press: { supports: ['bench'], minimumEquipmentQuantity: 1 },
  'Standing_Bent-Over_One-Arm_Dumbbell_Triceps_Extension': { minimumEquipmentQuantity: 1 },
  'Standing_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension': { minimumEquipmentQuantity: 2 },
  Standing_Concentration_Curl: { minimumEquipmentQuantity: 1 },
  Standing_Dumbbell_Triceps_Extension: { minimumEquipmentQuantity: 1 },
  'Standing_One-Arm_Dumbbell_Curl_Over_Incline_Bench': { supports: ['bench'], minimumEquipmentQuantity: 1 },
  'Standing_One-Arm_Dumbbell_Triceps_Extension': { minimumEquipmentQuantity: 1 },
  Tricep_Dumbbell_Kickback: { minimumEquipmentQuantity: 2 },
  'Two-Arm_Dumbbell_Preacher_Curl': { supports: ['bench'], minimumEquipmentQuantity: 2 },
  Cross_Body_Hammer_Curl: { minimumEquipmentQuantity: 2 },
  Hammer_Curls: { minimumEquipmentQuantity: 2 },
  Incline_Hammer_Curls: { supports: ['bench'], minimumEquipmentQuantity: 2 },
}

// Complete setup review is deliberately separate from partial historical annotations.
const completeSetup: Record<string, { anchors: string[]; supports: string[]; blocks: string[]; fixedLoadsKg: number[]; minimumEquipmentQuantity?: number }> = {
  'Alternate_Heel_Touchers': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Bent-Knee_Hip_Raise': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Bottoms_Up': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Cocoons': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Cross-Body_Crunch': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Crunch_-_Hands_Overhead': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Crunches': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Elbow_to_Knee': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Jackknife_Sit-Up': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Leg_Pull-In': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Oblique_Crunches': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Oblique_Crunches_-_On_The_Floor': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Plank': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Push-Up_Wide': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Push_Up_to_Side_Plank': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Pushups_Close_and_Wide_Hand_Positions': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Reverse_Crunch': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Single_Leg_Glute_Bridge': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Spider_Crawl': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Tuck_Crunch': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Band_Pull_Apart': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Calf_Raises_-_With_Bands': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Squats_-_With_Bands': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Lateral_Raise_-_With_Bands': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Upright_Row_-_With_Bands': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Alternating_Deltoid_Raise': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Bent_Over_Two-Dumbbell_Row': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Bent_Over_Two-Dumbbell_Row_With_Palms_In': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Dumbbell_Lunges': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Dumbbell_Raise': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Dumbbell_Scaption': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Dumbbell_Shrug': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Dumbbell_Squat': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Front_Dumbbell_Raise': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Front_Two-Dumbbell_Raise': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Power_Partials': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Side_Laterals_to_Front_Raise': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Stiff-Legged_Dumbbell_Deadlift': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Plie_Dumbbell_Squat': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 1 },
  'Single_Dumbbell_Raise': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 1 },
  'Dumbbell_Bench_Press': { anchors: [], supports: ['bench'], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Dumbbell_Bench_Press_with_Neutral_Grip': { anchors: [], supports: ['bench'], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Dumbbell_Flyes': { anchors: [], supports: ['bench'], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Dumbbell_Incline_Row': { anchors: [], supports: ['bench'], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Incline_Dumbbell_Press': { anchors: [], supports: ['bench'], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 2 },
  'Back_Flyes_-_With_Bands': { anchors: ['fixed post'], supports: [], blocks: [], fixedLoadsKg: [] },
  'External_Rotation_with_Band': { anchors: ['fixed post'], supports: [], blocks: [], fixedLoadsKg: [] },
  'Internal_Rotation_with_Band': { anchors: ['fixed post'], supports: [], blocks: [], fixedLoadsKg: [] },
  'Band_Hip_Adductions': { anchors: ['fixed post'], supports: [], blocks: [], fixedLoadsKg: [] },
  'Barbell_Shrug': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Barbell_Shrug_Behind_The_Back': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Bent_Over_Barbell_Row': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Flutter_Kicks': { anchors: [], supports: ['bench'], blocks: [], fixedLoadsKg: [] },
  'Seated_Leg_Tucks': { anchors: [], supports: ['bench'], blocks: [], fixedLoadsKg: [] },
  'Close-Grip_Dumbbell_Press': { anchors: [], supports: ['bench'], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 1 },
  'One_Arm_Dumbbell_Bench_Press': { anchors: [], supports: ['bench'], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 1 },
  'One-Arm_Flat_Bench_Dumbbell_Flye': { anchors: [], supports: ['bench'], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 1 },
  'Standing_Concentration_Curl': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 1 },
  'Standing_Dumbbell_Triceps_Extension': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 1 },
  'Standing_One-Arm_Dumbbell_Triceps_Extension': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 1 },
  Air_Bike: { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  Bodyweight_Squat: { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  'Butt-Ups': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  Butt_Lift_Bridge: { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  Dead_Bug: { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  Glute_Kickback: { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  Pushups: { anchors: [], supports: [], blocks: [], fixedLoadsKg: [] },
  Dumbbell_Side_Bend: { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 1 },
  'Standing_Bent-Over_One-Arm_Dumbbell_Triceps_Extension': { anchors: [], supports: [], blocks: [], fixedLoadsKg: [], minimumEquipmentQuantity: 1 },
}

export const exerciseCatalog = catalogSchema.parse(artifact).map((exercise) => {
  if (exercise.id !== `local:exercise:${exercise.sourceKey}`) {
    throw new Error(`Exercise catalog ID does not match its source key: ${exercise.sourceKey}`)
  }
  const instructions = `${exercise.name} ${exercise.instructions.join(' ')}`
  const anchors = /(?:fixed post|secure anchor|anchored|attach.{0,40}(?:post|anchor)|stationary post|pull-up bar|chin-up bar)/i.test(instructions) ? ['fixed anchor or bar'] : []
  const supports = /(?:sturdy support|stable support|sturdy object|secure your feet|feet secured|bench|rack at chest height)/i.test(instructions) ? ['stable support surface'] : []
  const blocks = /(?:wooden block|\d+[- ]inch block|stand on a block|block under|block beneath)/i.test(instructions) ? ['elevated block'] : []
  const fixedLoadMatches = [...instructions.matchAll(/(?:fixed|non-adjustable)\s+(?:weight|load)\s+(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs|pounds?)/ig)]
  const fixedLoadsKg = fixedLoadMatches.map((match) => Number(match[1]) * (/^lb/i.test(match[2]) ? 0.45359237 : 1))
  const minimumEquipmentQuantity = /(?:a dumbbell in each hand|two dumbbells|pair of dumbbells)/i.test(instructions) ? 2 : undefined
  const reviewed = reviewedSetup[exercise.sourceKey] ?? {}
  const complete = completeSetup[exercise.sourceKey] ?? {}
  return {
    ...exercise,
    setupReviewStatus: Object.hasOwn(completeSetup, exercise.sourceKey) ? 'reviewed' as const : 'unknown' as const,
    setupRequirements: {
      anchors: complete.anchors ?? reviewed.anchors ?? anchors,
      supports: complete.supports ?? reviewed.supports ?? supports,
      blocks: complete.blocks ?? reviewed.blocks ?? blocks,
      fixedLoadsKg: complete.fixedLoadsKg ?? reviewed.fixedLoadsKg ?? fixedLoadsKg,
      minimumEquipmentQuantity: complete.minimumEquipmentQuantity ?? reviewed.minimumEquipmentQuantity ?? minimumEquipmentQuantity,
    },
  }
})
