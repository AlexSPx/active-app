import { useRunningWorkoutStore } from '../../workout-session'
import { useAppNavigation } from '../../../navigation/useAppNavigation'
import type { ApiWorkout } from '../../../types/api'
import { queryClient } from '../../../lib/queryClient'
import { useProfileQueryKeys } from '../../../lib/hooks/useProfileQueryKeys'

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
  const ownerKeys = useProfileQueryKeys()

  const startWorkout = (workout: ApiWorkout) => {
    // Start the workout in the store
    startWorkoutInStore({
      id: workout.id,
      name: workout.title || 'Untitled Workout',
      exercises: workout.workoutTemplate.exercises.map((exercise, index) => ({
        coachPrescription: exercise.coachPrescription,
        id: exercise.exerciseId,
        sessionId: `${workout.id}-ex-${index}`,
        name: exercise.exerciseTitle?.trim() || exercise.exerciseId.replace(/_/g, ' '),
        level: 'INTERMEDIATE' as const,
        force: 'PUSH' as const,
        mechanic: 'COMPOUND' as const,
        equipment: 'OTHER' as const,
        primaryMuscles: exercise.primaryMuscles || [],
        secondaryMuscles: exercise.secondaryMuscles || [],
        instructions: [],
        category: exercise.category,
        sets:
          exercise.category === 'CARDIO' || exercise.coachPrescription?.sets[0]?.kind === 'timed'
            ? (exercise.durationSeconds?.length ?? 0)
            : Math.max(1, exercise.reps.length || 0),
        reps:
          exercise.category === 'CARDIO' || exercise.coachPrescription?.sets[0]?.kind === 'timed'
            ? 0
            : exercise.reps[0] || 10,
        sessionSets: Array.from(
          {
            length:
              exercise.category === 'CARDIO' ||
              exercise.coachPrescription?.sets[0]?.kind === 'timed'
                ? (exercise.durationSeconds?.length ?? 0)
                : Math.max(1, exercise.reps.length || 0),
          },
          (_, setIndex) => ({
            id: `${workout.id}-ex-${index}-set-${setIndex}`,
            reps:
              exercise.coachPrescription?.sets[setIndex]?.kind === 'strength'
                ? exercise.reps[setIndex]
                : null,
            weight:
              exercise.coachPrescription?.sets[setIndex]?.kind === 'strength'
                ? exercise.weight[setIndex]
                : null,
            // initialize durationSeconds for CARDIO so the session UI can render the input
            durationSeconds:
              exercise.category === 'CARDIO' ||
              exercise.coachPrescription?.sets[0]?.kind === 'timed'
                ? exercise.coachPrescription
                  ? (exercise.durationSeconds?.[setIndex] ?? 0)
                  : 0
                : undefined,
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
    queryClient.invalidateQueries({ queryKey: ownerKeys.workouts.all })
    queryClient.invalidateQueries({ queryKey: ownerKeys.records.all })
  }

  return {
    startWorkout,
    stopWorkout,
    isWorkoutRunning,
    isRecording,
    recordingError,
  }
}
