const { mkdtempSync, rmSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')
const { SqliteDb } = require('../helpers/sqliteDb')
const {
  captureFirstWorkout,
  prepareFirstWorkout,
  readFirstWorkout,
  freezeWorkoutRequest,
  acknowledgeFirstWorkout,
  seedAttachedProfile,
} = require('../../features/selfHosted/firstWorkout')
const { SOURCE_DATASET_VERSION } = require('../../lib/data/catalogIdentity')

const scope = { instanceId: 'server-a', accountId: 'account-a' }
const profile = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  timezone: 'UTC',
  measurements: null,
  registrationCompleted: true,
}
const preferences = { enabled: false, schedule: [], timezone: 'UTC' }
const catalog = {
  catalogVersion: 1,
  sourceDatasetVersion: SOURCE_DATASET_VERSION,
  mappingComplete: true,
  unresolvedSourceKeys: [],
  unresolvedLegacyIds: [],
  sourceMappings: [
    { datasetVersion: SOURCE_DATASET_VERSION, sourceKey: 'squat', exerciseId: 'server-exercise' },
  ],
  items: [{ id: 'server-exercise', sourceKey: 'squat', retired: false }],
}
let dir, db
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'first-workout-'))
  db = new SqliteDb(join(dir, 'source.sqlite'))
  await db.execAsync(`CREATE TABLE workouts (id TEXT PRIMARY KEY, title TEXT, notes TEXT, workout_template TEXT, created_at TEXT, is_deleted INTEGER);
    CREATE TABLE workout_records (id TEXT PRIMARY KEY); INSERT INTO workout_records VALUES ('history');`)
  await db.runAsync(
    'INSERT INTO workouts VALUES (?, ?, ?, ?, ?, ?)',
    'local-one',
    'Leg day',
    null,
    JSON.stringify({
      exercises: [
        { exerciseId: 'local:exercise:squat', reps: [5], weight: [50], durationSeconds: null },
      ],
    }),
    '2026-01-01',
    0
  )
})
afterEach(async () => {
  await db.closeAsync()
  rmSync(dir, { recursive: true, force: true })
})

test('freezes the source and operation key per account, and survives restart and acknowledgement rollback', async () => {
  const snapshot = await captureFirstWorkout(db, { id: 'local:device' }, profile, preferences)
  await prepareFirstWorkout(db, scope, snapshot, 'import-one', 'operation-one')
  await db.runAsync("UPDATE workouts SET title = 'Changed later'")
  await prepareFirstWorkout(
    db,
    scope,
    await captureFirstWorkout(db, { id: 'local:device' }, profile, preferences),
    'another',
    'another-key'
  )
  expect(await readFirstWorkout(db, { ...scope, accountId: 'another-account' })).toBeNull()
  let row = await readFirstWorkout(db, scope)
  expect(row).toMatchObject({
    import_id: 'import-one',
    operation_key: 'operation-one',
    request_payload: null,
  })
  expect(JSON.parse(row.snapshot).workout.title).toBe('Leg day')
  const request = await freezeWorkoutRequest(db, scope, row, catalog)
  expect(request.template.exercises[0].exerciseId).toBe('server-exercise')
  await db.closeAsync()
  db = new SqliteDb(join(dir, 'source.sqlite'))
  row = await readFirstWorkout(db, scope)
  expect(await freezeWorkoutRequest(db, scope, row, null)).toEqual(request)
  const originalRun = db.runAsync.bind(db)
  db.runAsync = async (...args) => {
    await originalRun(...args)
    if (args[0].startsWith('UPDATE first_workout_import SET remote_id'))
      throw new Error('interrupted acknowledgement')
  }
  await expect(acknowledgeFirstWorkout(db, scope, { id: 'remote', version: 1 })).rejects.toThrow(
    'interrupted'
  )
  db.runAsync = originalRun
  expect((await readFirstWorkout(db, scope)).remote_id).toBeNull()
  await acknowledgeFirstWorkout(db, scope, { id: 'remote', version: 1 })
  expect(await readFirstWorkout(db, scope)).toMatchObject({
    remote_id: 'remote',
    remote_version: 1,
    operation_key: 'operation-one',
  })
  expect(await db.getFirstAsync('SELECT title FROM workouts')).toEqual({ title: 'Changed later' })
  expect(await db.getFirstAsync('SELECT id FROM workout_records')).toEqual({ id: 'history' })
})

test('unresolved exercises do not freeze a request or alter source data', async () => {
  const snapshot = await captureFirstWorkout(db, { id: 'local:device' }, profile, preferences)
  await prepareFirstWorkout(db, scope, snapshot, 'import', 'key')
  await expect(
    freezeWorkoutRequest(db, scope, await readFirstWorkout(db, scope), {
      ...catalog,
      sourceMappings: [],
    })
  ).rejects.toThrow('could not be matched')
  expect((await readFirstWorkout(db, scope)).request_payload).toBeNull()
  expect(await db.getFirstAsync('SELECT title FROM workouts')).toEqual({ title: 'Leg day' })
})

test('seeds a new account profile without overwriting an existing one', async () => {
  const snapshot = await captureFirstWorkout(
    db,
    { id: 'local:device', firstName: 'Old' },
    profile,
    preferences
  )
  await seedAttachedProfile(db, 'selfhosted:server:account', snapshot)
  const first = JSON.parse((await db.getFirstAsync('SELECT user_json FROM user_profile')).user_json)
  expect(first).toMatchObject({
    id: 'selfhosted:server:account',
    firstName: 'Ada',
    activeRoutineId: null,
  })
  await seedAttachedProfile(db, 'selfhosted:server:account', {
    ...snapshot,
    profile: { ...profile, firstName: 'Other' },
  })
  expect(
    JSON.parse((await db.getFirstAsync('SELECT user_json FROM user_profile')).user_json)
  ).toEqual(first)
})
