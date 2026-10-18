import { useState } from 'react'
import { useRouter } from 'expo-router'
import { useAuth } from '../../../contexts/AuthContext'
import { useActiveRoutine, useRoutines } from '../../routines'
import { useWorkoutManagement, useWorkouts } from '../../workouts'
import { launchFacade } from '../../launch/launchFacade'
import type { ApiWorkout } from '../../../types/api'
import { formatWeekRange, routinePatternIndex, sameDay, startOfWeek } from '../../../utils/date'

type WeekDayBase = {
  date: Date
  weekday: string
  isToday: boolean
  isSelected: boolean
}

export type TrainingHomeWeekDay =
  | (WeekDayBase & { kind: 'scheduled'; workout: ApiWorkout })
  | (WeekDayBase & { kind: 'unavailable'; workoutId: string | null })
  | (WeekDayBase & { kind: 'rest' })
  | (WeekDayBase & { kind: 'before-routine' })
  | (WeekDayBase & { kind: 'unplanned' })
  | (WeekDayBase & { kind: 'setup' })

export type TrainingHomeWeekPlan =
  | { kind: 'setup'; weekRange: string; days: TrainingHomeWeekDay[] }
  | { kind: 'cycle'; routineName: string; weekRange: string; days: TrainingHomeWeekDay[] }
  | {
      kind: 'flexible'
      routineName: string
      weekRange: string
      workouts: Array<{ id: string; workout: ApiWorkout | null; completed: boolean }>
      completedCount: number | null
    }

export type TrainingHomeSession =
  | { kind: 'scheduled'; date: Date; workout: ApiWorkout }
  | { kind: 'unavailable'; date: Date; workoutId: string | null }
  | { kind: 'rest'; date: Date }
  | { kind: 'before-routine'; date: Date }
  | { kind: 'unplanned'; date: Date }

export type TrainingHomeSetup =
  | {
      kind: 'first-workout'
      title: string
      description: string
      actionLabel: string
      onAction: () => void
    }
  | {
      kind: 'create-routine'
      title: string
      description: string
      actionLabel: string
      onAction: () => void
    }
  | {
      kind: 'choose-routine'
      title: string
      description: string
      actionLabel: string
      onAction: () => void
    }

export type TrainingHomeState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'setup'
      setup: TrainingHomeSetup
      weekPlan: Extract<TrainingHomeWeekPlan, { kind: 'setup' }>
    }
  | {
      kind: 'plan'
      weekPlan: Exclude<TrainingHomeWeekPlan, { kind: 'setup' }>
      selectedSession: TrainingHomeSession | null
    }

function getWeekPlan(input: {
  routine: ReturnType<typeof useActiveRoutine>['activeRoutine']
  workouts: ApiWorkout[]
  selectedDate: Date
  today: Date
  completedWorkoutIds: string[] | null
}): TrainingHomeWeekPlan {
  const { routine, workouts, selectedDate, today, completedWorkoutIds } = input
  const weekRange = formatWeekRange(today)
  const workoutById = new Map(workouts.map((workout) => [workout.id, workout]))

  if (routine?.routineType === 'WEEKLY_COMPLETION') {
    const workoutIds = [
      ...new Set(
        routine.pattern
          .filter((day) => day.dayType === 'WORKOUT' && day.workoutId)
          .flatMap((day) => (day.dayType === 'WORKOUT' && day.workoutId ? [day.workoutId] : []))
      ),
    ]

    return {
      kind: 'flexible',
      routineName: routine.name,
      weekRange,
      workouts: workoutIds.map((id) => ({
        id,
        workout: workoutById.get(id) ?? null,
        completed: completedWorkoutIds?.includes(id) ?? false,
      })),
      completedCount:
        completedWorkoutIds === null
          ? null
          : workoutIds.filter((id) => completedWorkoutIds.includes(id)).length,
    }
  }

  const monday = startOfWeek(today)
  const days = Array.from({ length: 7 }, (_, index): TrainingHomeWeekDay => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    const base = {
      date,
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
      isToday: sameDay(date, today),
      isSelected: sameDay(date, selectedDate),
    }

    if (!routine) return { ...base, kind: 'setup' }

    const patternIndex = routinePatternIndex(routine.startDate, routine.pattern.length, date)
    if (patternIndex < 0) return { ...base, kind: 'before-routine' }

    const pattern = routine.pattern[patternIndex]
    if (!pattern) return { ...base, kind: 'unplanned' }
    if (pattern.dayType === 'REST') return { ...base, kind: 'rest' }

    const workout = pattern.workoutId ? workoutById.get(pattern.workoutId) : undefined
    return workout
      ? { ...base, kind: 'scheduled', workout }
      : { ...base, kind: 'unavailable', workoutId: pattern.workoutId }
  })

  return routine
    ? { kind: 'cycle', routineName: routine.name, weekRange, days }
    : { kind: 'setup', weekRange, days }
}

