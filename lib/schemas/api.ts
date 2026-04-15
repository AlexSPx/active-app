/**
 * Zod schemas for API response validation.
 * These schemas provide runtime type checking and automatic type inference.
 */
import { z } from 'zod'

// ==========================================
// Exercise Schemas
// ==========================================

export const exerciseLevelSchema = z.enum(['BEGINNER', 'INTERMEDIATE', 'EXPERT'])
export const exerciseForceSchema = z.enum(['PULL', 'PUSH', 'STATIC'])
export const exerciseMechanicSchema = z.enum(['COMPOUND', 'ISOLATION'])
export const exerciseEquipmentSchema = z.enum([
  'BODY_ONLY',
  'MACHINE',
  'OTHER',
  'FOAM_ROLL',
  'KETTLEBELLS',
  'DUMBBELL',
  'CABLE',
  'BARBELL',
  'BANDS',
  'MEDICINE_BALL',
  'EXERCISE_BALL',
  'E_Z_CURL_BAR',
])
export const exerciseCategorySchema = z.enum([
  'STRENGTH',
  'STRETCHING',
  'PLYOMETRICS',
  'STRONGMAN',
  'POWERLIFTING',
  'CARDIO',
  'OLYMPIC_WEIGHTLIFTING',
])

export const exerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: exerciseLevelSchema,
  force: exerciseForceSchema.nullable().optional(),
  mechanic: exerciseMechanicSchema.nullable().optional(),
  equipment: exerciseEquipmentSchema.nullable().optional(),
  primaryMuscles: z.array(z.string()),
  secondaryMuscles: z.array(z.string()),
  instructions: z.array(z.string()),
  category: exerciseCategorySchema,
})

export const exercisesArraySchema = z.array(exerciseSchema)

// ==========================================
// User Schemas
// ==========================================

export const userMeasurementsSchema = z.object({
  weightKg: z.number().nullable(),
  heightCm: z.number().nullable(),
})

export const userNotificationsSchema = z.object({
  emailNotificationsEnabled: z.boolean(),
  schedule: z.array(z.string()),
})

export const userStreakSchema = z.object({
  currentStreak: z.number(),
  longestStreak: z.number(),
  nextWorkoutId: z.string().nullable(),
  nextWorkoutDeadline: z.string().nullable(),
  streakFreezeCount: z.number(),
  lastWorkoutCountedDate: z.string().nullable(),
  weeklyCompletedWorkoutIds: z.array(z.string()),
  currentWeekStart: z.string().nullable(),
})

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  createdAt: z.string(),
  timezone: z.string().nullable(),
  activeRoutineId: z.string().nullable().optional(),
  streak: userStreakSchema.optional(),
  measurements: userMeasurementsSchema.nullable().optional(),
  registrationCompleted: z.boolean(),
  notificationPreferences: userNotificationsSchema,
})

// ==========================================
// Auth Schemas
// ==========================================

export const loginResponseSchema = z.object({
  token: z.string(),
  refreshToken: z.string(),
})

// ==========================================
// Workout Schemas
// ==========================================

export const muscleGroupSchema = z.enum([
  'ABDOMINALS',
  'ABDUCTORS',
  'ADDUCTORS',
  'BICEPS',
  'CALVES',
  'CHEST',
  'FOREARMS',
  'GLUTES',
  'HAMSTRINGS',
  'LATS',
  'LOWER_BACK',
  'MIDDLE_BACK',
  'NECK',
  'QUADRICEPS',
  'SHOULDERS',
  'TRAPS',
  'TRICEPS',
])

export const workoutExerciseSchema = z.object({
  exerciseId: z.string(),
  reps: z.array(z.number()).nullable().optional().transform((v) => v ?? []),
  weight: z.array(z.number()).nullable().optional().transform((v) => v ?? []),
  durationSeconds: z.array(z.number()).nullable().optional().transform((v) => v ?? []),
  category: exerciseCategorySchema,
  primaryMuscles: z.array(muscleGroupSchema).optional().default([]),
  secondaryMuscles: z.array(muscleGroupSchema).optional().default([]),
}).refine(
  (data) => {
    const hasRepsWeight = data.reps.length > 0 && data.weight.length > 0
    const hasDuration = data.durationSeconds.length > 0
    return hasRepsWeight || hasDuration
  },
  {
    message: 'Exercise must have either reps/weight or durationSeconds',
  }
)

