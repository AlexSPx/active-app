import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../../lib/queryKeys'
import { useWorkoutRepository } from '../../../lib/hooks/useRepository'
import type { ApiWorkout } from '../../../types/api'

export interface UseWorkoutsReturn {
  workouts: ApiWorkout[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useWorkouts(): UseWorkoutsReturn {
  const repo = useWorkoutRepository()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.workouts.list(),
    queryFn: async () => {
      return repo.getAll()
    },
    staleTime: 1000 * 60 * 5, // 5 minutes — data is local, so this is just for re-render control
  })

  return {
    workouts: (data as ApiWorkout[]) || [],
    loading: isLoading,
    error: error?.message ?? null,
    refetch: async () => { await refetch() },
  }
}
