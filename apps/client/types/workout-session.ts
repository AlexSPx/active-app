import type { ApiExercise, CoachPrescription } from './api'

// ==========================================
// Workout Session Types (for active workouts)
// ==========================================

export interface Set {
  id: string
  reps: number | null
  weight: number | null
  completed: boolean
  restTime?: number
  durationSeconds?: number | null // cardio interval
}

export interface Exercise extends ApiExercise {
  sessionId: string
  coachPrescription?: CoachPrescription
  sets: Set[]
}
