// ==========================================
// API Types - All API-related interfaces
// ==========================================

// Exercise Types
export interface ApiExercise {
  id: string
  name: string
  level: 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT'
  force: 'PULL' | 'PUSH' | 'STATIC' | null
  mechanic: 'COMPOUND' | 'ISOLATION' | null
  equipment:
    | 'BODY_ONLY'
    | 'MACHINE'
    | 'OTHER'
    | 'FOAM_ROLL'
    | 'KETTLEBELLS'
    | 'DUMBBELL'
    | 'CABLE'
    | 'BARBELL'
    | 'BANDS'
    | 'MEDICINE_BALL'
    | 'EXERCISE_BALL'
    | 'E_Z_CURL_BAR'
    | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  category:
    | 'STRENGTH'
    | 'STRETCHING'
    | 'PLYOMETRICS'
    | 'STRONGMAN'
    | 'POWERLIFTING'
    | 'CARDIO'
    | 'OLYMPIC_WEIGHTLIFTING'
}

// Authentication Types
export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  username: string
  firstName: string
  lastName: string
  password: string
  timezone?: string
  notificationFrequency?: number
  measurements?: UserMeasurements
  registrationCompleted: boolean
}

export interface LoginResponse {
  token: string
  refreshToken: string
}

export interface UserStreak {
  currentStreak: number
  longestStreak: number
  nextWorkoutId: string | null
  nextWorkoutDeadline: string | null // ISO string (LocalDate on server)
  streakFreezeCount: number
  lastWorkoutCountedDate: string | null // ISO string (LocalDate on server)
  weeklyCompletedWorkoutIds: string[]
  currentWeekStart: string | null // ISO string (LocalDate on server)
}

export interface User {
  id: string
  email: string
  username: string
  firstName: string
  lastName: string
  createdAt: string
  timezone: string | null
  activeRoutineId?: string | null
  streak?: UserStreak
  measurements?: UserMeasurements | null
  registrationCompleted: boolean
  notificationPreferences?: UserNotifications | null
}

export interface UserNotifications {
  emailNotificationsEnabled: boolean
  schedule: string[]
}

export interface UserMeasurements {
  weightKg: number | null
  heightCm: number | null
}

export interface UpdateUserRequest {
  username?: string
  firstName?: string
  lastName?: string
  email?: string
  timezone?: string
  measurements?: UserMeasurements
  notificationFrequency?: number
  registrationCompleted?: boolean
}

// Muscle Group enum matching backend MuscleGroup
export type MuscleGroup =
  | 'ABDOMINALS'
  | 'ABDUCTORS'
  | 'ADDUCTORS'
  | 'BICEPS'
  | 'CALVES'
  | 'CHEST'
  | 'FOREARMS'
  | 'GLUTES'
  | 'HAMSTRINGS'
  | 'LATS'
  | 'LOWER_BACK'
  | 'MIDDLE_BACK'
  | 'NECK'
  | 'QUADRICEPS'
  | 'SHOULDERS'
  | 'TRAPS'
  | 'TRICEPS'

// Workout Template Types (Server Request/Response)
export interface ApiWorkoutExercise {
  exerciseId: string
  exerciseTitle: string
  reps: number[]
  weight: number[]
  durationSeconds?: number[] | null
  category: ApiExercise['category']
  primaryMuscles?: string[]
  secondaryMuscles?: string[]
}

export interface ApiWorkoutTemplate {
  id: string
  exercises: ApiWorkoutExercise[]
  createdAt: string
  updatedAt: string
}

export interface ApiWorkout {
  id: string
  title: string
  notes?: string | null
  createdAt: string
  updatedAt: string
  workoutTemplate: ApiWorkoutTemplate
}

// Workout Creation Request Types
export interface TemplateExercise {
  exerciseId: string
  // Strength training fields
  reps?: number[]
  weight?: number[]
  // Cardio/Time-based fields
  durationSeconds?: number[]
  // Common fields
  notes?: string
}

export interface CreateWorkoutTemplateRequest {
  exercises: TemplateExercise[]
}

export interface CreateWorkoutRequest {
  title: string
  notes?: string
  template: CreateWorkoutTemplateRequest
}

export interface UpdateWorkoutRequest {
  title?: string
  notes?: string
  // If template is provided, it must be complete
  template?: CreateWorkoutTemplateRequest
}

// Workout Record Types (Completed Workouts)
export interface ExerciseRecord {
  exerciseId: string
  reps: number[]
  weight: number[] // in kg
  durationSeconds?: number[] // for cardio exercises, in seconds
  notes?: string // optional notes for the exercise
}

export interface WorkoutRecordRequest {
  notes?: string
  workoutId: string
  exerciseRecords: ExerciseRecord[]
  // LocalDateTime without timezone, e.g., '2025-08-25T14:30:00'
  startTime: string
}

export interface WorkoutRecordExercise {
  exerciseName: string
  reps: number[]
  weight: number[]
  durationSeconds?: number[] | null
  notes?: string | null
  // Achievement fields (populated when a new PR is achieved for this exercise)
  achievedOneRmValue?: number | null // estimated 1RM in kg
  achievedOneRmSetIndex?: number | null // zero-based set index that achieved 1RM
  achievedTotalVolumeValue?: number | null // total volume PR in kg across all sets
}

export interface WorkoutRecord {
  id: string | null
  workoutId: string
  workoutTitle: string
  notes?: string | null
  createdAt: string
  // LocalDateTime string if provided when recording
  startTime?: string
  exerciseRecords: WorkoutRecordExercise[]
}

// Streak update types
export type StreakUpdateStatus =
  | 'CONTINUED'
  | 'STARTED'
  | 'WRONG_WORKOUT'
  | 'BROKEN_RESET'
  | 'WEEKLY_PROGRESS' // Workout counted towards weekly goal, but week not yet complete

export interface StreakUpdateResponse {
  status: StreakUpdateStatus
  currentStreak: number
  longestStreak: number
  nextWorkoutId: string | null
  // ISO date string (LocalDate on server); keep as string client-side
  nextWorkoutDeadline: string | null
  streakFreezeCount: number
  // Weekly completion fields (only present for WEEKLY_COMPLETION routines)
  weeklyCompletedWorkoutIds?: string[] // Workout IDs completed this week
  weeklyWorkoutsRequired?: number // Total workouts needed for the week
}

// Response shape from recording a workout
export interface WorkoutRecordResponse {
  workoutRecord: WorkoutRecord
  streakUpdate: StreakUpdateResponse
}

// TODO: Harmonize with WorkoutRecordExercise
// Exercise Log Types
export interface ExerciseLogResponse {
  exerciseRecordId: string
  exerciseId: string
  exerciseName: string
  createdAt: string // ISO string format

  // Strength training fields
  reps: number[]
  weight: number[]

  // Cardio/Time-based fields
  durationSeconds?: number[]

  // Common fields
  notes?: string

  // Achievement fields (only present when this record set a new PR)
  achievedOneRmValue?: number // estimated 1RM in kg
  achievedOneRmSetIndex?: number // zero-based set index that achieved 1RM
  achievedTotalVolumeValue?: number // total volume in kg across all sets
}

// Error Types
export interface ApiError extends Error {
  status?: number
  code?: string
}
