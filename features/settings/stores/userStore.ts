import { create } from 'zustand'
import { UserRepository } from '../../../lib/repositories/UserRepository'
import type { User, ApiError, UpdateUserRequest } from '../../../types/api'

const userRepository = new UserRepository()

interface UserState {
  // State
  user: User | null
  isLoading: boolean
  error: string | null
  lastUpdated: number | null

  // Actions
  fetchUser: () => Promise<void>
  updateUser: (updates: Partial<User>) => void
  patchUser: (payload: UpdateUserRequest) => Promise<User | null>
  refreshUser: () => Promise<void>
  clearError: () => void
  reset: () => void

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

      const user = await userRepository.getCurrentUser()

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

  patchUser: async (payload: UpdateUserRequest) => {
    try {
      set({ isLoading: true, error: null })
      const updated = await userRepository.updateCurrentUser(payload)
      // Merge into current user state
      const currentUser = get().user
      if (currentUser) {
        set({
          user: { ...currentUser, ...updated },
          isLoading: false,
          lastUpdated: Date.now(),
        })
      } else {
        // If we had no user loaded yet, just set it
        set({ user: updated, isLoading: false, lastUpdated: Date.now() })
      }
      return updated
    } catch (error) {
      const apiError = error as ApiError
      set({ isLoading: false, error: apiError.message || 'Failed to update user' })
      // Propagate error for caller handling
      throw error
    }
  },

  refreshUser: async () => {
    // Force refresh user data
    await get().fetchUser()
  },

  clearError: () => set({ error: null }),

  reset: () => {
    set({
      user: null,
      isLoading: false,
      error: null,
      lastUpdated: null,
    })
  },

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
