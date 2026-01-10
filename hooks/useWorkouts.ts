import { useQuery } from '@tanstack/react-query'
import { apiService } from '../services/apiService'
import { queryKeys } from '../lib/queryKeys'
import { workoutsArraySchema } from '../lib/schemas/api'
import type { ApiWorkout } from '../types/api'

export interface UseWorkoutsReturn {
  workouts: ApiWorkout[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useWorkouts(): UseWorkoutsReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.workouts.list(),
    queryFn: async () => {
      const response = await apiService.getWorkouts()
      return workoutsArraySchema.parse(response)
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  })

  return {
    workouts: (data as ApiWorkout[]) || [],
    loading: isLoading,
    error: error?.message ?? null,
    refetch: async () => { await refetch() },
  }
}

