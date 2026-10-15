const fs = require('fs')
const os = require('os')
const path = require('path')

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}))
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}))
jest.mock('../../services/apiService', () => ({ apiService: {} }))

const { SqliteDb } = require('../helpers/sqliteDb')
const { WorkoutRepository } = require('../../lib/repositories/WorkoutRepository')
const { RoutineRepository } = require('../../lib/repositories/RoutineRepository')
const { SyncEngine } = require('../../lib/sync/SyncEngine')

const schema = `
CREATE TABLE sync_queue (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  payload TEXT,
  request_payload TEXT,
  local_table TEXT,
  local_id TEXT,
  idempotency_key TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  error_code TEXT,
  next_attempt_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE workouts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  created_at DATETIME,
  updated_at DATETIME,
  workout_template TEXT,
  is_synced INTEGER DEFAULT 0,
  synced_at DATETIME,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  server_version INTEGER
);
CREATE TABLE workout_records (
  id TEXT PRIMARY KEY,
  workout_id TEXT,
  workout_title TEXT NOT NULL,
  notes TEXT,
  created_at DATETIME,
  start_time DATETIME,
  exercise_records TEXT,
  is_synced INTEGER DEFAULT 0,
  synced_at DATETIME,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE routines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  user_id TEXT,
  routine_type TEXT DEFAULT 'SEQUENTIAL',
  pattern TEXT,
  start_date DATETIME,
  created_at DATETIME,
  updated_at DATETIME,
  is_active INTEGER DEFAULT 0,
  is_synced INTEGER DEFAULT 0,
  synced_at DATETIME,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  server_version INTEGER
);
CREATE TABLE id_remaps (
  table_name TEXT NOT NULL,
  old_id TEXT NOT NULL,
  new_id TEXT NOT NULL,
  PRIMARY KEY (table_name, old_id)
);
`

function createEngine(api, getNetworkState) {
  return new SyncEngine({
    api,
    getNetworkState,
    addAppStateListener: jest.fn(() => ({ remove: jest.fn() })),
    addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  })
}

describe('native local-only policy', () => {
  let directory
  let databasePath
  let db

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ale90-local-saves-'))
    databasePath = path.join(directory, 'profile.db')
    db = new SqliteDb(databasePath)
    await db.execAsync(schema)
  })

  afterEach(async () => {
    await db?.closeAsync()
    fs.rmSync(directory, { recursive: true, force: true })
  })

  test('keeps existing queue rows inert through startup, recovery and retry entry points', async () => {
    await db.runAsync(
      `INSERT INTO sync_queue (id, endpoint, method, payload, status, retry_count, next_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'old-pending',
      'deleteWorkout',
      'API',
      JSON.stringify(['workout-pending']),
      'pending',
      2,
      0
    )
    await db.runAsync(
      `INSERT INTO sync_queue (id, endpoint, method, payload, status, retry_count, next_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'old-processing',
      'deleteWorkout',
      'API',
      JSON.stringify(['workout-processing']),
      'processing',
      1,
      0
    )
    const api = { deleteWorkout: jest.fn() }
    const getNetworkState = jest.fn(async () => ({ isConnected: true, isInternetReachable: true }))
    const engine = createEngine(api, getNetworkState)

    try {
      await engine.init(db)
      engine.setUploadsEnabled(true)
      engine.scheduleQueueProcessing()
      await engine.processQueue()
      await engine.enqueue({ apiMethod: 'deleteWorkout', payload: ['new-local-delete'] }, db)
      await expect(engine.retryJob('old-pending')).rejects.toThrow(
        'Sync is disabled by the native launch policy.'
      )
      await expect(engine.discardJob('old-pending')).rejects.toThrow(
        'Sync is disabled by the native launch policy.'
      )

      const rows = await db.getAllAsync(
        'SELECT id, status, retry_count, payload FROM sync_queue ORDER BY sequence'
      )
      expect(rows).toEqual([
        {
          id: 'old-pending',
          status: 'pending',
          retry_count: 2,
          payload: '["workout-pending"]',
        },
        {
          id: 'old-processing',
          status: 'processing',
          retry_count: 1,
          payload: '["workout-processing"]',
        },
      ])
      expect(api.deleteWorkout).not.toHaveBeenCalled()
      expect(getNetworkState).not.toHaveBeenCalled()
    } finally {
      engine.destroy()
    }
  })

  test('commits local workout, record and routine changes across database reopen without queue growth', async () => {
    await db.runAsync(
      `INSERT INTO sync_queue (id, endpoint, method, payload, status, retry_count, next_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'old-pending',
      'deleteWorkout',
      'API',
      JSON.stringify(['workout-pending']),
      'pending',
      2,
      0
    )

    const workouts = new WorkoutRepository(db)
    const routines = new RoutineRepository(db)
    const deletedWorkout = await workouts.create(
      { title: 'Temporary', template: { exercises: [] } },
      []
    )
    await workouts.update(deletedWorkout.id, { title: 'Edited temporary' }, [])
    await workouts.delete(deletedWorkout.id)

    const completedWorkout = await workouts.create(
      { title: 'Completed', template: { exercises: [] } },
      []
    )
    await workouts.update(completedWorkout.id, { title: 'Edited completed' }, [])
    const completed = await workouts.recordWorkout(
      { workoutId: completedWorkout.id, exerciseRecords: [], notes: 'Local finish' },
      'Edited completed'
    )

    const deletedRoutine = await routines.create({ name: 'Temporary routine', pattern: [] })
    await routines.delete(deletedRoutine.id)
    const savedRoutine = await routines.create({ name: 'Saved routine', pattern: [] })
    await routines.update(savedRoutine.id, { name: 'Edited routine', active: true })

    await db.closeAsync()
    db = new SqliteDb(databasePath)
    const reopenedWorkouts = new WorkoutRepository(db)
    const reopenedRoutines = new RoutineRepository(db)

    await expect(reopenedWorkouts.getById(deletedWorkout.id)).resolves.toBeNull()
    await expect(reopenedWorkouts.getById(completedWorkout.id)).resolves.toMatchObject({
      title: 'Edited completed',
    })
    await expect(reopenedWorkouts.getAllRecords()).resolves.toMatchObject([
      {
        id: completed.workoutRecord.id,
        workoutId: completedWorkout.id,
        workoutTitle: 'Edited completed',
        notes: 'Local finish',
      },
    ])
    await expect(reopenedRoutines.getActive()).resolves.toMatchObject({
      id: savedRoutine.id,
      name: 'Edited routine',
    })

    const queue = await db.getAllAsync('SELECT id, status, retry_count FROM sync_queue')
    expect(queue).toEqual([{ id: 'old-pending', status: 'pending', retry_count: 2 }])
    const localWorkout = await db.getFirstAsync(
      'SELECT is_synced FROM workouts WHERE id = ?',
      completedWorkout.id
    )
    const localRecord = await db.getFirstAsync(
      'SELECT is_synced FROM workout_records WHERE id = ?',
      completed.workoutRecord.id
    )
    const localRoutine = await db.getFirstAsync(
      'SELECT is_synced FROM routines WHERE id = ?',
      savedRoutine.id
    )
    expect(localWorkout.is_synced).toBe(0)
    expect(localRecord.is_synced).toBe(0)
    expect(localRoutine.is_synced).toBe(0)
    const tombstones = await db.getAllAsync(
      'SELECT id, is_deleted FROM workouts WHERE id = ?',
      deletedWorkout.id
    )
    expect(tombstones).toEqual([{ id: deletedWorkout.id, is_deleted: 1 }])
  })
})
