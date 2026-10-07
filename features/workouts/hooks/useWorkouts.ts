import { useQuery } from '@tanstack/react-query'
import { useProfileQueryKeys } from '../../../lib/hooks/useProfileQueryKeys'
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
  const ownerKeys = useProfileQueryKeys()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ownerKeys.workouts.list(),
    queryFn: async () => {
      return repo.getAll()
    },
    staleTime: 1000 * 60 * 5, // 5 minutes — data is local, so this is just for re-render control
  })

  return {
    workouts: (data as ApiWorkout[]) || [],
    loading: isLoading,
    error: error?.message ?? null,
    refetch: async () => {
      await refetch()
    },
  }
}
