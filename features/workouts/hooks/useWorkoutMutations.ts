import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiExercise, CreateWorkoutRequest, UpdateWorkoutRequest } from '../../../types/api'
import type { Workout } from '../../../types/workout'
import { queryKeys } from '../../../lib/queryKeys'
import { useWorkoutRepository } from '../../../lib/hooks/useRepository'
import { useAuthStore } from '../../../stores/authStore'

export function useWorkoutMutations() {
  const queryClient = useQueryClient()
  const repo = useWorkoutRepository()
  const ownerId = useAuthStore((state) => state.profileOwnerId)
  const ownerKeys = queryKeys.forOwner(ownerId)

  const createMutation = useMutation({
    mutationFn: async ({
      workout,
      exercises,
    }: {
      workout: CreateWorkoutRequest
      exercises: ApiExercise[]
    }): Promise<Workout> => {
      const created = await repo.create(workout, exercises)

      return {
        id: created.id,
        name: created.title || '',
        notes: created.notes ?? undefined,
        exercises: [],
        date: new Date(),
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ownerKeys.workouts.all })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      workoutId,
      payload,
      exercises,
    }: {
      workoutId: string
      payload: UpdateWorkoutRequest
      exercises: ApiExercise[]
    }): Promise<void> => {
      await repo.update(workoutId, payload, exercises)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ownerKeys.workouts.all })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await repo.delete(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ownerKeys.workouts.all })
    },
  })

  const deleteRecordMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await repo.deleteRecord(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ownerKeys.records.all })
    },
  })

  const createWorkout = async (
    workout: CreateWorkoutRequest,
    exercises: ApiExercise[]
  ): Promise<Workout | null> => {
    try {
      return await createMutation.mutateAsync({ workout, exercises })
    } catch (error: any) {
      console.error('Error creating workout:', error)
      // Throw error to let the caller handle it and show exact message
      throw error
    }
  }

  const updateWorkout = async (
    workoutId: string,
    payload: UpdateWorkoutRequest,
    exercises: ApiExercise[]
  ): Promise<boolean> => {
    try {
      await updateMutation.mutateAsync({ workoutId, payload, exercises })
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

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    deleteRecordMutation.isPending
  const currentError =
    createMutation.error ??
    updateMutation.error ??
    deleteMutation.error ??
    deleteRecordMutation.error

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
