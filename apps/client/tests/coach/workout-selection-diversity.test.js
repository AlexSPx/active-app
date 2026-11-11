const { planWorkout, defaultSelection, validateSelection, validateWorkoutReview, renderWorkout } = require('../../features/coach/workoutPlanner')

test('flat and incline chest presses may coexist in the same session', () => {
  const result = planWorkout('Create 2 chest exercises, full gym')
  expect(result.kind).toBe('plan')
  const names = ['Dumbbell Bench Press', 'Incline Dumbbell Press']
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
  expect(names).toEqual(expect.arrayContaining(['Dumbbell Lunges', 'Dumbbell Squat', 'Stiff-Legged Dumbbell Deadlift', 'Calf Raises - With Bands']))
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
