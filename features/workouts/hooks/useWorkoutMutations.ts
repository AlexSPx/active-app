import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateWorkoutRequest, Workout } from '../../../types/workout'
import type { UpdateWorkoutRequest } from '../../../types/api'
import { queryKeys } from '../../../lib/queryKeys'
import { useWorkoutRepository } from '../../../lib/hooks/useRepository'

export function useWorkoutMutations() {
  const queryClient = useQueryClient()
  const repo = useWorkoutRepository()

  const createMutation = useMutation({
    mutationFn: async (workout: CreateWorkoutRequest): Promise<Workout> => {
      const created = await repo.create(workout)

      return {
        id: created.id,
        name: created.title || '',
        notes: created.notes ?? undefined,
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
      await repo.update(workoutId, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workouts.all })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await repo.delete(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workouts.all })
    },
  })

  const deleteRecordMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await repo.deleteRecord(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.records.all })
    },
  })

  const createWorkout = async (workout: CreateWorkoutRequest): Promise<Workout | null> => {
    try {
      return await createMutation.mutateAsync(workout)
    } catch (error: any) {
      console.error('Error creating workout:', error)
      // Throw error to let the caller handle it and show exact message
      throw error
    }
  }

  const updateWorkout = async (workoutId: string, payload: UpdateWorkoutRequest): Promise<boolean> => {
    try {
      await updateMutation.mutateAsync({ workoutId, payload })
      return true
    } catch (error) {
      console.error('Error updating workout:', error)
      return false
    }
  }

  const deleteWorkout = async (id: string): Promise<boolean> => {
    try {
      await deleteMutation.mutateAsync(id)
      return true
    } catch (error) {
      console.error('Error deleting workout:', error)
      return false
    }
  }

  const deleteWorkoutRecord = async (id: string): Promise<boolean> => {
    try {
      await deleteRecordMutation.mutateAsync(id)
      return true
    } catch (error) {
      console.error('Error deleting workout record:', error)
      return false
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending || deleteRecordMutation.isPending
  const currentError = createMutation.error ?? updateMutation.error ?? deleteMutation.error ?? deleteRecordMutation.error

  return {
    createWorkout,
    updateWorkout,
    deleteWorkout,
    deleteWorkoutRecord,
    loading: isPending,
    error: currentError?.message ?? null,
    clearError: () => {
      createMutation.reset()
      updateMutation.reset()
      deleteMutation.reset()
      deleteRecordMutation.reset()
    },
  }
}
