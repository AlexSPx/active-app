import { useRunningWorkoutStore } from '../stores/runningWorkoutStore'
import { useAppNavigation } from '../navigation/useAppNavigation'
import type { ApiWorkout } from '../types/api'

export interface UseWorkoutManagementActions {
  startWorkout: (workout: ApiWorkout) => void
  stopWorkout: (notes?: string) => Promise<void>
  isWorkoutRunning: () => boolean
  isRecording: boolean
  recordingError: string | null
}

export function useWorkoutManagement(): UseWorkoutManagementActions {
  const {
    startWorkout: startWorkoutInStore,
    stopWorkout: stopWorkoutInStore,
    isWorkoutRunning,
    isRecording,
    recordingError,
  } = useRunningWorkoutStore()
  const { navigateToWorkoutSession } = useAppNavigation()

  const startWorkout = (workout: ApiWorkout) => {
    // Start the workout in the store
    startWorkoutInStore({
      id: workout.id,
      name: workout.title || 'Untitled Workout',
      exercises: workout.workoutTemplate.exercises.map((exercise, index) => ({
        id: `${workout.id}-ex-${index}`,
        name: exercise.exerciseId.replace(/_/g, ' '), // Convert exercise ID to readable name
        level: 'INTERMEDIATE' as const,
        force: 'PUSH' as const,
        mechanic: 'COMPOUND' as const,
        equipment: 'OTHER' as const,
        primaryMuscles: ['OTHER'],
        secondaryMuscles: [],
        instructions: [],
        category: 'STRENGTH' as const,
        sets: exercise.reps.length,
        reps: exercise.reps[0] || 10,
        sessionSets: Array.from({ length: exercise.reps.length }, (_, setIndex) => ({
          id: `${workout.id}-ex-${index}-set-${setIndex}`,
          reps: null,
          weight: null,
          completed: false,
        })),
      })),
    })

    // Navigate to the workout session
    navigateToWorkoutSession(workout)
  }

  const stopWorkout = async (notes?: string) => {
    await stopWorkoutInStore(notes)
  }

  return {
    startWorkout,
    stopWorkout,
    isWorkoutRunning,
    isRecording,
    recordingError,
  }
}
