import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../../lib/queryKeys'
import { useWorkoutRepository } from '../../../lib/hooks/useRepository'
import type { WorkoutRecord } from '../../../types/api'
import { useAuthStore } from '../../../stores/authStore'

export interface UseWorkoutRecordsReturn {
  workoutRecords: WorkoutRecord[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useWorkoutRecords(): UseWorkoutRecordsReturn {
  const repo = useWorkoutRepository()
  const ownerId = useAuthStore((state) => state.profileOwnerId)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.forOwner(ownerId).records.list(),
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
