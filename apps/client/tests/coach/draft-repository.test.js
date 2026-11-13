jest.mock('../../features/launch/launchFacade', () => ({
  launchFacade: { api: { backendMode: () => 'device' } },
}))
jest.mock('../../lib/sync', () => {
  let tail = Promise.resolve()
  return {
    syncEngine: {
      withIdRemapLock: (fn) => {
        const result = tail.then(fn)
        tail = result.catch(() => {})
        return result
      },
    },
  }
})
const { DatabaseSync } = require('node:sqlite')
const { CoachDraftRepository } = require('../../lib/repositories/CoachDraftRepository')
const { getProfileScope, setActiveProfileOwner } = require('../../lib/profileScope')
const { exerciseCatalog } = require('../../lib/exercises/catalog')

function createDb() {
  const sql = new DatabaseSync(':memory:')
  sql.exec(`CREATE TABLE workouts (id TEXT PRIMARY KEY, title TEXT, notes TEXT, created_at TEXT, updated_at TEXT, workout_template TEXT, is_synced INTEGER);
    CREATE TABLE routines (id TEXT PRIMARY KEY, name TEXT, description TEXT, routine_type TEXT, pattern TEXT, start_date TEXT, created_at TEXT, updated_at TEXT, is_active INTEGER, is_synced INTEGER);
    CREATE TABLE coach_draft_saves (revision TEXT PRIMARY KEY, draft_json TEXT NOT NULL, result_json TEXT NOT NULL);`)
  return {
    sql,
    failOnWorkout: 0,
    inserted: 0,
    async getFirstAsync(query, ...params) {
      return sql.prepare(query).get(...params) ?? null
    },
    async runAsync(query, ...params) {
      sql.prepare(query).run(...params)
      if (query.includes('INSERT INTO workouts') && ++this.inserted === this.failOnWorkout)
        throw new Error('injected failure')
    },
    async withTransactionAsync(fn) {
      sql.exec('BEGIN')
      try {
        await fn()
        sql.exec('COMMIT')
      } catch (error) {
        sql.exec('ROLLBACK')
        throw error
      }
    },
  }
}
const request = 'Create 1 chest exercise using bodyweight'
const exercise = require('../../features/coach/workoutPlanner').planWorkout(request).plan.slots[0][0]
const draft = {
  version: 1,
  kind: 'routine_draft',
  assumptions: [],
  workouts: ['a', 'b', 'c'].map((ref, i) => ({
    ref,
    title: `Day ${i + 1}`,
    exercises: [
      {
        catalogId: exercise.id,
        sets:
          i === 1
            ? [{ kind: 'timed', durationSeconds: 30 }]
            : [{ kind: 'strength', repetitions: 8, load: { kind: 'bodyweight' } }],
        guidance: { restSeconds: 90, progression: 'Progress gradually' },
      },
    ],
  })),
  routine: {
    type: 'SEQUENTIAL',
    title: 'Three days',
    days: [
      { kind: 'workout', workoutRef: 'a' },
      { kind: 'rest' },
      { kind: 'workout', workoutRef: 'b' },
      { kind: 'workout', workoutRef: 'c' },
    ],
  },
}

test('rolls back after the second workout and persists one routine across concurrent retries', async () => {
  const db = createDb()
  const repo = new CoachDraftRepository(db)
  const input = { revision: 'revision-1', draft, request, scope: getProfileScope() }
  db.failOnWorkout = 2
  await expect(repo.save(input)).rejects.toThrow('injected failure')
  expect(db.sql.prepare('SELECT count(*) AS n FROM workouts').get().n).toBe(0)
  expect(db.sql.prepare('SELECT count(*) AS n FROM coach_draft_saves').get().n).toBe(0)
  db.failOnWorkout = 0
  const [first, second] = await Promise.all([repo.save(input), repo.save(input)])
  expect(first).toEqual(second)
  expect(await new CoachDraftRepository(db).save(input)).toEqual(first)
  expect(db.sql.prepare('SELECT count(*) AS n FROM workouts').get().n).toBe(3)
  const pattern = JSON.parse(db.sql.prepare('SELECT pattern FROM routines').get().pattern)
  expect(pattern.map((day) => day.workoutId)).toEqual([
    first.workoutIds[0],
    null,
    first.workoutIds[1],
    first.workoutIds[2],
  ])
  const template = JSON.parse(
    db.sql.prepare('SELECT workout_template FROM workouts WHERE id = ?').get(first.workoutIds[1])
      .workout_template
  )
  expect(template.exercises[0].coachPrescription).toEqual(
    draft.workouts[1].exercises[0] && {
      sets: draft.workouts[1].exercises[0].sets,
      guidance: draft.workouts[1].exercises[0].guidance,
    }
  )
  await expect(
    repo.save({ ...input, draft: { ...draft, assumptions: ['changed'] } })
  ).rejects.toThrow('different content')
  db.sql.close()
})
test('does not write after the captured profile changes', async () => {
  const db = createDb()
  const repo = new CoachDraftRepository(db)
  const scope = getProfileScope()
  setActiveProfileOwner('account:other')
  await expect(repo.save({ revision: 'stale', draft, request, scope })).rejects.toThrow('Profile changed')
  expect(db.sql.prepare('SELECT count(*) AS n FROM workouts').get().n).toBe(0)
  setActiveProfileOwner('local:device')
  db.sql.close()
})

