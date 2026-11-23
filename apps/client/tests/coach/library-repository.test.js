jest.mock('../../features/launch/launchFacade', () => ({
  launchFacade: { api: { backendMode: jest.fn(() => 'device') } },
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
      resolveId: (_table, id) => id,
      enqueue: jest.fn(),
      scheduleQueueProcessing: jest.fn(),
    },
  }
})

const { DatabaseSync } = require('node:sqlite')
const { launchFacade } = require('../../features/launch/launchFacade')
const { getProfileScope } = require('../../lib/profileScope')
const { exerciseCatalog } = require('../../lib/exercises/catalog')
const { WorkoutRepository } = require('../../lib/repositories/WorkoutRepository')
const {
  CoachLibraryRepository,
  previewCoachLibraryEdit,
} = require('../../lib/repositories/CoachLibraryRepository')

const initialTime = '2026-11-17T09:00:00.000Z'
const bodyweight = { kind: 'bodyweight' }
const strength = {
  exerciseId: 'legacy_squat',
  exerciseTitle: '  Legacy Squat  ',
  category: 'STRENGTH',
  reps: [10, 8],
  weight: [0, 20],
  notes: 'Pause at the bottom',
  coachPrescription: {
    sets: [
      { kind: 'strength', repetitions: 10, load: bodyweight },
      { kind: 'strength', repetitions: 8, load: { kind: 'kilograms', value: 20 } },
    ],
    guidance: { restSeconds: 90, progression: 'Increase gradually' },
  },
}
const cardio = {
  exerciseId: 'legacy_run',
  exerciseTitle: 'Run',
  category: 'CARDIO',
  durationSeconds: 30,
  reps: [5],
  weight: [10],
  notes: 'Keep a steady pace',
}
const template = {
  id: 'template-a',
  createdAt: initialTime,
  updatedAt: initialTime,
  source: 'legacy-import',
  exercises: [strength, cardio],
}
const rest = { dayIndex: 2, dayType: 'REST', workoutId: null, source: 'schedule' }
const pattern = [
  { dayIndex: 1, dayType: 'WORKOUT', workoutId: 'a' },
  rest,
  { dayIndex: 3, dayType: 'WORKOUT', workoutId: 'b' },
]
const catalogStrength = exerciseCatalog.find(
  (exercise) =>
    exercise.setupReviewStatus === 'reviewed' &&
    !exercise.retired &&
    exercise.category === 'STRENGTH'
)
const exerciseSets = [{ kind: 'strength', repetitions: 12, load: bodyweight }]

let sql
let db
let repo

