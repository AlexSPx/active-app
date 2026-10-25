import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo'
import { useActiveRoutine } from '../../routines/hooks/useActiveRoutine'
import { useWorkouts } from '../../workouts/hooks/useWorkouts'
import { useWorkoutRecords } from '../../workouts/hooks/useWorkoutRecords'
import { useAuthStore } from '../../../stores/authStore'
import { buildTodayPlanTimeline, emptyTodayPlan, getTodayPlan } from './todayPlan'

function getWidget(): (typeof import('./TodayPlanWidget'))['default'] | null {
  if (!requireOptionalNativeModule('ExpoWidgets')) return null
  return require('./TodayPlanWidget').default
}

export function TodayPlanWidgetSync() {
  const { activeRoutine, loading: routineLoading, error: routineError } = useActiveRoutine()
  const { workouts, loading: workoutsLoading, error: workoutsError } = useWorkouts()
  const { workoutRecords, loading: recordsLoading, error: recordsError } = useWorkoutRecords()
  const isProfileTransitioning = useAuthStore((state) => state.isProfileTransitioning)

  useEffect(() => {
    const widget = getWidget()
    widget?.updateSnapshot(emptyTodayPlan)
    return () => widget?.updateSnapshot(emptyTodayPlan)
  }, [])

  useEffect(() => {
    const widget = getWidget()
    if (!widget) return
    let midnightTimer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      clearTimeout(midnightTimer)
      if (isProfileTransitioning) {
        widget.updateSnapshot(emptyTodayPlan)
      } else if (routineError || workoutsError) {
        widget.updateSnapshot({
          ...emptyTodayPlan,
          title: 'Plan unavailable',
          detail: 'Open Active to reload your routine.',
          actionLabel: 'Open Active',
        })
      } else if (!routineLoading && !workoutsLoading) {
        const records = recordsLoading || recordsError ? null : workoutRecords
        if (Platform.OS === 'ios') {
          widget.updateTimeline(
            buildTodayPlanTimeline(activeRoutine, workouts, new Date(), records)
          )
        } else {
          // Android has no widget timelines; refresh on changes, foreground, and while the app runs.
          widget.updateSnapshot(getTodayPlan(activeRoutine, workouts, new Date(), records))
          const midnight = new Date()
          midnight.setDate(midnight.getDate() + 1)
          midnight.setHours(0, 0, 0, 0)
          midnightTimer = setTimeout(update, midnight.getTime() - Date.now())
        }
      }
    }
    update()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') update()
    })
    return () => {
      clearTimeout(midnightTimer)
      subscription.remove()
    }
  }, [
    activeRoutine,
    workouts,
    routineLoading,
    workoutsLoading,
    routineError,
    workoutsError,
    workoutRecords,
    recordsLoading,
    recordsError,
    isProfileTransitioning,
  ])

  return null
}
