import type { ApiExercise } from './api'

// ==========================================
// Workout Session Types (for active workouts)
// ==========================================

export interface Set {
  id: string
  reps: number | null
  weight: number | null
  completed: boolean
  restTime?: number
}

export interface Exercise extends ApiExercise {
  sets: Set[]
  previousBest?: {
    weight: number
    reps: number
    date: string
  }
  lastWorkout?: {
    sets: { reps: number; weight: number }[]
    date: string
  }
}
