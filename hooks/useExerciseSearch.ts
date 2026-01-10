import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiService } from '../services/apiService'
import { queryKeys } from '../lib/queryKeys'
import { exercisesArraySchema } from '../lib/schemas/api'
import type { ApiExercise } from '../types/api'

export function useExerciseSearch() {
  const [searchQuery, setSearchQuery] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.exercises.search(searchQuery),
    queryFn: async () => {
      if (!searchQuery.trim()) return []
      const response = await apiService.searchExercises(searchQuery.trim())
      return exercisesArraySchema.parse(response)
    },
    enabled: searchQuery.trim().length > 0,
    staleTime: 1000 * 60 * 60 * 3, // 3 hours
  })

  const searchExercises = useCallback(async (query: string) => {
    setSearchQuery(query)
  }, [])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    queryClient.removeQueries({ queryKey: queryKeys.exercises.search('') })
  }, [queryClient])

  return {
    exercises: (data as ApiExercise[]) || [],
    loading: isLoading,
    error: error?.message ?? null,
    hasSearched: searchQuery.trim().length > 0,
    searchExercises,
    clearSearch,
  }
}