beforeEach(() => {
  sql = new DatabaseSync(':memory:')
  sql.exec(`
    CREATE TABLE workouts (
      id TEXT PRIMARY KEY, title TEXT, notes TEXT, created_at TEXT, updated_at TEXT,
      workout_template TEXT, is_synced INTEGER DEFAULT 0, is_deleted INTEGER DEFAULT 0,
      server_version INTEGER
    );
    CREATE TABLE workout_records (id TEXT PRIMARY KEY, workout_id TEXT, notes TEXT);
    CREATE TABLE routines (
      id TEXT PRIMARY KEY, name TEXT, description TEXT, user_id TEXT, routine_type TEXT, pattern TEXT,
      start_date TEXT, created_at TEXT, updated_at TEXT, is_active INTEGER DEFAULT 0,
      is_synced INTEGER DEFAULT 0, is_deleted INTEGER DEFAULT 0
    );
    CREATE TABLE coach_draft_saves (
      revision TEXT PRIMARY KEY, draft_json TEXT NOT NULL, result_json TEXT NOT NULL
    );
    INSERT INTO workout_records VALUES ('history', 'a', 'Completed as planned');
  `)
  const workout = sql.prepare(
    'INSERT INTO workouts (id, title, notes, created_at, updated_at, workout_template) VALUES (?, ?, ?, ?, ?, ?)'
  )
  workout.run(
    'a',
    'Upper Day',
    'Original workout notes',
    initialTime,
    initialTime,
    JSON.stringify(template)
  )
  workout.run(
    'b',
    'Lower Day',
    null,
    initialTime,
    initialTime,
    JSON.stringify({ ...template, id: 'template-b' })
  )
  sql
    .prepare(
      `INSERT INTO routines (id, name, description, user_id, routine_type, pattern, start_date, created_at, updated_at, is_active)
     VALUES ('r', 'Weekly Plan', 'Routine notes', 'local', 'SEQUENTIAL', ?, '2026-11-01', ?, ?, 1)`
    )
    .run(JSON.stringify(pattern), initialTime, initialTime)
  db = {
    async getFirstAsync(query, ...params) {
      return sql.prepare(query).get(...params) ?? null
    },
    async getAllAsync(query, ...params) {
      return sql.prepare(query).all(...params)
    },
    async runAsync(query, ...params) {
      return sql.prepare(query).run(...params)
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
  repo = new CoachLibraryRepository(db)
  launchFacade.api.backendMode.mockReturnValue('device')
})

afterEach(() => sql.close())

async function review(change, kind = 'workout', revision = 'review') {
  const library = await repo.read()
  const saved =
    kind === 'workout' ? library.workouts.find(({ id }) => id === 'a') : library.routines[0]
  const target = {
    kind,
    id: saved.id,
    title: saved.title ?? saved.name,
    updatedAt: saved.updatedAt,
  }
  const summary = previewCoachLibraryEdit(target, change, library)
  return {
    revision,
    edit: { target, change, summary },
    scope: getProfileScope(),
    isAllowed: () => true,
  }
}

function savedWorkout() {
  const row = sql.prepare("SELECT * FROM workouts WHERE id = 'a'").get()
  return { ...row, template: JSON.parse(row.workout_template) }
}

test('saves set count without rewriting historical data or unrelated legacy template fields', async () => {
  const input = await review({ kind: 'set_count', position: 1, count: 3 })
  expect(input.edit.summary[0]).toContain('Legacy Squat')
  await Promise.all([repo.save(input), new CoachLibraryRepository(db).save(input)])
  const row = savedWorkout()
  expect(row).toMatchObject({
    id: 'a',
    title: 'Upper Day',
    notes: 'Original workout notes',
    created_at: initialTime,
    template: {
      id: template.id,
      createdAt: initialTime,
      updatedAt: row.updated_at,
      source: template.source,
      exercises: [
        {
          ...strength,
          reps: [10, 8, 8],
          weight: [0, 20, 20],
          coachPrescription: {
            ...strength.coachPrescription,
            sets: [...strength.coachPrescription.sets, strength.coachPrescription.sets[1]],
          },
        },
        cardio,
      ],
    },
  })
  expect(await repo.save(input)).toBeUndefined()
  expect(savedWorkout()).toEqual(row)
  expect(sql.prepare('SELECT * FROM workout_records').get()).toEqual({
    id: 'history',
    workout_id: 'a',
    notes: 'Completed as planned',
  })
  expect(sql.prepare('SELECT count(*) AS n FROM coach_draft_saves').get().n).toBe(1)
  await expect(
    repo.save({ ...input, edit: { ...input.edit, summary: ['Changed review'] } })
  ).rejects.toThrow('different content')
})

test.each([
  [{ kind: 'set_reps', position: 1, reps: 7 }, [{ ...strength, reps: [7, 7] }, cardio]],
  [{ kind: 'set_weight', position: 1, kilograms: 0 }, [{ ...strength, weight: [0, 0] }, cardio]],
  [
    { kind: 'set_duration', position: 2, seconds: 45 },
    [strength, { ...cardio, durationSeconds: [45] }],
  ],
  [{ kind: 'remove_exercise', position: 1 }, [cardio]],
  [{ kind: 'move_exercise', position: 1, toPosition: 2 }, [cardio, strength]],
  [
    { kind: 'add_exercise', catalogId: catalogStrength.id, sets: exerciseSets },
    [strength, cardio, { exerciseId: catalogStrength.id, reps: [12], weight: [0] }],
  ],
  [
    { kind: 'replace_exercise', position: 1, catalogId: catalogStrength.id, sets: exerciseSets },
    [{ exerciseId: catalogStrength.id, reps: [12], weight: [0] }, cardio],
  ],
])('persists workout change %j', async (change, expected) => {
  await repo.save(await review(change))
  const values = savedWorkout().template.exercises
  expect(values).toHaveLength(expected.length)
  for (const [index, exercise] of expected.entries()) {
    const { coachPrescription, ...fields } = exercise
    expect(values[index]).toMatchObject(fields)
  }
})

test('updates an exercise plan estimate and preserves its preparation and guidance', async () => {
  const preparation = [{ kind: 'warmup', description: 'Walk', durationSeconds: 60 }]
  const coachSchedule = { preparation, estimatedSeconds: 474, transitionSeconds: 30 }
  sql
    .prepare("UPDATE workouts SET workout_template = ? WHERE id = 'a'")
    .run(JSON.stringify({ ...template, coachSchedule }))
  await repo.save(await review({ kind: 'remove_exercise', position: 2 }))
  const updated = savedWorkout().template
  expect(updated.coachSchedule).toEqual({
    preparation,
    estimatedSeconds: 324,
    transitionSeconds: 0,
  })
  expect(updated.exercises).toEqual([strength])
})

test.each([
  [{ kind: 'insert_rest', position: 2 }, ['a', null, null, 'b']],
  [{ kind: 'insert_workout', position: 4, workoutId: 'a' }, ['a', null, 'b', 'a']],
  [{ kind: 'remove_day', position: 3 }, ['a', null]],
  [{ kind: 'move_day', position: 1, toPosition: 3 }, [null, 'b', 'a']],
  [{ kind: 'replace_day_workout', position: 2, workoutId: 'b' }, ['a', 'b', 'b']],
])('persists routine change %j while retaining the active routine', async (change, ids) => {
  expect((await repo.read()).activeRoutineId).toBe('r')
  await repo.save(await review(change, 'routine'))
  const row = sql.prepare('SELECT * FROM routines').get()
  expect(row).toMatchObject({
    id: 'r',
    name: 'Weekly Plan',
    description: 'Routine notes',
    user_id: 'local',
    start_date: '2026-11-01',
    routine_type: 'SEQUENTIAL',
    is_active: 1,
    created_at: initialTime,
  })
  const days = JSON.parse(row.pattern)
  expect(days.map((day) => day.workoutId)).toEqual(ids)
  expect(days.map((day) => day.dayIndex)).toEqual(ids.map((_id, index) => index + 1))
  expect(days.find((day) => day.source === 'schedule')).toMatchObject({ source: 'schedule' })
})

test('renames in place with empty legacy update time and preserves the original template bytes', async () => {
  sql.exec(
    "UPDATE workouts SET created_at = NULL, updated_at = NULL WHERE id = 'a'; UPDATE routines SET updated_at = NULL"
  )
  await repo.save(
    await review({ kind: 'rename', title: 'Morning Plan' }, 'routine', 'routine-rename')
  )
  await repo.save(await review({ kind: 'rename', title: 'Morning Lift' }))
  expect(savedWorkout()).toMatchObject({
    title: 'Morning Lift',
    workout_template: JSON.stringify(template),
  })
  expect(sql.prepare('SELECT name, pattern FROM routines').get()).toEqual({
    name: 'Morning Plan',
    pattern: JSON.stringify(pattern),
  })
})

test('rejects unsupported, invalid, and no-op previews', async () => {
  const unreviewed = exerciseCatalog.find((exercise) => exercise.setupReviewStatus === 'unknown')
  const workouts = [
    { kind: 'rename', title: 'Upper Day' },
    { kind: 'move_exercise', position: 2, toPosition: 2 },
    { kind: 'set_reps', position: 2, reps: 8 },
    { kind: 'set_duration', position: 1, seconds: 45 },
    { kind: 'set_weight', position: 1, kilograms: -5 },
    { kind: 'set_count', position: 0, count: 2 },
    { kind: 'move_exercise', position: 1, toPosition: 4 },
    { kind: 'insert_rest', position: 1 },
    { kind: 'add_exercise', catalogId: unreviewed.id, sets: exerciseSets },
    {
      kind: 'add_exercise',
      catalogId: catalogStrength.id,
      sets: [{ kind: 'timed', durationSeconds: 30 }, ...exerciseSets],
    },
    {
      kind: 'add_exercise',
      catalogId: catalogStrength.id,
      sets: [{ ...exerciseSets[0], load: { kind: 'user_selected' } }],
    },
  ]
  for (const change of workouts) await expect(review(change)).rejects.toThrow()
  await expect(review({ kind: 'remove_day', position: 4 }, 'routine')).rejects.toThrow()
  await expect(
    review({ kind: 'replace_day_workout', position: 2, workoutId: 'history' }, 'routine')
  ).rejects.toThrow()
  await expect(
    review({ kind: 'replace_day_workout', position: 1, workoutId: 'a' }, 'routine')
  ).rejects.toThrow()
  sql.exec("UPDATE routines SET routine_type = 'WEEKLY_COMPLETION'")
  await expect(review({ kind: 'insert_rest', position: 1 }, 'routine')).rejects.toThrow()
  expect(sql.prepare('SELECT count(*) AS n FROM coach_draft_saves').get().n).toBe(0)
})

test('rejects stale targets after competing saves, workout deletion and reference rewrites', async () => {
  const oldWorkout = await review({ kind: 'set_reps', position: 1, reps: 9 }, 'workout', 'stale')
  const oldRoutine = await review({ kind: 'rename', title: 'Renamed Routine' }, 'routine')
  const competing = await review({ kind: 'set_reps', position: 1, reps: 6 }, 'workout', 'competing')
  const results = await Promise.allSettled([repo.save(competing), repo.save(oldWorkout)])
  expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'rejected'])
  expect(results[1].reason.message).toContain('changed or was deleted')
  const deleted = await review({ kind: 'rename', title: 'Renamed Workout' }, 'workout', 'deleted')
  await new WorkoutRepository(db).delete('a')
  await expect(repo.save(deleted)).rejects.toThrow('changed or was deleted')
  await expect(repo.save(oldRoutine)).rejects.toThrow('changed or was deleted')
  expect(savedWorkout().template.exercises[0].reps).toEqual([6, 6])
})

