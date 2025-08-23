import type { ApiWorkout } from '../types/api'

export type RootStackParamList = {
  '(tabs)': undefined
  'workouts/session': {
    name: string
    exercises: string
  }
  'workouts/new': undefined
  'workouts/edit': { id: string }
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
  exercises: string
}

export interface NavigationHelpers {
  navigateToWorkoutSession: (workout: ApiWorkout) => void
  navigateToNewWorkout: () => void
  navigateToEditWorkout: (id: string) => void
  navigateToExerciseSearch: () => void
  goBack: () => void
}
