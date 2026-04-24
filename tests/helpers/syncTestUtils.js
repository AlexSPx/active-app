function makeJob({
  id,
  endpoint,
  payload,
  status = 'pending',
  localTable = null,
  localId = null,
  retryCount = 0,
}) {
  return {
    id,
    endpoint,
    method: 'API',
    payload: JSON.stringify(payload),
    local_table: localTable,
    local_id: localId,
    idempotency_key: `${id}-key`,
    retry_count: retryCount,
    status,
    error_message: null,
  }
}

class FakeDb {
  constructor({ jobs = [], tables = {} } = {}) {
    this.jobs = jobs.map((job) => ({ ...job }))
    this.tables = {
      workouts: new Map(),
      workout_records: new Map(),
      routines: new Map(),
    }

    for (const [tableName, ids] of Object.entries(tables)) {
      for (const id of ids) {
        this.tables[tableName].set(id, { id, is_synced: 0, synced_at: null })
      }
    }
  }

  async execAsync() {}

  async getAllAsync(sql, ...params) {
    if (sql.includes('ORDER BY created_at ASC')) {
      const [pendingStatus, failedStatus] = params
      return this.jobs.filter(
        (job) => job.status === pendingStatus || job.status === failedStatus
      )
    }

    if (sql.includes('SELECT id, payload') && sql.includes('FROM sync_queue')) {
      const [pendingStatus, failedStatus, excludedId] = params
      return this.jobs
        .filter(
          (job) =>
            (job.status === pendingStatus || job.status === failedStatus) && job.id !== excludedId
        )
        .map((job) => ({
          id: job.id,
          payload: job.payload,
        }))
    }

    if (sql === 'SELECT * FROM workouts ORDER BY created_at DESC') {
      return Array.from(this.tables.workouts.values()).sort((a, b) =>
        String(b.created_at).localeCompare(String(a.created_at))
      )
    }

    if (sql === 'SELECT * FROM workout_records ORDER BY created_at DESC') {
      return Array.from(this.tables.workout_records.values()).sort((a, b) =>
        String(b.created_at).localeCompare(String(a.created_at))
      )
    }

    if (sql === 'SELECT * FROM routines ORDER BY created_at DESC') {
      return Array.from(this.tables.routines.values()).sort((a, b) =>
        String(b.created_at).localeCompare(String(a.created_at))
      )
    }

    throw new Error(`Unsupported getAllAsync SQL in test: ${sql}`)
  }

  async getFirstAsync(sql, ...params) {
    if (sql.includes('FROM sync_queue WHERE id = ?')) {
      return this.jobs.find((job) => job.id === params[0]) ?? null
    }

    if (sql === 'SELECT * FROM workouts WHERE id = ?') {
      return this.tables.workouts.get(params[0]) ?? null
    }

    if (sql === 'SELECT * FROM routines WHERE id = ?') {
      return this.tables.routines.get(params[0]) ?? null
    }

    if (sql === 'SELECT * FROM routines WHERE is_active = 1 LIMIT 1') {
      return (
        Array.from(this.tables.routines.values()).find((routine) => routine.is_active === 1) ?? null
      )
    }

    throw new Error(`Unsupported getFirstAsync SQL in test: ${sql}`)
  }

