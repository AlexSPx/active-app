const { runConstrainedCoachTurn, applyWorkoutFollowUp } = require('../../features/coach/constrainedTurn')
const { coachResponseSchema } = require('../../features/coach/contracts')
const { validateWorkoutReview } = require('../../features/coach/workoutPlanner')
const { exerciseCatalog } = require('../../lib/exercises/catalog')

function harness(mode = 'valid', intent = 'create_workout') {
  const prompts = []
  let calls = 0
  const session = {
    appendUserMessage: async prompt => prompts.push(prompt),
    generate: async ({ finalResponseSchema: schema }) => {
      if (calls++ === 0) return { kind: 'final', content: { intent } }
      if (mode === 'timeout') throw new Error('Model timed out')
      const sessions = Object.fromEntries(Object.entries(schema.properties.sessions.properties).map(([day, daySchema]) => {
        const slots = daySchema.properties.selections.properties
        return [day, { selections: Object.fromEntries(Object.entries(slots).map(([key, slot]) => [key, slot.enum ? slot.enum[0] : slot.const])) }]
      }))
      return { kind: 'final', content: { sessions: mode === 'short' ? { day_1: sessions.day_1 } : mode === 'alllegs' ? Object.fromEntries(Object.keys(sessions).map(day => [day, sessions.day_3])) : sessions } }
    },
  }
  return { prompts, run: message => runConstrainedCoachTurn({ message, session, readHistory: async () => { throw Error('Unexpected history read') }, signal: new AbortController().signal, isCurrentProfile: () => true, maxOutputTokens: 1024 }) }
}

test.each(['Create a 3 day workout', 'Create a 3-day workout', 'Create a three-day workout', 'I want three days per week', 'Train 3 times/week'])('%s creates three sessions and keeps exercise count separate', async request => {
  const h = harness()
  const result = await h.run(`${request}, full gym, 4 exercises, 2 sets and 8 reps per session`)
  expect(result.response.kind).toBe('routine_draft')
  expect(coachResponseSchema.safeParse(result.response).success).toBe(true)
  expect(result.response.workouts).toHaveLength(3)
  expect(result.response.routine.workoutRefs).toEqual(result.response.workouts.map(workout => workout.ref))
  for (const workout of result.response.workouts) {
    expect(workout.exercises).toHaveLength(4)
    expect(workout.exercises.every(exercise => exercise.sets.length === 2 && exercise.sets.every(set => set.repetitions === 8))).toBe(true)
    expect(workout.exercises.some(exercise => exerciseCatalog.find(entry => entry.id === exercise.catalogId).equipment !== 'BODY_ONLY')).toBe(true)
  }
  expect(h.prompts[1]).toContain('Plan 3 training session(s)')
  expect(result.response.assumptions.join(' ')).not.toMatch(/catalog template/i)
  expect(validateWorkoutReview(`${request}, full gym, 4 exercises, 2 sets and 8 reps per session`, result.response)).toEqual([])
})

test('equipment clarification and repeated follow-ups retain the three-day request', async () => {
  const original = 'Create a 3 day workout'
  const first = await harness().run(original)
  expect(first.response.kind).toBe('clarification')
  expect(first.response.question).toMatch(/equipment/i)
  const followUp = applyWorkoutFollowUp('Which equipment do you mean?', [
    { kind: 'user', text: original }, { kind: 'response', response: first.response, request: original },
  ])
  const resolved = applyWorkoutFollowUp('Full gym', [
    { kind: 'user', text: 'Which equipment do you mean?' },
    { kind: 'response', response: { kind: 'clarification' }, request: followUp },
  ])
  expect(resolved).toContain(original)
  const result = await harness().run(resolved)
  expect(result.response.kind).toBe('routine_draft')
  expect(result.response.workouts).toHaveLength(3)
})

test.each(['short', 'timeout'])('a %s model response cannot collapse a routine to one day', async mode => {
  const h = harness(mode)
  const result = await h.run('Create a 3-day bodyweight workout')
  expect(result.response.kind).toBe('routine_draft')
  expect(result.response.workouts).toHaveLength(3)
  expect(coachResponseSchema.safeParse(result.response).success).toBe(true)
  expect(result.response.assumptions.join(' ')).toMatch(/each training day repeats the catalog template/i)
})

