import { apiService } from '../services/apiService'
import type { ApiWorkout } from '../types/api'
import { useCachedQuery } from './useCachedQuery'

export interface UseWorkoutsReturn {
  workouts: ApiWorkout[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useWorkouts(): UseWorkoutsReturn {
  const { data, isLoading, error, refresh } = useCachedQuery<ApiWorkout[]>({
    keyParts: ['workouts', 'all'],
    tags: ['workouts'],
    fetcher: () => apiService.getWorkouts(),
    ttlMs: 6 * 60 * 60 * 1000, // 6h
    staleAfterMs: 60 * 60 * 1000, // 1h
  })

  return {
    workouts: data || [],
    loading: isLoading,
    error: error?.message ?? null,
    refetch: () => refresh({ force: true }),
  }
}
