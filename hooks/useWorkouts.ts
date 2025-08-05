import { useState, useEffect, useCallback } from 'react'
import { apiService } from '../services/apiService'
import type { ApiWorkout } from '../types/api'

export interface UseWorkoutsReturn {
  workouts: ApiWorkout[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useWorkouts(): UseWorkoutsReturn {
  const [workouts, setWorkouts] = useState<ApiWorkout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchWorkouts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const fetchedWorkouts = await apiService.getWorkouts()
      setWorkouts(fetchedWorkouts)
    } catch (err) {
      console.error('Failed to fetch workouts:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch workouts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWorkouts()
  }, [fetchWorkouts])

  return {
    workouts,
    loading,
    error,
    refetch: fetchWorkouts,
  }
}
