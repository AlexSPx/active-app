import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiExercise, CreateWorkoutRequest, UpdateWorkoutRequest } from '../../../types/api'
import type { Workout } from '../../../types/workout'
import { useProfileQueryKeys } from '../../../lib/hooks/useProfileQueryKeys'
import { useWorkoutRepository } from '../../../lib/hooks/useRepository'
import { syncEngine } from '../../../lib/sync'
import { useRunningWorkoutStore } from '../../workout-session/stores/runningWorkoutStore'

export function useWorkoutMutations() {
  const queryClient = useQueryClient()
  const repo = useWorkoutRepository()
  const ownerKeys = useProfileQueryKeys()
  const invalidateWorkouts = () => {
    queryClient.invalidateQueries({ queryKey: ownerKeys.workouts.all })
  }

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
    retry: false,
    onSuccess: invalidateWorkouts,
  })

  const updateMutation = useMutation({
    mutationFn: ({
      workoutId,
      payload,
      exercises,
    }: {
      workoutId: string
      payload: UpdateWorkoutRequest
      exercises: ApiExercise[]
    }) => repo.update(workoutId, payload, exercises),
    retry: false,
    onSuccess: invalidateWorkouts,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      const runningId = useRunningWorkoutStore.getState().runningWorkout?.id
      if (
        runningId &&
        syncEngine.resolveId('workouts', runningId) === syncEngine.resolveId('workouts', id)
      ) {
        throw new Error('Finish or cancel this running workout before deleting it.')
      }
      return repo.delete(id)
    },
    retry: false,
    onSuccess: () => {
      invalidateWorkouts()
      queryClient.invalidateQueries({ queryKey: ownerKeys.routines.all })
      queryClient.invalidateQueries({ queryKey: ownerKeys.records.all })
    },
  })

  const deleteRecordMutation = useMutation({
    mutationFn: (id: string) => repo.deleteRecord(id),
    retry: false,
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
