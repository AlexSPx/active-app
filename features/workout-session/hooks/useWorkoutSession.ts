import { useState, useEffect, useCallback, useRef } from 'react'
import { AppState } from 'react-native'
import type { Exercise } from '../../../types/workout-session'
import { useRunningWorkoutStore } from '../stores/runningWorkoutStore'
import { useSettingsStore } from '../../settings'
import type { LocalWorkoutRecordingResult } from '../../../types/api'
import {
  scheduleRestNotification,
  cancelRestNotification,
} from '../../../services/notificationService'
import { queryClient } from '../../../lib/queryClient'
import { useProfileQueryKeys } from '../../../lib/hooks/useProfileQueryKeys'

export interface UseWorkoutSessionOptions {
  fallbackExercises?: Exercise[]
}

export interface WorkoutSessionState {
  exercises: Exercise[]
  workoutName: string
  workoutTag: string
  activeTimer: string | null
  restTime: number
  remainingRest: number
}

export interface WorkoutSessionActions {
  updateSet: (
    exerciseId: string,
    setId: string,
    field: 'reps' | 'weight' | 'duration',
    value: number | null
  ) => void
  toggleSetComplete: (exerciseId: string, setId: string) => void
  addSet: (exerciseId: string) => void
  removeSet: (exerciseId: string, setIndex: number) => void
  startRestTimer: (setId: string) => void
  extendRestTimer: () => void
  skipRestTimer: () => void
  finishWorkout: (notes?: string) => Promise<LocalWorkoutRecordingResult | void>
  cancelWorkout: () => void
}

