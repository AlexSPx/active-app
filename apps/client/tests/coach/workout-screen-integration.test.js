jest.mock('lucide-react-native', () => new Proxy({}, { get: (_, name) => name }))
jest.mock('uniwind', () => ({ useUniwind: () => ({ theme: 'light' }) }))
jest.mock('../../stores/authStore', () => { const state = { isProfileTransitioning: false, isDeviceDataErasing: false }; const useAuthStore = selector => selector(state); useAuthStore.getState = () => state; useAuthStore.subscribe = () => () => {}; return { useAuthStore } })
jest.mock('../../lib/sync', () => ({ syncEngine: { resolveId: (_, id) => id, withIdRemapLock: fn => fn(), enqueue: async () => {}, scheduleQueueProcessing: () => {} } }))
jest.mock('../../lib/db/connection', () => ({ getDatabase: async () => mockDb }))
jest.mock('../../lib/db/ProfileSQLiteProvider', () => ({ useProfileDatabase: () => mockDb, useProfileDatabaseCleanup: () => {} }))
jest.mock('../../utils/haptics', () => ({ haptics: { success: () => {} } }))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../../features/coach/runtime/modelFiles', () => ({ getVerifiedModel: async () => ({ kind: 'ready', artifact: {} }) }))
jest.mock('../../features/coach/runtime/llamaRuntime', () => ({ llamaCoachRuntime: { load: async () => ({ kind: 'ready', session: { appendSystemMessage: async () => {}, appendUserMessage: async () => {}, generate: async () => ({ kind: 'final', content: mockOutputs.shift() }), cancel: () => {}, dispose: async () => {} } }) } }))
jest.mock('expo-router', () => ({ useRouter: () => ({ back: () => {} }) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: async () => {} }) }))
const React = require('react')
const { act, create } = require('react-test-renderer')
const { DatabaseSync } = require('node:sqlite')
const { useRunningWorkoutStore } = require('../../features/workout-session/stores/runningWorkoutStore')
const { WorkoutRepository } = require('../../lib/repositories/WorkoutRepository')
const { CoachConversationRepository } = require('../../features/coach/conversations')
const { CoachScreen } = require('../../features/coach/components/CoachScreen')
let mockDb, mockOutputs
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)) }

async function sendMessage(tree, message) {
  await act(async () => {
    tree.root.findByProps({ accessibilityLabel: 'Message Coach' }).props.onChangeText(message)
  })
  await act(async () => {
    tree.root.findByProps({ accessibilityLabel: 'Send message' }).props.onPress()
    await flush()
  })
}

test('running correction persists and replacement changes rendered coach metrics while preserving prior reply', async () => {
  const sql = new DatabaseSync(':memory:')
  sql.exec(`CREATE TABLE workouts(id TEXT PRIMARY KEY,title TEXT,notes TEXT,created_at TEXT,updated_at TEXT,workout_template TEXT,is_synced INTEGER,is_deleted INTEGER DEFAULT 0,server_version INTEGER,synced_at TEXT); CREATE TABLE workout_records(id TEXT PRIMARY KEY,workout_id TEXT,workout_title TEXT,notes TEXT,created_at TEXT,start_time TEXT,exercise_records TEXT,is_synced INTEGER,is_deleted INTEGER DEFAULT 0,synced_at TEXT); CREATE TABLE coach_conversations(id TEXT PRIMARY KEY,updated_at TEXT,items_json TEXT);`)
  mockDb = { getFirstAsync: async (q, ...p) => sql.prepare(q).get(...p) ?? null, getAllAsync: async (q, ...p) => sql.prepare(q).all(...p), runAsync: async (q, ...p) => sql.prepare(q).run(...p), withTransactionAsync: async fn => { sql.exec('BEGIN'); try { await fn(); sql.exec('COMMIT') } catch (e) { sql.exec('ROLLBACK'); throw e } } }
  sql.prepare('INSERT INTO workouts(id,title,created_at,workout_template,is_deleted) VALUES(?,?,?,?,0)').run('w', 'Test', new Date().toISOString(), JSON.stringify({ exercises: [{ exerciseId: 'pull', exerciseTitle: 'Pull-ups' }] }))
  const store = useRunningWorkoutStore
  async function record(weight) {
    store.getState().startWorkout({ id: 'w', name: 'Test', exercises: [{ id: 'pull', sessionId: 's', sets: 1, reps: 8, category: 'STRENGTH' }] })
    store.getState().updateExerciseSet('s', 's-set-1', 7, 55)
    store.getState().completeSet('s', 's-set-1')
    store.getState().updateExerciseSet('s', 's-set-1', 8, weight)
    return store.getState().stopWorkout()
  }
  let tree
  try {
    const first = await record(0)
    mockOutputs = []
    await act(async () => { tree = create(React.createElement(CoachScreen)); await flush() })
    async function ask() {
      mockOutputs.push({ intent: 'history_question' }, { type: 'latest', exercise: 'Pull-ups', days: 30 })
      await sendMessage(tree, 'What were my latest Pull-ups sets in the last 30 days?')
    }
    await ask()
    expect(JSON.stringify(tree.toJSON())).toContain('0 kg, 8 reps')
    await new WorkoutRepository(mockDb).deleteRecord(first.workoutRecord.id)
    await record(25)
    await ask()
    const rendered = JSON.stringify(tree.toJSON())
    expect(rendered).toContain('0 kg, 8 reps')
    expect(rendered).toContain('25 kg, 8 reps')
    await act(async () => { await flush() })
    const id = sql.prepare('SELECT id FROM coach_conversations').get().id
    const loaded = await new CoachConversationRepository(mockDb).load(id)
    const replies = loaded.filter(item => item.kind === 'response')
    expect([...replies[0].details.metrics.values()].join(' ')).toContain('0 kg, 8 reps')
    expect([...replies[1].details.metrics.values()].join(' ')).toContain('25 kg, 8 reps')
  } finally { if (tree) await act(async () => tree.unmount()); store.getState().reset(); sql.close() }
})

