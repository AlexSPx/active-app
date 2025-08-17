import { useRouter } from 'expo-router'
import type { NavigationHelpers, WorkoutSessionParams } from './types'
import type { ApiWorkout } from '../types/api'

export function useAppNavigation(): NavigationHelpers {
  const router = useRouter()

  const navigateToWorkoutSession = (workout: ApiWorkout) => {
    const params: WorkoutSessionParams = {
      name: workout.title || 'Untitled Workout',
      exercises: JSON.stringify(workout.workoutTemplate.exercises),
    }

    router.push({
      pathname: '/workouts/session',
      params,
    })
  }

  const navigateToNewWorkout = () => {
    router.push('/workouts/new')
  }

  const navigateToExerciseSearch = () => {
    router.push('/exercises/search')
  }

  const goBack = () => {
    router.back()
  }

  return {
    navigateToWorkoutSession,
    navigateToNewWorkout,
    navigateToExerciseSearch,
    goBack,
  }
}
