import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateWorkoutRequest, Workout } from '../../../types/workout'
import type { UpdateWorkoutRequest } from '../../../types/api'
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

  const updateMutation = useMutation({
    mutationFn: async ({ workoutId, payload }: { workoutId: string; payload: UpdateWorkoutRequest }): Promise<void> => {
      await apiService.updateWorkout(workoutId, payload)
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

  const updateWorkout = async (workoutId: string, payload: UpdateWorkoutRequest): Promise<boolean> => {
    try {
      await updateMutation.mutateAsync({ workoutId, payload })
      return true
    } catch {
      return false
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

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending
  const currentError = createMutation.error ?? updateMutation.error ?? deleteMutation.error

  return {
    createWorkout,
    updateWorkout,
    deleteWorkout,
    loading: isPending,
    error: currentError?.message ?? null,
    clearError: () => {
      createMutation.reset()
      updateMutation.reset()
      deleteMutation.reset()
    },
  }
}
