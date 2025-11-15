import { useCallback } from 'react'
import { apiService } from '../services/apiService'
import type { Routine } from '../types/routine'
import { useCachedQuery } from './useCachedQuery'

export interface UseActiveRoutineReturn {
  activeRoutine: Routine | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  isStale: boolean
  isExpired: boolean
}

/**
 * useActiveRoutine
 *
 * Hook that fetches the currently active routine.
 * - Treats 404 as "no active routine" (not an error)
 * - Exposes a refetch function for manual refresh
 */
export function useActiveRoutine(): UseActiveRoutineReturn {
  const fetcher = useCallback(async (): Promise<Routine | null> => {
    try {
      const routine = await apiService.getActiveRoutine()
      return routine
    } catch (e: any) {
      if (e && typeof e === 'object' && 'status' in e && (e as any).status === 404) {
        return null
      }
      throw e
    }
  }, [])

  const { data, isLoading, error, refresh, isStale, isExpired } = useCachedQuery<Routine | null>({
    keyParts: ['activeRoutine'],
    tags: ['activeRoutine'],
    fetcher,
    ttlMs: 2 * 60 * 60 * 1000, // 2h
    staleAfterMs: 30 * 60 * 1000, // 30m
  })

  return {
    activeRoutine: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refetch: refresh,
    isStale,
    isExpired,
  }
}