export function useWorkoutSession(
  options: UseWorkoutSessionOptions = {}
): WorkoutSessionState & WorkoutSessionActions {
  const runningWorkout = useRunningWorkoutStore((state) => state.runningWorkout)
  const updateExerciseSet = useRunningWorkoutStore((state) => state.updateExerciseSet)
  const completeSet = useRunningWorkoutStore((state) => state.completeSet)
  const removeExerciseSet = useRunningWorkoutStore((state) => state.removeExerciseSet)
  const addExerciseSet = useRunningWorkoutStore((state) => state.addExerciseSet)
  const stopWorkout = useRunningWorkoutStore((state) => state.stopWorkout)
  const cancelInStore = useRunningWorkoutStore((state) => state.cancelWorkout)

  const [exercises, setExercises] = useState<Exercise[]>([])
  // Active rest timer references a completed set ID while counting down, otherwise null
  const [activeTimer, setActiveTimer] = useState<string | null>(null)
  // Rest timer configuration from settings
  const restTimerEnabled = useSettingsStore((s) => s.restTimerEnabled)
  const defaultRestSeconds = useSettingsStore((s) => s.restTimerDefaultSeconds)
  const ownerKeys = useProfileQueryKeys()
  const [restTime, setRestTime] = useState<number>(defaultRestSeconds)
  const [remainingRest, setRemainingRest] = useState<number>(0)
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const restDeadlineRef = useRef<number | null>(null)

  // Get workout data from running workout store
  const workoutName = runningWorkout?.name || 'No Workout'
  const workoutTag = 'In Progress'

  // Convert running workout exercises to session format
  const convertToSessionExercises = useCallback((): Exercise[] => {
    if (runningWorkout) {
      return runningWorkout.exercises.map((ex) => ({
        ...ex, // Include all API exercise properties
        sets: ex.sessionSets,
      }))
    }

    // Return fallback exercises or empty array if no running workout
    return options.fallbackExercises || []
  }, [options.fallbackExercises, runningWorkout])

  // Update exercises when running workout changes
  useEffect(() => {
    setExercises(convertToSessionExercises())
  }, [convertToSessionExercises])

  const updateSet = useCallback(
    (
      exerciseId: string,
      setId: string,
      field: 'reps' | 'weight' | 'duration',
      value: number | null
    ) => {
      // Update in the store if running workout exists
      if (runningWorkout) {
        const currentSet = runningWorkout.exercises
          .find((ex) => ex.sessionId === exerciseId)
          ?.sessionSets.find((set) => set.id === setId)

        if (currentSet) {
          if (field === 'duration') {
            updateExerciseSet(exerciseId, setId, currentSet.reps, currentSet.weight, value)
          } else {
            const newReps = field === 'reps' ? value : currentSet.reps
            const newWeight = field === 'weight' ? value : currentSet.weight
            updateExerciseSet(exerciseId, setId, newReps, newWeight, currentSet.durationSeconds)
          }
        }
      } else {
        // Fallback to local state for non-running workouts
        setExercises((prev) =>
          prev.map((exercise) =>
            exercise.sessionId === exerciseId
              ? {
                  ...exercise,
                  sets: exercise.sets.map((set) =>
                    set.id === setId
                      ? field === 'duration'
                        ? { ...set, durationSeconds: value }
                        : { ...set, [field]: value }
                      : set
                  ),
                }
              : exercise
          )
        )
      }
    },
    [runningWorkout, setExercises, updateExerciseSet]
  )

  const toggleSetComplete = useCallback(
    (exerciseId: string, setId: string) => {
      // Update in the store if running workout exists
      if (runningWorkout) {
        completeSet(exerciseId, setId)
      } else {
        // Fallback to local state for non-running workouts
        setExercises((prev) =>
          prev.map((exercise) =>
            exercise.sessionId === exerciseId
              ? {
                  ...exercise,
                  sets: exercise.sets.map((set) =>
                    set.id === setId ? { ...set, completed: !set.completed } : set
                  ),
                }
              : exercise
          )
        )
      }
    },
    [completeSet, runningWorkout, setExercises]
  )

  const addSet = useCallback(
    (exerciseId: string) => {
      // Update in the store if running workout exists
      if (runningWorkout) {
        addExerciseSet(exerciseId)
      } else {
        // Fallback to local state for non-running workouts
        setExercises((prev) =>
          prev.map((exercise) =>
            exercise.sessionId === exerciseId
              ? {
                  ...exercise,
                  sets: [
                    ...exercise.sets,
                    {
                      id: `${exercise.sessionId}-set-${exercise.sets.length + 1}`,
                      reps: null,
                      weight: null,
                      completed: false,
                    },
                  ],
                }
              : exercise
          )
        )
      }
    },
    [addExerciseSet, runningWorkout, setExercises]
  )

  const removeSet = useCallback(
    (exerciseId: string, setIndex: number) => {
      // Update in the store if running workout exists
      if (runningWorkout) {
        removeExerciseSet(exerciseId, setIndex)
      } else {
        // Fallback to local state for non-running workouts
        setExercises((prev) =>
          prev.map((exercise) =>
            exercise.sessionId === exerciseId && exercise.sets.length > 1
              ? {
                  ...exercise,
                  sets: exercise.sets.filter((_, index) => index !== setIndex),
                }
              : exercise
          )
        )
      }
    },
    [removeExerciseSet, runningWorkout, setExercises]
  )

  const clearRestTimer = useCallback(() => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current)
    restIntervalRef.current = null
    restDeadlineRef.current = null
  }, [])

  const finishRestTimer = useCallback(() => {
    setActiveTimer(null)
    setRemainingRest(0)
    clearRestTimer()
    // Vibration API (react-native) – guarded so web build doesn't break
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RN: any = (globalThis as any).navigator?.vibrate ? globalThis : null
      if (RN?.navigator?.vibrate) {
        RN.navigator.vibrate(400)
      }
      // Fallback using react-native module if available
      // Dynamic require to avoid web bundling issues
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Vibration } = require('react-native')
      Vibration.vibrate(400)
    } catch {
      // ignore vibration errors (e.g., web)
    }
  }, [clearRestTimer])

  const startRestTimer = useCallback(
    (setId: string) => {
      if (!restTimerEnabled) return
      // If already running, restart
      clearRestTimer()
      setActiveTimer(setId)
      // sync total with latest default from settings on start
      setRestTime(defaultRestSeconds)
      const total = defaultRestSeconds
      const deadline = Date.now() + total * 1000
      restDeadlineRef.current = deadline
      // Set initial remaining
      setRemainingRest(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))

      // Background notification for when app is locked
      scheduleRestNotification(deadline).catch(() => {})

      // Tick based on absolute time so background pauses don't break it
      restIntervalRef.current = setInterval(() => {
        const dl = restDeadlineRef.current
        if (!dl) return
        const remain = Math.max(0, Math.ceil((dl - Date.now()) / 1000))
        setRemainingRest(remain)
        if (remain <= 0) {
          finishRestTimer()
        }
      }, 500)
    },
    [clearRestTimer, finishRestTimer, restTimerEnabled, defaultRestSeconds]
  )

  const extendRestTimer = useCallback(() => {
    if (!activeTimer) return
    const EXT = 15 * 1000
    if (restDeadlineRef.current == null) return
    restDeadlineRef.current += EXT
    const remain = Math.max(0, Math.ceil((restDeadlineRef.current - Date.now()) / 1000))
    setRemainingRest(remain)
    // Reschedule background notification to new deadline
    scheduleRestNotification(restDeadlineRef.current).catch(() => {})
  }, [activeTimer])

  const skipRestTimer = useCallback(() => {
    if (!activeTimer) return
    finishRestTimer()
    cancelRestNotification().catch(() => {})
  }, [activeTimer, finishRestTimer])

  // Allow setting remaining/total seconds directly (for editing)

  // Cleanup on unmount
  useEffect(() => () => clearRestTimer(), [clearRestTimer])

  // Recompute remaining on app resume so timers 'catch up' after background/lock
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && restDeadlineRef.current && activeTimer) {
        const remain = Math.max(0, Math.ceil((restDeadlineRef.current - Date.now()) / 1000))
        setRemainingRest(remain)
        if (remain <= 0) finishRestTimer()
      }
    })
    return () => sub.remove()
  }, [activeTimer, finishRestTimer])

  const finishWorkout = useCallback(
    async (notes?: string) => {
      const result = await stopWorkout(notes)
      if (result) {
        queryClient.invalidateQueries({ queryKey: ownerKeys.records.all })
      }
      return result
    },
    [ownerKeys.records.all, stopWorkout]
  )

  const cancelWorkout = useCallback(() => {
    cancelInStore()
  }, [cancelInStore])

  return {
    // State
    exercises,
    workoutName,
    workoutTag,
    activeTimer,
    restTime,
    remainingRest,
    // Actions
    updateSet,
    toggleSetComplete,
    addSet,
    removeSet,
    startRestTimer,
    finishWorkout,
    cancelWorkout,
    // Rest timer controls (potentially used by UI layer)
    extendRestTimer,
    skipRestTimer,
  }
}
