import { useLocalSearchParams, useRouter } from 'expo-router'
import { useWorkouts } from './useWorkouts'
import { useWorkoutManagement } from './useWorkoutManagement'
import { useWorkoutIdRemap } from './useWorkoutIdRemap'
import { summarizeWorkoutExercises } from '../../../utils/workoutUtils'

export function useWorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { workouts, loading, error } = useWorkouts()
  const { startWorkout, isWorkoutRunning } = useWorkoutManagement()
  const running = isWorkoutRunning()
  useWorkoutIdRemap(id)
  const workout = workouts.find((item) => item.id === id)
  const exercises = workout?.workoutTemplate.exercises ?? []
  const { strengthSets, intervals } = summarizeWorkoutExercises(exercises, 0)
  const totalSets = strengthSets + intervals
  const setsLabel = `${totalSets} ${totalSets === 1 ? 'set' : 'sets'}`

  return {
    workout,
    exercises,
    loading,
    error,
    running,
    setsLabel,
    goBack: () => router.back(),
    editWorkout: () => {
      if (workout) router.push({ pathname: '/workouts/edit', params: { id: workout.id } })
    },
    startWorkout: () => {
      if (workout && !running && exercises.length) startWorkout(workout)
    },
  }
}
