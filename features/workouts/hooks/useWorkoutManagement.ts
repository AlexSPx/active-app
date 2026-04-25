import { useRunningWorkoutStore } from '../../workout-session'
import { useAppNavigation } from '../../../navigation/useAppNavigation'
import type { ApiWorkout } from '../../../types/api'
import { queryClient } from '../../../lib/queryClient'
import { queryKeys } from '../../../lib/queryKeys'

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
        id: exercise.exerciseId,
        sessionId: `${workout.id}-ex-${index}`,
        name: exercise.exerciseTitle?.trim() || exercise.exerciseId.replace(/_/g, ' '),
        level: 'INTERMEDIATE' as const,
        force: 'PUSH' as const,
        mechanic: 'COMPOUND' as const,
        equipment: 'OTHER' as const,
        primaryMuscles: ['OTHER'],
        secondaryMuscles: [],
        instructions: [],
        category: exercise.category,
        sets:
          exercise.category === 'CARDIO'
            ? exercise.durationSeconds!.length
            : Math.max(1, exercise.reps.length || 0),
        reps: exercise.category === 'CARDIO' ? 0 : exercise.reps[0] || 10,
        sessionSets: Array.from(
          {
            length:
              exercise.category === 'CARDIO'
                ? exercise.durationSeconds!.length
                : Math.max(1, exercise.reps.length || 0),
          },
          (_, setIndex) => ({
            id: `${workout.id}-ex-${index}-set-${setIndex}`,
            reps: null,
            weight: null,
            // initialize durationSeconds for CARDIO so the session UI can render the input
            durationSeconds: exercise.category === 'CARDIO' ? 0 : undefined,
            completed: false,
          })
        ),
      })),
    })

    // Navigate to the workout session
    navigateToWorkoutSession(workout)
  }

  const stopWorkout = async (notes?: string) => {
    await stopWorkoutInStore(notes)
    // After a workout is stopped/saved, invalidate dependent queries
    queryClient.invalidateQueries({ queryKey: queryKeys.workouts.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.records.all })
  }

  return {
    startWorkout,
    stopWorkout,
    isWorkoutRunning,
    isRecording,
    recordingError,
  }
}
