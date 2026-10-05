const {
  toggleExerciseSelection,
  validateWorkoutData,
  parseWorkoutDuration,
  buildUpdateWorkoutRequest,
} = require('../../utils/workoutUtils')
const { useWorkoutStore } = require('../../features/workouts/stores/createWorkoutStore')
const { useEditWorkoutStore } = require('../../features/workouts/stores/editWorkoutStore')

const squat = {
  id: 'squat',
  name: 'Squat',
  category: 'STRENGTH',
  sets: [{ weight: 60.5, reps: 8 }],
}
const run = {
  id: 'run',
  name: 'Run',
  category: 'CARDIO',
  sets: [{ weight: null, reps: null, durationSeconds: 900 }],
}

for (const [context, store] of [
  ['create', useWorkoutStore],
  ['edit', useEditWorkoutStore],
]) {
  test(`${context} picker changes stay pending until Done and restore original targets`, () => {
    store.getState().setExercises([squat])
    const original = store.getState().selectedExercises
    let pending = toggleExerciseSelection(original, run, original)
    pending = toggleExerciseSelection(pending, squat, original)
    pending = toggleExerciseSelection(pending, squat, original)
    expect(store.getState().selectedExercises).toEqual([squat]) // Cancel preserves the draft.
    expect(pending.find((exercise) => exercise.id === squat.id)).toBe(squat)
    store.getState().setExercises(pending) // Done applies all searches' selection.
    expect(store.getState().selectedExercises.map((exercise) => exercise.id)).toEqual([
      'run',
      'squat',
    ])
    expect(pending[0].sets).toEqual([{ reps: null, weight: null, durationSeconds: 0 }])
    store.getState().reset()
  })
}

test('saving requires a trimmed name, bounded notes, exercises, and finite valid targets', () => {
  expect(validateWorkoutData('  ', [squat])).toBeTruthy()
  expect(validateWorkoutData('x'.repeat(101), [squat])).toBeTruthy()
  expect(validateWorkoutData('Legs', [squat], 'x'.repeat(1001))).toBeTruthy()
  expect(validateWorkoutData('Legs', [])).toBeTruthy()
  expect(validateWorkoutData('Legs', [{ ...squat, sets: [] }])).toBeTruthy()
  for (const set of [
    { weight: null, reps: 8 },
    { weight: Infinity, reps: 8 },
    { weight: -1, reps: 8 },
    { weight: 0, reps: 0 },
    { weight: 0, reps: 1.5 },
  ]) {
    expect(validateWorkoutData('Legs', [{ ...squat, sets: [set] }])).toBeTruthy()
  }
  expect(validateWorkoutData('Legs', [{ ...squat, sets: [{ weight: 0, reps: 1 }] }])).toBeNull()
  expect(validateWorkoutData('Legs', [squat, run])).toBeNull()
})

test('cardio input supports minutes and seconds and rejects incomplete or invalid durations', () => {
  expect(parseWorkoutDuration('15:00')).toBe(900)
  expect(parseWorkoutDuration('90:30')).toBe(5430)
  for (const text of ['15:0', '0:60', 'abc', '-1:00', 'Infinity:00'])
    expect(parseWorkoutDuration(text)).toBeNull()
  for (const durationSeconds of [null, 0, Infinity, NaN, 1.5]) {
    expect(
      validateWorkoutData('Cardio', [
        { ...run, sets: [{ reps: null, weight: null, durationSeconds }] },
      ])
    ).toBeTruthy()
  }
})

test('updates preserve ordered strength targets and edited cardio duration', () => {
  const payload = buildUpdateWorkoutRequest({ exercises: [run, squat] })
  expect(payload.template.exercises).toEqual([
    { exerciseId: 'run', durationSeconds: [900], notes: undefined },
    { exerciseId: 'squat', weight: [60.5], reps: [8], notes: undefined },
  ])
})
