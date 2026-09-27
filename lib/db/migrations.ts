/**
 * Database migration runner.
 *
 * Called during SQLiteProvider's onInit callback.
 * Pragma setup is now handled by the singleton in connection.ts,
 * so this file only manages schema migrations.
 */
import { SQLiteDatabase } from 'expo-sqlite'

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const DATABASE_VERSION = 3

  // Enable WAL for better performance
  await db.execAsync('PRAGMA journal_mode = "wal";')
  // Enable foreign keys
  await db.execAsync('PRAGMA foreign_keys = ON;')

  let result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  const currentDbVersion = result?.user_version ?? 0

  if (currentDbVersion >= DATABASE_VERSION) {
    return
  }

  console.log(`Migrating database from version ${currentDbVersion} to ${DATABASE_VERSION}`)

  if (currentDbVersion === 0) {
    // Initial schema setup
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
        workout_template TEXT, -- JSON payload of ApiWorkoutTemplate
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
        exercise_records TEXT, -- JSON string of WorkoutRecordExercise[]
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
        pattern TEXT, -- JSON string of RoutinePatternItem[]
        start_date DATETIME,
        created_at DATETIME,
        updated_at DATETIME,
        is_active INTEGER DEFAULT 0,
        is_synced INTEGER DEFAULT 0,
        synced_at DATETIME
      );
    `)

    await db.execAsync(`PRAGMA user_version = 1`)
  }

  if (currentDbVersion < 2) {
    // Add idempotency_key to sync_queue if it doesn't have it (upgrading from v1)
    try {
      await db.execAsync(`ALTER TABLE sync_queue ADD COLUMN idempotency_key TEXT;`)
    } catch (e) {
      // Ignore if column already exists
      console.log('Column idempotency_key may already exist:', e)
    }

    await db.execAsync(`PRAGMA user_version = 2`)
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
