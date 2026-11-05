// ==========================================
// History Types (for displaying workout history)
// ==========================================

export interface WorkoutSet {
  reps: number
  weight: number
}

export interface WorkoutExercise {
  name: string
  sets: WorkoutSet[]
  muscleGroup: string
}

export interface WorkoutSession {
  id: string
  name: string
  date: string
  duration: number // in minutes
  exercises: WorkoutExercise[]
  totalVolume: number
  totalSets: number
  notes?: string
}
