import { useState } from 'react'
import type { CreateWorkoutRequest, Workout } from '../types/workout'
import { apiService } from '../services/apiService'
import { invalidateTags } from '../utils/cache/invalidate'

export function useWorkoutMutations() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createWorkout = async (workout: CreateWorkoutRequest): Promise<Workout | null> => {
    try {
      setLoading(true)
      setError(null)
      const result = await apiService.createWorkout(workout)
      // Note: API returns { id: string }, so we need to create a Workout object
      const newWorkout: Workout = {
        id: result.id,
        name: workout.title,
        notes: workout.notes,
        exercises: [], // Would need to convert from template
        date: new Date(),
      }
      // Invalidate workouts list to include the new one
      invalidateTags(['workouts'])
      return newWorkout
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workout')
      return null
    } finally {
      setLoading(false)
    }
  }

  const deleteWorkout = async (id: string): Promise<boolean> => {
    try {
      setLoading(true)
      setError(null)
      await apiService.deleteWorkout(id)
      invalidateTags(['workouts', `workout:${id}`])
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workout')
      return false
    } finally {
      setLoading(false)
    }
  }

  return {
    createWorkout,
    deleteWorkout,
    loading,
    error,
    clearError: () => setError(null),
  }
}