function getSetupWeekDays(today: Date, selectedDate: Date): TrainingHomeWeekDay[] {
  const monday = startOfWeek(today)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return {
      date,
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
      isToday: sameDay(date, today),
      isSelected: sameDay(date, selectedDate),
      kind: 'setup' as const,
    }
  })
}

function getSelectedSession(day: TrainingHomeWeekDay | undefined): TrainingHomeSession | null {
  if (!day || day.kind === 'setup') return null
  switch (day.kind) {
    case 'scheduled':
      return { kind: 'scheduled', date: day.date, workout: day.workout }
    case 'unavailable':
      return { kind: 'unavailable', date: day.date, workoutId: day.workoutId }
    case 'rest':
      return { kind: 'rest', date: day.date }
    case 'before-routine':
      return { kind: 'before-routine', date: day.date }
    case 'unplanned':
      return { kind: 'unplanned', date: day.date }
    default: {
      const exhaustive: never = day
      return exhaustive
    }
  }
}

export function useTrainingHomeController() {
  const router = useRouter()
  const { user } = useAuth()
  const {
    activeRoutine,
    loading: activeRoutineLoading,
    error: activeRoutineError,
    refetch: refetchActiveRoutine,
  } = useActiveRoutine()
  const {
    routines,
    loading: routinesLoading,
    error: routinesError,
    refetch: refetchRoutines,
  } = useRoutines()
  const {
    workouts,
    loading: workoutsLoading,
    error: workoutsError,
    refetch: refetchWorkouts,
  } = useWorkouts()
  const workoutActions = useWorkoutManagement()
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const today = new Date()
  const setupLoading = activeRoutineLoading || routinesLoading || workoutsLoading
  const setupError = activeRoutineError || routinesError || workoutsError
  const hasWorkouts = workouts.length > 0
  const canShowPlan = !setupLoading && !setupError && hasWorkouts && !!activeRoutine
  const completedWorkoutIds = launchFacade.training.getWeeklyCompletion(user)
  const weekPlan = getWeekPlan({
    routine: canShowPlan ? activeRoutine : null,
    workouts,
    selectedDate,
    today,
    completedWorkoutIds,
  })

  const openWorkout = (workoutId: string) => {
    router.push({ pathname: '/(tabs)/(workouts)', params: { focusId: workoutId } })
  }
  const browseWorkouts = () => router.push('/(tabs)/(workouts)')
  const manageRoutines = () => router.push('/(tabs)/(workouts)/routines')

  const retry = async () => {
    await Promise.all([refetchActiveRoutine(), refetchRoutines(), refetchWorkouts()])
  }

  let state: TrainingHomeState
  if (setupLoading) {
    state = { kind: 'loading' }
  } else if (setupError) {
    state = { kind: 'error', message: setupError }
  } else if (!hasWorkouts || !activeRoutine || weekPlan.kind === 'setup') {
    const setup: TrainingHomeSetup = !hasWorkouts
      ? {
          kind: 'first-workout',
          title: 'Make room for your routine.',
          description: 'Choose exercises and set your sets and reps to create your first workout.',
          actionLabel: 'Create workout',
          onAction: () => router.push('/workouts/new'),
        }
      : routines.length === 0
        ? {
            kind: 'create-routine',
            title: 'Set up your routine.',
            description: 'Your workouts are ready. Create a routine to plan your training.',
            actionLabel: 'Create routine',
            onAction: () => router.push('/routines/new'),
          }
        : {
            kind: 'choose-routine',
            title: 'Choose an active routine.',
            description: 'Select a routine to see your plan for today and this week.',
            actionLabel: 'Manage routines',
            onAction: manageRoutines,
          }
    state = {
      kind: 'setup',
      setup,
      weekPlan: {
        kind: 'setup',
        weekRange: weekPlan.weekRange,
        days: weekPlan.kind === 'setup' ? weekPlan.days : getSetupWeekDays(today, selectedDate),
      },
    }
  } else {
    const selectedDay =
      weekPlan.kind === 'cycle'
        ? weekPlan.days.find((day) => sameDay(day.date, selectedDate))
        : undefined
    state = {
      kind: 'plan',
      weekPlan,
      selectedSession: getSelectedSession(selectedDay),
    }
  }

  return {
    state,
    todayLabel: today.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
    selectedDate,
    selectDate: setSelectedDate,
    retry,
    openWorkout,
    startWorkout: workoutActions.startWorkout,
    isWorkoutRunning: workoutActions.isWorkoutRunning(),
    browseWorkouts,
    manageRoutines,
  }
}
