import { apiService } from '../services/apiService'
import type { WorkoutRecord } from '../types/api'
import { useCachedQuery } from './useCachedQuery'

export interface UseWorkoutRecordsReturn {
  workoutRecords: WorkoutRecord[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useWorkoutRecords(): UseWorkoutRecordsReturn {
  const { data, isLoading, error, refresh } = useCachedQuery<WorkoutRecord[]>({
    keyParts: ['workoutRecords', 'all'],
    tags: ['history', 'workouts'],
    fetcher: () => apiService.getWorkoutRecords(),
    ttlMs: 48 * 60 * 60 * 1000, // 48h
    staleAfterMs: 8 * 60 * 60 * 1000, // 8h
  })

  return {
    workoutRecords: data || [],
    loading: isLoading,
    error: error?.message ?? null,
    refetch: () => refresh(),
  }
}
