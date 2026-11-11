import { estimateWorkoutSeconds } from './workoutPlanner'
import { coachResponseSchema, type CoachResponse } from './contracts'
import { exerciseCatalog } from '../../lib/exercises/catalog'
import type { ApiWorkoutExercise, CoachPrescription } from '../../types/api'

type Draft = Extract<CoachResponse, { kind: 'workout_draft' | 'routine_draft' }>
export type AdaptedExercise = ApiWorkoutExercise & { coachPrescription: CoachPrescription }
export type AdaptedDraft = {
  draft: Draft
  workouts: { ref: string; title: string; exercises: AdaptedExercise[]; coachSchedule?: { preparation: NonNullable<Extract<CoachResponse, { kind: 'workout_draft' }>['workout']['preparation']>; estimatedSeconds: number; transitionSeconds: number } }[]
}

/** Convert only fully representable prescriptions; source IDs are never backend IDs. */
export function adaptCoachDraft(input: unknown, mode: 'device' | 'remote'): AdaptedDraft {
  const parsed = coachResponseSchema.parse(input)
  if (parsed.kind !== 'routine_draft' && parsed.kind !== 'workout_draft')
    throw new Error('A workout or routine draft is required.')
  if (mode === 'remote')
    throw new Error('This draft cannot be saved for sync until exercise IDs can be mapped.')
  const catalog = new Map(exerciseCatalog.map((exercise) => [exercise.id, exercise]))
  const workouts = parsed.kind === 'workout_draft' ? [parsed.workout] : parsed.workouts
  return {
    draft: parsed,
    workouts: workouts.map((workout) => ({
      ref: workout.ref,
      title: workout.title,
      exercises: workout.exercises.map((selection) => {
        const exercise = catalog.get(selection.catalogId)
        if (!exercise) throw new Error(`Unknown catalog exercise: ${selection.catalogId}`)
        const timed = selection.sets[0].kind === 'timed'
        if (exercise.category === 'CARDIO' && !timed)
          throw new Error(`${exercise.name}: choose a timed prescription for this cardio exercise.`)
        if (selection.sets.some((set) => (set.kind === 'timed') !== timed))
          throw new Error(`${exercise.name}: mixed timed and strength sets are not supported.`)
        const reps: number[] = []
        const weight: number[] = []
        const durationSeconds: number[] = []
        for (const set of selection.sets) {
          if (set.kind === 'timed') durationSeconds.push(set.durationSeconds)
          else {
            if (set.load.kind === 'user_selected')
              throw new Error(`${exercise.name}: choose a load for every set.`)
            reps.push(set.repetitions)
            // Zero is the existing editor's external-load representation; the label is retained separately.
            weight.push(set.load.kind === 'bodyweight' ? 0 : set.load.value)
          }
        }
        return {
          exerciseId: exercise.id,
          exerciseTitle: exercise.name,
          category: exercise.category,
          primaryMuscles: exercise.primaryMuscles,
          secondaryMuscles: exercise.secondaryMuscles,
          reps,
          weight,
          durationSeconds: timed ? durationSeconds : null,
          coachPrescription: {
            sets: selection.sets.map((set) => {
              if (set.kind === 'timed') return set
              const load = set.load
              if (load.kind === 'user_selected')
                throw new Error(`${exercise.name}: choose a load for every set.`)
              return { kind: 'strength' as const, repetitions: set.repetitions, load }
            }),
            guidance: selection.guidance,
          },
        }
      }),
      ...(workout.schedule ? { coachSchedule: { preparation: workout.preparation ?? [], estimatedSeconds: estimateWorkoutSeconds(workout), transitionSeconds: Math.max(0, workout.exercises.length - 1) * 30 } } : {}),
    })),
  }
}
