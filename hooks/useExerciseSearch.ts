import { useState, useCallback } from 'react'
import { apiService } from '../services/apiService'
import type { ApiExercise } from '../types/api'
import { cachedFetch } from '../utils/cache/cachedFetch'

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
      const keyParts = ['exerciseSearch', query.trim()]
      const res = await cachedFetch<ApiExercise[]>({
        keyParts,
        tags: ['exercises', 'exerciseSearch'],
        fetcher: () => apiService.searchExercises(query.trim()),
        ttlMs: 12 * 60 * 60 * 1000, // 12h
        staleAfterMs: 3 * 60 * 60 * 1000, // 3h
      })
      setExercises(res.data)
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
