import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useNavigation, router } from 'expo-router'
import { YStack, Button, Text } from 'tamagui'
import { CadenceOverlay } from '../../../components/ui/CadenceOverlay'
import { Trash2 } from '../../../components/ui/icons'

import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import {
  RoutineList,
  useRoutines,
  useRoutineMutations,
  useActiveRoutine,
} from '../../../features/routines'
import { useWorkouts } from '../../../features/workouts'
import type { Routine } from '../../../types/routine'
import { CreateTopButton } from '../../../components/ui/CreateTopButton'

export default function RoutinesTab() {
  const navigation = useNavigation()
  const { workouts } = useWorkouts()
  const workoutTitleById = useMemo(
    () => Object.fromEntries(workouts.map((workout) => [workout.id, workout.title])),
    [workouts]
  )

  const { routines, loading, error, refetch, isStale: routinesStale } = useRoutines()
  const {
    deleteRoutine,
    activateRoutine,
    updateRoutine,
    loading: mutating,
    error: deleteError,
    clearError,
  } = useRoutineMutations()
  const {
    activeRoutine,
    refetch: refetchActive,
    isStale: activeStale,
    loading: activeLoading,
  } = useActiveRoutine()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  // Separate state for FlashList UI refresh (pull-to-refresh)
  const [refreshing, setRefreshing] = useState(false)

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Routines' })
  }, [navigation])

  // Refresh data when this screen gains focus

  // Refetch when screen gains focus (only if data is stale to avoid unnecessary requests)
  useEffect(() => {
    const unsub = (navigation as any).addListener?.('focus', async () => {
      if (routinesStale) await refetch()
      if (activeStale) await refetchActive()
    })
    return () => unsub?.()
  }, [navigation, refetch, refetchActive, routinesStale, activeStale])

  const openCreate = useCallback(() => {
    router.push('/routines/new')
  }, [])

  const openEdit = useCallback((routine: Routine) => {
    router.push(`/routines/edit?id=${routine.id}`)
  }, [])

  const openDetail = useCallback((routine: Routine) => {
    router.push(`/routines/${routine.id}`)
  }, [])

  const handleActivate = useCallback(
    async (routineId: string) => {
      const updated = await activateRoutine(routineId)
      if (updated) {
        await refetchActive()
      }
    },
    [activateRoutine, refetchActive]
  )

  const handleDeleteRoutine = useCallback(
    (routineId: string) => {
      clearError()
      setPendingDeleteId(routineId)
      setConfirmOpen(true)
    },
    [clearError]
  )

  const handleStartFromToday = useCallback(
    async (routineId: string) => {
      const updated = await updateRoutine(routineId, {
        startDate: new Date().toISOString(),
      })
      if (updated) {
        await Promise.all([refetch(), refetchActive()])
      }
    },
    [updateRoutine, refetch, refetchActive]
  )

  useEffect(() => {
    if (!confirmOpen) return

    const unsubNav = (navigation as any).addListener?.('beforeRemove', (e: any) => {
      if (!confirmOpen) return
      e.preventDefault()
      if (!mutating) setConfirmOpen(false)
    })

    return () => unsubNav?.()
  }, [confirmOpen, navigation, mutating])

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId || mutating) return
    const ok = await deleteRoutine(pendingDeleteId)
    if (!ok) return
    await refetch()
    setConfirmOpen(false)
    setPendingDeleteId(null)
  }, [deleteRoutine, pendingDeleteId, refetch, mutating])

  if (loading && routines.length === 0) {
    return (
      <YStack flex={1} justify="center" items="center" bg="$background">
        <LoadingSpinner />
        <Text mt="$4" color="$colorSubtle">
          Loading routines...
        </Text>
      </YStack>
    )
  }

  if (error) {
    return (
      <YStack flex={1} justify="center" items="center" bg="$background" p="$page">
        <ErrorDisplay message={error} />
        <Button mt="$4" onPress={() => refetch()}>
          Try Again
        </Button>
      </YStack>
    )
  }

  const DeleteConfirmContent = (
    <YStack gap="$3" items="center">
      <Text color="$colorSubtle">Are you sure? This will permanently delete this routine.</Text>
      {!!deleteError && <ErrorDisplay title="Cannot delete routine" message={deleteError} />}
      <YStack mt="$2" gap="$3" width="100%">
        <Button
          bg="$destructive"
          color="$onPrimary"
          minH="$action"
          rounded="$button"
          iconAfter={Trash2}
          disabled={mutating}
          onPress={confirmDelete}
        >
          <Text color="$onPrimary">{mutating ? 'Deleting…' : 'Delete routine'}</Text>
        </Button>
        <Button
          bg="$backgroundStrong"
          color="$color"
          minH="$action"
          rounded="$button"
          disabled={mutating}
          onPress={() => setConfirmOpen(false)}
        >
          <Text>Cancel</Text>
        </Button>
      </YStack>
    </YStack>
  )

  return (
    <YStack flex={1} bg="$background">
      <YStack flex={1}>
        <RoutineList
          routines={routines}
          workoutTitleById={workoutTitleById}
          activeRoutineId={activeRoutine?.id ?? null}
          onActivate={handleActivate}
          onEditRoutine={openEdit}
          onDeleteRoutine={handleDeleteRoutine}
          onPressRoutine={openDetail}
          onStartFromToday={handleStartFromToday}
          disableActions={mutating}
          listHeader={
            <YStack gap="$card" mb="$page">
              <YStack gap="$1">
                <Text fontSize="$screenTitle" lineHeight="$screenTitle" fontWeight="600">
                  Your routines
                </Text>
                <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                  {routines.length} saved {routines.length === 1 ? 'routine' : 'routines'}
                </Text>
              </YStack>
              <CreateTopButton label="Create routine" onPress={openCreate} />
            </YStack>
          }
          refreshing={refreshing || activeLoading}
          onRefresh={async () => {
            setRefreshing(true)
            try {
              await Promise.all([refetch(), refetchActive()])
            } finally {
              setRefreshing(false)
            }
          }}
        />
      </YStack>

      <CadenceOverlay
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete routine"
        dismissible={!mutating}
      >
        {DeleteConfirmContent}
      </CadenceOverlay>
    </YStack>
  )
}
