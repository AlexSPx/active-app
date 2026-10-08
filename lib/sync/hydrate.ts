import { SQLiteDatabase } from 'expo-sqlite'
import { WorkoutRepository } from '../repositories/WorkoutRepository'
import { RoutineRepository } from '../repositories/RoutineRepository'
import { syncApi } from './api'
import { syncEngine } from './SyncEngine'
import { getProfileScope, isCurrentProfile, type ProfileScope } from '../profileScope'
import type { ApiWorkout, WorkoutRecord } from '../../types/api'
import type { Routine } from '../../types/routine'

/**
 * Pull fresh data from the server and UPSERT into local SQLite.
 * Runs on app startup and post-login — non-blocking, failure is tolerated (offline).
 *
 * Foreign key enforcement is disabled for the duration of the bulk import because
 * workout_records from the server may reference workouts that haven't been upserted yet
 * (ordering is not guaranteed). FK enforcement is always restored in the finally block.
 */
export async function hydrateFromServer(db: SQLiteDatabase): Promise<boolean> {
  const scope = getProfileScope()
  const queueMutationRevision = syncEngine.getQueueMutationRevision()
  const workoutRepo = new WorkoutRepository(db)
  const routineRepo = new RoutineRepository(db)
  let hydrated = false

  // Fetch the user first (needed for activeRoutineId), then the rest in parallel
  let activeRoutineId: string | null = null
  try {
    const user = await syncApi.getUser()

    activeRoutineId = user?.activeRoutineId ?? null
    console.log('[Hydration] User fetched, activeRoutineId:', activeRoutineId)
  } catch (e) {
    console.warn('[Hydration] Could not fetch user (offline?), skipping activeRoutineId:', e)
  }
  assertCurrentHydration(scope)

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
  assertCurrentHydration(scope)

  console.log('[Hydration] Fetched from server:', {
    workouts: serverWorkouts?.length ?? 'failed',
    records: serverRecords?.length ?? 'failed',
    routines: serverRoutines?.length ?? 'failed',
  })

  await syncEngine.withIdRemapLock(async () => {
    assertCurrentHydration(scope)
    const queuedMutation = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM sync_queue LIMIT 1'
    )
    assertCurrentHydration(scope)
    if (syncEngine.getQueueMutationRevision() !== queueMutationRevision) {
      // ponytail: skip stale snapshots after a local mutation; the caller can retry after the queue settles.
      console.info('[Hydration] Skipping server snapshot after a local mutation during fetch')
      return
    }
    if (queuedMutation) {
      // ponytail: defer bulk hydration until queued writes drain; reconcile per row if pulls must run sooner.
      console.info('[Hydration] Skipping server snapshot while local changes remain queued')
      return
    }

    // Disable FK checks for the bulk import — server data is authoritative.
    await db.execAsync('PRAGMA foreign_keys = OFF;')
    try {
      assertCurrentHydration(scope)
      await writeHydrationData(
        workoutRepo,
        routineRepo,
        serverWorkouts,
        serverRecords,
        serverRoutines,
        activeRoutineId,
        scope
      )
      hydrated = true
    } finally {
      // Always restore FK enforcement before another remap or record can run.
      await db.execAsync('PRAGMA foreign_keys = ON;')
    }
  })
  assertCurrentHydration(scope)

  if (hydrated) console.log('[Hydration] Server data synced to local DB ✓')
  return hydrated
}

async function writeHydrationData(
  workoutRepo: WorkoutRepository,
  routineRepo: RoutineRepository,
  serverWorkouts: ApiWorkout[] | null,
  serverRecords: WorkoutRecord[] | null,
  serverRoutines: Routine[] | null,
  activeRoutineId: string | null,
  scope: ProfileScope
): Promise<void> {
  assertCurrentHydration(scope)
  if (serverWorkouts) {
    try {
      await workoutRepo.hydrateWorkouts(serverWorkouts)
      console.log(`[Hydration] Wrote ${serverWorkouts.length} workouts`)
    } catch (e) {
      console.error('[Hydration] Failed to write workouts to SQLite:', e)
    }
  }

  assertCurrentHydration(scope)
  if (serverRecords) {
    try {
      await workoutRepo.hydrateRecords(serverRecords)
      console.log(`[Hydration] Wrote ${serverRecords.length} workout records`)
    } catch (e) {
      console.error('[Hydration] Failed to write workout records to SQLite:', e)
    }
  }

  assertCurrentHydration(scope)
  if (serverRoutines) {
    try {
      console.log('[Hydration] Upserting routines, sample:', JSON.stringify(serverRoutines[0]))
      await routineRepo.hydrateFromServer(serverRoutines, activeRoutineId)
      console.log(`[Hydration] Wrote ${serverRoutines.length} routines`)
    } catch (e) {
      console.error('[Hydration] Failed to write routines to SQLite:', e)
    }
  }
}

function assertCurrentHydration(scope: ProfileScope): void {
  if (!isCurrentProfile(scope)) throw new Error('Profile changed during hydration')
}
