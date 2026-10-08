import { useQuery } from '@tanstack/react-query'
import { useProfileQueryKeys } from '../../../lib/hooks/useProfileQueryKeys'
import { useWorkoutRepository } from '../../../lib/hooks/useRepository'
import type { ApiWorkout } from '../../../types/api'

export interface UseWorkoutReturn {
  workout: ApiWorkout | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useWorkout(id?: string): UseWorkoutReturn {
  const repo = useWorkoutRepository()
  const ownerKeys = useProfileQueryKeys()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ownerKeys.workouts.detail(id || ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<ApiWorkout | null> => {
      if (!id) return null
      return repo.getById(id)
    },
    staleTime: 1000 * 60 * 5, // 5 minutes — data is local, so this is just for re-render control
  })

  return {
    workout: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refetch: async () => {
      await refetch()
    },
  }
}
