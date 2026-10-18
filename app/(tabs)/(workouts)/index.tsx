import { YStack, Button, Text } from 'tamagui'
import { CadenceOverlay } from '../../../components/ui/CadenceOverlay'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigation, useLocalSearchParams, useRouter } from 'expo-router'
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
import { Trash2 } from '../../../components/ui/icons'
import { ApiWorkout } from '../../../types/api'
import { CreateTopButton } from '../../../components/ui/CreateTopButton'

export default function WorkoutsInnerTab() {
  const navigation = useNavigation()
  const router = useRouter()
  const { startWorkout, isWorkoutRunning } = useWorkoutManagement()
  const { navigateToNewWorkout, navigateToEditWorkout } = useAppNavigation()
  const { workouts, loading, error, refetch } = useWorkouts()
  const { routines } = useRoutines()
  const { deleteWorkout, loading: deleting, error: deleteError, clearError } = useWorkoutMutations()
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

  useEffect(() => {
    if (!confirmOpen) return

    const unsubNav = navigation.addListener('beforeRemove', (e: any) => {
      if (!confirmOpen) return
      e.preventDefault()
      if (!deleting) setConfirmOpen(false)
    })

    return () => unsubNav?.()
  }, [confirmOpen, navigation, deleting])

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId || deleting) return
    const ok = await deleteWorkout(pendingDeleteId)
    if (!ok) return
    await refetch()
    setConfirmOpen(false)
    setPendingDeleteId(null)
  }, [pendingDeleteId, deleteWorkout, refetch, deleting])

  if (loading && workouts.length === 0) {
    return (
      <YStack flex={1} justify="center" items="center" bg="$background">
        <LoadingSpinner />
        <Text mt="$4" color="$colorSubtle">
          Loading workouts...
        </Text>
      </YStack>
    )
  }

  if (error) {
    return (
      <YStack flex={1} justify="center" items="center" bg="$background" p="$page">
        <ErrorDisplay message={error} />
        <Button mt="$4" onPress={refetch}>
          Try Again
        </Button>
      </YStack>
    )
  }

  const DeleteConfirmContent = (
    <YStack gap="$3" items="center">
      <Text color="$colorSubtle">Are you sure? This will permanently delete this workout.</Text>
      {!!deleteError && <ErrorDisplay title="Cannot delete workout" message={deleteError} />}
      <YStack mt="$2" gap="$3" width="100%">
        <Button
          bg="$destructive"
          color="$onPrimary"
          minH="$action"
          rounded="$button"
          iconAfter={Trash2}
          disabled={deleting}
          onPress={confirmDelete}
        >
          {deleting ? 'Deleting…' : 'Delete workout'}
        </Button>
        <Button
          bg="$backgroundStrong"
          color="$color"
          minH="$action"
          rounded="$button"
          disabled={deleting}
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
        <WorkoutList
          workouts={workouts}
          onStartWorkout={startWorkout}
          isWorkoutRunning={isWorkoutRunning()}
          routineNameByWorkoutId={routineNameByWorkoutId}
          onEditWorkout={handleEditWorkout}
          focusId={(params.focusId as string) || undefined}
          listHeader={
            <YStack gap="$card" mb="$page">
              <YStack gap="$1">
                <Text fontSize="$screenTitle" lineHeight="$screenTitle" fontWeight="600">
                  Your workouts
                </Text>
                <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                  {workouts.length} saved {workouts.length === 1 ? 'workout' : 'workouts'}
                </Text>
              </YStack>
              <CreateTopButton label="Create workout" onPress={navigateToNewWorkout} />
            </YStack>
          }
          onDeleteWorkout={handleDeleteWorkout}
          refreshing={loading}
          onRefresh={refetch}
          onWorkoutPress={(workout) => router.push(`/workouts/${workout.id}`)}
        />
      </YStack>

      <CadenceOverlay
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete workout"
        dismissible={!deleting}
      >
        {DeleteConfirmContent}
      </CadenceOverlay>
    </YStack>
  )
}
