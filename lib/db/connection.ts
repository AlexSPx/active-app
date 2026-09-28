/**
 * Singleton SQLite database connection.
 *
 * Every consumer — repositories, SyncEngine, migrations — uses this single
 * handle so that PRAGMA settings (foreign_keys, journal_mode) are guaranteed
 * to be in effect and we avoid double-handle WAL problems.
 */
import * as SQLite from 'expo-sqlite'
import { syncEngine } from '../sync'

let _db: SQLite.SQLiteDatabase | null = null
let _dbResolver: ((db: SQLite.SQLiteDatabase) => void) | null = null
let _initPromise: Promise<SQLite.SQLiteDatabase> = new Promise((resolve) => {
  _dbResolver = resolve
})

/**
 * Feeds the shared DB handle from SQLiteProvider to the rest of the application
 * (SyncEngine, repos, etc).
 */
export function setSharedDatabase(db: SQLite.SQLiteDatabase) {
  if (_db === db) return
  _db = db
  if (_dbResolver) {
    _dbResolver(db)
    _dbResolver = null
  }
}

/**
 * Returns a singleton database handle. Any callers that
 * call this before the provider is ready will wait for the Promise.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  return _db ?? _initPromise
}

/**
 * Empty all database tables.
 * Useful for tearing down data on logout without dropping connections.
 */
export async function clearDatabase(): Promise<void> {
  try {
    const db = await getDatabase()
    await syncEngine.withIdRemapLock(async () => {
      await db.withTransactionAsync(async () => {
        await db.execAsync(`
          DELETE FROM sync_queue;
          DELETE FROM workout_records;
          DELETE FROM workouts;
          DELETE FROM routines;
          DELETE FROM id_remaps;
        `)
      })
      syncEngine.clearIdRemaps()
    })
    console.log('Successfully cleared sqlite database on logout')
  } catch (error) {
    console.warn('Failed to clear sqlite database:', error)
  }
}