  async runAsync(sql, ...params) {
    if (
      sql.includes('INSERT INTO workouts') &&
      sql.includes('(id, title, notes, created_at, updated_at, workout_template, is_synced)')
    ) {
      const [id, title, notes, createdAt, updatedAt, workoutTemplate, isSynced] = params
      this.tables.workouts.set(id, {
        id,
        title,
        notes,
        created_at: createdAt,
        updated_at: updatedAt,
        workout_template: workoutTemplate,
        is_synced: isSynced,
        synced_at: null,
      })
      return
    }

    if (sql.startsWith('UPDATE workouts SET ') && sql.endsWith(' WHERE id = ?')) {
      const workoutId = params[params.length - 1]
      const row = this.tables.workouts.get(workoutId)
      if (!row) return

      const assignments = sql
        .replace('UPDATE workouts SET ', '')
        .replace(' WHERE id = ?', '')
        .split(', ')

      assignments.forEach((assignment, index) => {
        const column = assignment.split(' = ')[0]
        row[column] = params[index]
      })

      this.tables.workouts.set(workoutId, row)
      return
    }

    if (sql === 'DELETE FROM workouts WHERE id = ?') {
      this.tables.workouts.delete(params[0])
      return
    }

    if (
      sql.includes('INSERT INTO workout_records') &&
      sql.includes(
        '(id, workout_id, workout_title, notes, created_at, start_time, exercise_records, is_synced)'
      )
    ) {
      const [id, workoutId, workoutTitle, notes, createdAt, startTime, exerciseRecords, isSynced] =
        params
      this.tables.workout_records.set(id, {
        id,
        workout_id: workoutId,
        workout_title: workoutTitle,
        notes,
        created_at: createdAt,
        start_time: startTime,
        exercise_records: exerciseRecords,
        is_synced: isSynced,
        synced_at: null,
      })
      return
    }

    if (sql === 'DELETE FROM workout_records WHERE id = ?') {
      this.tables.workout_records.delete(params[0])
      return
    }

    if (
      sql.includes('INSERT INTO routines') &&
      sql.includes(
        '(id, name, description, routine_type, pattern, start_date, created_at, updated_at, is_active, is_synced)'
      )
    ) {
      const [id, name, description, routineType, pattern, startDate, createdAt, updatedAt, isActive, isSynced] =
        params
      this.tables.routines.set(id, {
        id,
        name,
        description,
        user_id: null,
        routine_type: routineType,
        pattern,
        start_date: startDate,
        created_at: createdAt,
        updated_at: updatedAt,
        is_active: isActive,
        is_synced: isSynced,
        synced_at: null,
      })
      return
    }

    if (sql === 'UPDATE routines SET is_active = 0') {
      for (const routine of this.tables.routines.values()) {
        routine.is_active = 0
      }
      return
    }

    if (sql.startsWith('UPDATE routines SET ') && sql.endsWith(' WHERE id = ?')) {
      const routineId = params[params.length - 1]
      const row = this.tables.routines.get(routineId)
      if (!row) return

      const assignments = sql
        .replace('UPDATE routines SET ', '')
        .replace(' WHERE id = ?', '')
        .split(', ')

      assignments.forEach((assignment, index) => {
        const column = assignment.split(' = ')[0]
        row[column] = params[index]
      })

      this.tables.routines.set(routineId, row)
      return
    }

    if (sql === 'DELETE FROM routines WHERE id = ?') {
      this.tables.routines.delete(params[0])
      return
    }

    if (sql === 'UPDATE sync_queue SET status = ? WHERE id = ?') {
      const [status, jobId] = params
      const job = this.jobs.find((entry) => entry.id === jobId)
      if (job) job.status = status
      return
    }

    if (sql === 'DELETE FROM sync_queue WHERE id = ?') {
      const [jobId] = params
      this.jobs = this.jobs.filter((entry) => entry.id !== jobId)
      return
    }

    if (sql === 'UPDATE sync_queue SET payload = ? WHERE id = ?') {
      const [payload, jobId] = params
      const job = this.jobs.find((entry) => entry.id === jobId)
      if (job) job.payload = payload
      return
    }

    if (
      sql ===
      'UPDATE sync_queue SET status = ?, retry_count = ?, error_message = ? WHERE id = ?'
    ) {
      const [status, retryCount, errorMessage, jobId] = params
      const job = this.jobs.find((entry) => entry.id === jobId)
      if (job) {
        job.status = status
        job.retry_count = retryCount
        job.error_message = errorMessage
      }
      return
    }

    const remapMatch = sql.match(/^UPDATE "([^"]+)" SET id = \? WHERE id = \?$/)
    if (remapMatch) {
      const [, tableName] = remapMatch
      const [newId, oldId] = params
      const table = this.tables[tableName]
      const row = table.get(oldId) ?? { id: oldId, is_synced: 0, synced_at: null }
      table.delete(oldId)
      table.set(newId, { ...row, id: newId })
      return
    }

    const markSyncedMatch = sql.match(
      /^UPDATE "([^"]+)" SET is_synced = 1, synced_at = \? WHERE id = \?$/
    )
    if (markSyncedMatch) {
      const [, tableName] = markSyncedMatch
      const [syncedAt, id] = params
      const table = this.tables[tableName]
      const row = table.get(id) ?? { id }
      table.set(id, { ...row, is_synced: 1, synced_at: syncedAt })
      return
    }

    throw new Error(`Unsupported runAsync SQL in test: ${sql}`)
  }

  getJob(jobId) {
    return this.jobs.find((entry) => entry.id === jobId) ?? null
  }

  getTableRows(tableName) {
    return Array.from(this.tables[tableName].values())
  }
}

function createApi(overrides = {}) {
  return {
    createWorkout: jest.fn(async () => ({ id: 'server_workout_default' })),
    updateWorkout: jest.fn(async () => undefined),
    deleteWorkout: jest.fn(async () => undefined),
    recordWorkout: jest.fn(async () => ({ workoutRecord: { id: 'server_record_default' } })),
    deleteWorkoutRecord: jest.fn(async () => undefined),
    createRoutine: jest.fn(async () => ({ id: 'server_routine_default' })),
    updateRoutine: jest.fn(async () => undefined),
    deleteRoutine: jest.fn(async () => undefined),
    ...overrides,
  }
}

async function runQueue({ jobs, tables, api }) {
  const { SyncEngine } = require('../../lib/sync/SyncEngine')
  const db = new FakeDb({ jobs, tables })
  const engine = new SyncEngine({
    api,
    getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
    addAppStateListener: () => ({ remove() {} }),
  })

  await engine.init(db, { processOnInit: false })
  await engine.processQueue()

  return { db, engine }
}

module.exports = {
  FakeDb,
  createApi,
  makeJob,
  runQueue,
}
