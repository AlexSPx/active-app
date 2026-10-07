import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../../lib/queryKeys'
import { useWorkoutRepository } from '../../../lib/hooks/useRepository'
import type { ApiWorkout } from '../../../types/api'
import { useAuthStore } from '../../../stores/authStore'

export interface UseWorkoutReturn {
  workout: ApiWorkout | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useWorkout(id?: string): UseWorkoutReturn {
  const repo = useWorkoutRepository()
  const ownerId = useAuthStore((state) => state.profileOwnerId)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.forOwner(ownerId).workouts.detail(id || ''),
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