test('structured gym equipment is recognized and metadata day counts do not change the schedule', async () => {
  const result = await harness().run('Create a 3-day workout\nUser-supplied context: ' + JSON.stringify({ equipment: ['full gym'], profile: { limitations: [], trainingAge: 'beginner', notes: '2 days' } }))
  expect(result.response.kind).toBe('routine_draft')
  expect(result.response.workouts).toHaveLength(3)
})

test('a gym routine without an exercise count defaults to six exercises across all three sessions', async () => {
  const { response } = await harness().run('Create a 3-day workout with a full gym')
  expect(response.kind).toBe('routine_draft')
  expect(response.workouts).toHaveLength(3)
  expect(response.workouts.map(workout => workout.exercises.length)).toEqual([6, 6, 6])
  expect(response.workouts.every(workout => workout.exercises.some(exercise => exerciseCatalog.find(entry => entry.id === exercise.catalogId).equipment !== 'BODY_ONLY'))).toBe(true)
  expect(response.assumptions).toContain('Full gym is treated as including a bench and pairs of dumbbells.')
})

test('review rejects removing a requested training session', async () => {
  const request = 'Create a 3-day workout, full gym'
  const { response } = await harness().run(request)
  const edited = { ...response, workouts: response.workouts.slice(0, 2), routine: { ...response.routine, workoutRefs: response.routine.workoutRefs.slice(0, 2) } }
  expect(validateWorkoutReview(request, edited)).toContain('The routine must contain 3 workout sessions.')
  expect(validateWorkoutReview(request, { version: 1, kind: 'workout_draft', workout: response.workouts[0], assumptions: [] })).toContain('The routine must contain 3 workout sessions.')
})

const pplRequest = 'Give me a 3 day plan, Push Pull Legs.\nUser-supplied context: ' + JSON.stringify({ profile: { units: 'kg' }, equipment: ['a full gym'] })
const focusMuscles = [
  ['chest', 'shoulders', 'triceps'],
  ['lats', 'middle back', 'traps', 'biceps'],
  ['quadriceps', 'hamstrings', 'glutes', 'calves'],
]

test.each(['valid', 'alllegs', 'timeout'])('PPL keeps each day in its own muscle groups with %s model output', async mode => {
  const h = harness(mode)
  const { response } = await h.run(pplRequest)
  expect(response.kind).toBe('routine_draft')
  expect(coachResponseSchema.safeParse(response).success).toBe(true)
  expect(response.workouts.map(workout => workout.title)).toEqual(['Day 1 — Push', 'Day 2 — Pull', 'Day 3 — Legs'])
  response.workouts.forEach((workout, index) => {
    const entries = workout.exercises.map(exercise => exerciseCatalog.find(entry => entry.id === exercise.catalogId))
    expect(entries).toHaveLength(6)
    expect(entries.every(entry => entry.primaryMuscles.some(muscle => focusMuscles[index].includes(muscle.toLowerCase())))).toBe(true)
  })
  expect(validateWorkoutReview(pplRequest, response)).toEqual([])
  expect(response.assumptions.some(value => value.includes('focus-specific catalog template'))).toBe(mode !== 'valid')
  expect(response.assumptions.join(' ')).not.toMatch(/same requested muscle targets|repeats the catalog template/)
})

test('PPL review rejects leg-only substitutions and reordered training days', async () => {
  const { response } = await harness().run(pplRequest)
  const replaced = { ...response, workouts: response.workouts.map(workout => ({ ...workout, exercises: response.workouts[2].exercises })) }
  expect(validateWorkoutReview(pplRequest, replaced).length).toBeGreaterThan(0)
  const reordered = { ...response, routine: { ...response.routine, workoutRefs: [...response.routine.workoutRefs].reverse() } }
  expect(validateWorkoutReview(pplRequest, reordered).length).toBeGreaterThan(0)
})

