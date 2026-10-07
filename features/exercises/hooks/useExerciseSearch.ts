import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useExerciseRepository } from '../../../lib/hooks/useRepository'
import { useProfileQueryKeys } from '../../../lib/hooks/useProfileQueryKeys'
import type { ApiExercise } from '../../../types/api'

export function useExerciseSearch() {
  const [searchQuery, setSearchQuery] = useState('')
  const queryClient = useQueryClient()
  const repo = useExerciseRepository()
  const ownerKeys = useProfileQueryKeys()

  const { data, isLoading, error } = useQuery({
    queryKey: ownerKeys.exercises.search(searchQuery),
    queryFn: async () => {
      if (!searchQuery.trim()) return []
      return repo.search(searchQuery.trim())
    },
    enabled: searchQuery.trim().length > 0,
    staleTime: 1000 * 60 * 60 * 3, // 3 hours
  })

  const searchExercises = useCallback(async (query: string) => {
    setSearchQuery(query)
  }, [])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    queryClient.removeQueries({ queryKey: ownerKeys.exercises.search('') })
  }, [ownerKeys, queryClient])

  return {
    exercises: (data as ApiExercise[]) || [],
    loading: isLoading,
    error: error?.message ?? null,
    hasSearched: searchQuery.trim().length > 0,
    searchExercises,
    clearSearch,
  }
}
