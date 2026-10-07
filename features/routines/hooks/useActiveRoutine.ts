import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../../lib/queryKeys'
import { useRoutineRepository } from '../../../lib/hooks/useRepository'
import type { Routine } from '../../../types/routine'
import { useAuthStore } from '../../../stores/authStore'

export interface UseActiveRoutineReturn {
  activeRoutine: Routine | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  isStale: boolean
}

/**
 * Hook that fetches the currently active routine from local SQLite.
 * Returns null if no routine is active.
 */
export function useActiveRoutine(): UseActiveRoutineReturn {
  const repo = useRoutineRepository()
  const ownerId = useAuthStore((state) => state.profileOwnerId)

  const { data, isLoading, error, refetch, isStale } = useQuery({
    queryKey: queryKeys.forOwner(ownerId).routines.active(),
    queryFn: async (): Promise<Routine | null> => {
      return repo.getActive()
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  return {
    activeRoutine: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refetch: async () => {
      await refetch()
    },
    isStale,
  }
}
