import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ApiExercise } from '../../../types/api'
import type { WorkoutRecordRequest, ExerciseRecord, WorkoutRecordResponse } from '../../../types/api'
import { WorkoutRepository } from '../../../lib/repositories/WorkoutRepository'
import { getDatabase } from '../../../lib/db/connection'
import type { FinishedCongratsPayload } from '../../../types/congrats'
import { haptics } from '../../../utils/haptics'
import { posthog } from '../../../services/posthog'

export interface RunningWorkoutExercise extends ApiExercise {
  sets: number
  reps: number
  sessionSets: Array<{
    id: string
    reps: number | null
    weight: number | null
    durationSeconds?: number | null
    completed: boolean
  }>
}

export interface RunningWorkout {
  id: string
  name: string
  startTime: string // Store as ISO string instead of Date object
  exercises: RunningWorkoutExercise[]
  currentExerciseIndex: number
  completedExercises: number
}

interface RunningWorkoutStore {
  runningWorkout: RunningWorkout | null
  isRecording: boolean
  recordingError: string | null
  startWorkout: (
    workout: Omit<RunningWorkout, 'startTime' | 'currentExerciseIndex' | 'completedExercises'>
  ) => void
  stopWorkout: (notes?: string) => Promise<WorkoutRecordResponse | void>
  cancelWorkout: () => void
  updateCurrentExercise: (index: number) => void
  completeExercise: () => void
  updateExerciseSet: (
    exerciseId: string,
    setId: string,
    reps: number | null,
    weight: number | null,
    durationSeconds?: number | null
  ) => void
  completeSet: (exerciseId: string, setId: string) => void
  removeExerciseSet: (exerciseId: string, setIndex: number) => void
  addExerciseSet: (exerciseId: string) => void
  isWorkoutRunning: () => boolean
  getElapsedTime: () => number
  reset: () => void
}

