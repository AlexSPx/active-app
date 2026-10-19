const { getRestTimerNextStepText } = require('../../features/workout-session/utils')

const exercise = (name, category, sets) => ({
  name,
  category,
  sets: sets.map((id, index) => ({ id, completed: index === 0 })),
})

it('names the next incomplete strength set', () => {
  const exercises = [exercise('Squat', 'STRENGTH', ['squat-1', 'squat-2'])]

  expect(getRestTimerNextStepText(exercises, 'squat-1')).toBe('Next up: Squat, set 2.')
})

it('names the next cardio interval in the following exercise', () => {
  const exercises = [
    exercise('Squat', 'STRENGTH', ['squat-1']),
    exercise('Run', 'CARDIO', ['run-1', 'run-2']),
  ]

  expect(getRestTimerNextStepText(exercises, 'squat-1')).toBe('Next up: Run, interval 2.')
})

it('does not promise another set when the completed set is the last one', () => {
  const exercises = [exercise('Squat', 'STRENGTH', ['squat-1'])]

  expect(getRestTimerNextStepText(exercises, 'squat-1')).toBe(
    'All sets are complete. Finish your workout whenever you are ready.'
  )
})
