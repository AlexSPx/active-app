import type { ApiExercise } from './api'

// ==========================================
// Internal App Types for Workout Management
// ==========================================

// Use the API exercise type as the primary exercise type
export type Exercise = ApiExercise

// Re-export API types for convenience
export type {
  CreateWorkoutRequest,
  WorkoutRecordRequest,
  ExerciseRecord,
  TemplateExercise,
} from './api'

// Core workout types for the UI
export interface WorkoutSet {
  id?: string
  reps: number | null
  weight: number | null
  completed?: boolean
  restTime?: number
}

export interface WorkoutExercise extends Exercise {
  sets: WorkoutSet[]
  notes?: string
}

// Internal workout type for UI use (converted from API types)
export interface Workout {
  id?: string
  name: string
  date?: Date
  duration?: number
  exercises: WorkoutExercise[]
  tags?: string[]
  completed?: boolean
  notes?: string
}

// Store types
export interface WorkoutStore {
  selectedExercises: WorkoutExercise[]
  isLoading: boolean
  error: string | null
}
