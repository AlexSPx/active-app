import { useState, useEffect } from 'react'
import type { Exercise } from '../types/workout'
import { apiService } from '../services/apiService'

export function useExercises() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchExercises = async () => {
    try {
      setLoading(true)
      setError(null)
      // For now, return empty array since we don't have a getExercises endpoint
      // This can be implemented when needed or use searchExercises with empty query
      const data: Exercise[] = []
      setExercises(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch exercises')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExercises()
  }, [])

  return { exercises, loading, error, refetch: fetchExercises }
}

export function useExercise(id?: string) {
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setExercise(null)
      setLoading(false)
      return
    }

    let isMounted = true

    const fetchExercise = async () => {
      try {
        setLoading(true)
        setError(null)
        // Use search to find exercise by ID (if backend supports it)
        // For now, set to null since we don't have individual exercise fetch
        const data = null

        if (isMounted) {
          setExercise(data)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch exercise')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchExercise()

    return () => {
      isMounted = false
    }
  }, [id])

  return { exercise, loading, error }
}
