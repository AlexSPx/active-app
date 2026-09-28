import { YStack, XStack, Button, Text, Dialog } from 'tamagui'
import { Sheet } from '@tamagui/sheet'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigation, useLocalSearchParams, useRouter } from 'expo-router'
import { BackHandler, Platform } from 'react-native'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import {
  useWorkoutManagement,
  useWorkouts,
  WorkoutList,
  useWorkoutMutations,
} from '../../../features/workouts'
import { useRoutines } from '../../../features/routines'
import { useAppNavigation } from '../../../navigation/useAppNavigation'
import { AlertTriangle, Trash2 } from '@tamagui/lucide-icons'
import { ApiWorkout } from '../../../types/api'
import { CreateTopButton } from '../../../components/ui/CreateTopButton'

export default function WorkoutsInnerTab() {
  const navigation = useNavigation()
  const router = useRouter()
  const { startWorkout, isWorkoutRunning } = useWorkoutManagement()
  const { navigateToNewWorkout, navigateToEditWorkout } = useAppNavigation()
  const { workouts, loading, error, refetch } = useWorkouts()
  const { routines } = useRoutines()
  const { deleteWorkout, loading: deleting } = useWorkoutMutations()
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

  const handleDeleteWorkout = useCallback((workoutId: string) => {
    setPendingDeleteId(workoutId)
    setConfirmOpen(true)
  }, [])

  useEffect(() => {
    if (!confirmOpen) return

    const unsubNav = navigation.addListener('beforeRemove', (e: any) => {
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
    const ok = await deleteWorkout(pendingDeleteId)
    if (ok) await refetch()
    setConfirmOpen(false)
    setPendingDeleteId(null)
  }, [pendingDeleteId, deleteWorkout, refetch])

  if (loading && workouts.length === 0) {
    return (
      <YStack flex={1} justify="center" items="center" bg="$background">
        <LoadingSpinner />
        <Text mt="$4" color="$color11">
          Loading workouts...
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

  // Delete confirmation dialog content - shared between Sheet (native) and Dialog (web)
  const DeleteConfirmContent = (
    <YStack gap="$3" items="center">
      <XStack items="center" gap="$2">
        <AlertTriangle size="$1" color="$secondary" />
        <Text fontSize="$6" fontWeight="700">
          Delete workout
        </Text>
      </XStack>
      <Text color="$color10">Are you sure? This will permanently delete this workout.</Text>
      <YStack mt="$2" gap="$3" width="100%">
        <Button
          bg="$red4"
          color="$red11"
          size="$5"
          iconAfter={Trash2}
          disabled={deleting}
          onPress={confirmDelete}
        >
          {deleting ? 'Deleting…' : 'Delete workout'}
        </Button>
        <Button bg="$blue4" color="$blue12" size="$5" onPress={() => setConfirmOpen(false)}>
          <Text>Cancel</Text>
        </Button>
      </YStack>
    </YStack>
  )

  return (
    <YStack flex={1} bg="$background">
      <YStack flex={1}>
        <WorkoutList
          workouts={workouts}
          onStartWorkout={startWorkout}
          isWorkoutRunning={isWorkoutRunning()}
          routineNameByWorkoutId={routineNameByWorkoutId}
          onEditWorkout={handleEditWorkout}
          focusId={(params.focusId as string) || undefined}
          listHeader={
            <YStack mt="$1" mb="$3">
              <CreateTopButton label="Create workout" onPress={navigateToNewWorkout} />
            </YStack>
          }
          onDeleteWorkout={handleDeleteWorkout}
          refreshing={loading}
          onRefresh={refetch}
          onWorkoutPress={(workout) => router.push(`/workouts/${workout.id}`)}
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
              elevate
              key="content"
              animation={['quick', { opacity: { overshootClamping: true } }]}
              enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
              exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
              bg="$surface"
              p="$4"
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
          dismissOnOverlayPress={!deleting}
          snapPointsMode="fit"
        >
          <Sheet.Overlay animation="slow" style={{ backgroundColor: 'transparent' }} />
          <Sheet.Handle bg="$surface" />
          <Sheet.Frame bg="$surface" borderTopLeftRadius="$6" borderTopRightRadius="$6" p="$4">
            {DeleteConfirmContent}
          </Sheet.Frame>
        </Sheet>
      )}
    </YStack>
  )
}
