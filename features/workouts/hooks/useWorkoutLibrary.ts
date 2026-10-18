import { usePreventRemove } from '@react-navigation/native'
import { useState, useCallback, useMemo } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useWorkoutManagement } from './useWorkoutManagement'
import { useWorkouts } from './useWorkouts'
import { useWorkoutMutations } from './useWorkoutMutations'
import { useRoutines } from '../../routines'
import { useAppNavigation } from '../../../navigation/useAppNavigation'
import type { ApiWorkout } from '../../../types/api'

export function useWorkoutLibrary() {
  const router = useRouter()
  const { startWorkout, isWorkoutRunning } = useWorkoutManagement()
  const { navigateToNewWorkout, navigateToEditWorkout } = useAppNavigation()
  const { workouts, loading, error, refetch } = useWorkouts()
  const { routines } = useRoutines()
  const { deleteWorkout, loading: deleting, error: deleteError, clearError } = useWorkoutMutations()
  const [reconciling, setReconciling] = useState(false)
  const busy = deleting || reconciling
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const params = useLocalSearchParams<{ focusId?: string }>()

  const routineNameByWorkoutId = useMemo(() => {
    const mapping: Record<string, string> = {}
    for (const routine of routines) {
      for (const day of routine.pattern) {
        if (day.dayType !== 'WORKOUT' || !day.workoutId) continue
        if (!mapping[day.workoutId]) {
          mapping[day.workoutId] = routine.name
        }
      }
    }
    return mapping
  }, [routines])

  const handleEditWorkout = (workout: ApiWorkout) => navigateToEditWorkout(workout.id)

  const handleDeleteWorkout = useCallback(
    (workoutId: string) => {
      clearError()
      setPendingDeleteId(workoutId)
      setConfirmOpen(true)
    },
    [clearError]
  )

  const cancelDelete = useCallback(() => {
    if (busy) return
    setConfirmOpen(false)
    setPendingDeleteId(null)
    clearError()
  }, [busy, clearError])

  usePreventRemove(confirmOpen, () => {
    if (!busy) cancelDelete()
  })

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId || busy) return
    setReconciling(true)
    try {
      if (!(await deleteWorkout(pendingDeleteId))) return
      await refetch()
      setConfirmOpen(false)
      setPendingDeleteId(null)
    } finally {
      setReconciling(false)
    }
  }, [pendingDeleteId, deleteWorkout, refetch, busy])

  return {
    workouts,
    loading,
    error,
    refetch,
    routineNameByWorkoutId,
    startWorkout,
    running: isWorkoutRunning(),
    deleting: busy,
    deleteError,
    confirmOpen,
    focusId: params.focusId,
    cancelDelete,
    confirmDelete,
    handleDeleteWorkout,
    handleEditWorkout,
    navigateToNewWorkout,
    openWorkout: (workout: ApiWorkout) => router.push(`/workouts/${workout.id}`),
  }
}
