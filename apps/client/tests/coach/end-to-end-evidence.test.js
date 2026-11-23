jest.mock('../../lib/sync', () => ({ syncEngine: { resolveId: (_, id) => id, withIdRemapLock: fn => fn(), enqueue: async () => {}, scheduleQueueProcessing: () => {} } }))
const { DatabaseSync } = require('node:sqlite')
const { WorkoutRepository } = require('../../lib/repositories/WorkoutRepository')
const { CoachHistoryRepository } = require('../../lib/repositories/CoachHistoryRepository')
const { runConstrainedCoachTurn, applyWorkoutFollowUp } = require('../../features/coach/constrainedTurn')
const { resolveHistoryExercise } = require('../../features/coach/historyQuery')
function database() {
  const sql = new DatabaseSync(':memory:')
  sql.exec(`CREATE TABLE workouts(id TEXT PRIMARY KEY,title TEXT,notes TEXT,created_at TEXT,updated_at TEXT,workout_template TEXT,is_synced INTEGER,is_deleted INTEGER DEFAULT 0,server_version INTEGER,synced_at TEXT); CREATE TABLE workout_records(id TEXT PRIMARY KEY,workout_id TEXT,workout_title TEXT,notes TEXT,created_at TEXT,start_time TEXT,exercise_records TEXT,is_synced INTEGER,is_deleted INTEGER DEFAULT 0,synced_at TEXT);`)
  return { sql, getFirstAsync: async (q, ...p) => sql.prepare(q).get(...p) ?? null, getAllAsync: jest.fn(async (q, ...p) => sql.prepare(q).all(...p)), runAsync: async (q, ...p) => sql.prepare(q).run(...p), withTransactionAsync: async fn => { sql.exec('BEGIN'); try { await fn(); sql.exec('COMMIT') } catch (e) { sql.exec('ROLLBACK'); throw e } } }
}
async function turn(message, readHistory, outputs) {
  return runConstrainedCoachTurn({ message, readHistory, signal: new AbortController().signal, isCurrentProfile: () => true, maxOutputTokens: 500, session: { appendUserMessage: async () => {}, generate: async () => ({ kind: 'final', content: outputs.shift() }) } })
}
test('ISO clarification resolves the exercise and interval with one SQLite read', async () => {
  const db = database()
  try {
    const now = Date.now(), ago = n => new Date(now - n * 86400000).toISOString()
    db.sql.prepare('INSERT INTO workouts(id,title,created_at,workout_template,is_deleted) VALUES(?,?,?,?,0)').run('w', 'Test', ago(1), JSON.stringify({ exercises: [{ exerciseId: 'pull', exerciseTitle: 'Pull-ups' }, { exerciseId: 'push', exerciseTitle: 'Pushups' }] }))
    const workouts = new WorkoutRepository(db)
    const save = (days, exerciseId, weight) => workouts.recordWorkout({ workoutId: 'w', startTime: ago(days), exerciseRecords: [{ exerciseId, reps: [8], weight: [weight] }] }, 'Test')
    const included = await save(2, 'pull', 12)
    await save(40, 'pull', 99)
    await save(1, 'push', 88)
    const insert = db.sql.prepare('INSERT INTO workout_records(id,created_at,exercise_records) VALUES(?,?,?)')
    const older = JSON.stringify([{ exerciseId: 'pull', exerciseName: 'Pull-ups', reps: [8], weight: [10] }])
    for (let i = 0; i < 51; i++) insert.run(`a-older-${i}`, ago(3), older)
    insert.run('broken', ago(1), '{broken')
    insert.run('unknown-exercise', ago(1), JSON.stringify([{ exerciseName: 'Pushups' }]))
    const repository = new CoachHistoryRepository(db)
    const readHistory = jest.fn(args => repository.readHistory(args))
    db.getAllAsync.mockClear()
    const original = 'What was my latest Pull-ups load in 2024-01-01?'
    const first = await turn(original, readHistory, [{ intent: 'history_question' }])
    expect(first.response).toMatchObject({
      kind: 'clarification',
      question: expect.stringMatching(/period.*dates/i),
    })
    expect(db.getAllAsync).not.toHaveBeenCalled()
    const message = applyWorkoutFollowUp('30 days', [{ kind: 'user', text: original }, { kind: 'response', response: first.response, request: original }])
    const result = await turn(message, readHistory, [{ intent: 'history_question' }, { type: 'latest', exercise: 'Pull-ups', days: 30 }])
    expect(db.getAllAsync).toHaveBeenCalledTimes(1)
    expect(db.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('FROM workout_records'))
    expect(result.metrics[0].value).toEqual([expect.objectContaining({ recordId: included.workoutRecord.id, weightKg: 12, repetitions: 8 })])
    expect(readHistory).toHaveBeenCalledTimes(1)
    const { interval } = readHistory.mock.calls[0][0]
    expect(Date.parse(interval.end) - Date.parse(interval.start)).toBe(30 * 86400000)
    expect(result.response.limitations).toEqual([
      expect.stringContaining('Local history may be incomplete'),
      expect.stringContaining('1 local record(s)'),
      expect.stringContaining('1 exercise entry/entries had no identity'),
    ])
    expect(result.response.blocks.some(block => block.kind === 'metric')).toBe(true)
  } finally { db.sql.close() }
})

