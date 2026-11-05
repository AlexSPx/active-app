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
let providerMounted = false
let providerToken = 0
let closeError: Error | null = null
const detachWaiters = new Set<{ resolve: () => void; reject: (error: Error) => void }>()
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

/** Marks the start of an owned profile database provider lifecycle. */
export function markSharedDatabaseProviderMounted(): number {
  providerMounted = true
  closeError = null
  return ++providerToken
}

/** Waits until the active profile database has completed closeAsync. */
export async function waitForSharedDatabaseDetach(): Promise<void> {
  if (!providerMounted && !_db && !closeError) return
  if (!providerMounted && _db && closeError) {
    const db = _db
    await db.closeAsync()
    markSharedDatabaseDetached(db, providerToken)
    return
  }
  return new Promise((resolve, reject) => detachWaiters.add({ resolve, reject }))
}

/** Called only after the provider-owned database connection has closed. */
export function markSharedDatabaseDetached(db: SQLite.SQLiteDatabase | null, token: number): void {
  if (db && _db && _db !== db) return
  if (db && _db === db) {
    _db = null
    _initPromise = new Promise((resolve) => {
      _dbResolver = resolve
    })
  }
  if (token !== providerToken) return
  providerMounted = false
  closeError = null
  detachWaiters.forEach(({ resolve }) => resolve())
  detachWaiters.clear()
}

/** Keeps erasure retryable if a native close fails. */
export function markSharedDatabaseCloseFailed(
  cause: unknown,
  db: SQLite.SQLiteDatabase,
  token: number
): void {
  if (token !== providerToken || (_db && _db !== db)) return
  if (!_db) _db = db
  closeError = cause instanceof Error ? cause : new Error('Could not close local data.')
  providerMounted = false
  detachWaiters.forEach(({ reject }) => reject(closeError!))
  detachWaiters.clear()
}
