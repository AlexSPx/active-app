import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { useSettingsStore } from '../features/settings'
import { useRunningWorkoutStore } from '../features/workout-session/stores/runningWorkoutStore'
import { resetAllStores } from '../utils/storeReset'
import { clearDatabase } from '../lib/db/connection'
import { AuthRepository, UserRepository } from 'lib/repositories'

import type { User, LoginRequest, ApiError, RegisterRequest, UpdateUserRequest } from '../types/api'
import { posthog } from '../services/posthog'

const isWeb = Platform.OS === 'web'
const authRepository = new AuthRepository()
const userRepository = new UserRepository()
let authPersistenceReady = false
let authSessionGeneration = 0

const authStorage = createJSONStorage(() => ({
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, value) => (authPersistenceReady ? AsyncStorage.setItem(name, value) : undefined),
  removeItem: (name) => AsyncStorage.removeItem(name),
}))

function clearAuthState(set: (partial: Partial<AuthState>) => void) {
  set({
    startupError: null,
    isAuthenticated: false,
    user: null,
    token: null,
    refreshToken: null,
    isLoading: false,
    isProfileLoading: false,
    profileError: null,
    serverSession: 'unknown',
    error: null,
  })
}

async function waitForHydration(store: {
  persist: { hasHydrated: () => boolean; rehydrate: () => Promise<void> | void }
}): Promise<unknown> {
  if (!store.persist.hasHydrated()) {
    try {
      await store.persist.rehydrate()
    } catch (error) {
      return error
    }
  }
  return store.persist.hasHydrated() ? undefined : new Error('Could not restore saved data')
}

async function persistSession(
  response: { token: string; refreshToken: string },
  generation: number
): Promise<boolean> {
  if (generation !== authSessionGeneration) return false
  if (isWeb) return true

  await authRepository.setToken(response.token)
  if (generation !== authSessionGeneration) return false
  await authRepository.setRefreshToken(response.refreshToken)
  return generation === authSessionGeneration
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
  isStartupReady: boolean
  startupError: string | null
  // Local access remains available when the remote session cannot be checked.
  isAuthenticated: boolean
  serverSession: 'unknown' | 'valid' | 'invalid'
  user: User | null
  token: string | null
  refreshToken: string | null
  isLoading: boolean
  isProfileLoading: boolean
  profileError: string | null
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
  markServerSessionInvalid: () => void
}

function beginAuthenticatedSession(
  set: (partial: Partial<AuthState>) => void,
  response: { token: string; refreshToken: string }
) {
  authSessionGeneration += 1
  set({
    isAuthenticated: true,
    isLoading: false,
    user: null,
    token: isWeb ? null : response.token,
    refreshToken: isWeb ? null : response.refreshToken,
    serverSession: 'unknown',
    isProfileLoading: false,
    profileError: null,
    startupError: null,
  })
}

