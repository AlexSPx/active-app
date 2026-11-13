const { planWorkout, defaultSelection, renderWorkout, validateSelection, validateWorkoutReview } = require('../../features/coach/workoutPlanner')

function planned(request) {
  const result = planWorkout(request)
  expect(result.kind).toBe('plan')
  return result.plan
}

test('only a precise catalog name is mandatory through selection and review', () => {
  const request = 'Make a workout with only Pushups, 3 sets of 10 reps, bodyweight only.'
  const plan = planned(request)
  expect(plan.slots).toHaveLength(1)
  expect(plan.slots[0].map(e => e.name)).toEqual(['Pushups'])
  const draft = renderWorkout(plan, defaultSelection(plan))
  expect(validateWorkoutReview(request, draft)).toEqual([])
  expect(validateSelection(plan, { selections: ['Push-Up Wide'] }).errors.length).toBeGreaterThan(0)
  draft.workout.exercises = []
  expect(validateWorkoutReview(request, draft).join(' ')).toMatch(/required exercise Pushups is missing/)
})

test('an included movement stays mandatory among other selections', () => {
  const request = 'Create 3 exercises, include Pushups, bodyweight only.'
  const plan = planned(request)
  expect(plan.slots[0].map(e => e.name)).toEqual(['Pushups'])
  expect(plan.slots).toHaveLength(3)
  const alternate = plan.slots.map(slot => slot[slot.length - 1].name)
  expect(validateSelection(plan, { selections: alternate }).errors).toEqual([])
  expect(validateWorkoutReview(request, renderWorkout(plan, alternate))).toEqual([])
})

test.each([
  'Build a workout with a Bulgarian bag spin, 3 sets of 10, full gym.',
  'Create a workout with the imaginary moon hopper exercise, full gym.',
  'Make a workout with only Pushup Widee, bodyweight only.',
  'Create 2 exercises, with only Pushups, bodyweight only.',
])('clarifies unresolved names or count: %s', request => {
  expect(planWorkout(request).kind).toBe('clarification')
})

test('a concrete replacement can resolve the identity clarification', () => {
  expect(planned('Make a workout with only Pushups, bodyweight only.').slots[0][0].name).toBe('Pushups')
})

test('a precise two-name list keeps both identities', () => {
  const request = 'Create a full gym workout with exactly Dumbbell Bench Press and Pushups, 2 sets of 8.'
  const plan = planned(request)
  expect(plan.slots.map(slot => slot[0].name)).toEqual(['Dumbbell Bench Press', 'Pushups'])
  expect(validateWorkoutReview(request, renderWorkout(plan, defaultSelection(plan)))).toEqual([])
})

test('an imprecise barbell bench press asks for a concrete catalog choice', () => {
  const result = planWorkout('Create a full gym workout with exactly barbell bench press and dumbbell row, 3 sets of 10 each.')
  expect(result.kind).toBe('clarification')
  expect(result.question).toMatch(/Barbell Bench Press/i)
})

test('a named exercise with unavailable equipment explains the mismatch', () => {
  const result = planWorkout('Make a workout with only Dumbbell Bench Press, bodyweight only.')
  expect(result.kind).toBe('clarification')
  expect(result.question).toMatch(/equipment.*dumbbell/i)
})

test.each([
  'Create a full gym workout featuring Bulgarian bag spin.',
  'Create a full gym workout. I want Pushups and Bulgarian bag spin.',
  'Create a full gym workout, consisting of Pushups and imaginary moon hopper.',
])('does not substitute an unknown named movement: %s', request => {
  expect(planWorkout(request).kind).toBe('clarification')
})

test('a named movement does not supply its own equipment', () => {
  const result = planWorkout('Create a workout with only Dumbbell Bench Press.')
  expect(result.kind).toBe('clarification')
  expect(result.diagnostics.equipment).toEqual([])
})

