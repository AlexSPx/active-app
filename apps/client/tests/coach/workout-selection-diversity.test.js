const { planWorkout, defaultSelection, validateSelection, validateWorkoutReview, renderWorkout } = require('../../features/coach/workoutPlanner')

test('flat and incline chest presses may coexist in the same session', () => {
  const result = planWorkout('Create 2 chest exercises including Dumbbell Bench Press and Incline Dumbbell Press, full gym')
  expect(result.kind).toBe('plan')
  const names = ['Dumbbell Bench Press', 'Incline Dumbbell Press']
  expect(result.plan.mandatoryIds).toEqual(names.map(name => `local:exercise:${name.replace(/ /g, '_')}`))
  expect(validateSelection(result.plan, { selections: names }).errors).toEqual([])
})

test('neutral-grip and regular flat dumbbell presses share one slot and cannot fill two', () => {
  const request = 'Create 6 chest exercises, full gym'
  const result = planWorkout(request)
  expect(result.kind).toBe('plan')
  const variants = ['Dumbbell Bench Press', 'Dumbbell Bench Press with Neutral Grip']
  expect(result.plan.slots.filter(slot => slot.some(exercise => variants.includes(exercise.name)))).toHaveLength(1)
  expect(result.plan.slots.flat().filter(exercise => variants.includes(exercise.name))).toHaveLength(2)
  expect(defaultSelection(result.plan).filter(name => variants.includes(name))).toHaveLength(1)
  expect(validateSelection(result.plan, { selections: variants }).errors).toContain('Interchangeable exercise variants')
  const draft = renderWorkout(result.plan, defaultSelection(result.plan))
  const exercises = variants.map(name => ({ ...draft.workout.exercises[0], catalogId: result.plan.slots.flat().find(exercise => exercise.name === name).id }))
  expect(validateWorkoutReview(request, { ...draft, workout: { ...draft.workout, exercises } })).toContain('Interchangeable exercise variants')
})

test('squats and lunges may coexist without excluding a hip hinge or calf movement', () => {
  const result = planWorkout('Create a 6 exercise legs workout, full gym')
  expect(result.kind).toBe('plan')
  const names = defaultSelection(result.plan)
  expect(names).toHaveLength(6)
  const required = ['Dumbbell Lunges', 'Dumbbell Squat', 'Stiff-Legged Dumbbell Deadlift', 'Calf Raises - With Bands']
  const choices = result.plan.slots.reduce((picked, slot) =>
    picked.flatMap(selection => slot.map(exercise => [...selection, exercise.name])), [[]])
  expect(choices.some(selection =>
    required.every(name => selection.includes(name)) &&
    validateSelection(result.plan, { selections: selection }).errors.length === 0
  )).toBe(true)
  expect(validateSelection(result.plan, { selections: names }).errors).toEqual([])
})

test('duplicate exercise identity is still rejected during generation and review', () => {
  const request = 'Create 2 chest exercises, full gym'
  const result = planWorkout(request)
  const names = ['Dumbbell Bench Press', 'Dumbbell Bench Press']
  expect(validateSelection(result.plan, { selections: names }).errors).toContain('Duplicate exercise')
  const rendered = renderWorkout(result.plan, defaultSelection(result.plan))
  const duplicate = { ...rendered, workout: { ...rendered.workout, exercises: [rendered.workout.exercises[0], rendered.workout.exercises[0]] } }
  expect(validateWorkoutReview(request, duplicate)).toContain('Duplicate exercise')
})

test('full gym supplies the bench required by reviewed bench press and fly entries', () => {
  const result = planWorkout('Create 3 chest exercises, full gym')
  expect(result.kind).toBe('plan')
  const names = result.plan.slots.flat().map(exercise => exercise.name)
  expect(names).toEqual(expect.arrayContaining(['Dumbbell Bench Press', 'Dumbbell Flyes', 'Incline Dumbbell Press']))
  const noBench = planWorkout('Create 3 chest exercises with two dumbbells')
  expect(noBench.kind).toBe('plan')
  expect(noBench.plan.slots.flat().some(exercise => /bench press|flyes|incline dumbbell press/i.test(exercise.name))).toBe(false)
})

test('a gym back workout offers both vertical and horizontal pulling', () => {
  const result = planWorkout('Build a 3-exercise back workout for a full gym.')
  expect(result.kind).toBe('plan')
  expect(defaultSelection(result.plan)).toEqual(expect.arrayContaining([
    'Close-Grip Front Lat Pulldown', 'Bent Over Barbell Row',
  ]))
})

test('HIIT can use a reviewed conditioning movement while keeping timed prescriptions', () => {
  const result = planWorkout('Build a bodyweight HIIT workout, 3 exercises, 2 sets, 30 seconds on and 20 seconds off.')
  expect(result.kind).toBe('plan')
  const draft = renderWorkout(result.plan, defaultSelection(result.plan))
  expect(draft.workout.exercises).toContainEqual(expect.objectContaining({
    catalogId: 'local:exercise:Mountain_Climbers',
    sets: [{ kind: 'timed', durationSeconds: 30 }, { kind: 'timed', durationSeconds: 30 }],
    guidance: { restSeconds: 20 },
  }))
})

test('the exact barbell bench press requires a bench press station or suitable gym setup', () => {
  const request = 'Plan a chest workout with only Barbell Bench Press - Medium Grip, 2 sets of 5 reps.'
  const gym = planWorkout(`${request} Full gym.`)
  expect(gym.kind).toBe('plan')
  expect(defaultSelection(gym.plan)).toEqual(['Barbell Bench Press - Medium Grip'])
  expect(planWorkout(`${request} Full gym but without a rack.`).kind).toBe('clarification')
})

