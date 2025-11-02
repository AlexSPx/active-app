import { useCallback, useEffect, useState } from 'react'
import { apiService } from '../services/apiService'
import type { Routine } from '../types/routine'

export interface UseActiveRoutineReturn {
  activeRoutine: Routine | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * useActiveRoutine
 *
 * Hook that fetches the currently active routine.
 * - Treats 404 as "no active routine" (not an error)
 * - Exposes a refetch function for manual refresh
 */
export function useActiveRoutine(): UseActiveRoutineReturn {
  const [activeRoutine, setActiveRoutine] = useState<Routine | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const fetchActive = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const routine = await apiService.getActiveRoutine()
      setActiveRoutine(routine)
    } catch (e: any) {
      // Treat 404 as "no active routine"
      if (e && typeof e === 'object' && 'status' in e && (e as any).status === 404) {
        setActiveRoutine(null)
        setError(null)
      } else {
        setError('Failed to load active routine')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActive()
  }, [fetchActive])

  return { activeRoutine, loading, error, refetch: fetchActive }
}
