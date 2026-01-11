import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiService } from '../../../services/apiService'
import { queryKeys } from '../../../lib/queryKeys'

export function useAuthMutations() {
  const queryClient = useQueryClient()

  const deleteAccountMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      await apiService.deleteAccount()
    },
    onSuccess: () => {
      queryClient.clear()
    },
  })

  const linkGoogleMutation = useMutation({
    mutationFn: async (idToken: string): Promise<void> => {
      await apiService.linkGoogleAccount(idToken)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.me })
    },
  })

  const deleteAccount = async (): Promise<boolean> => {
    try {
      await deleteAccountMutation.mutateAsync()
      return true
    } catch {
      return false
    }
  }

  const linkGoogleAccount = async (idToken: string): Promise<boolean> => {
    try {
      await linkGoogleMutation.mutateAsync(idToken)
      return true
    } catch {
      return false
    }
  }

  return {
    deleteAccount,
    linkGoogleAccount,
    deleteAccountPending: deleteAccountMutation.isPending,
    linkGooglePending: linkGoogleMutation.isPending,
    loading: deleteAccountMutation.isPending || linkGoogleMutation.isPending,
    error: deleteAccountMutation.error?.message ?? linkGoogleMutation.error?.message ?? null,
    clearError: () => {
      deleteAccountMutation.reset()
      linkGoogleMutation.reset()
    },
  }
}
