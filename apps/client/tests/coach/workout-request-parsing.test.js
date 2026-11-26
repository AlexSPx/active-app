const { planWorkout, renderWorkout, defaultSelection, validateWorkoutReview } = require('../../features/coach/workoutPlanner')

function plan(request) {
  const result = planWorkout(request)
  expect(result.kind).toBe('plan')
  return result.plan
}

test('a duration followed by an activity is not a work interval', () => {
  // "22 minutes on my lunch break" previously matched the on/off interval pattern and
  // forced a conflicting-prescription clarification.
  const message = 'I know my way around the gym but only have 22 minutes on my lunch break. Plan a whole-body workout with exactly 5 exercises using selectorized machines only. Give me 2 sets of 10 reps per exercise with 60 seconds between sets.'
  const result = planWorkout(message)
  expect(result.kind).not.toBe('clarification')
})

test('a role mention of one exercise does not change the exercise total', () => {
  const message = "I'm new to lifting and have one pair of dumbbells at home. Give me a full-body workout using only dumbbells for exactly 4 exercises, 2 sets of 8 reps each, in 20 minutes. I'd like one exercise to be a goblet squat."
  const p = plan(message)
  expect(p.countRange).toEqual({ min: 4, max: 4 })
  expect(p.slots).toHaveLength(4)
  expect(p.prescription.sets).toBe(2)
  // The cataloged goblet squat is a kettlebell movement; the dumbbell draft is delivered
  // with an honest note rather than a blocking clarification.
  expect(p.mandatoryIds).toEqual([])
  expect(p.assumptions.some(assumption => /goblet squat.*left out/i.test(assumption))).toBe(true)
  const response = renderWorkout(p, defaultSelection(p))
  expect(response.workout.exercises).toHaveLength(4)
  expect(response.workout.exercises.every(exercise => exercise.sets.length === 2 && exercise.sets.every(set => set.repetitions === 8))).toBe(true)
  expect(response.workout.exercises.every(exercise => exercise.catalogId.startsWith('local:exercise:'))).toBe(true)
})

test('a quantity clause naming an implement is not an exercise list', () => {
  const message = 'Can you make me a 15-minute whole-body workout with exactly 3 resistance-band exercises? I have a long loop band and nowhere to anchor it, and I need to stay standing the whole time. Use only the band, with 2 sets of 10 per exercise.'
  const p = plan(message)
  expect(p.countRange).toEqual({ min: 3, max: 3 })
  expect(p.slots).toHaveLength(3)
  expect(p.slots.every(slot => slot.every(exercise => exercise.equipment === 'BANDS'))).toBe(true)
  expect(p.prescription).toMatchObject({ sets: 2, reps: { min: 10, max: 10 }, duration: 15 })
})

test('an inventory clause is not an exercise list, and a later named movement is found', () => {
  const message = "I'm an intermediate lifter and have 25 minutes with a barbell and rack. Write a whole-body session with exactly 4 barbell exercises and include a Romanian deadlift. I want 2 working sets of 6 reps per movement with 90 seconds between sets."
  const p = plan(message)
  expect(p.countRange).toEqual({ min: 4, max: 4 })
  expect(p.mandatoryIds).toContain('local:exercise:Romanian_Deadlift')
  expect(p.slots).toHaveLength(4)
  expect(p.restSeconds).toBe(90)
})

test('bodyweight movement counts and quiet-floor exclusions produce a draft', () => {
  const message = 'I have 18 minutes in a hotel room and no equipment. Give me a whole-body workout with exactly 5 bodyweight movements, 2 sets of 6 reps per movement. The room has people downstairs, so skip jumps and anything else that would thump on the floor.'
  const p = plan(message)
  expect(p.countRange).toEqual({ min: 5, max: 5 })
  expect(p.slots).toHaveLength(5)
  const names = p.slots.map(slot => slot[0].name).join(' ')
  expect(names).not.toMatch(/jump|hop|burpee|mountain climber|jumping jack/i)
})

test('a returning kettlebell user gets four reviewed movements without swings', () => {
  const message = "I'm getting back to training after taking a couple months off. I have one light kettlebell and 20 minutes for a whole-body workout. Give me exactly 4 exercises using only the kettlebell, with 2 sets of 8 reps each. Keep the reps controlled and leave out swings."
  const p = plan(message)
  expect(p.countRange).toEqual({ min: 4, max: 4 })
  expect(p.slots).toHaveLength(4)
  expect(p.slots.map(slot => slot[0].name).join(' ')).not.toMatch(/swing/i)
  expect(p.slots.every(slot => slot.every(exercise => exercise.equipment === 'KETTLEBELLS' && exercise.level === 'BEGINNER'))).toBe(true)
})

test.each([
  ['Give me 4 exercises using only the kettlebells, 2 sets of 8 reps each.', 4],
  ['I have a pair of dumbbells; use only dumbbells for exactly 5 exercises, 3 sets of 10 reps.', 5],
  ['I want exactly 6 barbell movements, 2 sets of 5 reps each.', 6],
  ['Draft 3 band exercises at 2 sets of 12 reps, use only bands.', 3],
])('count phrasing "%s" plans %i exercises', (clause, expected) => {
  const p = plan(`Make me a full-body workout. ${clause}`)
  expect(p.countRange.max).toBe(expected)
  expect(p.mandatoryIds).toEqual([])
})

test.each([
  ['Make a whole-body HIIT session, exactly 4 exercises, 30 seconds on and 30 seconds off, 2 sets each, bodyweight only.', 30],
  ['Make a whole-body HIIT session, exactly 4 exercises, 30 seconds, then 30 seconds rest, 2 sets each, bodyweight only.', 30],
])('a genuine interval phrasing still parses as timed: %s', (message, interval) => {
  const p = plan(message)
  expect(p.prescription.intervalSeconds).toBe(interval)
})

test('an explicitly requested machine row that the catalog cannot staff asks for a concrete alternative', () => {
  const message = "I know my way around the gym but only have 22 minutes on my lunch break. Plan a whole-body workout with exactly 5 exercises using selectorized machines only. Include the seated row. Give me 2 sets of 10 reps per exercise with 60 seconds between sets."
  const result = planWorkout(message)
  expect(result.kind).toBe('clarification')
  expect(result.question).toMatch(/seated row/i)
})

test('genuine HIIT interval phrasing keeps the timed prescription', () => {
  const p = plan('Create a whole-body HIIT session, 4 exercises, 20 seconds on and 10 seconds off, 3 sets each, bodyweight only.')
  expect(p.prescription.intervalSeconds).toBe(20)
  expect(p.prescription.hiit).toBe(true)
})

test('equipment word inside a named list does not restrict the session equipment', () => {
  // "with only Dumbbell Bench Press" is an exercise list, not an inventory clause.
  const result = planWorkout('Create a workout including Dumbbell Bench Press, 3 sets of 8 reps, full gym.')
  expect(result.kind).toBe('plan')
  expect(result.plan.mandatoryIds).toEqual(['local:exercise:Dumbbell_Bench_Press'])
})