test('saves generated explicit rest and rejects changing it before any write', async () => {
  const { planWorkout, renderWorkout, defaultSelection } = require('../../features/coach/workoutPlanner')
  const request = 'Create 2 chest exercises, full gym, 2 sets of 8 reps, rest 90 seconds.'
  const planned = planWorkout(request)
  const draft = renderWorkout(planned.plan, defaultSelection(planned.plan))
  for (const exercise of draft.workout.exercises) {
    for (const set of exercise.sets) set.load = { kind: 'kilograms', value: 10 }
  }
  const db = createDb()
  try {
    const repo = new CoachDraftRepository(db)
    const input = { revision: 'explicit-rest', draft, request, scope: getProfileScope() }
    const edited = structuredClone(draft)
    edited.workout.exercises[0].guidance.restSeconds = 60
    await expect(repo.save({ ...input, draft: edited })).rejects.toThrow('requested 90 seconds rest')
    expect(db.sql.prepare('SELECT count(*) AS n FROM workouts').get().n).toBe(0)
    const saved = await repo.save(input)
    const row = db.sql.prepare('SELECT workout_template FROM workouts WHERE id = ?').get(saved.workoutIds[0])
    const template = JSON.parse(row.workout_template)
    expect(template.exercises.every(exercise => exercise.coachPrescription.guidance.restSeconds === 90)).toBe(true)
  } finally {
    db.sql.close()
  }
})

test('review saver rejects an edited workout outside the worded count before any persistence', async () => {
  const { planWorkout, defaultSelection, renderWorkout } = require('../../features/coach/workoutPlanner')
  const { createReviewSaver } = require('../../features/coach/reviewSave')
  const request = 'Create at least three exercises and at most four exercises, full gym.'
  const result = planWorkout(request)
  expect(result.kind).toBe('plan')
  const response = renderWorkout(result.plan, defaultSelection(result.plan))
  response.workout.exercises.splice(2)
  const db = createDb()
  const save = createReviewSaver(db, getProfileScope(), () => true)
  await expect(save(response, 'count-review', request)).rejects.toThrow(/requested exercise count/)
  expect(db.sql.prepare('SELECT count(*) AS n FROM coach_draft_saves').get().n).toBe(0)
  expect(db.sql.prepare('SELECT count(*) AS n FROM workouts').get().n).toBe(0)
  db.sql.close()
})

test.each([
  'Create a full gym workout: Pushups and imaginary moon hopper.',
  'Create exactly 3 chest exercises and exactly 5 exercises, full gym.',
])('ambiguous request cannot persist a draft: %s', async request => {
  const { planWorkout, defaultSelection, renderWorkout } = require('../../features/coach/workoutPlanner')
  const { createReviewSaver } = require('../../features/coach/reviewSave')
  const valid = planWorkout('Create a workout with full gym.')
  const db = createDb()
  await expect(createReviewSaver(db, getProfileScope(), () => true)(renderWorkout(valid.plan, defaultSelection(valid.plan)), 'ambiguous', request)).rejects.toThrow()
  expect(db.sql.prepare('SELECT count(*) AS n FROM coach_draft_saves').get().n).toBe(0)
  expect(db.sql.prepare('SELECT count(*) AS n FROM workouts').get().n).toBe(0)
  db.sql.close()
})

test.each([
  ['Create a full gym workout: Pushups and imaginary moon hopper.', 'Replace imaginary moon hopper with Dumbbell Bench Press', ['Pushups', 'Dumbbell Bench Press']],
  ['Create exactly 3 chest exercises and exactly 5 exercises, full gym.', 'Make it exactly 3 chest exercises', null],
  ['Create a full gym workout: Pushups and imaginary moon hopper.', 'Swap imaginary moon hopper for Dumbbell Bench Press', ['Pushups', 'Dumbbell Bench Press']],
  ['Create exactly 3 chest exercises and exactly 5 exercises, full gym.', 'Create exactly 3 chest exercises, full gym.', null],
])('clarification correction survives review and SQLite save', async (initial, correction, names) => {
  const { applyWorkoutFollowUp, runConstrainedCoachTurn } = require('../../features/coach/constrainedTurn')
  const { createReviewSaver } = require('../../features/coach/reviewSave')
  const db = createDb()
  const prior = []
  async function turn(message) {
    const request = applyWorkoutFollowUp(message, prior)
    let calls = 0
    const result = await runConstrainedCoachTurn({ message: request, session: { appendUserMessage: async () => {}, generate: async () => { if (!calls++) return { kind: 'final', content: { intent: 'create_workout' } }; throw Error('template') } }, execute: async () => { throw Error('unexpected read') }, signal: new AbortController().signal, isCurrentProfile: () => true, maxOutputTokens: 500 })
    prior.push({ kind: 'user', text: message }, { kind: 'response', response: result.response, request })
    return { request, response: result.response }
  }
  try {
    expect((await turn(initial)).response.kind).toBe('clarification')
    expect(db.sql.prepare('SELECT count(*) AS n FROM workouts').get().n).toBe(0)
    const { request, response } = await turn(correction)
    expect(response.kind).toBe('workout_draft')
    const edited = structuredClone(response)
    edited.workout.title = 'Reviewed workout'
    for (const exercise of edited.workout.exercises) for (const set of exercise.sets) if (set.kind === 'strength') set.load = { kind: 'kilograms', value: 10 }
    const saved = await createReviewSaver(db, getProfileScope(), () => true)(edited, 'corrected', request)
    const template = JSON.parse(db.sql.prepare('SELECT workout_template FROM workouts WHERE id = ?').get(saved.workoutIds[0]).workout_template)
    if (names) expect(template.exercises.map(e => e.exerciseId)).toEqual(expect.arrayContaining(exerciseCatalog.filter(e => names.includes(e.name)).map(e => e.id)))
    else expect(template.exercises).toHaveLength(3)
  } finally { db.sql.close() }
})
