import { useQuery } from '@tanstack/react-query'
import { apiService } from '../../../services/apiService'
import { queryKeys } from '../../../lib/queryKeys'

type LegalContentType = 'privacy' | 'terms'

const EXPORT_COMPLIANCE = `

## Export Compliance

You agree to comply with all applicable export and import laws and regulations, including those of the United States. You represent that you are not located in a country subject to a U.S. government embargo, or that has been designated by the U.S. government as a "terrorist supporting" country, and that you are not listed on any U.S. government list of prohibited or restricted parties.`

export function useLegal(type: LegalContentType) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: type === 'privacy' ? queryKeys.legal.privacy : queryKeys.legal.terms,
    queryFn: async () => {
      if (type === 'privacy') {
        return apiService.getPrivacyPolicy()
      } else {
        const data = await apiService.getTermsOfService()
        return data + EXPORT_COMPLIANCE
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
