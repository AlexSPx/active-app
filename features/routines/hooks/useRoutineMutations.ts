import { useState } from 'react'
import { apiService } from '../../../services/apiService'
import type { CreateRoutineRequest, UpdateRoutineRequest, Routine } from '../../../types/routine'
import type { ApiError } from '../../../types/api'
import { queryClient } from '../../../lib/queryClient'
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createRoutine = async (payload: CreateRoutineRequest): Promise<Routine | null> => {
    try {
      setLoading(true)
      setError(null)
      const routine = await apiService.createRoutine(payload)
      // Invalidate routines list
      queryClient.invalidateQueries({ queryKey: queryKeys.routines.all })
      return routine
    } catch (e) {
      console.error('Failed to create routine:', e)
      setError(toFriendlyError(e, 'Failed to create routine'))
      return null
    } finally {
      setLoading(false)
    }
  }

  const updateRoutine = async (
    routineId: string,
    payload: UpdateRoutineRequest
  ): Promise<Routine | null> => {
    try {
      setLoading(true)
      setError(null)
      const routine = await apiService.updateRoutine(routineId, payload)
      queryClient.invalidateQueries({ queryKey: queryKeys.routines.all })
      return routine
    } catch (e) {
      console.error('Failed to update routine:', e)
      setError(toFriendlyError(e, 'Failed to update routine'))
      return null
    } finally {
      setLoading(false)
    }
  }

  const deleteRoutine = async (routineId: string): Promise<boolean> => {
    try {
      setLoading(true)
      setError(null)
      await apiService.deleteRoutine(routineId)
      queryClient.invalidateQueries({ queryKey: queryKeys.routines.all })
      return true
    } catch (e) {
      console.error('Failed to delete routine:', e)
      setError(toFriendlyError(e, 'Failed to delete routine'))
      return false
    } finally {
      setLoading(false)
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

  return {
    createRoutine,
    updateRoutine,
    deleteRoutine,
    activateRoutine,
    clearActiveRoutine,
    loading,
    error,
    clearError: () => setError(null),
  }
}
