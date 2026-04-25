import { SQLiteDatabase } from 'expo-sqlite'
import { WorkoutRepository } from '../repositories/WorkoutRepository'
import { RoutineRepository } from '../repositories/RoutineRepository'
import { syncApi } from './api'

/**
 * Pull fresh data from the server and UPSERT into local SQLite.
 * Runs on app startup and post-login — non-blocking, failure is tolerated (offline).
 *
 * Foreign key enforcement is disabled for the duration of the bulk import because
 * workout_records from the server may reference workouts that haven't been upserted yet
 * (ordering is not guaranteed). FK enforcement is always restored in the finally block.
 */
export async function hydrateFromServer(db: SQLiteDatabase): Promise<void> {
  const workoutRepo = new WorkoutRepository(db)
  const routineRepo = new RoutineRepository(db)

  // Fetch the user first (needed for activeRoutineId), then the rest in parallel
  let activeRoutineId: string | null = null
  try {
    const user = await syncApi.getUser()
    activeRoutineId = user?.activeRoutineId ?? null
    console.log('[Hydration] User fetched, activeRoutineId:', activeRoutineId)
  } catch (e) {
    console.warn('[Hydration] Could not fetch user (offline?), skipping activeRoutineId:', e)
  }

  // Fire all entity fetches in parallel
  const [serverWorkouts, serverRecords, serverRoutines] = await Promise.all([
    syncApi.getWorkouts().catch((e) => {
      console.error('[Hydration] Failed to fetch workouts:', e)
      return null
    }),
    syncApi.getWorkoutRecords().catch((e) => {
      console.error('[Hydration] Failed to fetch workout records:', e)
      return null
    }),
    syncApi.getRoutines().catch((e) => {
      console.error('[Hydration] Failed to fetch routines:', e)
      return null
    }),
  ])

  console.log('[Hydration] Fetched from server:', {
    workouts: serverWorkouts?.length ?? 'failed',
    records: serverRecords?.length ?? 'failed',
    routines: serverRoutines?.length ?? 'failed',
  })

  // Disable FK checks for the bulk import — server data is authoritative.
  await db.execAsync('PRAGMA foreign_keys = OFF;')

  try {
    if (serverWorkouts) {
      try {
        await workoutRepo.hydrateWorkouts(serverWorkouts)
        console.log(`[Hydration] Wrote ${serverWorkouts.length} workouts`)
      } catch (e) {
        console.error('[Hydration] Failed to write workouts to SQLite:', e)
      }
    }

    if (serverRecords) {
      try {
        await workoutRepo.hydrateRecords(serverRecords)
        console.log(`[Hydration] Wrote ${serverRecords.length} workout records`)
      } catch (e) {
        console.error('[Hydration] Failed to write workout records to SQLite:', e)
      }
    }

    if (serverRoutines) {
      try {
        console.log('[Hydration] Upserting routines, sample:', JSON.stringify(serverRoutines[0]))
        await routineRepo.hydrateFromServer(serverRoutines, activeRoutineId)
        console.log(`[Hydration] Wrote ${serverRoutines.length} routines`)
      } catch (e) {
        console.error('[Hydration] Failed to write routines to SQLite:', e)
      }
    }
  } finally {
    // Always restore FK enforcement
    await db.execAsync('PRAGMA foreign_keys = ON;')
  }

  console.log('[Hydration] Server data synced to local DB ✓')
}
