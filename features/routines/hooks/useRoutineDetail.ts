import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRoutines, useActiveRoutine } from '../index'
import { useWorkouts } from '../../workouts'
import { useSettingsStore } from '../../settings'
import { syncEngine } from '../../../lib/sync'
import { summarizeWorkoutExercises } from '../../../utils/workoutUtils'

export function useRoutineDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { routines, loading, error } = useRoutines()
  const { activeRoutine } = useActiveRoutine()
  const { workouts, loading: workoutsLoading, error: workoutsError, refetch } = useWorkouts()
  const { restTimerEnabled, restTimerDefaultSeconds } = useSettingsStore()
  const resolvedId = syncEngine.resolveId('routines', id)
  const routine = routines.find((item) => syncEngine.resolveId('routines', item.id) === resolvedId)
  const active =
    !!activeRoutine && syncEngine.resolveId('routines', activeRoutine.id) === resolvedId
  useEffect(() => {
    const resolved = id && syncEngine.resolveId('routines', id)
    if (resolved && resolved !== id) router.setParams({ id: resolved })
    return syncEngine.onIdRemap((table, oldId, newId) => {
      if (table === 'routines' && id === oldId) router.setParams({ id: newId })
    })
  }, [id, router])
  const weekly = routine?.routineType === 'WEEKLY_COMPLETION'
  const pattern = [...(routine?.pattern ?? [])]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .filter((day) => !weekly || day.dayType === 'WORKOUT')
  const days = pattern.map((day) => ({
    ...day,
    workout:
      day.dayType === 'WORKOUT' && day.workoutId
        ? workouts.find(
            (workout) =>
              syncEngine.resolveId('workouts', workout.id) ===
              syncEngine.resolveId('workouts', day.workoutId ?? '')
          )
        : undefined,
  }))
  const training = days.filter((day) => day.dayType === 'WORKOUT')
  const incomplete = training.some((day) => !day.workout)
  const exercises = training.flatMap((day) => day.workout?.workoutTemplate.exercises ?? [])
  const restSeconds = restTimerEnabled ? restTimerDefaultSeconds : 0
  const summary = summarizeWorkoutExercises(exercises, restSeconds)
  const edit = () => router.push({ pathname: '/routines/edit', params: { id: resolvedId } })
  const openWorkout = (workoutId: string) =>
    router.push({
      pathname: '/workouts/[id]',
      params: { id: syncEngine.resolveId('workouts', workoutId) },
    })

  return {
    routine,
    active,
    weekly,
    days,
    incomplete,
    exercises,
    restSeconds,
    summary,
    loading,
    error,
    workoutsLoading,
    workoutsError,
    retryWorkouts: refetch,
    edit,
    openWorkout,
    back: () => router.back(),
  }
}
