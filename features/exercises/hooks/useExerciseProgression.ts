import { useQuery } from '@tanstack/react-query'
import { useExerciseRepository } from '../../../lib/hooks/useRepository'
import { queryKeys } from '../../../lib/queryKeys'
import type { ExerciseLogResponse } from '../../../types/api'

export interface ProgressionDataPoint {
  date: string
  value: number
  label: string
  isPersonalRecord?: boolean
}

export interface ExerciseProgressionData {
  exerciseId: string
  exerciseName: string
  oneRmProgression: ProgressionDataPoint[]
  volumeProgression: ProgressionDataPoint[]
  maxWeightProgression: ProgressionDataPoint[]
  lastWorkout?: ExerciseLogResponse
  personalRecords: {
    oneRm?: number
    volume?: number
    maxWeight?: number
  }
}

function processExerciseLogs(logs: ExerciseLogResponse[]): ExerciseProgressionData {
  if (logs.length === 0) {
    throw new Error('No exercise data available')
  }

  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  const firstLog = sortedLogs[0]
  const exerciseName = firstLog.exerciseName
  const exerciseIdFromLog = firstLog.exerciseId

  // Calculate progression data
  const oneRmProgression: ProgressionDataPoint[] = []
  const volumeProgression: ProgressionDataPoint[] = []
  const maxWeightProgression: ProgressionDataPoint[] = []

  let maxOneRm = 0
  let maxVolume = 0
  let maxWeight = 0

  sortedLogs.forEach((log) => {
    const date = new Date(log.createdAt).toISOString().split('T')[0] // YYYY-MM-DD format

    // Calculate estimated 1RM if not provided
    let estimatedOneRm = log.achievedOneRmValue || 0
    if (!estimatedOneRm && log.weight.length > 0 && log.reps.length > 0) {
      // Use Epley formula: 1RM = weight * (1 + reps/30)
      const maxWeightInSession = Math.max(...log.weight.filter((w) => w > 0))
      const repsAtMaxWeight = log.reps[log.weight.findIndex((w) => w === maxWeightInSession)]
      if (maxWeightInSession > 0 && repsAtMaxWeight > 0) {
        estimatedOneRm = maxWeightInSession * (1 + repsAtMaxWeight / 30)
      }
    }

    // Calculate total volume
    let totalVolume = log.achievedTotalVolumeValue || 0
    if (!totalVolume && log.weight.length > 0 && log.reps.length > 0) {
      totalVolume = log.weight.reduce((sum, weight, index) => {
        const reps = log.reps[index] || 0
        return sum + weight * reps
      }, 0)
    }

    // Find max weight in session
    const sessionMaxWeight =
      log.weight.length > 0 ? Math.max(...log.weight.filter((w) => w > 0)) : 0

    // Track if this is a personal record
    const isOneRmPR = estimatedOneRm > maxOneRm
    const isVolumePR = totalVolume > maxVolume
    const isMaxWeightPR = sessionMaxWeight > maxWeight

    // Update maximums
    if (isOneRmPR) maxOneRm = estimatedOneRm
    if (isVolumePR) maxVolume = totalVolume
    if (isMaxWeightPR) maxWeight = sessionMaxWeight

    // Add data points
    if (estimatedOneRm > 0) {
      oneRmProgression.push({
        date,
        value: Math.round(estimatedOneRm * 10) / 10,
        label: `${Math.round(estimatedOneRm * 10) / 10}kg`,
        isPersonalRecord: isOneRmPR,
      })
    }

    if (totalVolume > 0) {
      volumeProgression.push({
        date,
        value: Math.round(totalVolume),
        label: `${Math.round(totalVolume)}kg`,
        isPersonalRecord: isVolumePR,
      })
    }

    if (sessionMaxWeight > 0) {
      maxWeightProgression.push({
        date,
        value: sessionMaxWeight,
        label: `${sessionMaxWeight}kg`,
        isPersonalRecord: isMaxWeightPR,
      })
    }
  })

  return {
    exerciseId: exerciseIdFromLog,
    exerciseName,
    oneRmProgression,
    volumeProgression,
    maxWeightProgression,
    lastWorkout: sortedLogs[sortedLogs.length - 1],
    personalRecords: {
      oneRm: maxOneRm > 0 ? Math.round(maxOneRm * 10) / 10 : undefined,
      volume: maxVolume > 0 ? Math.round(maxVolume) : undefined,
      maxWeight: maxWeight > 0 ? maxWeight : undefined,
    },
  }
}

export function useExerciseProgression(exerciseId: string | null) {
  const repo = useExerciseRepository()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.exercises.logs(exerciseId || ''),
    queryFn: async () => {
      if (!exerciseId) throw new Error('No exercise ID provided')
      const logs = await repo.getLogs(exerciseId)
      return processExerciseLogs(logs)
    },
    enabled: !!exerciseId,
    staleTime: 1000 * 60 * 60 * 3, // 3 hours
  })

  return {
    data: data ?? null,
    isLoading,
    error: error?.message ?? null,
    refetch: async () => { await refetch() },
  }
}
