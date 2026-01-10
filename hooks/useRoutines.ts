import { useQuery } from '@tanstack/react-query'
import { apiService } from '../services/apiService'
import { queryKeys } from '../lib/queryKeys'
import { routinesArraySchema } from '../lib/schemas/api'
import type { Routine } from '../types/routine'

export interface UseRoutinesReturn {
  routines: Routine[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  isStale: boolean
}

export function useRoutines(): UseRoutinesReturn {
  const { data, isLoading, error, refetch, isStale } = useQuery({
    queryKey: queryKeys.routines.list(),
    queryFn: async () => {
      const response = await apiService.getRoutines()
      return routinesArraySchema.parse(response)
    },
    staleTime: 1000 * 60 * 60 * 2, // 2 hours
  })

  return {
    routines: data || [],
    loading: isLoading,
    error: error?.message ?? null,
    refetch: async () => { await refetch() },
    isStale,
  }
}


