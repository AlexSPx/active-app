import { useState, useEffect } from 'react'
import type { Exercise } from '../types/workout-session'
import { useRunningWorkoutStore } from '../stores/runningWorkoutStore'
import { useOptimizedTimer, useElapsedTimeFormatter } from './useOptimizedTimer'
import { apiService } from '../services/apiService'
import type { WorkoutRecord } from '../types/api'

export interface UseWorkoutSessionOptions {
  fallbackExercises?: Exercise[]
}

export interface WorkoutSessionState {
  exercises: Exercise[]
  workoutName: string
  workoutTag: string
  workoutDuration: string
  activeTimer: string | null
  restTime: number
}

export interface WorkoutSessionActions {
  updateSet: (exerciseId: string, setId: string, field: 'reps' | 'weight', value: number) => void
  toggleSetComplete: (exerciseId: string, setId: string) => void
  addSet: (exerciseId: string) => void
  removeSet: (exerciseId: string, setIndex: number) => void
  startRestTimer: (setId: string) => void
  finishWorkout: (notes?: string) => Promise<WorkoutRecord | void>
  cancelWorkout: () => void
}

export function useWorkoutSession(
  options: UseWorkoutSessionOptions = {}
): WorkoutSessionState & WorkoutSessionActions {
  const {
    runningWorkout,
    updateExerciseSet,
    completeSet,
    removeExerciseSet,
    addExerciseSet,
    stopWorkout,
    cancelWorkout: cancelInStore,
    getElapsedTime,
  } = useRunningWorkoutStore()

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [activeTimer, setActiveTimer] = useState<string | null>(null)
  const [restTime] = useState(90)
  const [workoutDuration, setWorkoutDuration] = useState('0:00')

  // Get workout data from running workout store
  const workoutName = runningWorkout?.name || 'No Workout'
  const workoutTag = 'In Progress'

  // Convert running workout exercises to session format
  const convertToSessionExercises = (): Exercise[] => {
    if (runningWorkout) {
      return runningWorkout.exercises.map((ex) => ({
        ...ex, // Include all API exercise properties
        sets: ex.sessionSets,
        lastWorkout: {
          sets: Array.from({ length: ex.reps }, () => ({
            reps: ex.reps,
            weight: 185, // Mock weight for now
          })),
          date: '2024-01-20',
        },
      }))
    }

    // Return fallback exercises or empty array if no running workout
    return options.fallbackExercises || []
  }

  // Update exercises when running workout changes
  useEffect(() => {
    setExercises(convertToSessionExercises())
  }, [runningWorkout])

  // Initialize exercises
  useEffect(() => {
    if (exercises.length === 0) {
      setExercises(convertToSessionExercises())
    }
  }, [])

  // Timer optimization
  const formatElapsedTime = useElapsedTimeFormatter()

  const updateDuration = () => {
    if (runningWorkout) {
      const startTime = new Date(runningWorkout.startTime).getTime()
      setWorkoutDuration(formatElapsedTime(startTime))
    } else {
      setWorkoutDuration('0:00')
    }
  }

  // Use optimized timer instead of setInterval
  useOptimizedTimer(updateDuration, {
    enabled: !!runningWorkout,
    interval: 1000,
  })

  // Set initial duration when workout starts/stops
  useEffect(() => {
    updateDuration()
  }, [runningWorkout, formatElapsedTime])

  const updateSet = (
    exerciseId: string,
    setId: string,
    field: 'reps' | 'weight',
    value: number
  ) => {
    // Update in the store if running workout exists
    if (runningWorkout) {
      const currentSet = runningWorkout.exercises
        .find((ex) => ex.id === exerciseId)
        ?.sessionSets.find((set) => set.id === setId)

      if (currentSet) {
        const newReps = field === 'reps' ? value : currentSet.reps
        const newWeight = field === 'weight' ? value : currentSet.weight
        updateExerciseSet(exerciseId, setId, newReps, newWeight)
      }
    } else {
      // Fallback to local state for non-running workouts
      setExercises((prev) =>
        prev.map((exercise) =>
          exercise.id === exerciseId
            ? {
                ...exercise,
                sets: exercise.sets.map((set) =>
                  set.id === setId ? { ...set, [field]: value } : set
                ),
              }
            : exercise
        )
      )
    }
  }

  const toggleSetComplete = (exerciseId: string, setId: string) => {
    // Update in the store if running workout exists
    if (runningWorkout) {
      completeSet(exerciseId, setId)
    } else {
      // Fallback to local state for non-running workouts
      setExercises((prev) =>
        prev.map((exercise) =>
          exercise.id === exerciseId
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
  }

  const addSet = (exerciseId: string) => {
    // Update in the store if running workout exists
    if (runningWorkout) {
      addExerciseSet(exerciseId)
    } else {
      // Fallback to local state for non-running workouts
      setExercises((prev) =>
        prev.map((exercise) =>
          exercise.id === exerciseId
            ? {
                ...exercise,
                sets: [
                  ...exercise.sets,
                  {
                    id: `${exerciseId}-${exercise.sets.length + 1}`,
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
  }

  const removeSet = (exerciseId: string, setIndex: number) => {
    // Update in the store if running workout exists
    if (runningWorkout) {
      removeExerciseSet(exerciseId, setIndex)
    } else {
      // Fallback to local state for non-running workouts
      setExercises((prev) =>
        prev.map((exercise) =>
          exercise.id === exerciseId
            ? {
                ...exercise,
                sets: exercise.sets.filter((_, index) => index !== setIndex),
              }
            : exercise
        )
      )
    }
  }

  const startRestTimer = (setId: string) => {
    setActiveTimer(setId)
    setTimeout(() => setActiveTimer(null), restTime * 1000)
  }

  const finishWorkout = async (notes?: string) => {
    return await stopWorkout(notes)
  }

  const cancelWorkout = () => {
    cancelInStore()
  }

  return {
    // State
    exercises,
    workoutName,
    workoutTag,
    workoutDuration,
    activeTimer,
    restTime,
    // Actions
    updateSet,
    toggleSetComplete,
    addSet,
    removeSet,
    startRestTimer,
    finishWorkout,
    cancelWorkout,
  }
}
