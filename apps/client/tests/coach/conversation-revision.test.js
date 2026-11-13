const { runConstrainedCoachTurn, applyWorkoutFollowUp } = require('../../features/coach/constrainedTurn')
const { validateWorkoutReview } = require('../../features/coach/workoutPlanner')

async function run(message) {
  let calls = 0
  return runConstrainedCoachTurn({ message, session: { appendUserMessage: async () => {}, generate: async () => {
    if (calls++ === 0) return { kind: 'final', content: { intent: 'create_workout' } }
    throw Error('Use validated template')
  } }, execute: async () => { throw Error('Unexpected tool') }, signal: new AbortController().signal, isCurrentProfile: () => true, maxOutputTokens: 500 })
}
async function next(prior, message) {
  const request = applyWorkoutFollowUp(message, JSON.parse(JSON.stringify(prior)))
  const result = await run(request)
  prior.push({ kind: 'user', text: message }, { kind: 'response', response: result.response, request })
  return { request, response: result.response }
}

test.each(['3 sets of 8', '3x8'])('persisted conversation revises %s without losing constraints', async prescription => {
  const prior = []
  const first = await next(prior, `Create a chest workout with 3 exercises, ${prescription}, 90 seconds rest, full gym.`)
  expect(first.response.kind).toBe('workout_draft')
  const revised = await next(prior, 'Make it 2 sets instead')
  expect(revised.response.kind).toBe('workout_draft')
  expect(revised.response.workout.exercises).toHaveLength(3)
  expect(revised.response.workout.exercises.every(e => e.sets.length === 2 && e.sets.every(s => s.repetitions === 8) && e.guidance.restSeconds === 90)).toBe(true)
  expect(validateWorkoutReview(revised.request, revised.response)).toEqual([])
  const changed = structuredClone(revised.response)
  changed.workout.exercises[0].sets.pop()
  expect(validateWorkoutReview(revised.request, changed).length).toBeGreaterThan(0)
})

test('clarification then edits preserve the original and review constraints', async () => {
  const prior = []
  expect((await next(prior, 'Create a chest workout with 3 exercises, 3x8 and 90 seconds rest.')).response.kind).toBe('clarification')
  expect((await next(prior, 'Full gym')).response.kind).toBe('workout_draft')
  const reps = await next(prior, 'Make it 12 reps instead')
  expect(reps.response.kind).toBe('workout_draft')
  expect(reps.response.workout.exercises.every(e => e.sets.length === 3 && e.sets.every(s => s.repetitions === 12) && e.guidance.restSeconds === 90)).toBe(true)
  const rest = await next(prior, 'Change rest to 60 seconds')
  expect(rest.response.kind).toBe('workout_draft')
  expect(rest.response.workout.exercises.every(e => e.guidance.restSeconds === 60 && e.sets.every(s => s.repetitions === 12))).toBe(true)
  expect(validateWorkoutReview(rest.request, rest.response)).toEqual([])
  const equipment = await next(prior, 'Switch to dumbbells only')
  expect(equipment.response.kind).toBe('clarification')
  expect(equipment.response.question).toMatch(/equipment.*new workout/i)
  const after = await next(prior, 'Make it 2 sets instead')
  expect(after.response.kind).toBe('workout_draft')
  expect(after.response.workout.exercises.every(e => e.sets.length === 2 && e.sets.every(s => s.repetitions === 12) && e.guidance.restSeconds === 60)).toBe(true)
  expect(validateWorkoutReview(after.request, after.response)).toEqual([])
  expect(applyWorkoutFollowUp('Make a new leg workout', prior)).toBe('Make a new leg workout')
  expect(applyWorkoutFollowUp('What is a warmup?', prior)).toBe('What is a warmup?')
})

test('time edit with a rest asks instead of silently dropping either constraint', async () => {
  const prior = []
  await next(prior, 'Create a chest workout with 3 exercises, 3 sets of 8, 90 seconds rest, full gym.')
  const result = await next(prior, 'Make it 20 minutes instead')
  expect(result.response.kind).toBe('clarification')
  expect(result.request).toMatch(/90 seconds rest/)
})