test('only dumbbells restricts a full gym inventory', () => {
  const plan = planned('Create a workout using only dumbbells, full gym.')
  expect(plan.slots.flat().every(exercise => exercise.equipment === 'DUMBBELL')).toBe(true)
})

test('word prescriptions and preparation survive review', () => {
  const request = 'Create a workout with two sets of eight reps, no rest, 30 minute warm-up, full gym.'
  const plan = planned(request)
  expect([plan.sets, plan.reps, plan.restSeconds, plan.preparation[0].durationSeconds]).toEqual([2, 8, 0, 1800])
  const draft = renderWorkout(plan, defaultSelection(plan))
  expect(validateWorkoutReview(request, draft)).toEqual([])
  draft.workout.preparation[0].durationSeconds = 300
  expect(validateWorkoutReview(request, draft)).not.toEqual([])
})

test.each(['rest 30-60 seconds', 'rest for 1 minute 30 seconds', 'rest for 90 milliseconds'])('clarifies unsupported rest: %s', rest => {
  expect(planWorkout(`Create a workout with 2 sets of 8 reps, ${rest}, full gym.`).kind).toBe('clarification')
})

test.each(['a focus on strength', 'a goal of improving fitness', 'a 5 minute warm-up'])('ordinary prose is not a name: %s', phrase => {
  expect(planWorkout(`Create a workout with ${phrase}, full gym.`).kind).toBe('plan')
})

test('review enforces minimum and permits a smaller maximum', () => {
  for (const [qualifier, rejected] of [['exactly', true], ['at least', true], ['at most', false]]) {
    const request = `Create ${qualifier} 3 chest exercises, 2 sets of 8, full gym.`
    const plan = planned(request)
    const draft = renderWorkout(plan, defaultSelection(plan))
    draft.workout.exercises.pop()
    expect(validateWorkoutReview(request, draft).length > 0).toBe(rejected)
  }
})

test.each(['three', '3–4'])('edited review retains the requested count %s', count => {
  const request = `Create ${count} chest exercises, 2 sets of 8, full gym.`
  const plan = planned(request)
  const draft = renderWorkout(plan, defaultSelection(plan))
  expect(validateWorkoutReview(request, draft)).toEqual([])
  while (draft.workout.exercises.length >= 3) draft.workout.exercises.pop()
  expect(validateWorkoutReview(request, draft)).toContain('The edited workout must keep the requested exercise count.')
})

test.each([
  'Create a full gym workout: Pushups and imaginary moon hopper.',
  'Create a full gym workout including Pushups, imaginary moon hopper, and Dumbbell Curl.',
  'Create a full gym workout including Pushups; imaginary moon hopper.',
])('clarifies every item in an explicit list: %s', request => {
  expect(planWorkout(request).kind).toBe('clarification')
})

test('colon list preserves known identities', () => {
  const plan = planned('Create a full gym workout: Pushups and Dumbbell Bench Press.')
  expect(plan.slots.slice(0, 2).map(slot => slot[0].name)).toEqual(['Pushups', 'Dumbbell Bench Press'])
})

test.each([
  'Create exactly 3 chest exercises and exactly 5 exercises, full gym.',
  'Create at least five exercises and at most three exercises, full gym.',
])('clarifies incompatible or differently scoped counts: %s', request => {
  expect(planWorkout(request).kind).toBe('clarification')
})

test('intersects compatible count constraints for planning and review', () => {
  const request = 'Create at least three exercises and at most four exercises, full gym.'
  const plan = planned(request)
  const draft = renderWorkout(plan, defaultSelection(plan))
  expect(draft.workout.exercises).toHaveLength(4)
  expect(validateWorkoutReview(request, draft)).toEqual([])
  draft.workout.exercises.splice(2)
  expect(validateWorkoutReview(request, draft).join(' ')).toMatch(/requested exercise count/)
})

test('a scoped count after with exactly is not an exercise name', () => {
  expect(planWorkout('Create a new workout with exactly 3 chest exercises, full gym.').kind).toBe('plan')
})
