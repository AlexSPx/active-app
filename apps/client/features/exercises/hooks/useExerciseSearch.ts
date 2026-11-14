import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useExerciseRepository } from '../../../lib/hooks/useRepository'
import { useProfileQueryKeys } from '../../../lib/hooks/useProfileQueryKeys'

export function useExerciseSearch() {
  const [searchQuery, setSearchQuery] = useState('')
  const queryClient = useQueryClient()
  const repo = useExerciseRepository()
  const ownerKeys = useProfileQueryKeys()

  const { data, isLoading, error } = useQuery({
    queryKey: ownerKeys.exercises.search(searchQuery),
    networkMode: repo.searchNetworkMode,
    queryFn: async () => {
      if (!searchQuery.trim()) return []
      return repo.search(searchQuery.trim())
    },
    enabled: searchQuery.trim().length > 0,
    placeholderData: (previousData, previousQuery) =>
      searchQuery.trim() &&
      ownerKeys.exercises.all.every((key, index) => previousQuery?.queryKey[index] === key)
        ? previousData
        : undefined,
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
    exercises: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    hasSearched: searchQuery.trim().length > 0,
    searchExercises,
    clearSearch,
  }
}
