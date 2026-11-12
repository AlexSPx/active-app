// Disposable proof launched by the Rust integration test against fresh SQLite files.
const assert = require('node:assert/strict')
const ts = require('typescript')
const fs = require('node:fs')
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        resolveJsonModule: true,
      },
    }).outputText,
    filename
  )
}
const { SqliteDb } = require('../helpers/sqliteDb')
const { createClient } = require('../../../../packages/api-client/src/index.ts')
const {
  captureFirstWorkout,
  prepareFirstWorkout,
  readFirstWorkout,
  freezeWorkoutRequest,
  acknowledgeFirstWorkout,
} = require('../../features/selfHosted/firstWorkout.ts')
const [phase, path, base] = process.argv.slice(2)
const call = createClient(base, { kind: 'bearer', token: process.env.ACTIVE_PROOF_TOKEN })
const scope = { instanceId: 'proof-instance', accountId: 'proof-account' }
const profile = {
  firstName: 'Proof',
  lastName: 'User',
  timezone: 'UTC',
  measurements: null,
  registrationCompleted: true,
}
const preferences = { enabled: false, schedule: [], timezone: 'UTC' }
async function main() {
  let db = new SqliteDb(path)
  if (phase === 'prepare') {
    await db.execAsync(
      "CREATE TABLE workouts (id TEXT PRIMARY KEY, title TEXT, notes TEXT, workout_template TEXT, created_at TEXT, is_deleted INTEGER); CREATE TABLE workout_records (id TEXT PRIMARY KEY); INSERT INTO workout_records VALUES ('history');"
    )
    const catalog = await call('catalog.get', { path: {}, query: {}, body: null })
    const item = catalog.items[0]
    await db.runAsync(
      'INSERT INTO workouts VALUES (?, ?, ?, ?, ?, ?)',
      'local-workout',
      'Proof workout',
      null,
      JSON.stringify({
        exercises: [
          {
            exerciseId: `local:exercise:${item.sourceKey}`,
            reps: [5],
            weight: [30],
            durationSeconds: [],
          },
        ],
      }),
      '2026-01-01',
      0
    )
    const snapshot = await captureFirstWorkout(db, { id: 'local:device' }, profile, preferences)
    await prepareFirstWorkout(db, scope, snapshot, 'proof-import', 'proof-operation')
    const row = await readFirstWorkout(db, scope)
    const body = await freezeWorkoutRequest(db, scope, row, catalog)
    assert.equal(body.template.exercises[0].exerciseId, item.id)
    await db.closeAsync()
    return
  }
  if (phase === 'send') {
    const row = await readFirstWorkout(db, scope)
    const body = await freezeWorkoutRequest(db, scope, row, null)
    const loseResponse = createClient(
      base,
      { kind: 'bearer', token: process.env.ACTIVE_PROOF_TOKEN },
      async (...args) => {
        await fetch(...args)
        throw new Error('forced response loss after server commit')
      }
    )
    await assert.rejects(
      loseResponse('workout.create', {
        path: {},
        query: {},
        body,
        idempotencyKey: row.operation_key,
      }),
      /forced response loss/
    )
    await db.closeAsync()
    return
  }
  let row = await readFirstWorkout(db, scope)
  assert.equal(row.remote_id, null)
  const body = await freezeWorkoutRequest(db, scope, row, null)
  const result = await call('workout.create', {
    path: {},
    query: {},
    body,
    idempotencyKey: row.operation_key,
  })
  const run = db.runAsync.bind(db)
  db.runAsync = async (...args) => {
    await run(...args)
    if (args[0].startsWith('UPDATE first_workout_import SET remote_id'))
      throw new Error('interrupt acknowledgement')
  }
  await assert.rejects(acknowledgeFirstWorkout(db, scope, result))
  await db.closeAsync()
  db = new SqliteDb(path)
  row = await readFirstWorkout(db, scope)
  assert.equal(row.remote_id, null)
  const replay = await call('workout.create', {
    path: {},
    query: {},
    body,
    idempotencyKey: row.operation_key,
  })
  assert.deepEqual(replay, result)
  await acknowledgeFirstWorkout(db, scope, replay)
  const secondClient = createClient(base, { kind: 'bearer', token: process.env.ACTIVE_PROOF_TOKEN })
  const workouts = await secondClient('workout.list', { path: {}, query: {}, body: null })
  assert.equal(workouts.length, 1)
  assert.equal(workouts[0].id, result.id)
  assert.equal((await readFirstWorkout(db, scope)).remote_version, result.version)
  assert.deepEqual(await db.getFirstAsync('SELECT id FROM workout_records'), { id: 'history' })
  assert.deepEqual(await db.getFirstAsync('SELECT title FROM workouts'), { title: 'Proof workout' })
  await db.closeAsync()
  process.stdout.write('Client/SQLite/Rust replay and second-client read passed\n')
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
