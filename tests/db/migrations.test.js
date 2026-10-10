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
    if (sql === 'PRAGMA table_info(sync_queue)') return [{ name: 'idempotency_key' }]
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
    const versionBefore = this.userVersion
    try {
      await operation()
    } catch (error) {
      this.rows = rowsBefore
      this.metadata = metadataBefore
      this.userVersion = versionBefore
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

// Use Python's SQLite so schema rebuilds, rowid ordering and rollback are checked by SQLite itself.
class SqliteDb {
  constructor(path) {
    const { spawn } = require('child_process')
    const { createInterface } = require('readline')
    this.databasePath = path
    this.requests = []
    this.worker = spawn('python3', [
      '-u',
      '-c',
      `
import json, sqlite3, sys
connection = sqlite3.connect(sys.argv[1], isolation_level=None)
connection.row_factory = sqlite3.Row
for line in sys.stdin:
    try:
        request = json.loads(line)
        if request['kind'] == 'exec':
            statement = ''
            for char in request['sql']:
                statement += char
                if char == ';' and sqlite3.complete_statement(statement):
                    connection.execute(statement)
                    statement = ''
            if statement.strip(): connection.execute(statement)
            result = None
        else:
            cursor = connection.execute(request['sql'], request['params'])
            result = [dict(row) for row in cursor.fetchall()]
        print(json.dumps({'result': result}), flush=True)
    except Exception as error:
        print(json.dumps({'error': str(error)}), flush=True)
`,
      path,
    ])
    this.worker.on('error', (error) => this.fail(error))
    this.worker.on('exit', (code) => this.fail(new Error(`SQLite worker exited (${code})`)))
    createInterface({ input: this.worker.stdout }).on('line', (line) => {
      const response = JSON.parse(line)
      const { resolve, reject } = this.requests.shift()
      if (response.error) reject(new Error(response.error))
      else resolve(response.result)
    })
  }

  fail(error) {
    this.failure = error
    for (const { reject } of this.requests.splice(0)) reject(error)
  }

  request(kind, sql, params = []) {
    if (this.failure) return Promise.reject(this.failure)
    return new Promise((resolve, reject) => {
      this.requests.push({ resolve, reject })
      this.worker.stdin.write(`${JSON.stringify({ kind, sql, params })}\n`)
    })
  }

  execAsync(sql) {
    return this.request('exec', sql)
  }
  getAllAsync(sql, ...params) {
    return this.request('query', sql, params)
  }
  async getFirstAsync(sql, ...params) {
    return (await this.getAllAsync(sql, ...params))[0] ?? null
  }
  runAsync(sql, ...params) {
    return this.request('query', sql, Array.isArray(params[0]) ? params[0] : params)
  }
  async withTransactionAsync(operation) {
    await this.execAsync('BEGIN')
    try {
      await operation()
      await this.execAsync('COMMIT')
    } catch (error) {
      await this.execAsync('ROLLBACK')
      throw error
    }
  }
  async closeAsync() {
    if (this.closePromise) return this.closePromise
    if (this.failure || this.worker.exitCode !== null) return
    const exited = new Promise((resolve) => this.worker.once('exit', resolve))
    this.closePromise = exited
    this.worker.stdin.end()
    await exited
  }
}

const owner = { ownerId: 'account:alice', legacyOwnerId: 'account:alice' }

async function seedVersionThree(db, rows = []) {
  await db.execAsync(`
    CREATE TABLE sync_queue (
      id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, method TEXT NOT NULL, payload TEXT,
      local_table TEXT, local_id TEXT, idempotency_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0, error_message TEXT
    );
    CREATE TABLE workouts (id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE workout_records (id TEXT PRIMARY KEY, workout_id TEXT);
    CREATE TABLE routines (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE id_remaps (table_name TEXT, old_id TEXT, new_id TEXT, PRIMARY KEY(table_name, old_id));
    PRAGMA user_version = 3;
  `)
  for (const [id, key, timestamp] of rows) {
    await db.runAsync(
      'INSERT INTO sync_queue (id, endpoint, method, payload, idempotency_key, created_at, status, retry_count, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      'deleteWorkout',
      'API',
      JSON.stringify([id]),
      key,
      timestamp,
      'failed',
      6,
      'offline'
    )
  }
}

describe('durable queue schema on real SQLite', () => {
  let target
  let source
  beforeEach(() => {
    target = new SqliteDb(':memory:')
    source = new SqliteDb('')
    mockLegacyDb = source
  })
  afterEach(async () => {
    await Promise.all([target.closeAsync(), source.closeAsync()])
  })

  it('upgrades v3, keeps rows and operation keys, and assigns collision-free order to legacy imports and future inserts', async () => {
    await seedVersionThree(target, [
      ['target-newer', 'kept-key', '2026-02-01'],
      ['target-older', null, '2026-01-01'],
    ])
    await seedVersionThree(source, [
      ['legacy-first', 'legacy-key', '2026-01-01'],
      ['legacy-second', null, '2026-01-01'],
    ])
    await target.runAsync('INSERT INTO id_remaps VALUES (?, ?, ?)', 'workouts', 'local', 'server')
    await migrateDbIfNeeded(target, owner)
    const rows = await target.getAllAsync('SELECT * FROM sync_queue ORDER BY sequence')
    expect(rows.map((row) => row.id)).toEqual([
      'target-older',
      'target-newer',
      'legacy-first',
      'legacy-second',
    ])
    expect(rows.map((row) => row.idempotency_key)).toEqual([
      'target-older',
      'kept-key',
      'legacy-key',
      'legacy-second',
    ])
    expect(
      rows.every(
        (row) =>
          row.retry_count === 6 && row.error_message === 'offline' && row.next_attempt_at === 0
      )
    ).toBe(true)
    expect(await target.getAllAsync('SELECT * FROM id_remaps')).toEqual([
      { table_name: 'workouts', old_id: 'local', new_id: 'server' },
    ])
    expect(await target.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 4 })
    await migrateDbIfNeeded(target, owner)
    expect(await target.getAllAsync('SELECT * FROM sync_queue ORDER BY sequence')).toEqual(rows)
    await target.runAsync('DELETE FROM sync_queue WHERE id = ?', 'legacy-second')
    await target.runAsync(
      'INSERT INTO sync_queue (id, endpoint, method) VALUES (?, ?, ?)',
      'future',
      'deleteWorkout',
      'API'
    )
    expect(
      (await target.getFirstAsync('SELECT sequence FROM sync_queue WHERE id = ?', 'future'))
        .sequence
    ).toBeGreaterThan(rows[3].sequence)
  })

  it('creates a fresh queue with durable sequence and retry deadline defaults', async () => {
    await migrateDbIfNeeded(target, owner)
    await target.runAsync(
      'INSERT INTO sync_queue (id, endpoint, method, idempotency_key) VALUES (?, ?, ?, ?)',
      'new',
      'deleteWorkout',
      'API',
      'new-key'
    )
    expect(
      await target.getFirstAsync(
        'SELECT sequence, next_attempt_at, status, idempotency_key FROM sync_queue'
      )
    ).toEqual({ sequence: 1, next_attempt_at: 0, status: 'pending', idempotency_key: 'new-key' })
    expect(await target.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 4 })
  })

  it('rolls back the queue rebuild and schema version if copying existing rows fails', async () => {
    await seedVersionThree(target, [['existing', 'existing-key', '2026-01-01']])
    const originalExec = target.execAsync.bind(target)
    target.execAsync = async (sql) => {
      if (sql.includes('CREATE TABLE sync_queue_v4')) {
        // Fail after the old table is dropped; both the table and version must return on rollback.
        await originalExec(
          sql.replace(
            'ALTER TABLE sync_queue_v4 RENAME TO sync_queue;',
            'SELECT * FROM forced_failure;'
          )
        )
      } else await originalExec(sql)
    }
    await expect(migrateDbIfNeeded(target, owner)).rejects.toThrow('forced_failure')
    expect(await target.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 3 })
    expect(
      await target.getFirstAsync('SELECT id, idempotency_key, retry_count FROM sync_queue')
    ).toEqual({ id: 'existing', idempotency_key: 'existing-key', retry_count: 6 })
    expect(
      await target.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'sync_queue_v4'")
    ).toBeNull()
    target.execAsync = originalExec
    await migrateDbIfNeeded(target, owner)
    expect(await target.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 4 })
  })
})
