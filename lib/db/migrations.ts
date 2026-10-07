/**
 * Per-owner SQLite schema setup and one-time import from the legacy database.
 * Called during SQLiteProvider's onInit callback.
 */
import * as SQLite from 'expo-sqlite'
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite'

const DATABASE_VERSION = 3
const LEGACY_DATABASE_NAME = 'active.db'
const LEGACY_OWNER_KEY = 'legacy_active_db_owner'
const LEGACY_IMPORT_KEY = 'legacy_active_db_import_owner'
const UNKNOWN_OWNER = 'unknown'
const LEGACY_TABLES = ['workouts', 'workout_records', 'routines', 'sync_queue', 'id_remaps']

export interface DatabaseOwnerInfo {
  ownerId: string
  /** The owner cached before auth/profile refresh for this app startup. */
  legacyOwnerId: string | null
}

export async function migrateDbIfNeeded(db: SQLiteDatabase, owner: DatabaseOwnerInfo) {
  await migrateSchema(db)
  await ensureMetadataTable(db)

  const completedOwner = await getMetadata(db, LEGACY_IMPORT_KEY)
  if (completedOwner) {
    if (completedOwner !== owner.ownerId) {
      throw new Error(`Database import belongs to ${completedOwner}, not ${owner.ownerId}`)
    }
    return
  }

  const legacyDb = await SQLite.openDatabaseAsync(LEGACY_DATABASE_NAME)
  try {
    await migrateSchema(legacyDb)
    await ensureMetadataTable(legacyDb)

    let legacyOwnerId = await getMetadata(legacyDb, LEGACY_OWNER_KEY)
    if (!legacyOwnerId && (await hasLegacyRows(legacyDb))) {
      // This source-side claim is committed before copying, so a later account cannot claim it.
      await legacyDb.withTransactionAsync(async () => {
        await legacyDb.runAsync(
          'INSERT OR IGNORE INTO migration_metadata (key, value) VALUES (?, ?)',
          LEGACY_OWNER_KEY,
          owner.legacyOwnerId ?? UNKNOWN_OWNER
        )
      })
      legacyOwnerId = await getMetadata(legacyDb, LEGACY_OWNER_KEY)
    }

    if (!legacyOwnerId || legacyOwnerId === UNKNOWN_OWNER || legacyOwnerId !== owner.ownerId) return
    if (db.databasePath === legacyDb.databasePath) {
      throw new Error('Cannot import the legacy database into itself')
    }

    const rowsByTable = await getLegacyRows(legacyDb)
    const copy = async (transaction: SQLiteDatabase) => {
      const importedOwner = await getMetadata(transaction, LEGACY_IMPORT_KEY)
      if (importedOwner) {
        if (importedOwner !== owner.ownerId) {
          throw new Error(`Database import belongs to ${importedOwner}, not ${owner.ownerId}`)
        }
        return
      }

      for (const table of LEGACY_TABLES) {
        for (const row of rowsByTable[table]) {
          const columns = Object.keys(row)
          const names = columns.map((column) => `"${column.replace(/"/g, '""')}"`).join(', ')
          const placeholders = columns.map(() => '?').join(', ')
          await transaction.runAsync(
            `INSERT OR IGNORE INTO ${table} (${names}) VALUES (${placeholders})`,
            columns.map((column) => row[column])
          )
        }
      }
      await transaction.runAsync(
        'INSERT INTO migration_metadata (key, value) VALUES (?, ?)',
        LEGACY_IMPORT_KEY,
        owner.ownerId
      )
    }

    // Legacy records can reference server workouts absent from the local workouts table.
    // onInit runs before consumers render, so this connection-local PRAGMA and transaction are serialized.
    await db.execAsync('PRAGMA foreign_keys = OFF')
    try {
      await db.withTransactionAsync(() => copy(db))
    } finally {
      await db.execAsync('PRAGMA foreign_keys = ON')
    }
  } finally {
    await legacyDb.closeAsync()
  }
}

async function migrateSchema(db: SQLiteDatabase) {
  // Enable WAL for better performance
  await db.execAsync('PRAGMA journal_mode = "wal";')
  // Enable foreign keys
  await db.execAsync('PRAGMA foreign_keys = ON;')

  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  const currentDbVersion = result?.user_version ?? 0

  if (currentDbVersion >= DATABASE_VERSION) return

  console.log(`Migrating database from version ${currentDbVersion} to ${DATABASE_VERSION}`)

  if (currentDbVersion === 0) {
    await db.execAsync(`
      -- Sync Queue for Store & Forward
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        payload TEXT,
        local_table TEXT,
        local_id TEXT,
        idempotency_key TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS workouts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT,
        created_at DATETIME,
        updated_at DATETIME,
        workout_template TEXT,
        is_synced INTEGER DEFAULT 0,
        synced_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS workout_records (
        id TEXT PRIMARY KEY,
        workout_id TEXT NOT NULL,
        workout_title TEXT NOT NULL,
        notes TEXT,
        created_at DATETIME,
        start_time DATETIME,
        exercise_records TEXT,
        is_synced INTEGER DEFAULT 0,
        synced_at DATETIME,
        FOREIGN KEY(workout_id) REFERENCES workouts(id) ON UPDATE CASCADE
      );

      CREATE TABLE IF NOT EXISTS routines (
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
        synced_at DATETIME
      );
    `)

    await db.execAsync('PRAGMA user_version = 1')
  }

  if (currentDbVersion < 2) {
    try {
      await db.execAsync('ALTER TABLE sync_queue ADD COLUMN idempotency_key TEXT;')
    } catch (e) {
      // Ignore if column already exists
      console.log('Column idempotency_key may already exist:', e)
    }

    await db.execAsync('PRAGMA user_version = 2')
  }

  if (currentDbVersion < 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS id_remaps (
        table_name TEXT NOT NULL,
        old_id TEXT NOT NULL,
        new_id TEXT NOT NULL,
        PRIMARY KEY (table_name, old_id)
      );
      PRAGMA user_version = 3;
    `)
  }
}

async function ensureMetadataTable(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS migration_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

async function getMetadata(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM migration_metadata WHERE key = ?',
    key
  )
  return row?.value ?? null
}

async function hasLegacyRows(db: SQLiteDatabase) {
  for (const table of LEGACY_TABLES) {
    const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)
    if ((row?.count ?? 0) > 0) return true
  }
  return false
}

async function getLegacyRows(db: SQLiteDatabase) {
  const rowsByTable: Record<string, Record<string, SQLiteBindValue>[]> = {}
  for (const table of LEGACY_TABLES) {
    rowsByTable[table] = await db.getAllAsync<Record<string, SQLiteBindValue>>(
      `SELECT * FROM ${table}`
    )
  }
  return rowsByTable
}
