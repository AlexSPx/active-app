import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Platform } from 'react-native'
import { apiService } from '../services/apiService'
import { useSettingsStore } from './settingsStore'
import { resetAllStores } from '../utils/storeReset'
import type { User, LoginRequest, ApiError, RegisterRequest, UpdateUserRequest } from '../types/api'
import { posthog } from '../services/posthog'

const isWeb = Platform.OS === 'web'

interface AuthState {
  // State
  isAuthenticated: boolean
  user: User | null
  token: string | null
  refreshToken: string | null
  isLoading: boolean
  error: string | null

  // Actions
  login: (credentials: LoginRequest) => Promise<void>
  loginWithGoogle: (idToken: string) => Promise<void>
  loginWithWorkOS: (code: string) => Promise<void>
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
  setRefreshToken: (token: string | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
      isLoading: false,
      error: null,

      // Actions
      loginWithWorkOS: async (code: string) => {
        try {
          set({ isLoading: true, error: null })

          const response = await apiService.workosLogin(code)
          
          // On native, store tokens locally; on web, httpOnly cookies are set by server
          if (!isWeb) {
            await apiService.setToken(response.token)
            await apiService.setRefreshToken(response.refreshToken)
            set({
              token: response.token,
              refreshToken: response.refreshToken,
            })
          }

          set({
            isAuthenticated: true,
            isLoading: false,
          })

          await get().fetchUser()
          posthog.capture('user_logged_in', { method: 'workos' })
        } catch (error) {
          const apiError = error as ApiError
          set({
            isLoading: false,
            error: apiError.message || 'WorkOS login failed',
            isAuthenticated: false,
            token: null,
            refreshToken: null,
            user: null,
          })
          throw error
        }
      },
      login: async (credentials: LoginRequest) => {
        try {
          set({ isLoading: true, error: null })

          // Call login API
          const response = await apiService.login(credentials)

          // On native, store tokens locally; on web, httpOnly cookies are set by server
          if (!isWeb) {
            await apiService.setToken(response.token)
            await apiService.setRefreshToken(response.refreshToken)
            set({
              token: response.token,
              refreshToken: response.refreshToken,
            })
          }

          // Update state
          set({
            isAuthenticated: true,
            isLoading: false,
          })

          // Fetch user data
          await get().fetchUser()

          posthog.capture('user_logged_in', {method: "email"})
        } catch (error) {
          const apiError = error as ApiError
          set({
            isLoading: false,
            error: apiError.message || 'Login failed',
            isAuthenticated: false,
            token: null,
            refreshToken: null,
            user: null,
          })
          throw error
        }
      },

      register: async (payload) => {
        try {
          set({ isLoading: true, error: null })

          const response = await apiService.signup(payload)
          
          // On native, store tokens locally; on web, httpOnly cookies are set by server
          if (!isWeb) {
            await apiService.setToken(response.token)
            await apiService.setRefreshToken(response.refreshToken)
            set({
              token: response.token,
              refreshToken: response.refreshToken,
            })
          }

          set({
            isAuthenticated: true,
            isLoading: false,
          })

          await get().fetchUser()

          posthog.capture('user_signed_up')
          posthog.capture('user_logged_in')
        } catch (error) {
          const apiError = error as ApiError
          set({
            isLoading: false,
            error: apiError.message || 'Registration failed',
            isAuthenticated: false,
            token: null,
            refreshToken: null,
            user: null,
          })
          throw error
        }
      },

      loginWithGoogle: async (idToken: string) => {
        try {
          set({ isLoading: true, error: null })
          const response = await apiService.googleLogin(idToken)
          
          // On native, store tokens locally; on web, httpOnly cookies are set by server
          if (!isWeb) {
            await apiService.setToken(response.token)
            await apiService.setRefreshToken(response.refreshToken)
            set({
              token: response.token,
              refreshToken: response.refreshToken,
            })
          }
          
          set({
            isAuthenticated: true,
            isLoading: false,
          })
          await get().fetchUser()
          posthog.capture('user_logged_in', { method: 'google' })
        } catch (error) {
          const apiError = error as ApiError
          set({
            isLoading: false,
            error: apiError.message || 'Google login failed',
            isAuthenticated: false,
            token: null,
            refreshToken: null,
            user: null,
          })
          throw error
        }
      },

      logout: async () => {
        try {
          // Clear all stores and caches first
          await resetAllStores()

          // Then clear auth state (this will be redundant for auth store but ensures consistency)
          set({
            isAuthenticated: false,
            user: null,
            token: null,
            refreshToken: null,
            error: null,
          })
          posthog.reset()
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
      setRefreshToken: (refreshToken: string | null) => set({ refreshToken }),
    }),
    {
      name: 'auth-storage',
      // Only persist essential data
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// Initialize auth state on app start
export const initializeAuth = async () => {
  const token = await apiService.getToken()
  const refreshToken = await apiService.getRefreshToken()
  const { setToken, setRefreshToken, fetchUser } = useAuthStore.getState()

  if (token) {
    setToken(token)
    if (refreshToken) {
      setRefreshToken(refreshToken)
    }
    try {
      await fetchUser()
    } catch (error) {
      console.error('Failed to initialize auth:', error)
      // If fetching user fails, clear the token
      await useAuthStore.getState().logout()
    }
  }
}
