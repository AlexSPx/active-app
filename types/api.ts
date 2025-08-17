// ==========================================
// API Types - All API-related interfaces
// ==========================================

// Exercise Types
export interface ApiExercise {
  id: string
  name: string
  level: 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT'
  force: 'PULL' | 'PUSH' | 'STATIC'
  mechanic: 'COMPOUND' | 'ISOLATION'
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
}

export interface LoginResponse {
  token: string
}

export interface User {
  id: string
  email: string
  username: string
  firstName: string
  lastName: string
  createdAt: string
}

// Workout Template Types (Server Request/Response)
export interface ApiWorkoutExercise {
  exerciseId: string
  reps: number[]
  weight: number[]
  durationSeconds?: number | null
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
  name: string
  notes?: string
  template: CreateWorkoutTemplateRequest
}

export interface UpdateWorkoutRequest extends Partial<CreateWorkoutRequest> {
  id: string
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
}

export interface WorkoutRecordExercise {
  exerciseName: string
  reps: number[]
  weight: number[]
  durationSeconds?: number[] | null
  notes?: string | null
}

export interface WorkoutRecord {
  id: string | null
  workoutId: string
  notes?: string | null
  createdAt: string
  exerciseRecords: WorkoutRecordExercise[]
}

// Error Types
export interface ApiError extends Error {
  status?: number
  code?: string
}
