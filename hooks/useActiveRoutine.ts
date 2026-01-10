import { useQuery } from '@tanstack/react-query'
import { apiService } from '../services/apiService'
import { queryKeys } from '../lib/queryKeys'
import { routineSchema } from '../lib/schemas/api'
import type { Routine } from '../types/routine'

export interface UseActiveRoutineReturn {
  activeRoutine: Routine | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  isStale: boolean
}

/**
 * Hook that fetches the currently active routine.
 * - Treats 404 as "no active routine" (not an error)
 * - Exposes a refetch function for manual refresh
 */
export function useActiveRoutine(): UseActiveRoutineReturn {
  const { data, isLoading, error, refetch, isStale } = useQuery({
    queryKey: queryKeys.routines.active(),
    queryFn: async (): Promise<Routine | null> => {
      try {
        const response = await apiService.getActiveRoutine()
        return routineSchema.parse(response)
      } catch (e: any) {
        // Treat 404 as "no active routine"
        if (e && typeof e === 'object' && 'status' in e && e.status === 404) {
          return null
        }
        throw e
      }
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
    retry: (failureCount, error: any) => {
      // Don't retry on 404
      if (error?.status === 404) return false
      return failureCount < 2
    },
  })

  return {
    activeRoutine: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refetch: async () => { await refetch() },
    isStale,
  }
}


