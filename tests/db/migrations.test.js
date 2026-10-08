let mockLegacyDb

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => mockLegacyDb),
}))

const { openDatabaseAsync } = require('expo-sqlite')
const { migrateDbIfNeeded } = require('../../lib/db/migrations')

const tableNames = ['workouts', 'workout_records', 'routines', 'sync_queue', 'id_remaps']

function rowKey(table, row) {
  return table === 'id_remaps' ? `${row.table_name}:${row.old_id}` : row.id
}

class FakeDb {
  constructor(path, rows = {}) {
    this.databasePath = path
    this.userVersion = 0
    this.rows = Object.fromEntries(tableNames.map((table) => [table, new Map()]))
    this.metadata = new Map()
    this.failCopyTable = null
    this.foreignKeysEnabled = false

    for (const [table, values] of Object.entries(rows)) {
      for (const row of values) this.rows[table].set(rowKey(table, row), { ...row })
    }
  }

  async execAsync(sql) {
    if (sql.includes('PRAGMA foreign_keys = OFF')) this.foreignKeysEnabled = false
    if (sql.includes('PRAGMA foreign_keys = ON')) this.foreignKeysEnabled = true
    for (const [, version] of sql.matchAll(/PRAGMA user_version\s*=\s*(\d+)/g)) {
      this.userVersion = Number(version)
    }
  }

  async getFirstAsync(sql, ...params) {
    if (sql === 'PRAGMA user_version') return { user_version: this.userVersion }
    if (sql.startsWith('SELECT value FROM migration_metadata')) {
      const value = this.metadata.get(params[0])
      return value == null ? null : { value }
    }
    const countTable = sql.match(/SELECT COUNT\(\*\) AS count FROM (\w+)/)
    if (countTable) return { count: this.rows[countTable[1]].size }
    throw new Error(`Unsupported getFirstAsync SQL: ${sql}`)
  }

  async getAllAsync(sql) {
    const table = sql.match(/SELECT \* FROM (\w+)/)?.[1]
    if (!table) throw new Error(`Unsupported getAllAsync SQL: ${sql}`)
    return Array.from(this.rows[table].values(), (row) => ({ ...row }))
  }

  async runAsync(sql, ...params) {
    if (sql === 'INSERT OR IGNORE INTO migration_metadata (key, value) VALUES (?, ?)') {
      if (!this.metadata.has(params[0])) this.metadata.set(params[0], params[1])
      return
    }
    if (sql === 'INSERT INTO migration_metadata (key, value) VALUES (?, ?)') {
      this.metadata.set(params[0], params[1])
      return
    }

    const insert = sql.match(/INSERT OR IGNORE INTO (\w+) \((.+)\) VALUES \(/)
    if (insert) {
      const [, table, columnList] = insert
      if (this.failCopyTable === table) throw new Error(`copy failed: ${table}`)
      const columns = Array.from(columnList.matchAll(/"([^"]+)"/g), ([, column]) => column)
      const values = params[0]
      const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]))
      if (
        table === 'workout_records' &&
        this.foreignKeysEnabled &&
        !this.rows.workouts.has(row.workout_id)
      ) {
        throw new Error('foreign key constraint failed')
      }
      const key = rowKey(table, row)
      if (!this.rows[table].has(key)) this.rows[table].set(key, row)
      return
    }
    throw new Error(`Unsupported runAsync SQL: ${sql}`)
  }

  async withTransactionAsync(operation) {
    const rowsBefore = Object.fromEntries(
      tableNames.map((table) => [
        table,
        new Map(Array.from(this.rows[table], ([key, row]) => [key, { ...row }])),
      ])
    )
    const metadataBefore = new Map(this.metadata)
    try {
      await operation()
    } catch (error) {
      this.rows = rowsBefore
      this.metadata = metadataBefore
      throw error
    }
  }

  async withExclusiveTransactionAsync(operation) {
    await this.withTransactionAsync(() => operation(this))
  }

  async closeAsync() {}
}

function legacyRows() {
  return {
    workouts: [{ id: 'workout-1', title: 'A', is_synced: 0 }],
    workout_records: [
      { id: 'record-1', workout_id: 'workout-1', workout_title: 'A' },
      { id: 'orphan-record', workout_id: 'server-workout', workout_title: 'Server workout' },
    ],
    routines: [{ id: 'routine-1', name: 'Routine', is_synced: 0 }],
    sync_queue: [
      {
        id: 'queue-1',
        endpoint: '/workouts',
        method: 'POST',
        payload: '{"id":"workout-1"}',
        local_table: 'workouts',
        local_id: 'workout-1',
        idempotency_key: 'queue-key',
        created_at: '2026-01-01 00:00:00',
        status: 'failed',
        retry_count: 3,
        error_message: 'offline',
      },
    ],
    id_remaps: [{ table_name: 'workouts', old_id: 'old-1', new_id: 'new-1' }],
  }
}