test('rolls back the write if the profile changes before the revision is recorded', async () => {
  const input = await review({ kind: 'rename', title: 'Changed' })
  const runAsync = db.runAsync
  let allowed = true
  db.runAsync = async (query, ...params) => {
    const result = await runAsync(query, ...params)
    if (query.startsWith('UPDATE workouts')) allowed = false
    return result
  }
  await expect(repo.save({ ...input, isAllowed: () => allowed })).rejects.toThrow('Profile changed')
  expect(savedWorkout().title).toBe('Upper Day')
  expect(sql.prepare('SELECT count(*) AS n FROM coach_draft_saves').get().n).toBe(0)
  db.runAsync = runAsync
  await repo.save(input)
  expect(savedWorkout().title).toBe('Changed')
})

test('checks the routine pattern again in the update statement', async () => {
  const input = await review({ kind: 'move_day', position: 1, toPosition: 3 }, 'routine')
  const runAsync = db.runAsync
  db.runAsync = async (query, ...params) => {
    if (query.startsWith('UPDATE routines')) sql.exec("UPDATE routines SET pattern = '[]'")
    return await runAsync(query, ...params)
  }
  await expect(repo.save(input)).rejects.toThrow('changed or was deleted')
  expect(JSON.parse(sql.prepare('SELECT pattern FROM routines').get().pattern)).toEqual(pattern)
  expect(sql.prepare('SELECT count(*) AS n FROM coach_draft_saves').get().n).toBe(0)
})

test('remote mode rejects saves before the first write', async () => {
  launchFacade.api.backendMode.mockReturnValue('remote')
  await expect(repo.save(await review({ kind: 'rename', title: 'Changed' }))).rejects.toThrow(
    'device mode'
  )
  expect(savedWorkout().title).toBe('Upper Day')
})
