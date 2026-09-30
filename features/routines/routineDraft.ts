import type { ApiWorkout } from '../../types/api'
import type { RoutinePatternItem, RoutineType } from '../../types/routine'
import { createRoutineSchema, type CreateRoutineFormData } from '../../lib/schemas/forms'

export type RoutineDraft = Omit<CreateRoutineFormData, 'pattern'> & {
  pattern: RoutinePatternItem[]
}

export function reindexPattern(pattern: RoutinePatternItem[]) {
  return pattern.map((day, index) => ({ ...day, dayIndex: index + 1 }))
}

export function switchPatternDraft(
  drafts: Record<RoutineType, RoutinePatternItem[] | null>,
  currentType: RoutineType,
  current: RoutinePatternItem[],
  nextType: RoutineType
) {
  return {
    ...drafts,
    [currentType]: current,
    [nextType]:
      drafts[nextType] ?? reindexPattern(current.filter((day) => day.dayType === 'WORKOUT')),
  }
}

export function applyWorkoutSelection(pattern: RoutinePatternItem[], selection: string[]) {
  const retained = pattern.filter((day) => day.workoutId && selection.includes(day.workoutId))
  return reindexPattern([
    ...retained,
    ...selection
      .filter((id) => !retained.some((day) => day.workoutId === id))
      .map((workoutId) => ({ dayIndex: 0, dayType: 'WORKOUT' as const, workoutId })),
  ])
}

export function toggleWorkoutSelection(selection: string[], id: string, single: boolean) {
  return single
    ? [id]
    : selection.includes(id)
      ? selection.filter((value) => value !== id)
      : [...selection, id]
}

export function routineValidation(data: RoutineDraft, workoutIds: string[]) {
  if (!data.name.trim()) return 'Enter a routine name to save.'
  if (!data.pattern.length)
    return data.routineType === 'SEQUENTIAL'
      ? 'Add a day to begin your cycle.'
      : 'Add at least one workout for your week.'
  if (!data.pattern.some((day) => day.dayType === 'WORKOUT'))
    return 'Include at least one training day.'
  const missing = data.pattern.findIndex(
    (day) => day.dayType === 'WORKOUT' && (!day.workoutId || !workoutIds.includes(day.workoutId))
  )
  if (missing >= 0)
    return `Choose a saved workout for ${data.routineType === 'SEQUENTIAL' ? 'day' : 'session'} ${missing + 1}.`
  const result = createRoutineSchema.safeParse({ ...data, name: data.name.trim() })
  return result.success ? '' : result.error.issues[0].message
}

export function workoutMetadata(workout: ApiWorkout) {
  const exercises = workout.workoutTemplate.exercises
  const sets = exercises.reduce(
    (total, exercise) =>
      total +
      (exercise.category === 'CARDIO'
        ? (exercise.durationSeconds?.length ?? 0)
        : (exercise.reps?.length ?? 0)),
    0
  )
  const seconds = exercises.reduce(
    (total, exercise) =>
      total +
      (exercise.category === 'CARDIO'
        ? (exercise.durationSeconds?.reduce((sum, duration) => sum + duration, 0) ?? 0)
        : (exercise.reps?.length ?? 0) * 150),
    0
  )
  return `${sets} ${exercises.length && exercises.every((exercise) => exercise.category === 'CARDIO') ? 'intervals' : 'sets'} · ~${Math.max(5, Math.round(seconds / 60))} min`
}
