import { YStack, Button, Text, Separator } from 'tamagui'
import { useLayoutEffect } from 'react'
import { useNavigation } from 'expo-router'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { useWorkoutManagement } from '../../hooks/useWorkoutManagement'
import { useWorkouts } from '../../hooks/useWorkouts'
import { WorkoutList } from '../../components/workouts/WorkoutList'
import { useAppNavigation } from '../../navigation/useAppNavigation'

export default function WorkoutsScreen() {
  const navigation = useNavigation()
  const { startWorkout, isWorkoutRunning } = useWorkoutManagement()
  const { navigateToNewWorkout, navigateToEditWorkout } = useAppNavigation()
  const { workouts, loading, error, refetch } = useWorkouts()
  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Workouts',
    })
  }, [navigation])

  const handleEditWorkout = (workout: any) => navigateToEditWorkout(workout.id)

  const handleDeleteWorkout = (workoutId: string) => {
    // TODO: Implement delete functionality
    console.log('Delete workout:', workoutId)
  }

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
    </YStack>
  )
}
