import { apiService } from '../services/apiService'
import type { Routine } from '../types/routine'
import { useCachedQuery } from './useCachedQuery'

export interface UseRoutinesReturn {
  routines: Routine[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  isStale: boolean
  isExpired: boolean
}

export function useRoutines(): UseRoutinesReturn {
  const { data, isLoading, error, refresh, isStale, isExpired } = useCachedQuery<Routine[]>({
    keyParts: ['routines'],
    tags: ['routines'],
    fetcher: () => apiService.getRoutines(),
    ttlMs: 12 * 60 * 60 * 1000,
    staleAfterMs: 2 * 60 * 60 * 1000,
  })

  return {
    routines: data || [],
    loading: isLoading,
    error: error?.message ?? null,
    refetch: refresh,
    isStale,
    isExpired,
  }
}