test('Coach updates a saved workout only after confirmation', async () => {
  const sql = new DatabaseSync(':memory:')
  sql.exec(`
    CREATE TABLE workouts(id TEXT PRIMARY KEY, title TEXT, notes TEXT, created_at TEXT, updated_at TEXT, workout_template TEXT, is_synced INTEGER, is_deleted INTEGER DEFAULT 0, server_version INTEGER, synced_at TEXT);
    CREATE TABLE routines(id TEXT PRIMARY KEY, name TEXT, description TEXT, user_id TEXT, routine_type TEXT, pattern TEXT, start_date TEXT, created_at TEXT, updated_at TEXT, is_active INTEGER, is_synced INTEGER, is_deleted INTEGER DEFAULT 0, server_version INTEGER, synced_at TEXT);
    CREATE TABLE coach_conversations(id TEXT PRIMARY KEY, updated_at TEXT, items_json TEXT);
    CREATE TABLE coach_draft_saves(revision TEXT PRIMARY KEY, draft_json TEXT NOT NULL, result_json TEXT NOT NULL);
  `)
  mockDb = {
    getFirstAsync: async (query, ...params) => sql.prepare(query).get(...params) ?? null,
    getAllAsync: async (query, ...params) => sql.prepare(query).all(...params),
    runAsync: async (query, ...params) => sql.prepare(query).run(...params),
    withTransactionAsync: async (run) => {
      sql.exec('BEGIN')
      try {
        await run()
        sql.exec('COMMIT')
      } catch (error) {
        sql.exec('ROLLBACK')
        throw error
      }
    },
  }
  const now = '2026-11-23T12:00:00.000Z'
  const template = {
    id: 'w',
    createdAt: now,
    updatedAt: now,
    exercises: [
      {
        exerciseId: 'exercise',
        exerciseTitle: 'Push-Up',
        category: 'STRENGTH',
        reps: [8],
        weight: [0],
      },
    ],
  }
  sql
    .prepare(
      'INSERT INTO workouts(id, title, created_at, updated_at, workout_template) VALUES (?, ?, ?, ?, ?)'
    )
    .run('w', 'Core A', now, now, JSON.stringify(template))
  let tree
  try {
    mockOutputs = []
    await act(async () => {
      tree = create(React.createElement(CoachScreen))
      await flush()
    })
    const readWorkouts = sql.prepare('SELECT id, title FROM workouts')
    await sendMessage(tree, 'Rename workout "Core A" to "Core Focus"')
    expect(readWorkouts.all()).toEqual([{ id: 'w', title: 'Core A' }])
    const update = tree.root
      .findAllByProps({ accessibilityLabel: 'Update workout' })
      .find((node) => typeof node.props.onPress === 'function')
    await act(async () => {
      update.props.onPress()
      await flush()
    })
    expect(readWorkouts.all()).toEqual([{ id: 'w', title: 'Core Focus' }])

    const repository = new CoachConversationRepository(mockDb)
    const [summary] = await repository.list()
    expect(summary).toMatchObject({ artifact: 'workout', isEdit: true, saved: true })
    await repository.delete(summary.id)
    expect(sql.prepare('SELECT count(*) AS count FROM coach_draft_saves').get().count).toBe(0)
    expect(readWorkouts.all()).toEqual([{ id: 'w', title: 'Core Focus' }])
  } finally {
    if (tree) await act(async () => tree.unmount())
    sql.close()
  }
})
