/**
 * useRepository - React hook for accessing repository instances.
 *
 * Creates repository instances bound to the current SQLiteContext database.
 * Repositories are memoized per database instance.
 */
import { useMemo } from 'react'
import { useSQLiteContext } from 'expo-sqlite'
import { AuthRepository } from '../repositories/AuthRepository'
import { ExerciseRepository } from '../repositories/ExerciseRepository'
import { LegalRepository } from '../repositories/LegalRepository'
import { WorkoutRepository } from '../repositories/WorkoutRepository'
import { RoutineRepository } from '../repositories/RoutineRepository'
import { UserRepository } from '../repositories/UserRepository'

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

/**
 * Returns a memoized AuthRepository for authentication operations.
 */
export function useAuthRepository(): AuthRepository {
  return useMemo(() => new AuthRepository(), [])
}

/**
 * Returns a memoized ExerciseRepository for remote exercise data.
 */
export function useExerciseRepository(): ExerciseRepository {
  return useMemo(() => new ExerciseRepository(), [])
}

/**
 * Returns a memoized LegalRepository for legal content.
 */
export function useLegalRepository(): LegalRepository {
  return useMemo(() => new LegalRepository(), [])
}

/**
 * Returns a memoized UserRepository for current-user operations.
 */
export function useUserRepository(): UserRepository {
  return useMemo(() => new UserRepository(), [])
}