test('exercise count and uncomplicated duration revisions retain the other prescription', async () => {
  const prior = []
  await next(prior, 'Create a chest workout with 3 exercises, 2 sets of 8, full gym.')
  const count = await next(prior, 'Make it 2 exercises instead')
  expect(count.response.kind).toBe('workout_draft')
  expect(count.response.workout.exercises).toHaveLength(2)
  expect(validateWorkoutReview(count.request, count.response)).toEqual([])
  const time = await next(prior, 'Make it 30 minutes instead')
  expect(time.response.kind).toBe('workout_draft')
  expect(time.request).toMatch(/30 minutes/)
  expect(time.response.workout.exercises.every(e => e.sets.length === 2 && e.sets.every(s => s.repetitions === 8))).toBe(true)
  expect(validateWorkoutReview(time.request, time.response)).toEqual([])
})

test('a quoted unknown exercise clarification resolves to a reviewed catalog identity', async () => {
  const prior = []
  const first = await next(prior, 'Create a workout with imaginary exercise, full gym, 2 sets of 8.')
  expect(first.response.kind).toBe('clarification')
  expect(first.response.question).toMatch(/imaginary/i)
  const entry = require('../../lib/exercises/catalog').exerciseCatalog.find(e => e.id === 'local:exercise:Push-Up_Wide')
  expect(entry.setupReviewStatus).toBe('reviewed')
  const resolved = await next(prior, entry.name)
  expect(resolved.request).not.toMatch(/imaginary/i)
  expect(resolved.response.kind).toBe('workout_draft')
  expect(resolved.response.workout.exercises.map(e => e.catalogId)).toContain(entry.id)
  expect(validateWorkoutReview(resolved.request, resolved.response)).toEqual([])
})

test.each([
  'Create a full gym workout: Pushups and imaginary moon hopper.',
  'Create exactly 3 chest exercises and exactly 5 exercises, full gym.',
])('public turn returns clarification instead of a draft: %s', async message => {
  const result = await run(message)
  expect(result.response.kind).toBe('clarification')
})

test.each(['Replace imaginary moon hopper with Dumbbell Bench Press', 'Swap imaginary moon hopper for Dumbbell Bench Press'])('clarification accepts explicit replacement: %s', async answer => {
  const prior = []
  expect((await next(prior, 'Create a full gym workout: Pushups and imaginary moon hopper.')).response.kind).toBe('clarification')
  const result = await next(prior, answer)
  expect(result.response.kind).toBe('workout_draft')
  expect(result.response.workout.exercises.map(e => e.catalogId)).toEqual(expect.arrayContaining(require('../../lib/exercises/catalog').exerciseCatalog.filter(e => ['Pushups', 'Dumbbell Bench Press'].includes(e.name)).map(e => e.id)))
  expect(validateWorkoutReview(result.request, result.response)).toEqual([])
})

test.each(['Make it exactly 3 chest exercises', 'Create exactly 3 chest exercises, full gym.'])('clarification resolves conflicting counts: %s', async answer => {
  const prior = []
  expect((await next(prior, 'Create exactly 3 chest exercises and exactly 5 exercises, full gym.')).response.kind).toBe('clarification')
  const result = await next(prior, answer)
  expect(result.response.kind).toBe('workout_draft')
  expect(result.response.workout.exercises).toHaveLength(3)
  expect(result.request).toMatch(/full gym/i)
  expect(validateWorkoutReview(result.request, result.response)).toEqual([])
})

test('ambiguous replacements continue clarifying without dropping unknown names', async () => {
  const prior = []
  await next(prior, 'Create a full gym workout: Pushups, imaginary moon hopper, and imaginary star hopper.')
  const wrong = await next(prior, 'Replace something with Dumbbell Bench Press')
  expect(wrong.response.kind).toBe('clarification')
  const correct = await next(prior, 'Replace imaginary moon hopper with Dumbbell Bench Press')
  expect(correct.response.kind).toBe('clarification')
  expect(correct.response.question).toMatch(/imaginary star hopper/i)
})

test('repeated ambiguous correction does not substitute either unknown exercise', async () => {
  const prior = []
  await next(prior, 'Create a full gym workout: Pushups, imaginary moon hopper, and imaginary star hopper.')
  for (const answer of ['Replace something with Dumbbell Bench Press', 'Replace something with Dumbbell Bench Press']) {
    expect((await next(prior, answer)).response.kind).toBe('clarification')
  }
  const moon = await next(prior, 'Replace imaginary moon hopper with Dumbbell Bench Press')
  expect(moon.response.kind).toBe('clarification')
  expect(moon.response.question).toMatch(/imaginary star hopper/i)
  const star = await next(prior, 'Swap imaginary star hopper for Bodyweight Squat')
  expect(star.response.kind).toBe('workout_draft')
  expect(validateWorkoutReview(star.request, star.response)).toEqual([])
})
