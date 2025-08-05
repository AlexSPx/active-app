import { create } from 'zustand'
import { apiService } from '../services/apiService'
import type { User, ApiError } from '../types/api'

interface UserState {
  // State
  user: User | null
  isLoading: boolean
  error: string | null
  lastUpdated: number | null

  // Actions
  fetchUser: () => Promise<void>
  updateUser: (updates: Partial<User>) => void
  refreshUser: () => Promise<void>
  clearError: () => void

  // Helpers
  isDataStale: (maxAgeMs?: number) => boolean
}

export const useUserStore = create<UserState>((set, get) => ({
  // Initial state
  user: null,
  isLoading: false,
  error: null,
  lastUpdated: null,

  // Actions
  fetchUser: async () => {
    try {
      set({ isLoading: true, error: null })

      const user = await apiService.getUser()

      set({
        user,
        isLoading: false,
        lastUpdated: Date.now(),
      })
    } catch (error) {
      const apiError = error as ApiError
      set({
        isLoading: false,
        error: apiError.message || 'Failed to fetch user data',
      })
      throw error
    }
  },

  updateUser: (updates: Partial<User>) => {
    const currentUser = get().user
    if (currentUser) {
      set({
        user: { ...currentUser, ...updates },
        lastUpdated: Date.now(),
      })
    }
  },

  refreshUser: async () => {
    // Force refresh user data
    await get().fetchUser()
  },

  clearError: () => set({ error: null }),

  // Helper methods
  isDataStale: (maxAgeMs = 5 * 60 * 1000) => {
    // Default 5 minutes
    const { lastUpdated } = get()
    if (!lastUpdated) return true
    return Date.now() - lastUpdated > maxAgeMs
  },
}))

// Selector hooks for common patterns
export const useUserData = () => useUserStore((state) => state.user)
export const useUserLoading = () => useUserStore((state) => state.isLoading)
export const useUserError = () => useUserStore((state) => state.error)
