import { useState, useCallback } from 'react'
import { apiService } from '../services/apiService'
import type { ApiExercise } from '../types/api'

export function useExerciseSearch() {
  const [exercises, setExercises] = useState<ApiExercise[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const searchExercises = useCallback(async (query: string) => {
    if (!query.trim()) {
      setExercises([])
      setHasSearched(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      setHasSearched(true)

      const apiExercises = await apiService.searchExercises(query.trim())
      setExercises(apiExercises)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search exercises')
      setExercises([])
    } finally {
      setLoading(false)
    }
  }, [])

  const clearSearch = useCallback(() => {
    setExercises([])
    setError(null)
    setHasSearched(false)
  }, [])

  return {
    exercises,
    loading,
    error,
    hasSearched,
    searchExercises,
    clearSearch,
  }
}