test('a broad back session keeps vertical and horizontal pulling available to the model in separate slots', () => {
  const result = planWorkout('Build a full-gym back workout with 3 exercises.')
  expect(result.kind).toBe('plan')
  expect(result.plan.slots[0].map(exercise => exercise.name)).toEqual(['Close-Grip Front Lat Pulldown'])
  expect(result.plan.slots[1].every(exercise => /\brow\b/i.test(exercise.name))).toBe(true)
})

test('high set counts for a broad back session preserve sets and use a compact default exercise count', () => {
  const result = planWorkout('Build a full-gym back workout, exactly 6 sets of 8 reps.')
  expect(result.kind).toBe('plan')
  expect(result.plan.slots).toHaveLength(3)
  expect(result.plan.sets).toBe(6)
})

test('the floor calf-raise variation keeps the dumbbell-only setup and gives floor instructions', () => {
  const result = planWorkout('Build a leg workout using only two dumbbells, 4 exercises and 2 sets of 10.')
  expect(result.kind).toBe('plan')
  const draft = renderWorkout(result.plan, defaultSelection(result.plan))
  expect(draft.workout.exercises).toContainEqual(expect.objectContaining({
    catalogId: 'local:exercise:Standing_Dumbbell_Calf_Raise',
    guidance: expect.objectContaining({ cues: [expect.stringContaining('flat floor')] }),
  }))
})

test('machine-only lower-body plans can cover knee, hinge-related muscles, and calves without free weights', () => {
  const result = planWorkout('Build a lower-body session using only machines at a full gym, 3 exercises, 2 sets of 8 reps each.')
  expect(result.kind).toBe('plan')
  expect(result.plan.slots).toHaveLength(3)
  expect(result.plan.slots.flat().every(exercise => exercise.equipment === 'MACHINE')).toBe(true)
})

test.each([
  ['a flat bench', ['local:exercise:Dumbbell_Incline_Row']],
  ['no bench', ['local:exercise:Dumbbell_Incline_Row', 'local:exercise:Dumbbell_Bench_Press_with_Neutral_Grip']],
])('rejects incompatible bench setups in both candidates and a finished draft with %s', (setup, unavailable) => {
  const request = `Draft a whole-body strength workout with two dumbbells and ${setup}. Use 4 dumbbell exercises, 2 sets of 12 reps, within 22 minutes. Intermediate.`
  const result = planWorkout(request)
  expect(result.kind).toBe('plan')
  const ids = result.plan.slots.flat().map(exercise => exercise.id)
  const draft = renderWorkout(result.plan, defaultSelection(result.plan))
  for (const catalogId of unavailable) {
    expect(ids).not.toContain(catalogId)
    const exercises = draft.workout.exercises.map((exercise, index) =>
      index === 0 ? { ...exercise, catalogId } : exercise)
    expect(validateWorkoutReview(request, { ...draft, workout: { ...draft.workout, exercises } }))
      .toContain(`Exercise ${catalogId} does not match the original setup or restrictions.`)
  }
})

test('a deterministic session preserves the main lift, time cap, and complementary movements', () => {
  const { deterministicSelection } = require('../../features/coach/workoutPlanner')
  const result = planWorkout('Draft a workout with goblet squat, two kettlebells, and 2 exercises. Use 2 sets of 8 reps and fit within 20 minutes.')
  expect(result.kind).toBe('plan')
  const names = deterministicSelection(result.plan)
  expect(names[0]).toMatch(/goblet squat/i)
  expect(names[1]).toMatch(/push-up|floor press/i)
  expect(names).toHaveLength(2)
  expect(deterministicSelection(result.plan)).toEqual(names)
  expect(validateSelection(result.plan, { selections: names }).errors).toEqual([])
})

test('a no-overhead-movement restriction excludes pulldowns as well as presses', () => {
  const result = planWorkout("I'm intermediate and have a full gym. Draft one upper-body lifting session for today. Keep overhead movements out, include both pressing and rowing, and prescribe 4 exercises for 3 sets of 6–8 reps with 120 seconds of rest.")
  expect(result.kind).toBe('plan')
  expect(result.plan.slots.flat().map(exercise => exercise.name).join(', ')).not.toMatch(/pulldown|overhead|military press|shoulder press/i)
})

test('a four-movement whole-body draft covers a knee bend, push, pull, and hinge without a bench', () => {
  const { deterministicSelection, estimateWorkoutSeconds } = require('../../features/coach/workoutPlanner')
  const request = 'I have an open floor and a pair of dumbbells. Build an intermediate full-body strength workout using only those dumbbells, 4 movements, 2 sets of 10 reps, with 75 seconds rest. I have at most 24 minutes.'
  const result = planWorkout(request)
  expect(result.kind).toBe('plan')
  const names = deterministicSelection(result.plan)
  expect(names).toEqual([
    expect.stringMatching(/squat|lunge/i),
    'Dumbbell Floor Press',
    expect.stringMatching(/row/i),
    expect.stringMatching(/deadlift/i),
  ])
  const draft = renderWorkout(result.plan, names)
  expect(validateWorkoutReview(request, draft)).toEqual([])
  expect(estimateWorkoutSeconds(draft.workout)).toBeLessThanOrEqual(24 * 60)
  expect(draft.workout.exercises.every(exercise => exercise.guidance.restSeconds === 75)).toBe(true)
})

test('a pair-only floor press is unavailable with one dumbbell', () => {
  const result = planWorkout('Draft an intermediate chest workout with only one dumbbell and no bench.')
  if (result.kind === 'plan') {
    expect(result.plan.slots.flat().map(exercise => exercise.name)).not.toContain('Dumbbell Floor Press')
  } else {
    expect(result.kind).toBe('clarification')
  }
})
