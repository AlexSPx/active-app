import { useLocalSearchParams, useRouter } from 'expo-router'
import { useWorkouts } from './useWorkouts'
import { useWorkoutManagement } from './useWorkoutManagement'
import { useWorkoutIdRemap } from './useWorkoutIdRemap'
import { useSettingsStore } from '../../settings'
import { summarizeWorkoutExercises } from '../../../utils/workoutUtils'

export function useWorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { workouts, loading, error } = useWorkouts()
  const { startWorkout, isWorkoutRunning } = useWorkoutManagement()
  const running = isWorkoutRunning()
  useWorkoutIdRemap(id)
  const { restTimerEnabled, restTimerDefaultSeconds } = useSettingsStore()
  const workout = workouts.find((item) => item.id === id)
  const exercises = workout?.workoutTemplate.exercises ?? []
  const { strengthSets, intervals, estimatedMinutes } = summarizeWorkoutExercises(
    exercises,
    restTimerEnabled ? restTimerDefaultSeconds : 0
  )
  const setsLabel = [
    strengthSets && `${strengthSets} ${strengthSets === 1 ? 'set' : 'sets'}`,
    intervals && `${intervals} ${intervals === 1 ? 'interval' : 'intervals'}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    workout,
    exercises,
    loading,
    error,
    running,
    setsLabel,
    estimatedMinutes,
    goBack: () => router.back(),
    editWorkout: () => {
      if (workout) router.push({ pathname: '/workouts/edit', params: { id: workout.id } })
    },
    startWorkout: () => {
      if (workout && !running && exercises.length) startWorkout(workout)
    },
  }
}
