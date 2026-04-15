import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../../lib/queryKeys'
import { useRoutineRepository } from '../../../lib/hooks/useRepository'
import type { Routine } from '../../../types/routine'

export interface UseRoutinesReturn {
  routines: Routine[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  isStale: boolean
}

export function useRoutines(): UseRoutinesReturn {
  const repo = useRoutineRepository()

  const { data, isLoading, error, refetch, isStale } = useQuery({
    queryKey: queryKeys.routines.list(),
    queryFn: async () => {
      return repo.getAll()
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  return {
    routines: data || [],
    loading: isLoading,
    error: error?.message ?? null,
    refetch: async () => { await refetch() },
    isStale,
  }
}


