import type { Exercise, WorkoutSet, WorkoutExercise } from '../types/workout'
import type {
  WorkoutExercise as CreateWorkoutExercise,
  TemplateExercise,
  CreateWorkoutRequest,
} from '../types/workout'
import type { ApiWorkout, UpdateWorkoutRequest } from '../types/api'
import type { WorkoutRecord, WorkoutRecordExercise } from '../types/api'

export const calculateSetVolume = (set: WorkoutSet): number => {
  const reps = set.reps ?? 0
  const weight = set.weight ?? 0
  return reps * weight
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

/** Determine if an exercise record is cardio/time-based (no reps but has durationSeconds). */
export const isCardioExerciseRecord = (ex: WorkoutRecordExercise): boolean => {
  return (!ex.reps || ex.reps.length === 0) && !!ex.durationSeconds && ex.durationSeconds.length > 0
}

/** Total sets counting strength sets OR cardio intervals. */
export const countSetsForRecord = (record: WorkoutRecord): number => {
  return record.exerciseRecords.reduce((total, ex) => {
    const strengthSets = ex.reps?.length || 0
    if (strengthSets > 0) return total + strengthSets
    if (isCardioExerciseRecord(ex)) return total + (ex.durationSeconds?.length || 0)
    return total
  }, 0)
}

/** Compute total volume (only strength exercises). */
export const computeVolumeForRecord = (record: WorkoutRecord): number => {
  return record.exerciseRecords.reduce((total, ex) => {
    if (!ex.reps || !ex.weight || ex.reps.length === 0) return total
    return total + ex.reps.reduce((acc, reps, i) => acc + reps * (ex.weight[i] || 0), 0)
  }, 0)
}

/** Sum of all cardio/time durations across exercises (in seconds). */
export const computeCardioDurationForRecord = (record: WorkoutRecord): number => {
  return record.exerciseRecords.reduce((sum, ex) => {
    if (!isCardioExerciseRecord(ex)) return sum
    return sum + (ex.durationSeconds?.reduce((a, b) => a + (b || 0), 0) || 0)
  }, 0)
}

/** Format seconds to H:MM:SS or M:SS. */
export const formatSeconds = (secs?: number): string => {
  const s = Math.max(0, Math.floor(secs || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  return `${m}:${String(ss).padStart(2, '0')}`
}

/**
 * Converts internal WorkoutExercise format to server TemplateExercise format
 */
export const convertToTemplateExercise = (exercise: CreateWorkoutExercise): TemplateExercise => {
  if (exercise.category === 'CARDIO') {
    // For cardio, send durationSeconds (per-interval values). If multiple, server may accept array via TemplateExercise type.
    // Our Api type defines durationSeconds?: number[] for TemplateExercise; build from per-set durationSeconds.
    const durations = exercise.sets
      .map((s) => (typeof s.durationSeconds === 'number' ? s.durationSeconds : null))
      .filter((v): v is number => v != null)
    return {
      exerciseId: exercise.id,
      durationSeconds: durations,
      notes: exercise.notes,
    } as unknown as TemplateExercise
  }
  return {
    exerciseId: exercise.id,
    reps: exercise.sets.map((set) => set.reps).filter((v): v is number => v != null),
    weight: exercise.sets.map((set) => set.weight).filter((v): v is number => v != null),
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
    // Editor expects Exercise-like object with id/name/muscles.
    // Use API exerciseTitle when present; fall back to a readable ID.
    id: ex.exerciseId,
    name: ex.exerciseTitle?.trim() || ex.exerciseId.replace(/_/g, ' '),
    level: 'INTERMEDIATE',
    force: 'PUSH',
    mechanic: 'COMPOUND',
    equipment: 'OTHER',
    primaryMuscles: ex.primaryMuscles || [],
    secondaryMuscles: ex.secondaryMuscles || [],
    instructions: [],
    category: ex.category,
    sets:
      ex.category === 'CARDIO'
        ? ((ex.durationSeconds
            ? Array.isArray(ex.durationSeconds)
              ? ex.durationSeconds.map((d) => ({ reps: null, weight: null, durationSeconds: d }))
              : [{ reps: null, weight: null, durationSeconds: ex.durationSeconds as any }]
            : [{ reps: null, weight: null, durationSeconds: 0 }]) as any)
        : ((ex.reps && ex.weight
            ? ex.reps.map((r, i) => ({ reps: r, weight: ex.weight[i] ?? 0 }))
            : [{ reps: null, weight: null }]) as any),
  })) as unknown as CreateWorkoutExercise[]
}

/**
 * Validates workout data before sending to server
 */
export const validateWorkoutData = (
  name: string,
  exercises: CreateWorkoutExercise[],
  notes = ''
): string | null => {
  if (!name.trim()) {
    return 'Workout name is required'
  }

  if (name.length > 100) return 'Keep the workout name within 100 characters.'
  if (notes.length > 1000) return 'Keep notes within 1,000 characters.'

  if (exercises.length === 0) {
    return 'At least one exercise is required'
  }

  for (const exercise of exercises) {
    if (exercise.sets.length === 0) {
      return `Exercise "${exercise.name}" must have at least one set`
    }
    if (exercise.category === 'CARDIO') {
      for (const set of exercise.sets) {
        if (!Number.isInteger(set.durationSeconds) || (set.durationSeconds ?? 0) <= 0) {
          return `All cardio intervals must have a positive duration in "${exercise.name}"`
        }
      }
      continue
    }
    for (const set of exercise.sets) {
      if (set.reps == null || set.weight == null) {
        return `All sets must have reps and weight in "${exercise.name}"`
      }
      if (!Number.isInteger(set.reps) || (set.reps ?? 0) <= 0) {
        return `All sets must have whole, positive reps in "${exercise.name}"`
      }
      if (!Number.isFinite(set.weight) || (set.weight ?? 0) < 0) {
        return `Enter a finite weight of 0 or more in "${exercise.name}"`
      }
    }
  }

  return null
}

/** Picker changes remain local until Done; reselecting restores the original targets. */
export const toggleExerciseSelection = (
  pending: WorkoutExercise[],
  exercise: Exercise,
  original: WorkoutExercise[]
): WorkoutExercise[] => {
  if (pending.some((item) => item.id === exercise.id)) {
    return pending.filter((item) => item.id !== exercise.id)
  }
  const existing = original.find((item) => item.id === exercise.id)
  return [
    ...pending,
    existing ?? {
      ...exercise,
      sets: [
        exercise.category === 'CARDIO'
          ? { reps: null, weight: null, durationSeconds: 0 }
          : { reps: null, weight: null },
      ],
    },
  ]
}

export const parseWorkoutDuration = (text: string): number | null => {
  const match = /^(\d+):([0-5]\d)$/.exec(text.trim())
  if (!match) return null
  const seconds = Number(match[1]) * 60 + Number(match[2])
  return Number.isSafeInteger(seconds) ? seconds : null
}
