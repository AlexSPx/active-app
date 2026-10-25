import type { ApiWorkout } from '../../../types/api'
import type { Routine } from '../../../types/routine'
import { routinePatternIndex } from '../../../utils/date'
import appearance from './appearance.json'

export type TodayPlanProps = {
  kind: keyof typeof appearance
  dateLabel: string
  title: string
  detail: string
  actionLabel: string
  url: string
  appearance: typeof appearance.training
}

export const emptyTodayPlan: TodayPlanProps = {
  kind: 'empty',
  dateLabel: "Today's plan",
  title: 'No routine',
  detail: 'Make room for your next goal',
  actionLabel: 'Choose routine',
  url: 'activenext://routines',
  appearance: appearance.empty,
}

export function getTodayPlan(
  routine: Routine | null,
  workouts: Pick<ApiWorkout, 'id' | 'title'>[],
  date: Date
): TodayPlanProps {
  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  if (!routine) return { ...emptyTodayPlan, dateLabel }
  const routineUrl = `activenext://routines/${encodeURIComponent(routine.id)}`
  const routinePlan = {
    ...emptyTodayPlan,
    dateLabel,
    actionLabel: 'View routine',
    url: routineUrl,
  }
  if (routine.routineType === 'WEEKLY_COMPLETION') {
    return {
      ...routinePlan,
      kind: 'training',
      title: 'Choose a workout',
      detail: routine.name,
      appearance: appearance.training,
    }
  }

  const index = routinePatternIndex(routine.startDate, routine.pattern.length, date)
  if (index < 0) return { ...routinePlan, title: 'Routine starts soon', detail: routine.name }
  const day = routine.pattern[index]
  if (!day) return { ...routinePlan, title: 'No workout planned', detail: routine.name }
  if (day.dayType === 'REST') {
    return {
      ...routinePlan,
      kind: 'rest',
      title: 'Rest day',
      detail: 'Take time to recover',
      appearance: appearance.rest,
    }
  }
  const workout = workouts.find((workout) => workout.id === day.workoutId)
  return workout
    ? {
        ...routinePlan,
        kind: 'training',
        title: workout.title,
        detail: routine.name,
        actionLabel: 'View workout',
        url: `activenext://workouts/${encodeURIComponent(workout.id)}`,
        appearance: appearance.training,
      }
    : { ...routinePlan, title: 'Workout unavailable', detail: 'Update your routine in Active' }
}

export function buildTodayPlanTimeline(
  routine: Routine | null,
  workouts: Pick<ApiWorkout, 'id' | 'title'>[],
  now = new Date()
) {
  const entries = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now)
    if (index > 0) {
      date.setDate(date.getDate() + index)
      date.setHours(0, 0, 0, 0)
    }
    return { date, props: getTodayPlan(routine, workouts, date) }
  })
  const expiry = new Date(now)
  expiry.setDate(expiry.getDate() + 30)
  expiry.setHours(0, 0, 0, 0)
  entries.push({
    date: expiry,
    props: {
      ...emptyTodayPlan,
      title: 'Refresh your plan',
      detail: 'Open Active to see your latest routine.',
      actionLabel: 'Open Active',
    },
  })
  return entries
}
