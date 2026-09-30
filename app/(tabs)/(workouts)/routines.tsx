import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { BackHandler, Platform } from 'react-native'
import { useNavigation, router } from 'expo-router'
import { YStack, Button, Text, XStack, Dialog } from 'tamagui'
import { Sheet } from '@tamagui/sheet'
import { AlertTriangle, Trash2 } from '@tamagui/lucide-icons'

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
import { posthog } from '../../../services/posthog'
import { CreateTopButton } from '../../../components/ui/CreateTopButton'

export default function RoutinesTab() {
  const navigation = useNavigation()
  const { workouts } = useWorkouts()
  const workoutTitleById = useMemo(
    () => Object.fromEntries(workouts.map((workout) => [workout.id, workout.title])),
    [workouts]
  )

  const { routines, loading, error, refetch, isStale: routinesStale } = useRoutines()
  const { deleteRoutine, activateRoutine, updateRoutine, loading: mutating } = useRoutineMutations()
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
        posthog.capture('routine_activated')
        await refetchActive()
      }
    },
    [activateRoutine, refetchActive]
  )

  const handleDeleteRoutine = useCallback((routineId: string) => {
    setPendingDeleteId(routineId)
    setConfirmOpen(true)
  }, [])

  const handleStartFromToday = useCallback(
    async (routineId: string) => {
      const updated = await updateRoutine(routineId, {
        startDate: new Date().toISOString(),
      })
      if (updated) {
        posthog.capture('routine_start_date_updated')
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
      setConfirmOpen(false)
    })

    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (confirmOpen) {
        setConfirmOpen(false)
        return true
      }
      return false
    })

    return () => {
      unsubNav?.()
      backSub.remove()
    }
  }, [confirmOpen, navigation])

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return
    const ok = await deleteRoutine(pendingDeleteId)
    if (ok) {
      posthog.capture('routine_deleted')
      await refetch()
    }
    setConfirmOpen(false)
    setPendingDeleteId(null)
  }, [deleteRoutine, pendingDeleteId, refetch])

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

  // Delete confirmation content - shared between Sheet (native) and Dialog (web)
  const DeleteConfirmContent = (
    <YStack gap="$3" items="center">
      <XStack items="center" gap="$2">
        <AlertTriangle size="$1" color="$destructive" />
        <Text fontSize="$sectionTitle" fontWeight="700">
          Delete routine
        </Text>
      </XStack>
      <Text color="$colorSubtle">Are you sure? This will permanently delete this routine.</Text>
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

      {/* Use Dialog on web (Sheet has rendering issues), Sheet on native */}
      {Platform.OS === 'web' ? (
        <Dialog modal open={confirmOpen} onOpenChange={setConfirmOpen}>
          <Dialog.Portal>
            <Dialog.Overlay
              key="overlay"
              animation="slow"
              opacity={0.5}
              enterStyle={{ opacity: 0 }}
              exitStyle={{ opacity: 0 }}
            />
            <Dialog.Content
              bordered
              rounded="$menu"
              key="content"
              animation={['quick', { opacity: { overshootClamping: true } }]}
              enterStyle={{ opacity: 0 }}
              exitStyle={{ opacity: 0 }}
              bg="$surface"
              p="$page"
            >
              {DeleteConfirmContent}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      ) : (
        <Sheet
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          modal
          dismissOnOverlayPress={!mutating}
          snapPointsMode="fit"
        >
          <Sheet.Overlay animation="slow" bg="$backgroundTransparent" />
          <Sheet.Handle bg="$surface" />
          <Sheet.Frame
            bg="$surface"
            borderTopLeftRadius="$sheet"
            borderTopRightRadius="$sheet"
            p="$page"
          >
            {DeleteConfirmContent}
          </Sheet.Frame>
        </Sheet>
      )}
    </YStack>
  )
}
