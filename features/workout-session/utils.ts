import type { Exercise } from '../../types/workout-session'

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
