import { useRouter } from 'expo-router'
import type { NavigationHelpers, WorkoutSessionParams } from './types'
import type { WorkoutTemplate } from '../types/workout'

export function useAppNavigation(): NavigationHelpers {
  const router = useRouter()

  const navigateToWorkoutSession = (workoutTemplate: WorkoutTemplate) => {
    const params: WorkoutSessionParams = {
      name: workoutTemplate.name,
      tag: workoutTemplate.tag || 'Workout',
      duration: workoutTemplate.duration || '30 min',
      exercises: JSON.stringify(workoutTemplate.exercises),
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
