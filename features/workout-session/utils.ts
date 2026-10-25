import type { Exercise, Set } from '../../types/workout-session'

export function getRestTimerNextStepText(exercises: Exercise[], activeSetId: string) {
  const sets = exercises.flatMap((exercise) =>
    exercise.sets.map((set, index) => ({ exercise, set, index }))
  )
  const activeIndex = sets.findIndex(({ set }) => set.id === activeSetId)
  const nextSet = sets.find(({ set }, index) => index > activeIndex && !set.completed)

  if (nextSet) {
    const noun = nextSet.exercise.category === 'CARDIO' ? 'interval' : 'set'
    return `Next up: ${nextSet.exercise.name}, ${noun} ${nextSet.index + 1}.`
  }

  if (sets.some(({ set }) => !set.completed)) {
    return 'You still have unfinished sets. Continue whenever you are ready.'
  }

  return 'All sets are complete. Finish your workout whenever you are ready.'
}

export function hasSetValues(
  category: string,
  set: Pick<Set, 'reps' | 'weight' | 'durationSeconds'>
) {
  if (category === 'CARDIO') {
    return (
      set.durationSeconds != null && Number.isFinite(set.durationSeconds) && set.durationSeconds > 0
    )
  }
  return (
    set.reps != null &&
    Number.isFinite(set.reps) &&
    set.reps > 0 &&
    set.weight != null &&
    Number.isFinite(set.weight) &&
    set.weight >= 0
  )
}
