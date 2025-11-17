import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiService } from '../services/apiService'
import { useSettingsStore } from './settingsStore'
import type { User, LoginRequest, ApiError, RegisterRequest, UpdateUserRequest } from '../types/api'

interface AuthState {
  // State
  isAuthenticated: boolean
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null

  // Actions
  login: (credentials: LoginRequest) => Promise<void>
  register: (payload: RegisterRequest) => Promise<void>
  logout: () => Promise<void>
  fetchUser: () => Promise<void>
  updateUser: (payload: UpdateUserRequest) => Promise<User | null>
  clearError: () => void

  // Internal actions
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      user: null,
      token: null,
      isLoading: false,
      error: null,

      // Actions
      login: async (credentials: LoginRequest) => {
        try {
          set({ isLoading: true, error: null })

          // Call login API
          const response = await apiService.login(credentials)

          // Store token
          await apiService.setToken(response.token)

          // Update state
          set({
            token: response.token,
            isAuthenticated: true,
            isLoading: false,
          })

          // Fetch user data
          await get().fetchUser()
        } catch (error) {
          const apiError = error as ApiError
          set({
            isLoading: false,
            error: apiError.message || 'Login failed',
            isAuthenticated: false,
            token: null,
            user: null,
          })
          throw error
        }
      },

      register: async (payload) => {
        try {
          set({ isLoading: true, error: null })

          const response = await apiService.signup(payload)
          await apiService.setToken(response.token)

          set({ token: response.token, isAuthenticated: true, isLoading: false })

          await get().fetchUser()
        } catch (error) {
          const apiError = error as ApiError
          set({
            isLoading: false,
            error: apiError.message || 'Registration failed',
            isAuthenticated: false,
            token: null,
            user: null,
          })
          throw error
        }
      },

      logout: async () => {
        try {
          // Clear token from storage
          await apiService.removeToken()

          // Clear state
          set({
            isAuthenticated: false,
            user: null,
            token: null,
            error: null,
          })
        } catch (error) {
          console.error('Logout error:', error)
        }
      },

      fetchUser: async () => {
        try {
          set({ isLoading: true, error: null })

          const user = await apiService.getUser()

          set({
            user,
            isLoading: false,
          })

          // Sync timezone into settings store if provided
          if (user.timezone) {
            try {
              useSettingsStore.getState().setTimeZone(user.timezone)
            } catch (e) {
              console.error('Failed to sync timezone to settings store', e)
              useSettingsStore.getState().setTimeZone('UTC')
            }
          }

          // Sync measurements (kg/cm) into settings store if present
          if (user.measurements) {
            try {
              const { weightKg, heightCm } = user.measurements
              useSettingsStore
                .getState()
                .setBodyWeight(typeof weightKg === 'number' ? weightKg : null)
              useSettingsStore.getState().setHeight(typeof heightCm === 'number' ? heightCm : null)
            } catch (e) {
              console.error('Failed to sync measurements to settings store', e)
            }
          }
        } catch (error) {
          const apiError = error as ApiError

          // If unauthorized, clear auth state
          if (apiError.status === 401) {
            await get().logout()
          } else {
            set({
              isLoading: false,
              error: apiError.message || 'Failed to fetch user data',
            })
          }
          throw error
        }
      },

      updateUser: async (payload: UpdateUserRequest) => {
        try {
          set({ isLoading: true, error: null })
          const updated = await apiService.updateCurrentUser(payload)
          // Merge with existing state (server returns full user shape)
          set({ user: updated, isLoading: false })

          // Sync timezone if changed
          if (updated.timezone) {
            try {
              useSettingsStore.getState().setTimeZone(updated.timezone)
            } catch (e) {
              console.error('Failed to sync updated timezone', e)
            }
          }

          // Sync measurements if present
          if (updated.measurements) {
            try {
              const { weightKg, heightCm } = updated.measurements
              useSettingsStore
                .getState()
                .setBodyWeight(typeof weightKg === 'number' ? weightKg : null)
              useSettingsStore.getState().setHeight(typeof heightCm === 'number' ? heightCm : null)
            } catch (e) {
              console.error('Failed to sync updated measurements', e)
            }
          }
          return updated
        } catch (error) {
          const apiError = error as ApiError
          set({
            isLoading: false,
            error: apiError.message || 'Failed to update user',
          })
          // If unauthorized, force logout
          if (apiError.status === 401) {
            await get().logout()
            return null
          }
          throw error
        }
      },

      clearError: () => set({ error: null }),

      // Internal actions
      setLoading: (isLoading: boolean) => set({ isLoading }),
      setError: (error: string | null) => set({ error }),
      setUser: (user: User | null) => set({ user }),
      setToken: (token: string | null) => set({ token, isAuthenticated: !!token }),
    }),
    {
      name: 'auth-storage',
      // Only persist essential data
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// Initialize auth state on app start
export const initializeAuth = async () => {
  const token = await apiService.getToken()
  const { setToken, fetchUser } = useAuthStore.getState()

  if (token) {
    setToken(token)
    try {
      await fetchUser()
    } catch (error) {
      console.error('Failed to initialize auth:', error)
      // If fetching user fails, clear the token
      await useAuthStore.getState().logout()
    }
  }
}