export const useRunningWorkoutStore = create<RunningWorkoutStore>()(
  persist(
    (set, get) => ({
      runningWorkout: null,
      isRecording: false,
      recordingError: null,

      startWorkout: (workout) => {
        // Convert exercises to include session sets
        const exercisesWithSets = workout.exercises.map((exercise) => ({
          ...exercise,
          sessionSets: Array.from({ length: exercise.sets }, (_, index) => ({
            id: `${exercise.id}-set-${index + 1}`,
            reps: null,
            weight: null,
            durationSeconds: exercise.category === 'CARDIO' ? 0 : undefined,
            completed: false,
          })),
        }))

        set({
          runningWorkout: {
            ...workout,
            exercises: exercisesWithSets,
            startTime: new Date().toISOString(),
            currentExerciseIndex: 0,
            completedExercises: 0,
          },
          recordingError: null,
        })
      },

      stopWorkout: async (notes?: string) => {
        const state = get()
        if (!state.runningWorkout) return

        try {
          set({ isRecording: true, recordingError: null })

          // Convert running workout to workout record format (strength + cardio)
          const rawRecords = state.runningWorkout.exercises.map((exercise) => {
            const completedSets = exercise.sessionSets.filter((set) => set.completed)
            const isCardio = exercise.category === 'CARDIO'
            if (isCardio) {
              const durations = completedSets
                .map((s) => (typeof s.durationSeconds === 'number' ? s.durationSeconds : null))
                .filter((v): v is number => v != null)
              if (durations.length === 0) return null
              return {
                exerciseId: exercise.name.replace(/\s+/g, '_'),
                reps: [],
                weight: [],
                durationSeconds: durations,
                notes: undefined as string | undefined,
              }
            }
            const repsArr = completedSets.map((set) => set.reps || 0)
            const weightArr = completedSets.map((set) => set.weight || 0)
            if (repsArr.length === 0) return null
            return {
              exerciseId: exercise.name.replace(/\s+/g, '_'),
              reps: repsArr,
              weight: weightArr,
              notes: undefined as string | undefined,
            }
          })
          const exerciseRecords: ExerciseRecord[] = rawRecords
            .filter((r): r is NonNullable<typeof r> => r != null)
            .filter(
              (r) => r.reps.length > 0 || (r.durationSeconds && r.durationSeconds.length > 0)
            ) as ExerciseRecord[]

          const toLocalDateTime = (date: Date) => {
            const pad = (n: number) => String(n).padStart(2, '0')
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
              date.getHours()
            )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
          }

          const workoutRecord: WorkoutRecordRequest = {
            workoutId: state.runningWorkout.id,
            exerciseRecords,
            notes,
            startTime: toLocalDateTime(new Date(state.runningWorkout.startTime)),
          }

          // Save to local SQLite FIRST, then queue for server sync.
          // This guarantees no data loss even if the app is offline.
          const db = await getDatabase()
          const workoutRepo = new WorkoutRepository(db)
          const result = await workoutRepo.recordWorkout(
            workoutRecord,
            state.runningWorkout.name || 'Workout',
          )

          // Clear the running workout after successful local save
          set({ runningWorkout: null, isRecording: false })
          haptics.success()

          posthog.capture('workout_completed', {
            duration_seconds: (Date.now() - new Date(state.runningWorkout.startTime).getTime()) / 1000,
            total_exercises: state.runningWorkout.exercises.length,
          })

          return result
        } catch (error) {
          console.error('Failed to record workout:', error)
          const errorMessage = error instanceof Error ? error.message : 'Failed to record workout'
          set({ recordingError: errorMessage, isRecording: false })
          // Do NOT clear runningWorkout on failure — user can retry
        }
      },

      // Discard the current running workout without recording
      cancelWorkout: () => {
        const state = get()
        if (state.runningWorkout) {
          posthog.capture('workout_cancelled', {
            duration_seconds: (Date.now() - new Date(state.runningWorkout.startTime).getTime()) / 1000,
            total_exercises: state.runningWorkout.exercises.length,
          })
        }
        set({ runningWorkout: null, isRecording: false, recordingError: null })
      },

      updateCurrentExercise: (index) => {
        const state = get()
        if (state.runningWorkout) {
          set({
            runningWorkout: {
              ...state.runningWorkout,
              currentExerciseIndex: index,
            },
          })
        }
      },

      completeExercise: () => {
        const state = get()
        if (state.runningWorkout) {
          const newCompletedCount = state.runningWorkout.completedExercises + 1
          const nextExerciseIndex = Math.min(
            state.runningWorkout.currentExerciseIndex + 1,
            state.runningWorkout.exercises.length - 1
          )

          set({
            runningWorkout: {
              ...state.runningWorkout,
              completedExercises: newCompletedCount,
              currentExerciseIndex: nextExerciseIndex,
            },
          })
        }
      },

      updateExerciseSet: (exerciseId, setId, reps, weight, durationSeconds) => {
        const state = get()
        if (state.runningWorkout) {
          const updatedExercises = state.runningWorkout.exercises.map((exercise) => {
            if (exercise.id === exerciseId) {
              return {
                ...exercise,
                sessionSets: exercise.sessionSets.map((set) => {
                  if (set.id === setId) {
                    return {
                      ...set,
                      reps,
                      weight,
                      durationSeconds: durationSeconds ?? set.durationSeconds,
                    }
                  }
                  return set
                }),
              }
            }
            return exercise
          })

          set({
            runningWorkout: {
              ...state.runningWorkout,
              exercises: updatedExercises,
            },
          })
        }
      },

      completeSet: (exerciseId, setId) => {
        const state = get()
        if (state.runningWorkout) {
          const updatedExercises = state.runningWorkout.exercises.map((exercise) => {
            if (exercise.id === exerciseId) {
              return {
                ...exercise,
                sessionSets: exercise.sessionSets.map((set) => {
                  if (set.id === setId) {
                    const newCompleted = !set.completed
                    if (newCompleted) {
                      haptics.success()
                    }
                    return { ...set, completed: newCompleted }
                  }
                  return set
                }),
              }
            }
            return exercise
          })

          set({
            runningWorkout: {
              ...state.runningWorkout,
              exercises: updatedExercises,
            },
          })
        }
      },

      removeExerciseSet: (exerciseId, setIndex) => {
        const state = get()
        if (state.runningWorkout) {
          const updatedExercises = state.runningWorkout.exercises.map((exercise) => {
            if (exercise.id === exerciseId) {
              return {
                ...exercise,
                sessionSets: exercise.sessionSets.filter((_, index) => index !== setIndex),
              }
            }
            return exercise
          })

          set({
            runningWorkout: {
              ...state.runningWorkout,
              exercises: updatedExercises,
            },
          })
        }
      },

      addExerciseSet: (exerciseId) => {
        const state = get()
        if (state.runningWorkout) {
          const updatedExercises = state.runningWorkout.exercises.map((exercise) => {
            if (exercise.id === exerciseId) {
              const newSetIndex = exercise.sessionSets.length + 1
              return {
                ...exercise,
                sessionSets: [
                  ...exercise.sessionSets,
                  {
                    id: `${exerciseId}-set-${newSetIndex}`,
                    reps: null,
                    weight: null,
                    durationSeconds: exercise.category === 'CARDIO' ? 0 : undefined,
                    completed: false,
                  },
                ],
              }
            }
            return exercise
          })

          set({
            runningWorkout: {
              ...state.runningWorkout,
              exercises: updatedExercises,
            },
          })
        }
      },

      isWorkoutRunning: () => {
        return get().runningWorkout !== null
      },

      getElapsedTime: () => {
        const state = get()
        if (state.runningWorkout) {
          return Date.now() - new Date(state.runningWorkout.startTime).getTime()
        }
        return 0
      },

      reset: () => {
        set({
          runningWorkout: null,
          isRecording: false,
          recordingError: null,
        })
      },
    }),
    {
      name: 'running-workout-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        runningWorkout: state.runningWorkout,
        recordingError: state.recordingError,
      }),
    }
  )
)