function rowCounts(db) {
  return Object.fromEntries(tableNames.map((table) => [table, db.rows[table].size]))
}

describe('migrateDbIfNeeded', () => {
  beforeEach(() => {
    mockLegacyDb = new FakeDb('active.db', legacyRows())
    openDatabaseAsync.mockClear()
  })

  it('copies the assigned legacy rows and stays idempotent across restart', async () => {
    const target = new FakeDb('profile-account%3Aalice.db')

    await migrateDbIfNeeded(target, { ownerId: 'account:alice', legacyOwnerId: 'account:alice' })
    expect(rowCounts(target)).toEqual({
      workouts: 1,
      workout_records: 2,
      routines: 1,
      sync_queue: 1,
      id_remaps: 1,
    })
    expect(target.rows.sync_queue.get('queue-1')).toMatchObject({
      status: 'failed',
      retry_count: 3,
      idempotency_key: 'queue-key',
      error_message: 'offline',
    })
    expect(target.rows.workout_records.has('orphan-record')).toBe(true)
    expect(target.foreignKeysEnabled).toBe(true)
    expect(mockLegacyDb.metadata.get('legacy_active_db_owner')).toBe('account:alice')
    expect(target.metadata.get('legacy_active_db_import_owner')).toBe('account:alice')

    await migrateDbIfNeeded(target, { ownerId: 'account:alice', legacyOwnerId: 'account:alice' })
    expect(rowCounts(target)).toEqual({
      workouts: 1,
      workout_records: 2,
      routines: 1,
      sync_queue: 1,
      id_remaps: 1,
    })
    expect(openDatabaseAsync).toHaveBeenCalledTimes(1)

    const bobTarget = new FakeDb('profile-account%3Abob.db')
    await migrateDbIfNeeded(bobTarget, { ownerId: 'account:bob', legacyOwnerId: 'account:bob' })
    expect(rowCounts(bobTarget).workouts).toBe(0)
    expect(mockLegacyDb.metadata.get('legacy_active_db_owner')).toBe('account:alice')
  })

  it('locks discovered data as unknown and refuses a later account claim', async () => {
    const target = new FakeDb('profile-account%3Abob.db')

    await migrateDbIfNeeded(target, { ownerId: 'account:bob', legacyOwnerId: null })
    expect(mockLegacyDb.metadata.get('legacy_active_db_owner')).toBe('unknown')
    expect(rowCounts(mockLegacyDb)).toEqual({
      workouts: 1,
      workout_records: 2,
      routines: 1,
      sync_queue: 1,
      id_remaps: 1,
    })
    expect(rowCounts(target)).toEqual({
      workouts: 0,
      workout_records: 0,
      routines: 0,
      sync_queue: 0,
      id_remaps: 0,
    })

    await migrateDbIfNeeded(target, { ownerId: 'account:bob', legacyOwnerId: 'account:bob' })
    expect(rowCounts(target).workouts).toBe(0)
    expect(mockLegacyDb.metadata.get('legacy_active_db_owner')).toBe('unknown')
  })

  it('rolls back a failed copy while retaining the owner claim for retry', async () => {
    const target = new FakeDb('profile-account%3Aalice.db')
    target.failCopyTable = 'routines'

    await expect(
      migrateDbIfNeeded(target, { ownerId: 'account:alice', legacyOwnerId: 'account:alice' })
    ).rejects.toThrow('copy failed: routines')
    expect(mockLegacyDb.metadata.get('legacy_active_db_owner')).toBe('account:alice')
    expect(rowCounts(target)).toEqual({
      workouts: 0,
      workout_records: 0,
      routines: 0,
      sync_queue: 0,
      id_remaps: 0,
    })
    expect(target.foreignKeysEnabled).toBe(true)
    expect(target.metadata.has('legacy_active_db_import_owner')).toBe(false)

    target.failCopyTable = null
    await migrateDbIfNeeded(target, { ownerId: 'account:alice', legacyOwnerId: null })
    expect(rowCounts(target)).toEqual({
      workouts: 1,
      workout_records: 2,
      routines: 1,
      sync_queue: 1,
      id_remaps: 1,
    })
  })
})
