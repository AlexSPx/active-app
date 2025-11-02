import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { BackHandler } from 'react-native'
import { useNavigation, router } from 'expo-router'
import { YStack, Button, Text, XStack } from 'tamagui'
import { Sheet } from '@tamagui/sheet'
import { AlertTriangle, Trash2 } from '@tamagui/lucide-icons'

import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import { RoutineList } from '../../../components/routines/RoutineList'
import { useRoutines } from '../../../hooks/useRoutines'
import { useRoutineMutations } from '../../../hooks/useRoutineMutations'
import { apiService } from '../../../services/apiService'
import type { Routine } from '../../../types/routine'

export default function RoutinesTab() {
  const navigation = useNavigation()

  const { routines, loading, error, refetch } = useRoutines()
  const { deleteRoutine, activateRoutine, loading: mutating } = useRoutineMutations()

  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Routines' })
  }, [navigation])

  const fetchActive = useCallback(async () => {
    try {
      const active = await apiService.getActiveRoutine()
      setActiveRoutineId(active.id)
    } catch (e: any) {
      // 404 means no active routine; others we ignore for now
      if (!(e && typeof e === 'object' && 'status' in e && (e as any).status === 404)) {
        console.warn('Failed to fetch active routine:', e)
      }
      setActiveRoutineId(null)
    }
  }, [])

  useEffect(() => {
    fetchActive()
  }, [fetchActive])

  // Refetch when screen gains focus (ensures newly created routines appear)
  useEffect(() => {
    const unsub = (navigation as any).addListener?.('focus', async () => {
      await refetch()
      await fetchActive()
    })
    return () => unsub?.()
  }, [fetchActive, navigation, refetch])

  const openCreate = useCallback(() => {
    router.push('/routines/new')
  }, [])

  const openEdit = useCallback((routine: Routine) => {
    router.push(`/routines/edit?id=${routine.id}`)
  }, [])

  const handleActivate = useCallback(
    async (routineId: string) => {
      const updated = await activateRoutine(routineId)
      if (updated) {
        setActiveRoutineId(updated.id)
      } else {
        // Fallback refetch
        await fetchActive()
      }
    },
    [activateRoutine, fetchActive]
  )

  const handleDeleteRoutine = useCallback((routineId: string) => {
    setPendingDeleteId(routineId)
    setConfirmOpen(true)
  }, [])

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
      await refetch()
      await fetchActive()
    }
    setConfirmOpen(false)
    setPendingDeleteId(null)
  }, [deleteRoutine, fetchActive, pendingDeleteId, refetch])

  if (loading && routines.length === 0) {
    return (
      <YStack flex={1} justify="center" items="center" bg="$background">
        <LoadingSpinner />
        <Text mt="$4" color="$color11">
          Loading routines...
        </Text>
      </YStack>
    )
  }

  if (error) {
    return (
      <YStack flex={1} justify="center" items="center" bg="$background" p="$4">
        <ErrorDisplay message={error} />
        <Button mt="$4" onPress={refetch}>
          Try Again
        </Button>
      </YStack>
    )
  }

  return (
    <YStack flex={1} bg="$background">
      <YStack flex={1} px="$4">
        <RoutineList
          routines={routines}
          activeRoutineId={activeRoutineId}
          onActivate={handleActivate}
          onEditRoutine={openEdit}
          onDeleteRoutine={handleDeleteRoutine}
          disableActions={mutating}
          listHeader={
            <Button bg="$primary" width="100%" my="$3" onPress={openCreate}>
              <Text>Create Routine</Text>
            </Button>
          }
          refreshing={loading}
          onRefresh={async () => {
            await refetch()
            await fetchActive()
          }}
          onCreateRoutine={openCreate}
        />
      </YStack>

      {/* Delete confirm */}
      <Sheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        modal
        dismissOnOverlayPress={!mutating}
        snapPointsMode="fit"
      >
        <Sheet.Overlay animation="lazy" style={{ backgroundColor: 'transparent' }} />
        <Sheet.Handle bg="$surface" />
        <Sheet.Frame bg="$surface" borderTopLeftRadius="$6" borderTopRightRadius="$6" p="$4">
          <YStack gap="$3" items="center">
            <XStack items="center" gap="$2">
              <AlertTriangle size="$1" color="$secondary" />
              <Text fontSize="$6" fontWeight="700">
                Delete routine
              </Text>
            </XStack>
            <Text color="$color10">Are you sure? This will permanently delete this routine.</Text>
            <YStack mt="$2" gap="$3" width="100%">
              <Button
                bg="$red4"
                color="$red11"
                size="$5"
                iconAfter={Trash2}
                disabled={mutating}
                onPress={confirmDelete}
              >
                {mutating ? 'Deleting…' : 'Delete routine'}
              </Button>
              <Button bg="$blue4" color="$blue12" size="$5" onPress={() => setConfirmOpen(false)}>
                Cancel
              </Button>
            </YStack>
          </YStack>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  )
}
