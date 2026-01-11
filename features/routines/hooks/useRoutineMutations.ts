import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiService } from '../../../services/apiService'
import type { CreateRoutineRequest, UpdateRoutineRequest, Routine } from '../../../types/routine'
import type { ApiError } from '../../../types/api'
import { queryKeys } from '../../../lib/queryKeys'

function toFriendlyError(err: unknown, fallback: string): string {
  const defaultMsg = fallback
  if (err && typeof err === 'object' && 'status' in err) {
    const e = err as ApiError
    if (e.status === 409) {
      return 'A routine with this name already exists. Please choose a different name.'
    }
    if (e.status === 400) {
      return e.message || 'Invalid data. Please check the fields and try again.'
    }
    return e.message || defaultMsg
  }
  return err instanceof Error ? err.message : defaultMsg
}

export function useRoutineMutations() {
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (payload: CreateRoutineRequest) => apiService.createRoutine(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routines.all })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ routineId, payload }: { routineId: string; payload: UpdateRoutineRequest }) =>
      apiService.updateRoutine(routineId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routines.all })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (routineId: string) => apiService.deleteRoutine(routineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routines.all })
    },
  })

  const createRoutine = async (payload: CreateRoutineRequest): Promise<Routine | null> => {
    try {
      return await createMutation.mutateAsync(payload)
    } catch (e) {
      console.error('Failed to create routine:', e)
      return null
    }
  }

  const updateRoutine = async (
    routineId: string,
    payload: UpdateRoutineRequest
  ): Promise<Routine | null> => {
    try {
      return await updateMutation.mutateAsync({ routineId, payload })
    } catch (e) {
      console.error('Failed to update routine:', e)
      return null
    }
  }

  const deleteRoutine = async (routineId: string): Promise<boolean> => {
    try {
      await deleteMutation.mutateAsync(routineId)
      return true
    } catch (e) {
      console.error('Failed to delete routine:', e)
      return false
    }
  }

  const activateRoutine = async (routineId: string): Promise<Routine | null> => {
    const result = await updateRoutine(routineId, { active: true })
    queryClient.invalidateQueries({ queryKey: queryKeys.routines.active() })
    return result
  }

  const clearActiveRoutine = async (routineId: string): Promise<Routine | null> => {
    const result = await updateRoutine(routineId, { active: false })
    queryClient.invalidateQueries({ queryKey: queryKeys.routines.active() })
    return result
  }

  const currentError =
    createMutation.error ?? updateMutation.error ?? deleteMutation.error ?? null

  return {
    createRoutine,
    updateRoutine,
    deleteRoutine,
    activateRoutine,
    clearActiveRoutine,
    loading: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
    error: currentError ? toFriendlyError(currentError, 'An error occurred') : null,
    clearError: () => {
      createMutation.reset()
      updateMutation.reset()
      deleteMutation.reset()
    },
  }
}