async function fetchProfileAfterLogin(get: () => AuthState) {
  try {
    await get().fetchUser()
  } catch {
    // The credential exchange succeeded; AuthGuard presents the profile retry state.
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      isStartupReady: false,
      startupError: null,
      isAuthenticated: false,
      serverSession: 'unknown',
      user: null,
      token: null,
      refreshToken: null,
      isLoading: false,
      isProfileLoading: false,
      profileError: null,
      error: null,

      // Actions
      loginWithWorkOS: async (code: string) => {
        const generation = authSessionGeneration
        try {
          console.log('Handling WorkOS login on ' + (isWeb ? 'web' : 'native'))

          set({ isLoading: true, error: null })

          const response = await authRepository.loginWithWorkOS(code)
          if (!(await persistSession(response, generation))) return

          beginAuthenticatedSession(set, response)
          await fetchProfileAfterLogin(get)
          posthog.capture('user_logged_in', { method: 'workos' })
        } catch (error) {
          const apiError = error as ApiError
          if (generation === authSessionGeneration) {
            set({ isLoading: false, error: apiError.message || 'WorkOS login failed' })
          }
          throw error
        }
      },
      login: async (credentials: LoginRequest) => {
        const generation = authSessionGeneration
        try {
          set({ isLoading: true, error: null })

          // Call login API
          const response = await authRepository.login(credentials)
          if (!(await persistSession(response, generation))) return

          beginAuthenticatedSession(set, response)
          await fetchProfileAfterLogin(get)

          posthog.capture('user_logged_in', { method: 'email' })
        } catch (error) {
          const apiError = error as ApiError
          if (generation === authSessionGeneration) {
            set({ isLoading: false, error: apiError.message || 'Login failed' })
          }
          throw error
        }
      },

      register: async (payload) => {
        const generation = authSessionGeneration
        try {
          set({ isLoading: true, error: null })

          const response = await authRepository.register(payload)
          if (!(await persistSession(response, generation))) return

          beginAuthenticatedSession(set, response)
          await fetchProfileAfterLogin(get)

          posthog.capture('user_signed_up')
          posthog.capture('user_logged_in')
        } catch (error) {
          const apiError = error as ApiError
          if (generation === authSessionGeneration) {
            set({ isLoading: false, error: apiError.message || 'Registration failed' })
          }
          throw error
        }
      },

      loginWithGoogle: async (idToken: string) => {
        const generation = authSessionGeneration
        try {
          set({ isLoading: true, error: null })
          const response = await authRepository.loginWithGoogle(idToken)
          if (!(await persistSession(response, generation))) return

          beginAuthenticatedSession(set, response)
          await fetchProfileAfterLogin(get)
          posthog.capture('user_logged_in', { method: 'google' })
        } catch (error) {
          const apiError = error as ApiError
          if (generation === authSessionGeneration) {
            set({ isLoading: false, error: apiError.message || 'Google login failed' })
          }
          throw error
        }
      },

      logout: async () => {
        authSessionGeneration += 1
        clearAuthState(set)
        try {
          await Promise.allSettled([
            authRepository.removeToken(),
            authRepository.removeRefreshToken(),
          ])

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
        const generation = authSessionGeneration
        try {
          set({ isProfileLoading: true, profileError: null, serverSession: 'unknown' })

          const user = await userRepository.getCurrentUser()
          if (generation !== authSessionGeneration) return

          set({
            user,
            isProfileLoading: false,
            profileError: null,
            serverSession: 'valid',
          })

          syncUserToSettings(user)
        } catch (error) {
          if (generation !== authSessionGeneration) throw error
          const apiError = error as ApiError
          set({
            isProfileLoading: false,
            profileError: apiError.message || 'Failed to fetch user data',
            serverSession:
              apiError.status === 401
                ? 'invalid'
                : apiError.status == null
                  ? get().serverSession
                  : 'unknown',
          })
          throw error
        }
      },

      updateUser: async (payload: UpdateUserRequest) => {
        const generation = authSessionGeneration
        try {
          set({ isLoading: true, error: null })
          const updated = await userRepository.updateCurrentUser(payload)
          if (generation !== authSessionGeneration) return null
          // Merge with existing state (server returns full user shape)
          set({ user: updated, isLoading: false, serverSession: 'valid' })

          syncUserToSettings(updated)
          return updated
        } catch (error) {
          if (generation !== authSessionGeneration) return null
          const apiError = error as ApiError
          set({
            isLoading: false,
            error: apiError.message || 'Failed to update user',
          })
          // A rejected remote session does not erase the local profile or data.
          if (apiError.status === 401) {
            set({ serverSession: 'invalid' })
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
      markServerSessionInvalid: () => set({ serverSession: 'invalid' }),
    }),
    {
      name: 'auth-storage',
      storage: authStorage,
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

// Restore local state first; server profile validation continues in the background.
let initializationPromise: Promise<void> | null = null

export function initializeAuth(retry = false): Promise<void> {
  if (retry) {
    initializationPromise = null
    useAuthStore.setState({ isStartupReady: false, startupError: null })
  }
  if (!initializationPromise) initializationPromise = initializeAuthState()
  return initializationPromise
}

async function initializeAuthState(): Promise<void> {
  const generation = authSessionGeneration
  let shouldRefreshProfile = false
  try {
    const hydrationErrors = await Promise.all([
      waitForHydration(useAuthStore),
      waitForHydration(useSettingsStore),
      waitForHydration(useRunningWorkoutStore),
    ])
    const hydrationError = hydrationErrors.find(Boolean)
    if (hydrationError) throw hydrationError
    authPersistenceReady = true
    if (generation !== authSessionGeneration) return

    const [token, refreshToken] = isWeb
      ? [null, null]
      : await Promise.all([authRepository.getToken(), authRepository.getRefreshToken()])
    if (generation !== authSessionGeneration) return
    const state = useAuthStore.getState()
    const hasCredentials = !!(token || refreshToken)

    if (hasCredentials) {
      useAuthStore.setState({
        isAuthenticated: true,
        token,
        refreshToken,
        serverSession: 'unknown',
      })
    } else if (!isWeb && state.isAuthenticated && state.user) {
      // Keep the cached profile usable after credentials expire or disappear.
      useAuthStore.setState({ token: null, refreshToken: null, serverSession: 'invalid' })
    } else if (!isWeb) {
      useAuthStore.setState({
        isAuthenticated: false,
        user: null,
        token: null,
        refreshToken: null,
        serverSession: 'unknown',
      })
    }

    shouldRefreshProfile = hasCredentials || (isWeb && state.isAuthenticated)
  } catch (error) {
    console.error('Failed to restore local startup state:', error)
    if (generation === authSessionGeneration) {
      useAuthStore.setState({ startupError: 'We couldn’t restore your local data.' })
    }
  } finally {
    useAuthStore.setState({ isStartupReady: true })
  }

  if (shouldRefreshProfile) {
    void useAuthStore
      .getState()
      .fetchUser()
      .catch(() => {})
  }
}
