function makeJob({
  id,
  endpoint,
  payload,
  status = 'pending',
  localTable = null,
  localId = null,
  retryCount = 0,
  sequence,
  nextAttemptAt = 0,
  createdAt = '2026-01-01 00:00:00',
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
    sequence,
    next_attempt_at: nextAttemptAt,
    created_at: createdAt,
    status,
    error_message: null,
  }
}

class FakeDb {
  constructor({ jobs = [], tables = {}, enforceForeignKeys = false } = {}) {
    this.jobs = jobs.map((job, index) => ({ ...job, sequence: job.sequence ?? index + 1 }))
    this.nextSequence = Math.max(0, ...this.jobs.map((job) => job.sequence)) + 1
    this.enforceForeignKeys = enforceForeignKeys
    this.tables = {
      workouts: new Map(),
      workout_records: new Map(),
      routines: new Map(),
    }
    this.idRemaps = new Map()
    this.transactionDepth = 0
    this.transactionEvents = []

    for (const [tableName, ids] of Object.entries(tables)) {
      for (const id of ids) {
        this.tables[tableName].set(id, { id, is_synced: 0, synced_at: null })
      }
    }
  }

  async execAsync(sql) {
    if (this.enforceForeignKeys && sql.includes('PRAGMA foreign_keys = OFF')) {
      this.foreignKeysEnabled = false
    }
    if (sql.includes('PRAGMA foreign_keys = ON')) {
      this.foreignKeysEnabled = true
    }
  }

  async withTransactionAsync(operation) {
    return this.runTransaction(operation, 'shared')
  }

  async withExclusiveTransactionAsync(operation) {
    return this.runTransaction(operation, 'exclusive')
  }

  async runTransaction(operation, mode) {
    const snapshot = {
      jobs: this.jobs.map((job) => ({ ...job })),
      idRemaps: new Map(Array.from(this.idRemaps, ([key, value]) => [key, { ...value }])),
      tables: Object.fromEntries(
        Object.entries(this.tables).map(([name, table]) => [
          name,
          new Map(Array.from(table, ([id, row]) => [id, { ...row }])),
        ])
      ),
    }
    this.recordTransactionEvent('begin', { mode })
    this.transactionDepth += 1

    try {
      const result = await operation(this)
      this.transactionDepth -= 1
      this.recordTransactionEvent('commit', { mode })
      return result
    } catch (error) {
      this.jobs = snapshot.jobs
      this.idRemaps = snapshot.idRemaps
      for (const [name, rows] of Object.entries(snapshot.tables)) {
        this.tables[name].clear()
        for (const [id, row] of rows) this.tables[name].set(id, row)
      }
      this.transactionDepth -= 1
      this.recordTransactionEvent('rollback', { mode })
      throw error
    }
  }

  recordTransactionEvent(type, details = {}) {
    this.transactionEvents.push({
      type,
      inTransaction: this.transactionDepth > 0,
      ...details,
    })
  }

