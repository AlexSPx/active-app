import { useState, useEffect, useCallback } from 'react'
import { apiService } from '../services/apiService'
import type { WorkoutRecord } from '../types/api'

export interface UseWorkoutRecordsReturn {
  workoutRecords: WorkoutRecord[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useWorkoutRecords(): UseWorkoutRecordsReturn {
  const [workoutRecords, setWorkoutRecords] = useState<WorkoutRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchWorkoutRecords = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const fetchedRecords = await apiService.getWorkoutRecords()
      setWorkoutRecords(fetchedRecords)
    } catch (err) {
      console.error('Failed to fetch workout records:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch workout records')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWorkoutRecords()
  }, [fetchWorkoutRecords])

  return {
    workoutRecords,
    loading,
    error,
    refetch: fetchWorkoutRecords,
  }
}
