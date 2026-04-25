import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { useSettingsStore } from '../features/settings'
import { resetAllStores } from '../utils/storeReset'
import { clearDatabase } from '../lib/db/connection'
import { AuthRepository, UserRepository } from '../lib/repositories'
import type { User, LoginRequest, ApiError, RegisterRequest, UpdateUserRequest } from '../types/api'
import { posthog } from '../services/posthog'

const isWeb = Platform.OS === 'web'
const authRepository = new AuthRepository()
const userRepository = new UserRepository()

function clearAuthState(set: (partial: Partial<AuthState>) => void) {
  set({
    isAuthenticated: false,
    user: null,
    token: null,
    refreshToken: null,
    isLoading: false,
    error: null,
  })
}

async function persistSession(response: { token: string; refreshToken: string }) {
  if (isWeb) return

  await authRepository.setToken(response.token)
  await authRepository.setRefreshToken(response.refreshToken)
}

function syncUserToSettings(user: User) {
  if (user.timezone) {
    try {
      useSettingsStore.getState().setTimeZone(user.timezone)
    } catch (e) {
      console.error('Failed to sync timezone to settings store', e)
      useSettingsStore.getState().setTimeZone('UTC')
    }
  }

  if (user.measurements) {
    try {
      const { weightKg, heightCm } = user.measurements
      useSettingsStore.getState().setBodyWeight(typeof weightKg === 'number' ? weightKg : null)
      useSettingsStore.getState().setHeight(typeof heightCm === 'number' ? heightCm : null)
    } catch (e) {
      console.error('Failed to sync measurements to settings store', e)
    }
  }
}

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
          console.log('Handling WorkOS login on ' + (isWeb ? 'web' : 'native'))

          set({ isLoading: true, error: null })

          const response = await authRepository.loginWithWorkOS(code)
          await persistSession(response)

          set({
            isAuthenticated: true,
            isLoading: false,
            token: isWeb ? null : response.token,
            refreshToken: isWeb ? null : response.refreshToken,
          })

          await get().fetchUser()
          posthog.capture('user_logged_in', { method: 'workos' })
        } catch (error) {
          const apiError = error as ApiError
          clearAuthState(set)
          set({ error: apiError.message || 'WorkOS login failed' })
          throw error
        }
      },
      login: async (credentials: LoginRequest) => {
        try {
          set({ isLoading: true, error: null })

          // Call login API
          const response = await authRepository.login(credentials)
          await persistSession(response)

          // Update state
          set({
            isAuthenticated: true,
            isLoading: false,
            token: isWeb ? null : response.token,
            refreshToken: isWeb ? null : response.refreshToken,
          })

          // Fetch user data
          await get().fetchUser()

          posthog.capture('user_logged_in', {method: "email"})
        } catch (error) {
          const apiError = error as ApiError
          clearAuthState(set)
          set({ error: apiError.message || 'Login failed' })
          throw error
        }
      },

      register: async (payload) => {
        try {
          set({ isLoading: true, error: null })

          const response = await authRepository.register(payload)
          await persistSession(response)

          set({
            isAuthenticated: true,
            isLoading: false,
            token: isWeb ? null : response.token,
            refreshToken: isWeb ? null : response.refreshToken,
          })

          await get().fetchUser()

          posthog.capture('user_signed_up')
          posthog.capture('user_logged_in')
        } catch (error) {
          const apiError = error as ApiError
          clearAuthState(set)
          set({ error: apiError.message || 'Registration failed' })
          throw error
        }
      },

      loginWithGoogle: async (idToken: string) => {
        try {
          set({ isLoading: true, error: null })
          const response = await authRepository.loginWithGoogle(idToken)
          await persistSession(response)

          set({
            isAuthenticated: true,
            isLoading: false,
            token: isWeb ? null : response.token,
            refreshToken: isWeb ? null : response.refreshToken,
          })
          await get().fetchUser()
          posthog.capture('user_logged_in', { method: 'google' })
        } catch (error) {
          const apiError = error as ApiError
          clearAuthState(set)
          set({ error: apiError.message || 'Google login failed' })
          throw error
        }
      },

      logout: async () => {
        try {
          // Clear all stores and caches first
          await resetAllStores()

          // Clear local SQLite database
          await clearDatabase()

          // Then clear auth state (this will be redundant for auth store but ensures consistency)
          clearAuthState(set)
          posthog.reset()
        } catch (error) {
          console.error('Logout error:', error)
        }
      },

      fetchUser: async () => {
        try {
          set({ isLoading: true, error: null })

          const user = await userRepository.getCurrentUser()

          set({
            user,
            isLoading: false,
          })

          syncUserToSettings(user)
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
          const updated = await userRepository.updateCurrentUser(payload)
          // Merge with existing state (server returns full user shape)
          set({ user: updated, isLoading: false })

          syncUserToSettings(updated)
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
      storage: createJSONStorage(() => AsyncStorage),
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
  const token = await authRepository.getToken()
  const refreshToken = await authRepository.getRefreshToken()
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