  async getAllAsync(sql, ...params) {
    if (sql === 'SELECT table_name, old_id, new_id FROM id_remaps') {
      return Array.from(this.idRemaps.values())
    }
    if (sql === 'SELECT id, pattern FROM routines WHERE is_deleted = 0') {
      return Array.from(this.tables.routines.values())
        .filter((row) => !row.is_deleted)
        .map(({ id, pattern }) => ({ id, pattern }))
    }

    if (sql.includes('ORDER BY sequence ASC') || sql.includes('ORDER BY created_at ASC')) {
      const [pendingStatus, failedStatus] = params
      return this.jobs
        .filter((job) => job.status === pendingStatus || job.status === failedStatus)
        .sort((a, b) => a.sequence - b.sequence)
        .slice(0, sql.includes('LIMIT 50') ? 50 : undefined)
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

    const jsonColumnMatch = sql.match(
      /^SELECT id, "(workout_template|pattern)" AS value FROM "(workouts|routines)"(?: WHERE id = \?)?$/
    )
    if (jsonColumnMatch) {
      const [, columnName, tableName] = jsonColumnMatch
      const table = this.tables[tableName]
      const rows = params.length
        ? [table.get(params[0])].filter(Boolean)
        : Array.from(table.values())
      return rows.map((row) => ({ id: row.id, value: row[columnName] ?? null }))
    }

    if (
      sql === 'SELECT * FROM workouts WHERE is_deleted = 0 ORDER BY created_at DESC' ||
      sql === 'SELECT * FROM workouts ORDER BY created_at DESC'
    ) {
      return Array.from(this.tables.workouts.values())
        .filter((row) => !row.is_deleted)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    }

    if (
      sql === 'SELECT * FROM workout_records WHERE is_deleted = 0 ORDER BY created_at DESC' ||
      sql === 'SELECT * FROM workout_records ORDER BY created_at DESC'
    ) {
      return Array.from(this.tables.workout_records.values())
        .filter((row) => !row.is_deleted)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    }

    if (
      sql === 'SELECT * FROM routines WHERE is_deleted = 0 ORDER BY created_at DESC' ||
      sql === 'SELECT * FROM routines ORDER BY created_at DESC'
    ) {
      return Array.from(this.tables.routines.values())
        .filter((row) => !row.is_deleted)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    }

    throw new Error(`Unsupported getAllAsync SQL in test: ${sql}`)
  }

  async getFirstAsync(sql, ...params) {
    if (sql === 'SELECT id FROM sync_queue LIMIT 1') {
      return this.jobs[0] ? { id: this.jobs[0].id } : null
    }

    if (sql.includes('FROM sync_queue WHERE id = ?')) {
      return this.jobs.find((job) => job.id === params[0]) ?? null
    }

    if (
      sql === 'SELECT * FROM workouts WHERE id = ?' ||
      sql === 'SELECT * FROM workouts WHERE id = ? AND is_deleted = 0'
    ) {
      const row = this.tables.workouts.get(params[0]) ?? null
      return sql.includes('is_deleted = 0') && row?.is_deleted ? null : row
    }

    if (
      sql === 'SELECT is_deleted FROM workouts WHERE id = ?' ||
      sql === 'SELECT is_deleted, workout_template FROM workouts WHERE id = ?'
    ) {
      const row = this.tables.workouts.get(params[0])
      return row
        ? { is_deleted: row.is_deleted ?? 0, workout_template: row.workout_template ?? null }
        : null
    }

    if (sql === 'SELECT id FROM workouts WHERE id = ?') {
      return this.tables.workouts.has(params[0]) ? { id: params[0] } : null
    }

    if (
      sql === 'SELECT * FROM routines WHERE id = ?' ||
      sql === 'SELECT * FROM routines WHERE id = ? AND is_deleted = 0'
    ) {
      const row = this.tables.routines.get(params[0]) ?? null
      return sql.includes('is_deleted = 0') && row?.is_deleted ? null : row
    }

    if (
      sql === 'SELECT * FROM routines WHERE is_active = 1 LIMIT 1' ||
      sql === 'SELECT * FROM routines WHERE is_active = 1 AND is_deleted = 0 LIMIT 1'
    ) {
      return (
        Array.from(this.tables.routines.values()).find(
          (routine) => routine.is_active === 1 && !routine.is_deleted
        ) ?? null
      )
    }

    throw new Error(`Unsupported getFirstAsync SQL in test: ${sql}`)
  }

  async runAsync(sql, ...params) {
    const acknowledgedDelete = sql.match(
      /^DELETE FROM "(workouts|workout_records|routines)" WHERE id = \? AND is_deleted = 1$/
    )
    if (acknowledgedDelete) {
      const table = this.tables[acknowledgedDelete[1]]
      if (table.get(params[0])?.is_deleted) {
        table.delete(params[0])
        if (acknowledgedDelete[1] === 'workouts' && this.foreignKeysEnabled) {
          for (const record of this.tables.workout_records.values()) {
            if (record.workout_id === params[0]) record.workout_id = null
          }
        }
      }
      return
    }

    if (sql.includes('INSERT INTO workouts') && sql.includes('WHERE NOT EXISTS')) {
      const [id, title, notes, createdAt, updatedAt, workoutTemplate, syncedAt] = params
      const existing = this.tables.workouts.get(id)
      if (!existing?.is_deleted)
        this.tables.workouts.set(id, {
          ...existing,
          id,
          title,
          notes,
          created_at: existing?.created_at ?? createdAt,
          updated_at: updatedAt,
          workout_template: workoutTemplate,
          is_synced: 1,
          synced_at: syncedAt,
          is_deleted: 0,
        })
      return
    }

    if (sql.includes('INSERT INTO workout_records') && sql.includes('WHERE NOT EXISTS')) {
      const [id, workoutId, workoutTitle, notes, createdAt, startTime, exerciseRecords, syncedAt] =
        params
      const existing = this.tables.workout_records.get(id)
      if (!existing?.is_deleted)
        this.tables.workout_records.set(id, {
          ...existing,
          id,
          workout_id: workoutId,
          workout_title: workoutTitle,
          notes,
          created_at: existing?.created_at ?? createdAt,
          start_time: startTime,
          exercise_records: exerciseRecords,
          is_synced: 1,
          synced_at: syncedAt,
          is_deleted: 0,
        })
      return
    }

    if (
      sql ===
      'INSERT INTO sync_queue (id, endpoint, method, payload, local_table, local_id, idempotency_key)\n       VALUES (?, ?, ?, ?, ?, ?, ?)'
    ) {
      const [id, endpoint, method, payload, localTable, localId, idempotencyKey] = params
      this.jobs.push({
        id,
        endpoint,
        method,
        payload,
        local_table: localTable,
        local_id: localId,
        idempotency_key: idempotencyKey,
        retry_count: 0,
        next_attempt_at: 0,
        sequence: this.nextSequence++,
        status: 'pending',
      })
      return
    }

    if (sql === 'INSERT OR REPLACE INTO id_remaps (table_name, old_id, new_id) VALUES (?, ?, ?)') {
      const [tableName, oldId, newId] = params
      this.idRemaps.set(`${tableName}:${oldId}`, {
        table_name: tableName,
        old_id: oldId,
        new_id: newId,
      })
      return
    }

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
        row[column] = / = [01]$/.test(assignment) ? Number(assignment.slice(-1)) : params[index]
      })

