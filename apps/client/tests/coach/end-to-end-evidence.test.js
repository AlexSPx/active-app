jest.mock('../../lib/sync', () => ({ syncEngine: { resolveId: (_, id) => id, withIdRemapLock: fn => fn(), enqueue: async () => {}, scheduleQueueProcessing: () => {} } }))
const { DatabaseSync } = require('node:sqlite')
const { WorkoutRepository } = require('../../lib/repositories/WorkoutRepository')
const { CoachReadRepository } = require('../../lib/repositories/CoachReadRepository')
const { createCoachTools } = require('../../features/coach/tools/createCoachTools')
const { getProfileScope } = require('../../lib/profileScope')
const { runConstrainedCoachTurn, applyWorkoutFollowUp } = require('../../features/coach/constrainedTurn')
function database() {
  const sql = new DatabaseSync(':memory:')
  sql.exec(`CREATE TABLE workouts(id TEXT PRIMARY KEY,title TEXT,notes TEXT,created_at TEXT,updated_at TEXT,workout_template TEXT,is_synced INTEGER,is_deleted INTEGER DEFAULT 0,server_version INTEGER,synced_at TEXT); CREATE TABLE workout_records(id TEXT PRIMARY KEY,workout_id TEXT,workout_title TEXT,notes TEXT,created_at TEXT,start_time TEXT,exercise_records TEXT,is_synced INTEGER,is_deleted INTEGER DEFAULT 0,synced_at TEXT);`)
  return { sql, getFirstAsync: async (q, ...p) => sql.prepare(q).get(...p) ?? null, getAllAsync: async (q, ...p) => sql.prepare(q).all(...p), runAsync: async (q, ...p) => sql.prepare(q).run(...p), withTransactionAsync: async fn => { sql.exec('BEGIN'); try { await fn(); sql.exec('COMMIT') } catch (e) { sql.exec('ROLLBACK'); throw e } } }
}
async function turn(message, execute, outputs) {
  return runConstrainedCoachTurn({ message, execute, signal: new AbortController().signal, isCurrentProfile: () => true, maxOutputTokens: 500, session: { appendUserMessage: async () => {}, generate: async () => ({ kind: 'final', content: outputs.shift() }) } })
}
test('ISO clarification resolves named exercise and interval against persisted SQLite records', async () => {
  const db = database()
  try {
    const now = Date.now(), ago = n => new Date(now - n * 86400000).toISOString()
    db.sql.prepare('INSERT INTO workouts(id,title,created_at,workout_template,is_deleted) VALUES(?,?,?,?,0)').run('w', 'Test', ago(1), JSON.stringify({ exercises: [{ exerciseId: 'pull', exerciseTitle: 'Pull-ups' }, { exerciseId: 'push', exerciseTitle: 'Pushups' }] }))
    const workouts = new WorkoutRepository(db)
    const save = (days, exerciseId, weight) => workouts.recordWorkout({ workoutId: 'w', startTime: ago(days), exerciseRecords: [{ exerciseId, reps: [8], weight: [weight] }] }, 'Test')
    const included = await save(2, 'pull', 12)
    await save(40, 'pull', 99)
    await save(1, 'push', 88)
    const execute = createCoachTools(db, getProfileScope(), new AbortController().signal)
    const original = 'What was my latest Pull-ups load in 2024-01-01?'
    const first = await turn(original, execute, [{ intent: 'history_question' }])
    expect(first.response.kind).toBe('clarification')
    const message = applyWorkoutFollowUp('30 days', [{ kind: 'user', text: original }, { kind: 'response', response: first.response, request: original }])
    const calls = []
    const result = await turn(message, async (...args) => { calls.push(args[0]); return execute(...args) }, [{ intent: 'history_question' }, { type: 'latest', exercise: 'Pull-ups', days: 30 }])
    expect(result.metrics[0].value).toEqual([expect.objectContaining({ recordId: included.workoutRecord.id, weightKg: 12, repetitions: 8 })])
    const scoped = calls.find(call => call.name === 'readRecords' && call.arguments.exerciseId)
    expect(scoped.arguments.exerciseId).toBe('pull')
    expect(Date.parse(scoped.arguments.interval.end) - Date.parse(scoped.arguments.interval.start)).toBe(30 * 86400000)
    const actual = await new CoachReadRepository(db).readRecords(scoped.arguments)
    expect(actual.data.items.map(item => item.id)).toEqual([included.workoutRecord.id])
    expect(result.response.blocks.some(block => block.kind === 'metric')).toBe(true)
  } finally { db.sql.close() }
})
