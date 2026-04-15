import { SQLiteDatabase } from 'expo-sqlite'
import { apiService } from '../../services/apiService'
import { WorkoutRepository } from '../repositories/WorkoutRepository'
import { RoutineRepository } from '../repositories/RoutineRepository'

/**
 * Pull fresh data from the server and UPSERT into local SQLite.
 * Runs on app startup and post-login — non-blocking, failure is tolerated (offline).
 */
export async function hydrateFromServer(db: SQLiteDatabase): Promise<void> {
  const workoutRepo = new WorkoutRepository(db)
  const routineRepo = new RoutineRepository(db)

  // Fire all server fetches in parallel
  const [serverWorkouts, serverRecords, serverRoutines] = await Promise.all([
    apiService.getWorkouts().catch(() => null),
    apiService.getWorkoutRecords().catch(() => null),
    apiService.getRoutines().catch(() => null),
  ])

  if (serverWorkouts) {
    await workoutRepo.hydrateWorkouts(serverWorkouts)
  }
  if (serverRecords) {
    await workoutRepo.hydrateRecords(serverRecords)
  }
  if (serverRoutines) {
    // Try to get the active routine ID from user profile
    let activeRoutineId: string | null = null
    try {
      const user = await apiService.getUser()
      activeRoutineId = user.activeRoutineId || null
    } catch {
      // ignore
    }
    await routineRepo.hydrateFromServer(serverRoutines, activeRoutineId)
  }

  console.log('[Hydration] Server data synced to local DB')
}
