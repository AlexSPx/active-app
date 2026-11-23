jest.mock('../../features/launch/launchFacade', () => ({
  launchFacade: { api: { backendMode: () => 'device' } },
}))
jest.mock('../../lib/sync', () => ({ syncEngine: {} }))

const { runConstrainedCoachTurn } = require('../../features/coach/constrainedTurn')
const { coachResponseSchema } = require('../../features/coach/contracts')
const { previewCoachLibraryEdit } = require('../../lib/repositories/CoachLibraryRepository')

const updatedAt = '2026-11-23T12:00:00.000Z'
const exercise = (name, reps, weight) => ({
  exerciseId: name,
  exerciseTitle: name,
  category: 'STRENGTH',
  reps,
  weight,
})
const workout = (id, title) => ({
  id,
  title,
  createdAt: updatedAt,
  updatedAt,
  workoutTemplate: {
    id: `${id}-template`,
    createdAt: updatedAt,
    updatedAt,
    exercises: [
      exercise('Bench Press', [8, 8], [45, 45]),
      exercise('Dumbbell Row', [10], [15]),
      { ...exercise('Bike', [], []), category: 'CARDIO', durationSeconds: [30] },
    ],
  },
})
const routine = {
  id: 'split-id',
  name: 'Training Split',
  routineType: 'SEQUENTIAL',
  createdAt: updatedAt,
  updatedAt,
  pattern: [
    { dayIndex: 2, dayType: 'REST', workoutId: null },
    { dayIndex: 1, dayType: 'WORKOUT', workoutId: 'upper-id' },
  ],
}
const library = {
  workouts: [workout('upper-id', 'Upper Day'), workout('lower-id', 'Lower Day')],
  routines: [routine],
  activeRoutineId: routine.id,
}

function turn(message, overrides = {}) {
  const generate = jest.fn().mockResolvedValue({ kind: 'final', content: { intent: 'coach_qa' } })
  const appendUserMessage = jest.fn().mockResolvedValue(undefined)
  const readLibrary = jest.fn().mockResolvedValue(library)
  const readHistory = jest.fn()
  const result = runConstrainedCoachTurn({
    message,
    session: { appendUserMessage, generate },
    maxOutputTokens: 500,
    signal: new AbortController().signal,
    isCurrentProfile: () => true,
    readHistory,
    readLibrary,
    previewLibraryEdit: previewCoachLibraryEdit,
    ...overrides,
  })
  return { result, generate, appendUserMessage, readLibrary, readHistory }
}

test('lists the saved library and shows routine days in saved order', async () => {
  const list = turn('List my saved workouts and routines')
  expect((await list.result).response).toEqual({
    version: 1,
    kind: 'answer',
    blocks: [
      {
        kind: 'text',
        text: 'Saved workouts\n• Upper Day\n• Lower Day\n\nSaved routines\n• Training Split',
        evidence: [],
      },
    ],
    limitations: [],
  })
  expect(list.generate).not.toHaveBeenCalled()
  expect(
    (await turn('Show the schedule for routine Training Split').result).response.blocks[0].text
  ).toBe('Training Split\nRepeating schedule\nDay 1 — Upper Day\nDay 2 — Rest')
  expect((await turn('What’s my active routine?').result).response.blocks[0].text).toBe(
    'Active routine — Training Split\nRepeating schedule\nDay 1 — Upper Day\nDay 2 — Rest'
  )
  expect(
    (
      await turn('What is my active routine?', {
        readLibrary: async () => ({ ...library, activeRoutineId: null }),
      }).result
    ).response.blocks[0].text
  ).toBe('You have no active routine.')
})

test('shows contents for an exact saved name before considering prefixes', async () => {
  const exact = turn('Show me what’s in workout Upper Day', {
    readLibrary: async () => ({
      ...library,
      workouts: [...library.workouts, workout('other', 'Upper Day 2')],
    }),
  })
  expect((await exact.result).response.blocks[0]).toEqual({
    kind: 'text',
    text: 'Upper Day\n1. Bench Press — 8 reps at 45 kg; 8 reps at 45 kg\n2. Dumbbell Row — 10 reps at 15 kg\n3. Bike — 30 sec',
    evidence: [],
  })
  const unique = await turn('What is in workout Upper?').result
  expect(unique.response.blocks[0].text).toMatch(/^Upper Day\n/)
})

test('asks for clarification when a saved target is ambiguous or missing', async () => {
  const ambiguous = await turn('Rename Upper to New Name', {
    readLibrary: async () => ({
      ...library,
      workouts: [...library.workouts, workout('other', 'Upper Body')],
    }),
  }).result
  expect(ambiguous.response).toMatchObject({
    kind: 'clarification',
    question: expect.stringContaining('“Upper Day” (workout), “Upper Body” (workout)'),
  })
  const missing = await turn('Show routine Missing').result
  expect(missing.response).toMatchObject({
    kind: 'clarification',
    question: 'I could not find “Missing” in your saved library. What is its saved name?',
  })
})

