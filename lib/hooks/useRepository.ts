/**
 * useRepository - React hook for accessing repository instances.
 *
 * Creates repository instances bound to the current SQLiteContext database.
 * Repositories are memoized per database instance.
 */
import { useMemo } from 'react'
import { useSQLiteContext } from 'expo-sqlite'
import { WorkoutRepository } from '../repositories/WorkoutRepository'
import { RoutineRepository } from '../repositories/RoutineRepository'

/**
 * Returns a memoized WorkoutRepository bound to the current DB.
 */
export function useWorkoutRepository(): WorkoutRepository {
  const db = useSQLiteContext()
  return useMemo(() => new WorkoutRepository(db), [db])
}

/**
 * Returns a memoized RoutineRepository bound to the current DB.
 */
export function useRoutineRepository(): RoutineRepository {
  const db = useSQLiteContext()
  return useMemo(() => new RoutineRepository(db), [db])
}