test('six-day PPL repeats the push/pull/legs cycle while preserving per-session prescriptions', async () => {
  const request = 'Create a 6-day PPL routine, full gym, 2 exercises, 2 sets and 8 reps'
  const { response } = await harness().run(request)
  expect(response.kind).toBe('routine_draft')
  expect(response.workouts).toHaveLength(6)
  expect(response.workouts.map(workout => workout.title.replace(' — partial workout', ''))).toEqual(['Day 1 — Push', 'Day 2 — Pull', 'Day 3 — Legs', 'Day 4 — Push', 'Day 5 — Pull', 'Day 6 — Legs'])
  expect(response.assumptions.join(' ')).toMatch(/PARTIAL WORKOUT.*3 muscle groups.*2 exercises/)
  expect(response.workouts.every(workout => workout.exercises.length === 2 && workout.exercises.every(exercise => exercise.sets.length === 2 && exercise.sets.every(set => set.repetitions === 8)))).toBe(true)
})

test.each(['valid', 'timeout'])('six exercises per PPL session remain six with %s model output', async mode => {
  const h = harness(mode)
  const request = 'Give me a 3-day Push Pull Legs routine with 6 exercises per session, 3 sets each, using a full gym.\nUser-supplied context: ' + JSON.stringify({ profile: { units: 'kg' }, equipment: ['a full gym'] })
  const { response } = await h.run(request)
  expect(response.kind).toBe('routine_draft')
  expect(coachResponseSchema.safeParse(response).success).toBe(true)
  response.workouts.forEach((workout, index) => {
    expect(workout.exercises).toHaveLength(6)
    expect(new Set(workout.exercises.map(exercise => exercise.catalogId)).size).toBe(6)
    expect(workout.exercises.every(exercise => exercise.sets.length === 3)).toBe(true)
    expect(workout.exercises.every(exercise => exerciseCatalog.find(entry => entry.id === exercise.catalogId).primaryMuscles.some(muscle => focusMuscles[index].includes(muscle.toLowerCase())))).toBe(true)
  })
  expect(response.assumptions.join(' ')).not.toMatch(/PARTIAL WORKOUT|Requested 6 exercises; found 3/)
  expect(validateWorkoutReview(request, response)).toEqual([])
})

test('the reported PPL request survives malformed intent output and produces a validated routine', async () => {
  let calls = 0
  const session = {
    appendUserMessage: async () => {},
    generate: async ({ finalResponseSchema: schema }) => {
      if (calls++ < 2) return { kind: 'invalid_final' }
      const sessions = Object.fromEntries(Object.entries(schema.properties.sessions.properties).map(([day, daySchema]) => [day, { selections: Object.fromEntries(Object.entries(daySchema.properties.selections.properties).map(([key, slot]) => [key, slot.enum ? slot.enum[0] : slot.const])) }]))
      return { kind: 'final', content: { sessions } }
    },
  }
  const message = 'Build me a 3 days Push Pull Legs routine for a full gym with like 5-6 exercises each'
  const result = await runConstrainedCoachTurn({ message, session, readHistory: async () => { throw Error('unexpected read') }, signal: new AbortController().signal, isCurrentProfile: () => true, maxOutputTokens: 1024 })
  expect(result.response.kind).toBe('routine_draft')
  expect(coachResponseSchema.safeParse(result.response).success).toBe(true)
  expect(result.response.workouts).toHaveLength(3)
  expect(result.response.workouts.every(workout => workout.exercises.length >= 5 && workout.exercises.length <= 6)).toBe(true)
  expect(validateWorkoutReview(message, result.response)).toEqual([])
})

test('the reported simple request asks for equipment after malformed classification', async () => {
  const session = { appendUserMessage: async () => {}, generate: async () => ({ kind: 'final', content: {} }) }
  const result = await runConstrainedCoachTurn({ message: 'Build me a workout', session, readHistory: async () => {}, signal: new AbortController().signal, isCurrentProfile: () => true, maxOutputTokens: 1024 })
  expect(result.response.kind).toBe('clarification')
  expect(result.response.question).toMatch(/equipment/i)
})

