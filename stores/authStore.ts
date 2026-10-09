import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { config } from '../config/api'
import { useSettingsStore } from '../features/settings'
import { useUiStore } from './uiStore'
import { resetAllStores } from '../utils/storeReset'
import { queryClient } from '../lib/queryClient'
import { syncEngine } from '../lib/sync'
import { hydrateProfileStores } from '../lib/profileStorage'
import {
  getProfileScope,
  isCurrentProfile,
  LOCAL_PROFILE_OWNER,
  profileOwnerForUser,
  setActiveProfileOwner,
} from '../lib/profileScope'
import { AuthRepository, UserRepository } from 'lib/repositories'

import type { User, LoginRequest, ApiError, RegisterRequest, UpdateUserRequest } from '../types/api'
import { posthog } from '../services/posthog'

const isWeb = Platform.OS === 'web'
const authRepository = new AuthRepository()
const userRepository = new UserRepository()
let authPersistenceReady = false
let secureCredentialsMigrated = false
let authSessionGeneration = 0
let authTransitions: Promise<void> = Promise.resolve()

function serializeAuthTransition<T>(operation: () => Promise<T>): Promise<T> {
  const next = authTransitions.then(operation, operation)
  authTransitions = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

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
    isProfileTransitioning: false,
    logoutRetryRequired: false,
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
  exchange: () => Promise<{ token: string; refreshToken: string }>,
  generation: number,
  set: (partial: Partial<AuthState>) => void,
  get: () => AuthState
): Promise<boolean> {
  return serializeAuthTransition(async () => {
    if (generation !== authSessionGeneration) return false
    set({ isProfileTransitioning: true })
    try {
      const pendingRequests = authRepository.invalidatePendingRequests()
      await syncEngine.pauseAndDrain()
      await queryClient.cancelQueries()
      queryClient.clear()
      await resetAllStores()
      if (generation !== authSessionGeneration) return false

      await pendingRequests
      const response = await exchange()
      if (generation !== authSessionGeneration) return false
      await authRepository.invalidatePendingRequests()
      set({
        isAuthenticated: false,
        user: null,
        token: null,
        refreshToken: null,
        serverSession: 'unknown',
      })

      // A successful exchange may have changed credentials before the server
      // profile reveals the new owner. Keep the previous account database out
      // of the active tree until that identity is known.
      if (get().profileOwnerId !== LOCAL_PROFILE_OWNER) {
        setActiveProfileOwner(LOCAL_PROFILE_OWNER)
        set({ profileOwnerId: LOCAL_PROFILE_OWNER })
        await hydrateProfileStores(LOCAL_PROFILE_OWNER, get().legacyOwnerId)
        if (generation !== authSessionGeneration) return false
      }

      if (!isWeb) {
        await authRepository.setToken(response.token)
        if (generation !== authSessionGeneration) return false
        await authRepository.setRefreshToken(response.refreshToken)
      }
      if (generation !== authSessionGeneration) return false
      beginAuthenticatedSession(set, response)
      return true
    } catch (error) {
      if (generation === authSessionGeneration) {
        authRepository.resumePendingRequests()
        set({ isProfileTransitioning: false })
      }
      throw error
    }
  })
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
  profileOwnerId: string
  legacyOwnerId: string | null
  isProfileTransitioning: boolean
  logoutRetryRequired: boolean
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
  markProfileDatabaseReady: (ownerId: string) => void
}

async function persistScrubbedAuthState(state: AuthState): Promise<void> {
  await AsyncStorage.setItem(
    'auth-storage',
    JSON.stringify({
      state: { user: state.user, isAuthenticated: state.isAuthenticated },
      version: 0,
    })
  )
}

async function persistScrubbedAuthStateForGeneration(generation: number): Promise<boolean> {
  return serializeAuthTransition(async () => {
    if (generation !== authSessionGeneration) return false
    await persistScrubbedAuthState(useAuthStore.getState())
    return generation === authSessionGeneration
  })
}

