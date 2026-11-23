const { planWorkout, defaultSelection, renderWorkout, estimateWorkoutSeconds, validateSelection, validateWorkoutReview } = require('../../features/coach/workoutPlanner')
const { runConstrainedCoachTurn } = require('../../features/coach/constrainedTurn')

function draft(request) {
  const result = planWorkout(request)
  expect(result.kind).toBe('plan')
  return { result, response: renderWorkout(result.plan, defaultSelection(result.plan)) }
}

test('a 13-minute cap preserves three movements by reducing default sets', () => {
  const { result, response } = draft('Create 3 chest exercises within 13 minutes, full gym.')
  expect(response.workout.exercises).toHaveLength(3)
  expect(response.workout.exercises.every(exercise => exercise.sets.length === 2)).toBe(true)
  expect(estimateWorkoutSeconds(response.workout)).toBe(780)
  expect(result.plan.partial).toBe(false)
})

test.each([['', 6], [' within 12 minutes', 5]])('a workout with no exercise count%s plans %i movements', (timeLimit, count) => {
  const request = `Create a workout${timeLimit}, full gym.`
  const { result, response } = draft(request)
  expect(response.workout.exercises).toHaveLength(count)
  expect(response.assumptions).toContain(`Planned ${count} exercises.`)
  expect(result.plan.partial).toBe(false)
  expect(validateWorkoutReview(request, response)).toEqual([])
  if (timeLimit) expect(estimateWorkoutSeconds(response.workout)).toBeLessThanOrEqual(720)
})

test.each(['90 seconds rest', 'rest for 90 seconds', '1.5 minutes of rest', 'rest 1.5 minutes'])('preserves %s in planning, rendering and save review', rest => {
  const request = `Create 3 chest exercises, 2 sets of 8 reps, ${rest}, full gym.`
  const { result, response } = draft(request)
  expect(result.plan.durationLimitSeconds).toBeUndefined()
  expect(response.workout.exercises.every(exercise => exercise.guidance.restSeconds === 90 && exercise.sets.every(set => set.repetitions === 8))).toBe(true)
  expect(estimateWorkoutSeconds(response.workout)).toBe(834)
  expect(validateWorkoutReview(request, response)).toEqual([])
  const edited = structuredClone(response)
  edited.workout.exercises[0].guidance.restSeconds = 60
  expect(validateWorkoutReview(request, edited)).toContain('Each exercise must keep the requested 90 seconds rest.')
})

test('explicit sets and rests survive a cap, with an honest movement-count shortfall', () => {
  const request = 'Create 3 chest exercises, 3 sets of 12 reps, 120 seconds rest within 20 minutes, full gym.'
  const { result, response } = draft(request)
  expect(response.workout.exercises).toHaveLength(2)
  expect(response.workout.exercises.every(exercise => exercise.sets.length === 3 && exercise.guidance.restSeconds === 120)).toBe(true)
  expect(estimateWorkoutSeconds(response.workout)).toBeLessThanOrEqual(1200)
  expect(result.plan.partial).toBe(true)
  expect(response.assumptions.join(' ')).toMatch(/PARTIAL WORKOUT.*time limit/)
  expect(validateWorkoutReview(request, response)).toEqual([])
})

test('preparation is included before reducing default sets', () => {
  const { result, response } = draft('Create 3 chest exercises within 15 minutes, full gym, with a warm-up.')
  expect(response.workout.exercises).toHaveLength(3)
  expect(result.plan.sets).toBe(1)
  expect(response.workout.preparation[0].durationSeconds).toBe(300)
  expect(estimateWorkoutSeconds(response.workout)).toBeLessThanOrEqual(900)
})

test('a single explicit prescription that cannot fit is refused', () => {
  expect(planWorkout('Create 1 chest exercise, 5 sets of 30 reps, rest 5 minutes, within 5 minutes, full gym.').kind).toBe('infeasible')
})

test.each(['-30 seconds rest', 'rest -30 seconds', '0.5 seconds rest'])('rejects unsupported rest %s', rest => {
  expect(planWorkout(`Create 3 chest exercises, full gym, ${rest}.`).kind).toBe('infeasible')
})

test('a model alternative that overruns the cap is rejected', () => {
  const { result } = draft('Create 3 chest exercises, 2 sets of 30 reps within 13 minutes, full gym.')
  const choices = result.plan.slots.map(slot => slot.find(exercise => /one.arm/i.test(exercise.name))?.name ?? slot[0].name)
  if (estimateWorkoutSeconds(renderWorkout(result.plan, choices).workout) <= 780) throw Error('Expected an over-budget alternative')
  expect(validateSelection(result.plan, { selections: choices }).errors).toContain('Selected exercises exceed the time limit')
})

test.each(['valid', 'missing', 'extra', 'invented', 'legacy', 'retry'])(
  'single-workout session selections handle %s model output', async mode => {
    let calls = 0
    const prompts = []
    const session = {
      appendUserMessage: async prompt => prompts.push(prompt),
      generate: async ({ finalResponseSchema: schema }) => {
        if (calls++ === 0) return { kind: 'final', content: { intent: 'create_workout' } }
        const slots = schema.properties.sessions.properties.day_1.properties.selections.properties
        const selections = Object.fromEntries(Object.entries(slots).map(([key, slot]) => [key, slot.enum?.[0] ?? slot.const]))
        if (mode === 'missing' || (mode === 'retry' && calls === 2)) delete selections.slot_2
        if (mode === 'extra') selections.slot_4 = 'Invented movement'
        if (mode === 'invented') selections.slot_1 = 'Invented movement'
        if (mode === 'legacy') return { kind: 'final', content: { selections } }
        return { kind: 'final', content: { sessions: { day_1: { selections } } } }
      },
    }
    const result = await runConstrainedCoachTurn({ message: 'Create 3 chest exercises, full gym.', session, readHistory: async () => { throw Error('Unexpected history read') }, signal: new AbortController().signal, isCurrentProfile: () => true, maxOutputTokens: 1024 })
    expect(result.response.kind).toBe('workout_draft')
    expect(result.response.workout.exercises).toHaveLength(3)
    expect(result.response.assumptions.some(value => value.includes('validated catalog template'))).toBe(mode !== 'valid' && mode !== 'retry')
    expect(result.repaired).toBe(mode !== 'valid')
    expect(calls).toBe(mode === 'valid' ? 2 : 3)
    expect(prompts[1]).toMatch(/sessions object.*day_1.*selections object/)
    if (mode !== 'valid') expect(prompts[2]).toContain('Validation errors:')
  }
)