test.each(['valid', 'timeout'])('two dumbbells stays dumbbells-only through the %s selection path', async mode => {
  const h = harness(mode)
  const request = 'Plan a leg workout using only dumbbells, 4 exercises, 3 sets of 10 reps each'
  const first = await h.run(request)
  expect(first.response).toMatchObject({ kind: 'clarification', question: expect.stringMatching(/one dumbbell or two dumbbells/) })
  const followUp = applyWorkoutFollowUp('Two', [{ kind: 'user', text: request }, { kind: 'response', request, response: first.response }])
  for (const message of [followUp, request.replace('only dumbbells', 'only two dumbbells')]) {
    const { response } = await harness(mode).run(message)
    expect(response.kind).toBe('workout_draft')
    expect(response.assumptions.some(text => text.startsWith('Model selection was unavailable'))).toBe(mode === 'timeout')
    expect(response.workout.exercises.map(item => exerciseCatalog.find(entry => entry.id === item.catalogId).equipment)).toEqual(Array(4).fill('DUMBBELL'))
    expect(validateWorkoutReview(message, response)).toEqual([])
  }
  const { response } = await harness(mode).run(request.replace('only dumbbells', 'only one dumbbell'))
  expect(response.workout).toMatchObject({ title: 'Partial workout', exercises: [expect.objectContaining({ catalogId: 'local:exercise:Plie_Dumbbell_Squat' })] })
})

test.each(['valid', 'timeout'])('single push and timed workouts honor the request through the %s path', async mode => {
  const push = await harness(mode).run('Create a push workout with 4 exercises and 3 sets, bodyweight only')
  expect(push.response.kind).toBe('workout_draft')
  expect(push.response.workout.exercises.map(item => exerciseCatalog.find(entry => entry.id === item.catalogId).primaryMuscles)).toEqual(Array(4).fill(['chest']))
  const request = 'Create a HIIT workout with 30s on and 20s off, bodyweight only, 2 exercises, 3 sets'
  const timed = await harness(mode).run(request)
  expect(timed.response.assumptions.some(text => text.startsWith('Model selection was unavailable'))).toBe(mode === 'timeout')
  expect(timed.response.workout.schedule).toEqual({ estimatedSeconds: 290, transitionSeconds: 30 })
  for (const exercise of timed.response.workout.exercises) {
    expect(exercise.sets).toEqual(Array(3).fill({ kind: 'timed', durationSeconds: 30 }))
    expect(exercise.guidance.restSeconds).toBe(20)
  }
  expect(validateWorkoutReview(request, timed.response)).toEqual([])
  const edited = structuredClone(timed.response)
  edited.workout.exercises[0].sets[0].durationSeconds = 45
  expect(validateWorkoutReview(request, edited)).toContain('Each interval must keep the requested 30 seconds of work.')
})

test('requested routine variation survives repeated model picks through the catalog fallback', async () => {
  const request = 'Create a 3-day bodyweight routine with different workouts, 3 exercises per day'
  const { response } = await harness().run(request)
  expect(response.kind).toBe('routine_draft')
  expect(response.assumptions).toContain('Model selection was unavailable; this draft uses validated catalog choices.')
  const signatures = response.workouts.map(workout => workout.exercises.map(item => item.catalogId).sort().join(','))
  expect(new Set(signatures).size).toBe(3)
  expect(validateWorkoutReview(request, response)).toEqual([])
})

test.each([
  ['Build a weekly routine: rest days are Monday and Tuesday; train Thursday, bodyweight only', [3]],
  ['I want to train on Tuesdays and Thursdays, bodyweight only', [1, 3]],
])('preserves the stated training days for %s', async (request, expectedDays) => {
  const { response } = await harness('valid', 'coach_qa').run(request)
  expect(response).toMatchObject({
    kind: 'routine_draft',
    routine: { type: 'SEQUENTIAL', startsOnMonday: true },
  })
  expect(response.routine.days.flatMap((day, index) => day.kind === 'workout' ? [index] : [])).toEqual(expectedDays)
  expect(validateWorkoutReview(request, response)).toEqual([])
})
