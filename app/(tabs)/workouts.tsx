import { YStack, ScrollView, Button, Text } from 'tamagui'
import { useLayoutEffect } from 'react'
import { useNavigation } from 'expo-router'
import { RefreshControl } from 'react-native'
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
      headerRight: () => (
        <Button bg="$primary" onPress={navigateToNewWorkout}>
          + Add Workout
        </Button>
      ),
    })
  }, [navigation, navigateToNewWorkout])

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
    <ScrollView
      bg="$background"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
    >
      <YStack p="$4" gap="$4">
        {workouts.length === 0 ? (
          <YStack items="center" justify="center" py="$8">
            <Text fontSize="$6" color="$color11">
              No workouts yet
            </Text>
            <Text fontSize="$4" color="$color10" mt="$2">
              Create your first workout to get started
            </Text>
            <Button mt="$4" onPress={navigateToNewWorkout}>
              Create Workout
            </Button>
          </YStack>
        ) : (
          <WorkoutList
            workouts={workouts}
            onStartWorkout={startWorkout}
            isWorkoutRunning={isWorkoutRunning()}
            onEditWorkout={handleEditWorkout}
          />
        )}
      </YStack>
    </ScrollView>
  )
}
