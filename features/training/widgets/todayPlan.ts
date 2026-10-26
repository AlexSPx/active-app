import type { ApiWorkout, WorkoutRecord } from '../../../types/api'
import type { Routine } from '../../../types/routine'
import { parseServerUtcDate, routinePatternIndex, startOfWeek } from '../../../utils/date'
import appearance from './appearance.json'

export type TodayPlanProps = {
  kind: keyof typeof appearance
  dateLabel: string
  title: string
  detail: string
  actionLabel: string
  url: string
  appearance: typeof appearance.training
  cycle: { current: number; total: number } | null
  progress: { label: string; value: number | null } | null
}

export const emptyTodayPlan: TodayPlanProps = {
  kind: 'empty',
  dateLabel: "Today's plan",
  title: 'No routine',
  detail: 'Make room for your next goal',
  actionLabel: 'Choose routine',
  url: 'activenext://routines',
  appearance: appearance.empty,
  cycle: null,
  progress: null,
}

function getWeeklyProgress(
  routine: Routine,
  records: Pick<WorkoutRecord, 'workoutId' | 'createdAt'>[] | null,
  date: Date
): TodayPlanProps['progress'] {
  const required = new Set(
    routine.pattern.flatMap((day) =>
      day.dayType === 'WORKOUT' && day.workoutId ? [day.workoutId] : []
    )
  )
  if (required.size === 0) return { label: 'No workouts in this routine', value: null }
  if (records === null) return { label: 'Progress unavailable', value: null }
  const monday = startOfWeek(date)
  const nextMonday = new Date(monday)
  nextMonday.setDate(monday.getDate() + 7)
  const completed = new Set(
    records.flatMap((record) => {
      const completedAt = parseServerUtcDate(record.createdAt)
      return record.workoutId &&
        required.has(record.workoutId) &&
        completedAt >= monday &&
        completedAt < nextMonday
        ? [record.workoutId]
        : []
    })
  )
  return {
    label: `${completed.size} of ${required.size} workouts this week`,
    value: completed.size / required.size,
  }
}

export function getTodayPlan(
  routine: Routine | null,
  workouts: Pick<ApiWorkout, 'id' | 'title'>[],
  date: Date,
  records: Pick<WorkoutRecord, 'workoutId' | 'createdAt'>[] | null = null
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
      progress: getWeeklyProgress(routine, records, date),
    }
  }

  const index = routinePatternIndex(routine.startDate, routine.pattern.length, date)
  if (index < 0) return { ...routinePlan, title: 'Routine starts soon', detail: routine.name }
  const day = routine.pattern[index]
  if (!day) return { ...routinePlan, title: 'No workout planned', detail: routine.name }
  const scheduledPlan = {
    ...routinePlan,
    cycle: { current: index + 1, total: routine.pattern.length },
    progress: {
      label: `Day ${index + 1} of ${routine.pattern.length}`,
      value: (index + 1) / routine.pattern.length,
    },
  }
  if (day.dayType === 'REST') {
    return {
      ...scheduledPlan,
      kind: 'rest',
      title: 'Rest day',
      detail: 'Take time to recover',
      appearance: appearance.rest,
    }
  }
  const workout = workouts.find((workout) => workout.id === day.workoutId)
  return workout
    ? {
        ...scheduledPlan,
        kind: 'training',
        title: workout.title,
        detail: routine.name,
        actionLabel: 'View workout',
        url: `activenext://workouts/${encodeURIComponent(workout.id)}`,
        appearance: appearance.training,
      }
    : { ...scheduledPlan, title: 'Workout unavailable', detail: 'Update your routine in Active' }
}

export function buildTodayPlanTimeline(
  routine: Routine | null,
  workouts: Pick<ApiWorkout, 'id' | 'title'>[],
  now = new Date(),
  records: Pick<WorkoutRecord, 'workoutId' | 'createdAt'>[] | null = null
) {
  const entries = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now)
    if (index > 0) {
      date.setDate(date.getDate() + index)
      date.setHours(0, 0, 0, 0)
    }
    return { date, props: getTodayPlan(routine, workouts, date, records) }
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
