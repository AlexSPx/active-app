import { YStack, XStack, Button, Text, Separator } from 'tamagui'
import { Sheet } from '@tamagui/sheet'
import { useLayoutEffect, useState, useCallback, useEffect } from 'react'
import { useNavigation } from 'expo-router'
import { BackHandler } from 'react-native'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { useWorkoutManagement } from '../../hooks/useWorkoutManagement'
import { useWorkouts } from '../../hooks/useWorkouts'
import { WorkoutList } from '../../components/workouts/WorkoutList'
import { useAppNavigation } from '../../navigation/useAppNavigation'
import { useWorkoutMutations } from '../../hooks/useWorkoutMutations'
import { AlertTriangle, Trash2 } from '@tamagui/lucide-icons'

export default function WorkoutsScreen() {
  const navigation = useNavigation()
  const { startWorkout, isWorkoutRunning } = useWorkoutManagement()
  const { navigateToNewWorkout, navigateToEditWorkout } = useAppNavigation()
  const { workouts, loading, error, refetch } = useWorkouts()
  const { deleteWorkout, loading: deleting } = useWorkoutMutations()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Workouts',
    })
  }, [navigation])

  const handleEditWorkout = (workout: any) => navigateToEditWorkout(workout.id)

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

  const cancelDelete = useCallback(() => {
    setConfirmOpen(false)
    setPendingDeleteId(null)
  }, [])

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

  return (
    <YStack flex={1} bg="$background">
      <YStack flex={1} px="$4" pt="$3">
        <WorkoutList
          workouts={workouts}
          onStartWorkout={startWorkout}
          isWorkoutRunning={isWorkoutRunning()}
          onEditWorkout={handleEditWorkout}
          onDeleteWorkout={handleDeleteWorkout}
          listHeader={
            <YStack gap="$3" pb="$3">
              <Button bg="$primary" width="100%" onPress={navigateToNewWorkout}>
                Create Workout
              </Button>
              <Separator />
            </YStack>
          }
          refreshing={loading}
          onRefresh={refetch}
          onCreateWorkout={navigateToNewWorkout}
        />
      </YStack>

      <Sheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        modal
        dismissOnOverlayPress={!deleting}
        snapPointsMode="fit"
      >
        <Sheet.Overlay animation="lazy" style={{ backgroundColor: 'transparent' }} />
        <Sheet.Handle bg="$surface" />
        <Sheet.Frame bg="$surface" borderTopLeftRadius="$6" borderTopRightRadius="$6" p="$4">
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
                Cancel
              </Button>
            </YStack>
          </YStack>
        </Sheet.Frame>
      </Sheet>
    </YStack>
  )
}
