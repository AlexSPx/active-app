import { useEffect, useState } from 'react'
import { useNavigation, router } from 'expo-router'
import { useRoutines, useActiveRoutine, useRoutineMutations } from '../index'
import { usePreventRemove } from '@react-navigation/native'
import { useWorkouts } from '../../workouts'
import { syncEngine } from '../../../lib/sync'
import type { Routine } from '../../../types/routine'

export function useRoutineLibrary() {
  const navigation = useNavigation()
  const { workouts } = useWorkouts()
  const library = useRoutines()
  const active = useActiveRoutine()
  const mutations = useRoutineMutations()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const busy = mutations.loading || reconciling
  const workoutTitleById = Object.fromEntries(
    workouts.map((workout) => [syncEngine.resolveId('workouts', workout.id), workout.title])
  )
  const routines = library.routines.map((routine) => ({
    ...routine,
    id: syncEngine.resolveId('routines', routine.id),
    pattern: routine.pattern.map((day) => ({
      ...day,
      workoutId: day.workoutId ? syncEngine.resolveId('workouts', day.workoutId) : day.workoutId,
    })),
  }))
  useEffect(
    () =>
      navigation.addListener('focus', () => {
        if (library.isStale) void library.refetch()
        if (active.isStale) void active.refetch()
      }),
    [navigation, library.isStale, library.refetch, active.isStale, active.refetch]
  )
  usePreventRemove(pendingDeleteId !== null, () => {
    if (!busy) setPendingDeleteId(null)
  })
  const refresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([library.refetch(), active.refetch()])
    } finally {
      setRefreshing(false)
    }
  }
  const reconcile = async (action: () => Promise<unknown>) => {
    if (busy) return
    mutations.clearError()
    setReconciling(true)
    try {
      if (await action()) await Promise.all([library.refetch(), active.refetch()])
    } finally {
      setReconciling(false)
    }
  }
  return {
    routines,
    workoutTitleById,
    loading: library.loading,
    error: library.error,
    mutationError: mutations.error,
    activeRoutineId: active.activeRoutine
      ? syncEngine.resolveId('routines', active.activeRoutine.id)
      : null,
    busy,
    refreshing: refreshing || active.loading,
    refresh,
    retry: library.refetch,
    create: () => router.push('/routines/new'),
    edit: (routine: Routine) =>
      router.push({
        pathname: '/routines/edit',
        params: { id: syncEngine.resolveId('routines', routine.id) },
      }),
    detail: (routine: Routine) =>
      router.push({
        pathname: '/routines/[id]',
        params: { id: syncEngine.resolveId('routines', routine.id) },
      }),
    activate: (id: string) =>
      reconcile(() => mutations.activateRoutine(syncEngine.resolveId('routines', id))),
    startToday: (id: string) =>
      reconcile(() =>
        mutations.updateRoutine(syncEngine.resolveId('routines', id), {
          startDate: new Date().toISOString(),
        })
      ),
    requestDelete: (id: string) => {
      mutations.clearError()
      setPendingDeleteId(id)
    },
    confirmOpen: pendingDeleteId !== null,
    setConfirmOpen: (open: boolean) => {
      if (!open && !busy) setPendingDeleteId(null)
    },
    confirmDelete: async () => {
      if (!pendingDeleteId || busy) return
      setReconciling(true)
      try {
        if (!(await mutations.deleteRoutine(syncEngine.resolveId('routines', pendingDeleteId))))
          return
        await Promise.all([library.refetch(), active.refetch()])
        setPendingDeleteId(null)
      } finally {
        setReconciling(false)
      }
    },
  }
}
