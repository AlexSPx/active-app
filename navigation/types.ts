import type { WorkoutTemplate } from '../types/workout'

export type RootStackParamList = {
  '(tabs)': undefined
  'workouts/session': {
    name: string
    tag: string
    duration: string
    exercises: string
  }
  'workouts/new': undefined
  'exercises/search': undefined
  modal: undefined
}

export type TabsParamList = {
  index: undefined
  workouts: undefined
  history: undefined
}

export type WorkoutSessionParams = {
  name: string
  tag: string
  duration: string
  exercises: string
}

export interface NavigationHelpers {
  navigateToWorkoutSession: (workoutTemplate: WorkoutTemplate) => void
  navigateToNewWorkout: () => void
  navigateToExerciseSearch: () => void
  goBack: () => void
}
