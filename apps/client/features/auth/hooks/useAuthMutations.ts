import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useUserRepository } from '../../../lib/hooks/useRepository'

export function useAuthMutations() {
  const queryClient = useQueryClient()
  const repo = useUserRepository()

  const deleteAccountMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      await repo.deleteCurrentUser()
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
