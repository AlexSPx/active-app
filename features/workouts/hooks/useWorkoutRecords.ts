import { useQuery } from '@tanstack/react-query'
import { apiService } from '../../../services/apiService'
import { queryKeys } from '../../../lib/queryKeys'
import { workoutRecordsArraySchema } from '../../../lib/schemas/api'
import type { WorkoutRecord } from '../../../types/api'

export interface UseWorkoutRecordsReturn {
  workoutRecords: WorkoutRecord[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useWorkoutRecords(): UseWorkoutRecordsReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.records.list(),
    queryFn: async () => {
      const response = await apiService.getWorkoutRecords()
      return workoutRecordsArraySchema.parse(response)
    },
    staleTime: 1000 * 60 * 60 * 8, // 8 hours
  })

  return {
    workoutRecords: (data as WorkoutRecord[]) || [],
    loading: isLoading,
    error: error?.message ?? null,
    refetch: async () => { await refetch() },
  }
}