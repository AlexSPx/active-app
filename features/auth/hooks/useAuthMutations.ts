import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiService } from '../../../services/apiService'

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

  const deleteAccount = async (): Promise<boolean> => {
    try {
      await deleteAccountMutation.mutateAsync()
      return true
    } catch {
      return false
    }
  }

  return {
    deleteAccount,
    deleteAccountPending: deleteAccountMutation.isPending,
    loading: deleteAccountMutation.isPending,
    error: deleteAccountMutation.error?.message ?? null,
    clearError: () => {
      deleteAccountMutation.reset()
    },
  }
}
