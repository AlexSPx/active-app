import { useQuery } from '@tanstack/react-query'
import { useProfileQueryKeys } from '../../../lib/hooks/useProfileQueryKeys'
import { useWorkoutRepository } from '../../../lib/hooks/useRepository'
import type { WorkoutRecord } from '../../../types/api'

export interface UseWorkoutRecordsReturn {
  workoutRecords: WorkoutRecord[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useWorkoutRecords(): UseWorkoutRecordsReturn {
  const repo = useWorkoutRepository()
  const ownerKeys = useProfileQueryKeys()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ownerKeys.records.list(),
    queryFn: async () => {
      return repo.getAllRecords()
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  return {
    workoutRecords: (data as WorkoutRecord[]) || [],
    loading: isLoading,
    error: error?.message ?? null,
    refetch: async () => {
      await refetch()
    },
  }
}
