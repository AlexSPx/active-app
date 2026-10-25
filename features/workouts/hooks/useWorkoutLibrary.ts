import { usePreventRemove } from 'expo-router/react-navigation'
import { useState, useCallback } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useWorkoutManagement } from './useWorkoutManagement'
import { useWorkouts } from './useWorkouts'
import { useWorkoutMutations } from './useWorkoutMutations'
import { useAppNavigation } from '../../../navigation/useAppNavigation'
import type { ApiWorkout } from '../../../types/api'

export function useWorkoutLibrary() {
  const router = useRouter()
  const { startWorkout, isWorkoutRunning } = useWorkoutManagement()
  const { navigateToNewWorkout, navigateToEditWorkout } = useAppNavigation()
  const { workouts, loading, error, refetch } = useWorkouts()
  const { deleteWorkout, loading: deleting, error: deleteError, clearError } = useWorkoutMutations()
  const [refreshing, setRefreshing] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const busy = deleting || reconciling
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const params = useLocalSearchParams<{ focusId?: string }>()

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

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
    refreshing,
    refresh,
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
