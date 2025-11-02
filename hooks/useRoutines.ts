import { useState, useEffect, useCallback } from 'react'
import { apiService } from '../services/apiService'
import type { Routine } from '../types/routine'

export interface UseRoutinesReturn {
  routines: Routine[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useRoutines(): UseRoutinesReturn {
  const [routines, setRoutines] = useState<Routine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRoutines = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiService.getRoutines()
      // Defensive sort by createdAt desc
      const sorted = [...data].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      setRoutines(sorted)
    } catch (err) {
      console.error('Failed to fetch routines:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch routines')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRoutines()
  }, [fetchRoutines])

  return {
    routines,
    loading,
    error,
    refetch: fetchRoutines,
  }
}
