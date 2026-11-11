const { parseWorkoutSchedule } = require('../../features/coach/workoutSchedule')

test.each(['3-day workout', 'three day workout', '3 days/week', '3 training days per week', '3 workouts a week', 'three sessions weekly', 'train three times per week'])('recognizes training frequency: %s', request => {
  expect(parseWorkoutSchedule(request)).toEqual({ kind: 'weekly', sessions: 3, split: 'shared' })
})

test.each(['3 exercises, 2 sets, 8 reps', '30-minute bodyweight workout', 'one-day workout'])('does not turn exercise prescriptions into training days: %s', request => {
  expect(parseWorkoutSchedule(request)).toEqual({ kind: 'single' })
})

test.each(['weekly workout', 'multi-day plan', '3 or 4 days', '3–4 days', 'two to three days', '0 days', '8 days', '3 workout days and 4 rest days', '3 consecutive days', '3 days for 4 weeks'])('clarifies unsupported or ambiguous schedules: %s', request => {
  expect(parseWorkoutSchedule(request).kind).toBe('clarification')
})

test.each(['PPL', 'Push Pull Legs', 'Push Pull Leg', '3-day Push/Pull/Legs', 'three day push-pull-legs split'])('recognizes the split independently of muscle mentions: %s', request => {
  expect(parseWorkoutSchedule(request)).toEqual({ kind: 'weekly', sessions: 3, split: 'ppl' })
})

test('recognizes two PPL cycles and clarifies incompatible day counts', () => {
  expect(parseWorkoutSchedule('6-day PPL')).toEqual({ kind: 'weekly', sessions: 6, split: 'ppl' })
  expect(parseWorkoutSchedule('4-day PPL').kind).toBe('clarification')
  expect(parseWorkoutSchedule('Give me a 4 days Push Pull Leg routine').kind).toBe('clarification')
})
