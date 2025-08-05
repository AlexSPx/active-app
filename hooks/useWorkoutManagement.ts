import { useRunningWorkoutStore } from '../stores/runningWorkoutStore'
import { useAppNavigation } from '../navigation/useAppNavigation'
import type { ApiWorkout } from '../types/api'
import type { WorkoutTemplate } from '../types/workout'

export interface UseWorkoutManagementActions {
  startWorkout: (workout: ApiWorkout) => void
  stopWorkout: (notes?: string) => Promise<void>
  isWorkoutRunning: () => boolean
  isRecording: boolean
  recordingError: string | null
}

// Convert API Workout to WorkoutTemplate format for backward compatibility
function convertApiWorkoutToTemplate(workout: ApiWorkout): WorkoutTemplate {
  return {
    id: workout.id,
    name: workout.title || 'Untitled Workout',
    tag: 'Workout',
    duration: '30 min', // Default duration - could be calculated from exercises
    exercises: workout.workoutTemplate.exercises.map((exercise) => ({
      name: exercise.exerciseId.replace(/_/g, ' '), // Convert exercise ID to readable name
      sets: exercise.reps.length,
      reps: exercise.reps[0] || 10,
    })),
  }
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
    const workoutTemplate = convertApiWorkoutToTemplate(workout)
    // Start the workout in the store
    startWorkoutInStore({
      id: workoutTemplate.id,
      name: workoutTemplate.name,
      exercises: workoutTemplate.exercises.map((exercise, index) => ({
        id: `${workoutTemplate.id}-ex-${index}`,
        name: exercise.name,
        level: 'INTERMEDIATE' as const,
        force: 'PUSH' as const,
        mechanic: 'COMPOUND' as const,
        equipment: 'OTHER' as const,
        primaryMuscles: ['OTHER'],
        secondaryMuscles: [],
        instructions: [],
        category: 'STRENGTH' as const,
        sets: exercise.sets,
        reps: exercise.reps,
        sessionSets: Array.from({ length: exercise.sets }, (_, setIndex) => ({
          id: `${workoutTemplate.id}-ex-${index}-set-${setIndex}`,
          reps: null,
          weight: null,
          completed: false,
        })),
      })),
    })

    // Navigate to the workout session
    navigateToWorkoutSession(workoutTemplate)
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
