import { useState, useCallback } from 'react'
import { apiService } from '../services/apiService'
import type { WorkoutRecordRequest, ExerciseRecord, WorkoutRecord } from '../types/api'

export interface UseWorkoutRecordingReturn {
  recordWorkout: (workoutRecord: WorkoutRecordRequest) => Promise<WorkoutRecord | null>
  isRecording: boolean
  error: string | null
}

export function useWorkoutRecording(): UseWorkoutRecordingReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recordWorkout = useCallback(async (workoutRecord: WorkoutRecordRequest) => {
    try {
      setIsRecording(true)
      setError(null)

      const result = await apiService.recordWorkout(workoutRecord)
      return result
    } catch (err) {
      console.error('Failed to record workout:', err)
      setError(err instanceof Error ? err.message : 'Failed to record workout')
      return null
    } finally {
      setIsRecording(false)
    }
  }, [])

  return {
    recordWorkout,
    isRecording,
    error,
  }
}

// Helper function to convert running workout data to workout record format
export function convertRunningWorkoutToRecord(
  runningWorkout: {
    id: string
    exercises: Array<{
      id: string
      sessionSets: Array<{
        reps: number | null
        weight: number | null
        completed: boolean
      }>
    }>
  },
  startTimeIso: string,
  notes?: string
): WorkoutRecordRequest {
  const toLocalDateTime = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }
  const exerciseRecords: ExerciseRecord[] = runningWorkout.exercises.map((exercise) => {
    const completedSets = exercise.sessionSets.filter((set) => set.completed)

    return {
      exerciseId: exercise.id,
      reps: completedSets.map((set) => set.reps || 0),
      weight: completedSets.map((set) => set.weight || 0),
      notes: undefined, // Can be extended later
    }
  })

  return {
    workoutId: runningWorkout.id,
    exerciseRecords,
    notes,
    startTime: toLocalDateTime(new Date(startTimeIso)),
  }
}
