import { useQuery } from '@tanstack/react-query'
import { useProfileQueryKeys } from '../../../lib/hooks/useProfileQueryKeys'
import { useRoutineRepository } from '../../../lib/hooks/useRepository'
import type { Routine } from '../../../types/routine'

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
  const ownerKeys = useProfileQueryKeys()

  const { data, isLoading, error, refetch, isStale } = useQuery({
    queryKey: ownerKeys.routines.active(),
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