      this.tables.workouts.set(workoutId, row)
      return
    }

    if (sql === 'DELETE FROM workouts WHERE id = ?') {
      const workoutId = params[0]
      if (this.foreignKeysEnabled) {
        for (const record of this.tables.workout_records.values()) {
          if (record.workout_id === workoutId) record.workout_id = null
        }
      }
      this.tables.workouts.delete(workoutId)
      return
    }

    if (
      sql === 'UPDATE workouts SET is_deleted = 1 WHERE id = ?' ||
      sql === 'UPDATE routines SET is_deleted = 1 WHERE id = ?'
    ) {
      const table = sql.startsWith('UPDATE workouts') ? this.tables.workouts : this.tables.routines
      const row = table.get(params[0])
      if (row) row.is_deleted = 1
      return
    }

    if (sql === 'UPDATE workout_records SET workout_id = ? WHERE workout_id = ?') {
      const [newWorkoutId, oldWorkoutId] = params
      for (const record of this.tables.workout_records.values()) {
        if (record.workout_id === oldWorkoutId) record.workout_id = newWorkoutId
      }
      return
    }

    if (sql === 'UPDATE workout_records SET is_deleted = 1 WHERE id = ?') {
      const row = this.tables.workout_records.get(params[0])
      if (row) row.is_deleted = 1
      return
    }

    if (sql === 'UPDATE routines SET pattern = ? WHERE id = ?') {
      const row = this.tables.routines.get(params[1])
      if (row) row.pattern = params[0]
      return
    }

    const jsonUpdateMatch = sql.match(
      /^UPDATE "(workouts|routines)" SET "(workout_template|pattern)" = \? WHERE id = \?$/
    )
    if (jsonUpdateMatch) {
      const [, tableName, columnName] = jsonUpdateMatch
      const [value, id] = params
      const row = this.tables[tableName].get(id)
      if (row) row[columnName] = value
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
      if (this.foreignKeysEnabled && !this.tables.workouts.has(workoutId)) {
        throw new Error('FOREIGN KEY constraint failed')
      }
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
      const [
        id,
        name,
        description,
        routineType,
        pattern,
        startDate,
        createdAt,
        updatedAt,
        isActive,
        isSynced,
      ] = params
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
        row[column] = / = [01]$/.test(assignment) ? Number(assignment.slice(-1)) : params[index]
      })

      this.tables.routines.set(routineId, row)
      return
    }

    if (sql === 'DELETE FROM routines WHERE id = ?') {
      this.tables.routines.delete(params[0])
      return
    }

    if (sql === 'UPDATE sync_queue SET status = ? WHERE status = ?') {
      const [status, previousStatus] = params
      for (const job of this.jobs) if (job.status === previousStatus) job.status = status
      return
    }

    if (
      sql ===
      'UPDATE sync_queue SET status = ?, retry_count = ?, error_message = ?, next_attempt_at = ? WHERE id = ?'
    ) {
      const [status, retryCount, errorMessage, deadline, jobId] = params
      const job = this.getJob(jobId)
      if (job)
        Object.assign(job, {
          status,
          retry_count: retryCount,
          error_message: errorMessage,
          next_attempt_at: deadline,
        })
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
      sql === 'UPDATE sync_queue SET status = ?, retry_count = ?, error_message = ? WHERE id = ?'
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
      if (tableName === 'workouts' && this.foreignKeysEnabled) {
        for (const record of this.tables.workout_records.values()) {
          if (record.workout_id === oldId) record.workout_id = newId
        }
      }
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

async function runQueue({ jobs, tables, api, configureDb }) {
  const { SyncEngine } = require('../../lib/sync/SyncEngine')
  const db = new FakeDb({ jobs, tables })
  configureDb?.(db)
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
