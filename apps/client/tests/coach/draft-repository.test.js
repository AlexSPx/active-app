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