async function switchProfile(
  ownerId: string,
  generation: number,
  set: (partial: Partial<AuthState>) => void,
  get: () => AuthState
): Promise<boolean> {
  return serializeAuthTransition(async () => {
    if (generation !== authSessionGeneration) return false
    if (get().profileOwnerId === ownerId) return true

    set({
      isProfileTransitioning: true,
      isLoading: false,
      profileError: null,
      user: null,
    })
    const pendingRequests = authRepository.invalidatePendingRequests()
    try {
      await syncEngine.pauseAndDrain()
      await queryClient.cancelQueries()
      queryClient.clear()
      await pendingRequests
      setActiveProfileOwner(ownerId)
      await hydrateProfileStores(ownerId, get().legacyOwnerId)
      await resetAllStores()
      if (generation !== authSessionGeneration) return false

      // Provider sees the new owner only after stores have been switched and hydrated.
      set({ profileOwnerId: ownerId })
      return true
    } catch (error) {
      if (generation === authSessionGeneration) {
        authRepository.resumePendingRequests()
        const apiError = error as ApiError
        set({
          isLoading: false,
          isProfileLoading: false,
          isProfileTransitioning: false,
          profileError: apiError.message || 'Could not restore this profile',
        })
      }
      throw error
    }
  })
}

function beginAuthenticatedSession(
  set: (partial: Partial<AuthState>) => void,
  response: { token: string; refreshToken: string }
) {
  authSessionGeneration += 1
  set({
    isAuthenticated: true,
    isProfileTransitioning: true,
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

async function authenticate(
  exchange: () => Promise<{ token: string; refreshToken: string }>,
  fallbackError: string,
  set: (partial: Partial<AuthState>) => void,
  get: () => AuthState
): Promise<boolean> {
  const generation = authSessionGeneration
  set({ isLoading: true, error: null })
  try {
    if (!(await persistSession(exchange, generation, set, get))) return false
    await fetchProfileAfterLogin(get)
    return true
  } catch (error) {
    if (generation === authSessionGeneration) {
      set({
        isLoading: false,
        isProfileTransitioning: false,
        error: (error as ApiError).message || fallbackError,
      })
    }
    throw error
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      isStartupReady: false,
      startupError: null,
      profileOwnerId: LOCAL_PROFILE_OWNER,
      legacyOwnerId: null,
      isProfileTransitioning: false,
      logoutRetryRequired: false,
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
        if (
          await authenticate(
            () => authRepository.loginWithWorkOS(code),
            'WorkOS login failed',
            set,
            get
          )
        ) {
          posthog.capture('user_logged_in', { method: 'workos' })
        }
      },

      login: async (credentials: LoginRequest) => {
        if (await authenticate(() => authRepository.login(credentials), 'Login failed', set, get)) {
          posthog.capture('user_logged_in', { method: 'email' })
        }
      },

      register: async (payload) => {
        if (
          await authenticate(
            () => authRepository.register(payload),
            'Registration failed',
            set,
            get
          )
        ) {
          posthog.capture('user_signed_up')
          posthog.capture('user_logged_in')
        }
      },

      loginWithGoogle: async (idToken: string) => {
        if (
          await authenticate(
            () => authRepository.loginWithGoogle(idToken),
            'Google login failed',
            set,
            get
          )
        ) {
          posthog.capture('user_logged_in', { method: 'google' })
        }
      },

      logout: async () => {
        const previousState = get()
        const previousPersistenceReady = authPersistenceReady
        const wasLocalProfileReady =
          previousState.profileOwnerId === LOCAL_PROFILE_OWNER &&
          !previousState.isProfileTransitioning
        let credentialCleanupAttempted = false
        let profileSwitchStarted = false
        let profileSwitchCommitted = false
        authSessionGeneration += 1
        const generation = authSessionGeneration
        const pendingRequests = authRepository.invalidatePendingRequests()
        useUiStore.getState().hideFinishedCongrats()
        authPersistenceReady = false
        set({
          isProfileTransitioning: true,
          logoutRetryRequired: false,
          isAuthenticated: false,
          user: null,
          token: null,
          refreshToken: null,
          isLoading: false,
        })
        await serializeAuthTransition(async () => {
          try {
            await syncEngine.pauseAndDrain()
            await pendingRequests
            await queryClient.cancelQueries()
            queryClient.clear()
            try {
              credentialCleanupAttempted = true
              await authRepository.removeToken()
              await authRepository.removeRefreshToken()
            } catch (error) {
              if ((error as { code?: string })?.code !== 'SECURE_STORE_UNAVAILABLE') throw error
              await AsyncStorage.multiRemove([
                config.STORAGE_KEYS.TOKEN,
                config.STORAGE_KEYS.REFRESH_TOKEN,
              ])
            }
            await AsyncStorage.multiRemove([
              config.STORAGE_KEYS.TOKEN,
              config.STORAGE_KEYS.REFRESH_TOKEN,
            ])

            if (!wasLocalProfileReady) {
              profileSwitchStarted = true
              setActiveProfileOwner(LOCAL_PROFILE_OWNER)
              await hydrateProfileStores(LOCAL_PROFILE_OWNER, get().legacyOwnerId)
              if (generation !== authSessionGeneration) return
              set({ profileOwnerId: LOCAL_PROFILE_OWNER })
              profileSwitchCommitted = true
            }
            await resetAllStores()
            clearAuthState(set)
            authRepository.resumePendingRequests()
            posthog.reset()
            await AsyncStorage.removeItem('auth-storage')
            authPersistenceReady = true
          } catch (error) {
            console.error('Logout error:', error)
            if (generation === authSessionGeneration) {
              authRepository.resumePendingRequests()
              if (!credentialCleanupAttempted && !profileSwitchStarted) {
                authPersistenceReady = previousPersistenceReady
                set({
                  isAuthenticated: previousState.isAuthenticated,
                  user: previousState.user,
                  token: previousState.token,
                  refreshToken: previousState.refreshToken,
                  serverSession: previousState.serverSession,
                  isLoading: false,
                  isProfileLoading: false,
                  isProfileTransitioning: previousState.isProfileTransitioning,
                  logoutRetryRequired: previousState.logoutRetryRequired,
                  startupError: previousState.startupError,
                  error: 'Could not sign out. Please try again.',
                })
              } else {
                authPersistenceReady = false
                set({
                  profileOwnerId: profileSwitchStarted
                    ? getProfileScope().ownerId
                    : get().profileOwnerId,
                  isAuthenticated: false,
                  user: null,
                  token: null,
                  refreshToken: null,
                  isLoading: false,
                  isProfileLoading: false,
                  isProfileTransitioning:
                    credentialCleanupAttempted || (profileSwitchStarted && !profileSwitchCommitted),
                  error: 'Could not sign out. Please try again.',
                  logoutRetryRequired: true,
                  ...(profileSwitchStarted
                    ? { startupError: 'We couldn’t restore your local data.' }
                    : {}),
                })
              }
            }
          }
        })
      },

      fetchUser: async () => {
        const generation = authSessionGeneration
        const requestScope = getProfileScope()
        try {
          set({ isProfileLoading: true, profileError: null, serverSession: 'unknown' })

          const user = await userRepository.getCurrentUser()
          if (generation !== authSessionGeneration || !isCurrentProfile(requestScope)) return

          const ownerId = profileOwnerForUser(user.id)
          const previousOwnerId = get().profileOwnerId
          const profileChanged = ownerId !== previousOwnerId
          if (profileChanged) {
            const switched = await switchProfile(ownerId, generation, set, get)
            if (!switched || generation !== authSessionGeneration) return
          }
          if (getProfileScope().ownerId !== ownerId) return

          set({
            user,
            isProfileLoading: false,
            profileError: null,
            serverSession: 'valid',
            isProfileTransitioning: profileChanged,
          })

          syncUserToSettings(user)
        } catch (error) {
          if (generation !== authSessionGeneration) throw error
          if (!isCurrentProfile(requestScope)) return
          const apiError = error as ApiError
          const loginTransitionActive = get().isLoading
          set({
            isProfileLoading: false,
            profileError: apiError.message || 'Failed to fetch user data',
            // A stale profile request can reject after a new login has begun.
            // Keep the old owner hidden until that credential exchange settles.
            isProfileTransitioning: loginTransitionActive,
            serverSession:
              apiError.status === 401
                ? 'invalid'
                : apiError.status == null
                  ? get().serverSession
                  : 'unknown',
          })
          if (get().profileOwnerId === LOCAL_PROFILE_OWNER) {
            authRepository.resumePendingRequests()
          }
          throw error
        }
      },

      updateUser: async (payload: UpdateUserRequest) => {
        const generation = authSessionGeneration
        const requestScope = getProfileScope()
        try {
          set({ isLoading: true, error: null })
          const updated = await userRepository.updateCurrentUser(payload)
          if (generation !== authSessionGeneration || !isCurrentProfile(requestScope)) return null
          if (profileOwnerForUser(updated.id) !== get().profileOwnerId) return null
          // Merge with existing state (server returns full user shape)
          set({ user: updated, isLoading: false, serverSession: 'valid' })

          syncUserToSettings(updated)
          return updated
        } catch (error) {
          if (generation !== authSessionGeneration || !isCurrentProfile(requestScope)) return null
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
      setUser: (user: User | null) => {
        if (user && profileOwnerForUser(user.id) !== get().profileOwnerId) return
        set({ user })
      },
      setToken: (token: string | null) => set({ token, isAuthenticated: !!token }),
      setRefreshToken: (refreshToken: string | null) => set({ refreshToken }),
      markServerSessionInvalid: () => set({ serverSession: 'invalid' }),
      markProfileDatabaseReady: (ownerId: string) => {
        if (ownerId === get().profileOwnerId) {
          authRepository.resumePendingRequests()
          set({ isProfileTransitioning: false })
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: authStorage,
      // Only persist essential data
      partialize: (state) => ({
        ...(!isWeb && !secureCredentialsMigrated
          ? { token: state.token, refreshToken: state.refreshToken }
          : {}),
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
    authPersistenceReady = false
    useAuthStore.setState({ isStartupReady: false, startupError: null })
  }
  if (!initializationPromise) initializationPromise = initializeAuthState()
  return initializationPromise
}

async function initializeAuthState(): Promise<void> {
  const generation = authSessionGeneration
  let shouldRefreshProfile = false
  try {
    const hydrationError = await waitForHydration(useAuthStore)
    if (hydrationError) throw hydrationError
    if (generation !== authSessionGeneration) return

    // The last persisted auth user is the only identity allowed to claim legacy data.
    const cachedState = useAuthStore.getState()
    const legacyOwnerId = cachedState.user?.id ? profileOwnerForUser(cachedState.user.id) : null
    const ownerId = legacyOwnerId ?? LOCAL_PROFILE_OWNER
    setActiveProfileOwner(ownerId)
    await hydrateProfileStores(ownerId, legacyOwnerId)
    if (generation !== authSessionGeneration) return
    useAuthStore.setState({
      profileOwnerId: ownerId,
      legacyOwnerId,
      isProfileTransitioning: false,
    })

    const hydratedState = useAuthStore.getState()
    try {
      const credentials = await authRepository.migrateLegacyCredentials({
        token: hydratedState.token,
        refreshToken: hydratedState.refreshToken,
      })
      if (generation !== authSessionGeneration) return

      if (isWeb) {
        // Browser sessions use cookies; legacy native token fields are no longer needed.
        useAuthStore.setState({ token: null, refreshToken: null })
        if (
          !(await persistScrubbedAuthStateForGeneration(generation)) ||
          generation !== authSessionGeneration
        )
          return
        authPersistenceReady = true
        shouldRefreshProfile = hydratedState.isAuthenticated
      } else {
        const state = useAuthStore.getState()
        const hasCredentials = !!(credentials.token || credentials.refreshToken)
        if (hasCredentials) {
          useAuthStore.setState({
            isAuthenticated: true,
            token: credentials.token,
            refreshToken: credentials.refreshToken,
            serverSession: 'unknown',
          })
        } else if (state.isAuthenticated && state.user) {
          // Keep the cached profile usable after credentials expire or disappear.
          useAuthStore.setState({ token: null, refreshToken: null, serverSession: 'invalid' })
        } else {
          useAuthStore.setState({
            isAuthenticated: false,
            user: null,
            token: null,
            refreshToken: null,
            serverSession: 'unknown',
          })
        }
        if (
          !(await persistScrubbedAuthStateForGeneration(generation)) ||
          generation !== authSessionGeneration
        )
          return
        secureCredentialsMigrated = true
        authPersistenceReady = true
        shouldRefreshProfile = hasCredentials
      }
    } catch (error) {
      if (!isWeb && (error as { code?: string })?.code === 'SECURE_STORE_UNAVAILABLE') {
        authPersistenceReady = true
        return
      }
      throw error
    }
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