test.each([
  ['a catalog alias', 'Forearm Plank', 'Plank', resolveHistoryExercise('Forearm Plank').exercise.id],
  ['a custom exercise name', 'Garage Row', 'Garage Row', 'custom-row-id'],
])('matches %s and follows the same ID across recorded names', async (_, name, recordedName, exerciseId) => {
  const db = database()
  try {
    const insert = db.sql.prepare('INSERT INTO workout_records(id,created_at,exercise_records) VALUES(?,?,?)')
    const date = new Date(Date.now() - 86400000).toISOString()
    insert.run('r1', date, JSON.stringify([{ exerciseId, exerciseName: recordedName }]))
    insert.run('r2', date, JSON.stringify([{ exerciseId, exerciseName: 'An old label' }]))
    const repository = new CoachHistoryRepository(db)
    const result = await turn(`How many ${name} sessions have I logged?`, args => repository.readHistory(args), [
      { intent: 'history_question' },
      { type: 'sessions', exercise: name, days: null },
    ])
    expect(result.metrics).toEqual([expect.objectContaining({ kind: 'completed_sessions', value: 2, evidenceIds: ['r1', 'r2'] })])
    expect(db.getAllAsync).toHaveBeenCalledTimes(1)
  } finally { db.sql.close() }
})

test.each([
  ['with a missing ID', 'Split Squat', 'Split Squat', [null]],
  ['with a blank ID', 'Split Squat', 'Split Squat', [' ']],
  ['with a missing ID alongside a known ID', 'Split Squat', 'Split Squat', [null, 'split']],
  ['shared by multiple IDs', 'Split Squat', 'Split Squat', ['split', 'custom-split']],
  ['with a missing ID for a catalog alias', 'Forearm Plank', 'Plank', [null]],
  ['with a custom ID for the catalog name', 'Forearm Plank', 'Plank', ['custom-plank']],
  ['with another catalog ID for the same label', 'Forearm Plank', 'Plank', [resolveHistoryExercise('Pull-ups').exercise.id]],
])('does not turn a recorded name %s into a presence or absence claim', async (_, name, recordedName, ids) => {
  const db = database()
  try {
    const insert = db.sql.prepare('INSERT INTO workout_records(id,created_at,exercise_records) VALUES(?,?,?)')
    const date = new Date(Date.now() - 86400000).toISOString()
    ids.forEach((exerciseId, i) => insert.run(`r${i}`, date, JSON.stringify([{ exerciseId, exerciseName: recordedName }])))
    const repository = new CoachHistoryRepository(db)
    const result = await turn(`Have I ever done ${name}?`, args => repository.readHistory(args), [
      { intent: 'history_question' },
      { type: 'presence', exercise: name, days: null },
    ])
    expect(result.response.blocks[0]).toMatchObject({ text: expect.stringMatching(/unresolved or ambiguous/i), evidence: [] })
    expect(db.getAllAsync).toHaveBeenCalledTimes(1)
  } finally { db.sql.close() }
})

test('bounds history by absolute start time, falls back to creation time and reports corrupt rows', async () => {
  const db = database()
  try {
    const interval = { start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z' }
    const insert = db.sql.prepare('INSERT INTO workout_records(id,created_at,start_time,exercise_records,is_deleted) VALUES(?,?,?,?,?)')
    insert.run('start', '2026-02-02T00:00:00Z', '2025-12-31T19:00:00-05:00', '[]', 0)
    insert.run('created', '2026-01-31T23:59:59Z', null, '[]', 0)
    insert.run('end', interval.end, interval.end, '{unreadable outside interval', 0)
    insert.run('deleted', interval.start, null, '[]', 1)
    insert.run('ambiguous-time', interval.start, '2026-01-01T00:00:00', '[]', 0)
    insert.run('unreadable', interval.start, null, '[{}]', 0)
    const result = await new CoachHistoryRepository(db).readHistory({ interval, exercise: null })
    expect(result).toEqual({
      kind: 'success',
      records: [
        { id: 'created', timestamp: Date.parse('2026-01-31T23:59:59Z'), exercises: [] },
        { id: 'start', timestamp: Date.parse(interval.start), exercises: [] },
      ],
      limitations: [expect.stringContaining('Local history may be incomplete'), expect.stringContaining('2 local record(s)')],
    })
  } finally { db.sql.close() }
})
