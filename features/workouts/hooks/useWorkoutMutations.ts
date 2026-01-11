import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateWorkoutRequest, Workout } from '../../../types/workout'
import { apiService } from '../../../services/apiService'
import { queryKeys } from '../../../lib/queryKeys'

export function useWorkoutMutations() {
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: async (workout: CreateWorkoutRequest): Promise<Workout> => {
      const result = await apiService.createWorkout(workout)
      return {
        id: result.id,
        name: workout.title,
        notes: workout.notes,
        exercises: [],
        date: new Date(),
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workouts.all })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await apiService.deleteWorkout(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workouts.all })
    },
  })

  const createWorkout = async (workout: CreateWorkoutRequest): Promise<Workout | null> => {
    try {
      return await createMutation.mutateAsync(workout)
    } catch {
      return null
    }
  }

  const deleteWorkout = async (id: string): Promise<boolean> => {
    try {
      await deleteMutation.mutateAsync(id)
      return true
    } catch {
      return false
    }
  }

  return {
    createWorkout,
    deleteWorkout,
    loading: createMutation.isPending || deleteMutation.isPending,
    error: createMutation.error?.message ?? deleteMutation.error?.message ?? null,
    clearError: () => {
      createMutation.reset()
      deleteMutation.reset()
    },
  }
}

