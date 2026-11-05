import { useLocalSearchParams, useRouter } from 'expo-router'
import { useWorkout } from './useWorkout'
import { useWorkoutManagement } from './useWorkoutManagement'
import { useWorkoutIdRemap } from './useWorkoutIdRemap'
import { summarizeWorkoutExercises } from '../../../utils/workoutUtils'
import { syncEngine } from '../../../lib/sync'

export function useWorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const workoutId = id && syncEngine.resolveId('workouts', id)
  const { workout, loading, error } = useWorkout(workoutId || id)
  const { startWorkout, isWorkoutRunning } = useWorkoutManagement()
  const running = isWorkoutRunning()
  useWorkoutIdRemap(id)
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
    duplicateWorkout: () => {
      if (workout) router.push({ pathname: '/workouts/new', params: { duplicateId: workout.id } })
    },
    startWorkout: () => {
      if (workout && !running && exercises.length) startWorkout(workout)
    },
  }
}
