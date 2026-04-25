import { useQuery } from '@tanstack/react-query'
import { useLegalRepository } from '../../../lib/hooks/useRepository'
import { queryKeys } from '../../../lib/queryKeys'

type LegalContentType = 'privacy' | 'terms'

export function useLegal(type: LegalContentType) {
  const repo = useLegalRepository()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: type === 'privacy' ? queryKeys.legal.privacy : queryKeys.legal.terms,
    queryFn: async () => {
      if (type === 'privacy') {
        return repo.getPrivacyPolicy()
      } else {
        return repo.getTermsOfService()
      }
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  })

  return {
    content: data ?? '',
    loading: isLoading,
    error: error?.message ?? null,
    refetch,
  }
}
