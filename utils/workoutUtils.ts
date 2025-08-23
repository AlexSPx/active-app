import type { WorkoutSet, WorkoutExercise } from '../types/history'
import type {
  WorkoutExercise as CreateWorkoutExercise,
  TemplateExercise,
  CreateWorkoutRequest,
} from '../types/workout'
import type { ApiWorkout, UpdateWorkoutRequest } from '../types/api'

export const calculateSetVolume = (set: WorkoutSet): number => {
  return set.reps * set.weight
}

export const calculateExerciseVolume = (sets: WorkoutSet[]): number => {
  return sets.reduce((total, set) => total + calculateSetVolume(set), 0)
}

export const calculateWorkoutVolume = (exercises: WorkoutExercise[]): number => {
  return exercises.reduce((total, exercise) => total + calculateExerciseVolume(exercise.sets), 0)
}

export const formatVolume = (volume: number, unit: 'lbs' | 'kg' = 'kg'): string => {
  if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}k ${unit}`
  }
  return `${volume.toLocaleString()} ${unit}`
}

/**
 * Converts internal WorkoutExercise format to server TemplateExercise format
 */
export const convertToTemplateExercise = (exercise: CreateWorkoutExercise): TemplateExercise => {
  return {
    exerciseId: exercise.id,
    reps: exercise.sets.map((set) => set.reps),
    weight: exercise.sets.map((set) => set.weight),
    notes: exercise.notes,
  }
}

/**
 * Converts internal workout data to server CreateWorkoutRequest format
 */
export const convertToCreateWorkoutRequest = (
  name: string,
  exercises: CreateWorkoutExercise[],
  notes?: string
): CreateWorkoutRequest => {
  return {
    title: name,
    notes: notes?.trim() || undefined,
    template: {
      exercises: exercises.map(convertToTemplateExercise),
    },
  }
}

/**
 * Build an UpdateWorkoutRequest honoring partial updates. If template is provided,
 * the backend requires it to be complete; here we only include template when explicitly asked.
 */
export const buildUpdateWorkoutRequest = (params: {
  title?: string
  notes?: string
  exercises?: CreateWorkoutExercise[]
}): UpdateWorkoutRequest => {
  const payload: UpdateWorkoutRequest = {}
  if (params.title && params.title.trim()) payload.title = params.title
  if (typeof params.notes !== 'undefined') {
    const trimmed = params.notes?.trim()
    if (trimmed && trimmed.length > 0) payload.notes = trimmed
    else payload.notes = '' // allow clearing notes by sending empty string
  }
  if (params.exercises) {
    payload.template = {
      exercises: params.exercises.map(convertToTemplateExercise),
    }
  }
  return payload
}

/** Convert an ApiWorkout to editable WorkoutExercise[] used by the editor */
export const apiWorkoutToEditableExercises = (workout: ApiWorkout): CreateWorkoutExercise[] => {
  return workout.workoutTemplate.exercises.map((ex, idx) => ({
    // Editor expects Exercise-like object with id/name/muscles; we only have exerciseId.
    // Use exerciseId for id and a readable name; muscle metadata is not available from API here.
    id: ex.exerciseId,
    name: ex.exerciseId.replace(/_/g, ' '),
    level: 'INTERMEDIATE',
    force: 'PUSH',
    mechanic: 'COMPOUND',
    equipment: 'OTHER',
    primaryMuscles: ['OTHER'],
    secondaryMuscles: [],
    instructions: [],
    category: 'STRENGTH',
    sets: (ex.reps && ex.weight
      ? ex.reps.map((r, i) => ({ reps: r, weight: ex.weight[i] ?? 0 }))
      : []) as any,
  })) as unknown as CreateWorkoutExercise[]
}

/**
 * Validates workout data before sending to server
 */
export const validateWorkoutData = (
  name: string,
  exercises: CreateWorkoutExercise[]
): string | null => {
  if (!name.trim()) {
    return 'Workout name is required'
  }

  if (exercises.length === 0) {
    return 'At least one exercise is required'
  }

  for (const exercise of exercises) {
    if (exercise.sets.length === 0) {
      return `Exercise "${exercise.name}" must have at least one set`
    }

    for (const set of exercise.sets) {
      if (set.reps <= 0) {
        return `All sets must have positive reps in "${exercise.name}"`
      }
      if (set.weight < 0) {
        return `Weight cannot be negative in "${exercise.name}"`
      }
    }
  }

  return null
}