export const workoutTemplateSchema = z.object({
  id: z.string(),
  exercises: z.array(workoutExerciseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const workoutSchema = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  workoutTemplate: workoutTemplateSchema,
})

export const workoutsArraySchema = z.array(workoutSchema)

// ==========================================
// Workout Record Schemas
// ==========================================

export const workoutRecordExerciseSchema = z.object({
  exerciseName: z.string(),
  reps: z.array(z.number()),
  weight: z.array(z.number()),
  durationSeconds: z.array(z.number()).nullable().optional(),
  notes: z.string().nullable().optional(),
  achievedOneRmValue: z.number().nullable().optional(),
  achievedOneRmSetIndex: z.number().nullable().optional(),
  achievedTotalVolumeValue: z.number().nullable().optional(),
})

export const workoutRecordSchema = z.object({
  id: z.string().nullable(),
  workoutId: z.string(),
  workoutTitle: z.string(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  startTime: z.string().optional(),
  exerciseRecords: z.array(workoutRecordExerciseSchema),
})

export const workoutRecordsArraySchema = z.array(workoutRecordSchema)

export const streakUpdateStatusSchema = z.enum([
  'CONTINUED',
  'STARTED',
  'WRONG_WORKOUT',
  'BROKEN_RESET',
  'WEEKLY_PROGRESS',
])

export const streakUpdateResponseSchema = z.object({
  status: streakUpdateStatusSchema,
  currentStreak: z.number(),
  longestStreak: z.number(),
  nextWorkoutId: z.string().nullable(),
  nextWorkoutDeadline: z.string().nullable(),
  streakFreezeCount: z.number(),
  weeklyCompletedWorkoutIds: z.array(z.string()).optional(),
  weeklyWorkoutsRequired: z.number().optional(),
})

export const workoutRecordResponseSchema = z.object({
  workoutRecord: workoutRecordSchema,
  streakUpdate: streakUpdateResponseSchema,
})

// ==========================================
// Routine Schemas
// ==========================================

export const routineTypeSchema = z.enum(['SEQUENTIAL', 'WEEKLY_COMPLETION'])
export const routineDayTypeSchema = z.enum(['WORKOUT', 'REST'])

export const routinePatternItemSchema = z.object({
  dayIndex: z.number(),
  dayType: routineDayTypeSchema,
  workoutId: z.string().nullable(),
})

export const routineSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  userId: z.string(),
  routineType: routineTypeSchema.optional(),
  pattern: z.array(routinePatternItemSchema),
  startDate: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const routinesArraySchema = z.array(routineSchema)

// ==========================================
// Exercise Log Schema
// ==========================================

export const exerciseLogSchema = z.object({
  exerciseRecordId: z.string(),
  exerciseId: z.string(),
  exerciseName: z.string(),
  createdAt: z.string(),
  reps: z.array(z.number()),
  weight: z.array(z.number()),
  durationSeconds: z.array(z.number()).optional(),
  notes: z.string().optional(),
  achievedOneRmValue: z.number().optional(),
  achievedOneRmSetIndex: z.number().optional(),
  achievedTotalVolumeValue: z.number().optional(),
})

export const exerciseLogsArraySchema = z.array(exerciseLogSchema)

// ==========================================
// Type Exports (inferred from schemas)
// ==========================================

export type Exercise = z.infer<typeof exerciseSchema>
export type User = z.infer<typeof userSchema>
export type Workout = z.infer<typeof workoutSchema>
export type WorkoutRecord = z.infer<typeof workoutRecordSchema>
export type Routine = z.infer<typeof routineSchema>
export type ExerciseLog = z.infer<typeof exerciseLogSchema>
export type LoginResponse = z.infer<typeof loginResponseSchema>
