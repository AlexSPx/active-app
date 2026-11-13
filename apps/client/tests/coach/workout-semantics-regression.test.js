import { defaultSelection, planWorkout, renderWorkout, validateWorkoutReview } from '../../features/coach/workoutPlanner'

const draft = request => {
  const result = planWorkout(request)
  expect(result.kind).toBe('plan')
  return renderWorkout(result.plan, defaultSelection(result.plan))
}

test.each([
  'Build a workout with a Bulgarian bag spin, 3 sets of 10, full gym.',
  'Create a workout with the imaginary moon hopper exercise, full gym.',
])('does not silently replace named movements: %s', request => {
  expect(planWorkout(request).kind).toBe('clarification')
})

test.each([
  ['Create 3 chest exercises with 2 sets of 8, rest for one minute, full gym.', 2, 8, 60],
  ['Create 3 chest exercises, 3x8 each, full gym.', 3, 8, 60],
  ['Create 3 chest exercises with 2 sets of 8-12 reps and 90 seconds rest, full gym.', 2, 10, 90],
])('preserves prescriptions and enforces review edits: %s', (request, sets, reps, rest) => {
  const response = draft(request)
  expect(response.workout.exercises.every(e => e.sets.length === sets && e.sets.every(s => s.repetitions === reps) && e.guidance.restSeconds === rest)).toBe(true)
  expect(validateWorkoutReview(request, response)).toEqual([])
  response.workout.exercises[0].sets[0].repetitions = 25
  expect(validateWorkoutReview(request, response)).toEqual(expect.arrayContaining([expect.stringMatching(/repetitions/)]))
})

test.each([
  'Make 3 chest exercises, 2 sets of 8 reps each, then make each exercise 4 sets of 12 reps. Full gym.',
  'Create 3 chest exercises, 2 sets of 8 reps, 30 seconds rest and 3 minutes rest, full gym.',
  'Create 3 chest exercises in no more than 10 minutes and exactly 45 minutes, full gym.',
  'Make chest exercises, 2x8 and 4x12, full gym.',
  'Make chest exercises with no 3 sets, full gym.',
])('clarifies conflicting or unsupported quantities: %s', request => {
  expect(planWorkout(request).kind).toBe('clarification')
})

test('half an hour is a duration and all rest spans are excluded', () => {
  const result = planWorkout('Create 3 chest exercises within half an hour with 3 sets of 8 reps and 2 minutes rest, full gym.')
  expect(result.kind).toBe('plan')
  expect(result.diagnostics.durationMinutes).toBe(30)
})

test('upper-body choices have upper-body primary muscles and dumbbells only requires dumbbells', () => {
  const result = planWorkout('Build an upper body workout using dumbbells only.')
  expect(result.kind).toBe('plan')
  expect(result.plan.slots.flat().every(e => e.equipment === 'DUMBBELL' && e.primaryMuscles.some(m => ['chest', 'shoulders', 'triceps', 'biceps', 'forearms', 'lats', 'middle back', 'traps'].includes(m)))).toBe(true)
})

test.each(['0 sets of 8', '-1 sets of 8', '2 sets of 0', '2 sets of -1', '0 minutes'])('rejects invalid quantity %s', quantity => {
  expect(planWorkout(`Create chest exercises with ${quantity}, full gym.`).kind).not.toBe('plan')
})