test.each([
  ['Rename workout "Upper Day" to "Upper Strength"', { kind: 'rename', title: 'Upper Strength' }],
  ['Set Bench Press in workout Upper Day to 12 reps', { kind: 'set_reps', position: 1, reps: 12 }],
  [
    'Set the weight for Bench Press to 50 kg in workout Upper Day',
    { kind: 'set_weight', position: 1, kilograms: 50 },
  ],
  ['Set Dumbbell Row to 3 sets in workout Upper Day', { kind: 'set_count', position: 2, count: 3 }],
  [
    'Set Bike to 1.5 minutes in workout Upper Day',
    { kind: 'set_duration', position: 3, seconds: 90 },
  ],
  [
    'Move Bench Press after Dumbbell Row in workout Upper Day',
    { kind: 'move_exercise', position: 1, toPosition: 2 },
  ],
  ['Remove Dumbbell Row from workout Upper Day', { kind: 'remove_exercise', position: 2 }],
  [
    'Add Plank for 2 x 30 sec to workout Upper Day',
    {
      kind: 'add_exercise',
      catalogId: 'local:exercise:Plank',
      sets: [
        { kind: 'timed', durationSeconds: 30 },
        { kind: 'timed', durationSeconds: 30 },
      ],
    },
  ],
  [
    'Replace Dumbbell Row with Pushups for 2 x 10 in workout Upper Day',
    {
      kind: 'replace_exercise',
      position: 2,
      catalogId: 'local:exercise:Pushups',
      sets: [
        { kind: 'strength', repetitions: 10, load: { kind: 'bodyweight' } },
        { kind: 'strength', repetitions: 10, load: { kind: 'bodyweight' } },
      ],
    },
  ],
])('previews “%s” against the existing workout', async (message, change) => {
  const request = turn(message)
  const result = await request.result
  expect(coachResponseSchema.parse(result.response)).toMatchObject({
    kind: 'library_edit',
    edit: { target: { kind: 'workout', id: 'upper-id', title: 'Upper Day', updatedAt }, change },
  })
  expect(request.generate).not.toHaveBeenCalled()
})

test.each([
  [
    'Add workout Lower Day as day 2 to routine Training Split',
    { kind: 'insert_workout', position: 2, workoutId: 'lower-id' },
  ],
  ['Insert rest after day 1 in routine Training Split', { kind: 'insert_rest', position: 2 }],
  ['Insert rest after day 1 in my active routine', { kind: 'insert_rest', position: 2 }],
  [
    'Move day 2 to day 1 in routine Training Split',
    { kind: 'move_day', position: 2, toPosition: 1 },
  ],
  [
    'Replace day 2 with workout Lower Day in routine Training Split',
    { kind: 'replace_day_workout', position: 2, workoutId: 'lower-id' },
  ],
  ['Remove day 2 from routine Training Split', { kind: 'remove_day', position: 2 }],
])('previews “%s” against the existing routine', async (message, change) => {
  const result = await turn(message).result
  expect(coachResponseSchema.parse(result.response)).toMatchObject({
    kind: 'library_edit',
    edit: {
      target: { kind: 'routine', id: 'split-id', title: 'Training Split', updatedAt },
      change,
    },
  })
})

test.each([
  'Use 12 reps for Bench Press in workout Upper Day',
  'Edit workout Upper Day: set Bench Press to 12 reps',
])('previews “%s” using the saved workout and exact request', async (message) => {
  const { result, generate } = turn(message)
  expect((await result).response.edit).toEqual({
    target: { kind: 'workout', id: 'upper-id', title: 'Upper Day', updatedAt },
    change: { kind: 'set_reps', position: 1, reps: 12 },
    summary: ['Change Bench Press from 2 × 8 reps at 45 kg to 2 × 12 reps at 45 kg.'],
  })
  expect(generate).not.toHaveBeenCalled()
})

test.each([
  'Rename workout Upper Day to Upper Focus and remove exercise 1',
  'Rename workout Upper Day to "Upper Focus" and rename routine "Training Split"',
  'Change Bench Press weight to 10 reps in workout Upper Day',
  'Set exercise 9 to 12 reps in workout Upper Day',
  'Remove Bench Press and Dumbbell Row in workout Upper Day',
  'Add Plank to workout Upper Day',
])('clarifies “%s” without proposing an unintended change', async (message) => {
  expect((await turn(message).result).response.kind).toBe('clarification')
})

test('uses the raw library message before draft revision handling and respects health and profile guards', async () => {
  const message =
    'Create a workout.\nUnsupported workout revision: Rename workout Upper Day to Upper Strength'
  const request = turn(message, { libraryMessage: 'Rename workout Upper Day to Upper Strength' })
  expect((await request.result).response.kind).toBe('library_edit')

  const medical = turn('Rename workout Upper Day to Upper Strength. I have chest pain.')
  expect((await medical.result).response).toMatchObject({
    kind: 'cannot_fulfill',
    reason: expect.stringContaining('urgent medical help'),
  })
  expect(medical.readLibrary).not.toHaveBeenCalled()

  let current = true
  const stale = await turn('List my routines', {
    readLibrary: async () => {
      current = false
      return library
    },
    isCurrentProfile: () => current,
  }).result
  expect(stale).toEqual({
    kind: 'failure',
    code: 'stale_profile',
    message: 'The coach request was interrupted.',
  })
})

test('preserves the workout creation, advice, and personal history routes', async () => {
  for (const request of [
    'Make a workout in 20 minutes using bodyweight',
    'Give me a bodyweight workout for my routine',
  ]) {
    const create = turn(request)
    expect((await create.result).response.kind).toBe('workout_draft')
    expect(create.readLibrary).not.toHaveBeenCalled()
  }

  const advice = turn('What is in a warmup?')
  expect((await advice.result).response.blocks[0].text).toContain(
    'generated coaching advice is currently unavailable'
  )
  expect(advice.readLibrary).not.toHaveBeenCalled()

  const history = turn('Show my recorded workouts')
  await history.result
  expect(history.generate).toHaveBeenCalledTimes(1)
  expect(history.readLibrary).not.toHaveBeenCalled()
})
