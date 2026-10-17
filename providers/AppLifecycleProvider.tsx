import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { SQLiteDatabase } from 'expo-sqlite'
import { ProfileSQLiteProvider, useProfileDatabase } from '../lib/db/ProfileSQLiteProvider'
import { PortalProvider } from 'tamagui'
import { QueryClientProvider } from '@tanstack/react-query'
import { useUiStore } from '../stores/uiStore'
import FinishedWorkoutCongrats from '../components/FinishedWorkoutCongrats'
import { initNotifications } from '../services/notificationService'
import { useSettingsStore } from '../features/settings'
import { saveSettingsProfile } from '../features/settings/stores/settingsStore'
import { queryClient } from '../lib/queryClient'
import { queryKeys } from '../lib/queryKeys'
import { syncEngine } from '../lib/sync'
import { replaceQueuedIdReferences } from '../lib/sync/queuePayloadRemap'
import { hydrateFromServer } from '../lib/sync/hydrate'
import { setSharedDatabase } from '../lib/db/connection'
import { useAuthStore } from '../stores/authStore'
import { initializeLocalUser, migrateDbIfNeeded } from '../lib/db/migrations'
import { readLegacyTrainingProfile } from '../lib/legacyTrainingProfile'
import { isMissingLocalUserProfile, UserRepository } from '../lib/repositories/UserRepository'
import { useNetworkStore } from '../stores/networkStore'
import { apiService } from '../services/apiService'
import { remapRunningWorkoutId } from '../features/workout-session/stores/runningWorkoutStore'
import { launchFacade } from '../features/launch/launchFacade'
import {
  databaseNameForProfile,
  getProfileScope,
  isCurrentProfile,
  LOCAL_PROFILE_OWNER,
  LOCAL_USER_ID,
  profileOwnerForUser,
} from '../lib/profileScope'
import type { User } from '../types/api'

const userRepository = new UserRepository()

function loadExpoNetwork(): typeof import('expo-network') | null {
  try {
    return require('expo-network')
  } catch {
    return null
  }
}

function SyncEngineBootstrap({
  children,
  ownerId,
}: {
  children: React.ReactNode
  ownerId: string
}) {
  const db = useProfileDatabase()
  const [readyDb, setReadyDb] = useState<SQLiteDatabase | null>(null)
  const [apiReadyOwner, setApiReadyOwner] = useState<string | null>(null)
  const apiReadyOwnerRef = useRef<string | null>(null)
  const isStartupReady = useAuthStore((state) => state.isStartupReady)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const userId = useAuthStore((state) => state.user?.id)
  const profileOwnerId = useAuthStore((state) => state.profileOwnerId)
  const isProfileTransitioning = useAuthStore((state) => state.isProfileTransitioning)
  const serverSession = useAuthStore((state) => state.serverSession)
  const startupError = useAuthStore((state) => state.startupError)
  const manualOffline = useNetworkStore((state) => state.manualOffline)
  const networkPreferenceReady = useNetworkStore((state) => state.isReady)
  const networkPreferenceError = useNetworkStore((state) => state.restoreError)

  setSharedDatabase(db)

  useEffect(() => {
    let active = true
    const scope = getProfileScope()
    if (scope.ownerId !== ownerId || profileOwnerId !== ownerId) return

    const unsubscribeIdRemap = syncEngine.onIdRemap((tableName, oldId, newId) => {
      if (!isCurrentProfile(scope)) return
      if (tableName !== 'workouts' && tableName !== 'routines') return

      if (tableName === 'workouts') remapRunningWorkoutId(oldId, newId)
      const ownerKeys = queryKeys.forOwner(ownerId)
      const affectedQueries =
        tableName === 'workouts'
          ? [ownerKeys.workouts.all, ownerKeys.routines.all]
          : [ownerKeys.routines.all]
      for (const queryKey of affectedQueries) {
        queryClient.setQueriesData(
          { queryKey },
          (data) => replaceQueuedIdReferences(data, oldId, newId).value
        )
      }
    })

    setReadyDb(null)
    syncEngine.setConnectivityManaged(true)
    if (launchFacade.sync.queueMode() === 'local-only') {
      syncEngine.setUploadsEnabled(false)
    }
    syncEngine
      .init(db, { processOnInit: false })
      .then(() => {
        if (!active || !isCurrentProfile(scope)) return
        setReadyDb(db)
        useAuthStore.getState().markProfileDatabaseReady(ownerId)
      })
      .catch((error) => {
        console.error('[SyncEngineBootstrap] Init failed:', error)
        if (active && isCurrentProfile(scope)) {
          // The migrated local database remains usable even if queue bootstrap fails.
          useAuthStore.getState().markProfileDatabaseReady(ownerId)
        }
      })

    return () => {
      active = false
      syncEngine.setUploadsEnabled(false)
      unsubscribeIdRemap()
      syncEngine.destroy()
      syncEngine.setConnectivityManaged(false)
      setReadyDb(null)
    }
  }, [db, ownerId, profileOwnerId])

  useEffect(() => {
    syncEngine.setUploadsEnabled(
      isStartupReady &&
        !startupError &&
        !isProfileTransitioning &&
        isAuthenticated &&
        !!userId &&
        profileOwnerId === ownerId &&
        serverSession === 'valid' &&
        networkPreferenceReady &&
        !networkPreferenceError &&
        !manualOffline &&
        apiReadyOwnerRef.current === ownerId &&
        apiReadyOwner === ownerId
    )
  }, [
    apiReadyOwner,
    isAuthenticated,
    isProfileTransitioning,
    isStartupReady,
    manualOffline,
    networkPreferenceError,
    networkPreferenceReady,
    ownerId,
    profileOwnerId,
    serverSession,
    startupError,
    userId,
  ])

  useEffect(() => {
    if (launchFacade.api.backendMode() === 'device') {
      apiReadyOwnerRef.current = null
      setApiReadyOwner(null)
      syncEngine.setUploadsEnabled(false)
      return
    }

    apiReadyOwnerRef.current = null
    setApiReadyOwner(null)
    syncEngine.setUploadsEnabled(false)
    if (
      readyDb !== db ||
      !networkPreferenceReady ||
      networkPreferenceError ||
      manualOffline ||
      !isStartupReady ||
      startupError ||
      isProfileTransitioning ||
      !isAuthenticated ||
      !userId ||
      ownerId === LOCAL_PROFILE_OWNER ||
      profileOwnerId !== ownerId
    ) {
      return
    }

    const scope = getProfileScope()
    if (scope.ownerId !== ownerId || !isCurrentProfile(scope)) return
    const network = loadExpoNetwork()

    let active = true
    let appIsActive = AppState.currentState !== 'background' && AppState.currentState !== 'inactive'
    let inProgress = false
    let rerunRequested = false
    let validationEpoch = 0
    let retryDelay = 1_000
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const clearRetry = () => {
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = undefined
    }
    const closeGate = () => {
      validationEpoch += 1
      apiReadyOwnerRef.current = null
      setApiReadyOwner(null)
      syncEngine.setUploadsEnabled(false)
    }
    const scheduleRetry = () => {
      clearRetry()
      if (!active || !appIsActive) return
      retryTimer = setTimeout(run, retryDelay)
      retryDelay = Math.min(retryDelay * 2, 60_000)
    }
    const run = async () => {
      if (!active || !appIsActive) return
      if (inProgress) {
        rerunRequested = true
        return
      }
      inProgress = true
      const epoch = validationEpoch
      clearRetry()
      try {
        try {
          const networkState = await new Promise<
            Awaited<ReturnType<NonNullable<typeof network>['getNetworkStateAsync']>>
          >((resolve, reject) => {
            if (!network) {
              reject(new Error('Network state unavailable'))
              return
            }
            const timeout = setTimeout(() => reject(new Error('Network check timed out')), 3_000)
            network.getNetworkStateAsync().then(
              (state) => {
                clearTimeout(timeout)
                resolve(state)
              },
              (error) => {
                clearTimeout(timeout)
                reject(error)
              }
            )
          })
          if (networkState.isConnected === false || networkState.isInternetReachable === false) {
            throw new Error('Network unavailable')
          }
        } catch (error) {
          if ((error as Error).message === 'Network unavailable') throw error
        }
        await apiService.probeAvailability()
        const networkPreference = useNetworkStore.getState()
        if (
          !active ||
          !appIsActive ||
          epoch !== validationEpoch ||
          !isCurrentProfile(scope) ||
          !networkPreference.isReady ||
          networkPreference.restoreError ||
          networkPreference.manualOffline
        ) {
          return
        }
        const beforeAuth = useAuthStore.getState()
        if (
          !beforeAuth.isAuthenticated ||
          beforeAuth.profileOwnerId !== ownerId ||
          beforeAuth.user?.id !== userId ||
          beforeAuth.serverSession === 'invalid'
        ) {
          return
        }
        await beforeAuth.fetchUser()
        const state = useAuthStore.getState()
        if (
          active &&
          appIsActive &&
          epoch === validationEpoch &&
          isCurrentProfile(scope) &&
          state.profileOwnerId === ownerId &&
          state.user?.id === userId &&
          state.serverSession === 'valid'
        ) {
          retryDelay = 1_000
          apiReadyOwnerRef.current = ownerId
          setApiReadyOwner(ownerId)
        }
      } catch {
        if (
          active &&
          epoch === validationEpoch &&
          isCurrentProfile(scope) &&
          useAuthStore.getState().serverSession !== 'invalid'
        ) {
          scheduleRetry()
        }
      } finally {
        inProgress = false
        if (rerunRequested) {
          rerunRequested = false
          void run()
        }
      }
    }

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      appIsActive = nextState === 'active'
      closeGate()
      if (appIsActive) void run()
      else clearRetry()
    })
    const networkSubscription = network?.addNetworkStateListener((state) => {
      closeGate()
      if (state.isConnected === false || state.isInternetReachable === false) return
      if (retryTimer) return
      void run()
    })
    const authSubscription = useAuthStore.subscribe((state, previous) => {
      const eligible =
        state.isStartupReady &&
        !state.startupError &&
        !state.isProfileTransitioning &&
        state.isAuthenticated &&
        state.profileOwnerId === ownerId &&
        state.user?.id === userId
      if (!eligible || state.serverSession === 'invalid') {
        closeGate()
      }
      if (
        eligible &&
        !inProgress &&
        state.serverSession !== 'invalid' &&
        previous.serverSession === 'invalid'
      ) {
        void run()
      }
    })
    closeGate()
    void run()

    return () => {
      active = false
      apiReadyOwnerRef.current = null
      syncEngine.setUploadsEnabled(false)
      clearRetry()
      appStateSubscription.remove()
      networkSubscription?.remove()
      authSubscription()
    }
  }, [
    db,
    isAuthenticated,
    isProfileTransitioning,
    isStartupReady,
    manualOffline,
    networkPreferenceError,
    networkPreferenceReady,
    ownerId,
    profileOwnerId,
    readyDb,
    startupError,
    userId,
  ])

  useEffect(() => {
    if (launchFacade.api.backendMode() === 'device') return

    if (
      readyDb !== db ||
      !isStartupReady ||
      startupError ||
      isProfileTransitioning ||
      profileOwnerId !== ownerId ||
      !isAuthenticated ||
      !userId ||
      serverSession !== 'valid' ||
      !networkPreferenceReady ||
      networkPreferenceError ||
      manualOffline ||
      apiReadyOwner !== ownerId
    ) {
      return
    }

    const scope = getProfileScope()
    if (scope.ownerId !== ownerId || !isCurrentProfile(scope)) return

    let active = true
    let hydrationDeferred = false
    let hydrationInProgress = false
    let retryHydrationAfterMutation = false
    let hydrationRetryDelay = 1_000
    let hydrationRetryTimer: ReturnType<typeof setTimeout> | undefined
    let appIsActive = AppState.currentState !== 'background' && AppState.currentState !== 'inactive'
    let hydrationComplete = false
    let unsubscribeSync: (() => void) | undefined

    const scheduleHydrationRetry = () => {
      const networkPreference = useNetworkStore.getState()
      if (
        !active ||
        !appIsActive ||
        hydrationRetryTimer ||
        hydrationComplete ||
        apiReadyOwnerRef.current !== ownerId ||
        !networkPreference.isReady ||
        networkPreference.restoreError ||
        networkPreference.manualOffline
      ) {
        return
      }
      hydrationRetryTimer = setTimeout(() => {
        hydrationRetryTimer = undefined
        void hydrateWhenQueueIsClear()
      }, hydrationRetryDelay)
      hydrationRetryDelay = Math.min(hydrationRetryDelay * 2, 60_000)
    }

    const hydrateWhenQueueIsClear = async () => {
      if (!active || hydrationInProgress) return
      const state = useAuthStore.getState()
      const networkPreference = useNetworkStore.getState()
      if (
        AppState.currentState === 'background' ||
        AppState.currentState === 'inactive' ||
        apiReadyOwnerRef.current !== ownerId ||
        !networkPreference.isReady ||
        networkPreference.restoreError ||
        networkPreference.manualOffline ||
        !state.isStartupReady ||
        state.startupError ||
        state.isProfileTransitioning ||
        state.profileOwnerId !== ownerId ||
        !state.isAuthenticated ||
        state.user?.id !== userId ||
        state.serverSession !== 'valid' ||
        !isCurrentProfile(scope)
      ) {
        return
      }

      hydrationInProgress = true
      try {
        const queuedMutation = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM sync_queue LIMIT 1'
        )
        const currentNetworkPreference = useNetworkStore.getState()
        if (
          !active ||
          !appIsActive ||
          apiReadyOwnerRef.current !== ownerId ||
          !currentNetworkPreference.isReady ||
          currentNetworkPreference.restoreError ||
          currentNetworkPreference.manualOffline ||
          !isCurrentProfile(scope)
        ) {
          return
        }
        if (queuedMutation) {
          // ponytail: defer bulk hydration until queued writes drain; reconcile per row if pulls must run sooner.
          hydrationDeferred = true
          console.info('[SyncEngineBootstrap] Hydration skipped while local changes remain queued')
          return
        }

        const hydrated = await hydrateFromServer(db)
        if (
          !active ||
          !appIsActive ||
          apiReadyOwnerRef.current !== ownerId ||
          !isCurrentProfile(scope)
        ) {
          return
        }
        if (!hydrated) {
          const queuedAfterSnapshot = await db.getFirstAsync<{ id: string }>(
            'SELECT id FROM sync_queue LIMIT 1'
          )
          if (
            !active ||
            !appIsActive ||
            apiReadyOwnerRef.current !== ownerId ||
            !isCurrentProfile(scope)
          ) {
            return
          }
          hydrationDeferred = !!queuedAfterSnapshot
          if (!queuedAfterSnapshot) scheduleHydrationRetry()
          return
        }

        hydrationDeferred = false
        hydrationComplete = true
        hydrationRetryDelay = 1_000
        retryHydrationAfterMutation = false
        unsubscribeSync?.()
        unsubscribeSync = undefined
        await queryClient.invalidateQueries({ queryKey: ['profile', ownerId] })
      } catch (error: any) {
        if (isCurrentProfile(scope)) {
          console.warn('[SyncEngineBootstrap] Hydration failed (offline?):', error?.message)
          scheduleHydrationRetry()
        }
      } finally {
        hydrationInProgress = false
        if (active && retryHydrationAfterMutation) {
          retryHydrationAfterMutation = false
          void hydrateWhenQueueIsClear()
        }
      }
    }

    unsubscribeSync = syncEngine.on('sync:complete', () => {
      if (hydrationInProgress) {
        retryHydrationAfterMutation = true
      } else if (hydrationDeferred) {
        void hydrateWhenQueueIsClear()
      }
    })
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      appIsActive = state === 'active'
      if (!appIsActive && hydrationRetryTimer) {
        clearTimeout(hydrationRetryTimer)
        hydrationRetryTimer = undefined
      } else if (appIsActive) {
        scheduleHydrationRetry()
      }
    })
    syncEngine
      .processQueue()
      .then(hydrateWhenQueueIsClear)
      .catch((error) => {
        if (isCurrentProfile(scope)) {
          console.warn('[SyncEngineBootstrap] Queue drain failed before hydration:', error?.message)
        }
      })

    return () => {
      active = false
      if (hydrationRetryTimer) clearTimeout(hydrationRetryTimer)
      appStateSubscription.remove()
      unsubscribeSync?.()
    }
  }, [
    db,
    apiReadyOwner,
    manualOffline,
    networkPreferenceError,
    networkPreferenceReady,
    isAuthenticated,
    isProfileTransitioning,
    isStartupReady,
    ownerId,
    profileOwnerId,
    readyDb,
    serverSession,
    startupError,
    userId,
  ])

  return <>{children}</>
}

function OwnerDatabaseContent({ children }: { children: React.ReactNode }) {
  const finishedCongrats = useUiStore((state) => state.finishedCongrats)
  const hideFinishedCongrats = useUiStore((state) => state.hideFinishedCongrats)
  const isProfileTransitioning = useAuthStore((state) => state.isProfileTransitioning)
  const payload = finishedCongrats.payload
  const congratsVisible = !isProfileTransitioning && finishedCongrats.visible && !!payload

  return (
    <PortalProvider>
      {children}
      {congratsVisible && payload && (
        <FinishedWorkoutCongrats
          data={payload.workoutRecord}
          visible={congratsVisible}
          onClose={hideFinishedCongrats}
        />
      )}
    </PortalProvider>
  )
}

export function AppLifecycleProvider({ children }: { children: React.ReactNode }) {
  const isStartupReady = useAuthStore((state) => state.isStartupReady)
  const startupError = useAuthStore((state) => state.startupError)
  const isDeviceDataErasing = useAuthStore((state) => state.isDeviceDataErasing)
  const profileOwnerId = useAuthStore((state) => state.profileOwnerId)
  const legacyOwnerId = useAuthStore((state) => state.legacyOwnerId)
  const onInit = useCallback(
    async (db: SQLiteDatabase) => {
      const scope = getProfileScope()
      if (
        scope.ownerId !== profileOwnerId ||
        useAuthStore.getState().profileOwnerId !== profileOwnerId ||
        !isCurrentProfile(scope)
      ) {
        return
      }

      try {
        await migrateDbIfNeeded(db, { ownerId: profileOwnerId, legacyOwnerId })
        if (!isCurrentProfile(scope) || useAuthStore.getState().profileOwnerId !== profileOwnerId) {
          return
        }
        setSharedDatabase(db)

        if (launchFacade.profile.databaseBootstrapAction() !== 'restore-local-user') return

        const state = useAuthStore.getState()

        let storedUser: User | null
        try {
          storedUser = await userRepository.getCurrentUser()
        } catch (error) {
          if (!isMissingLocalUserProfile(error)) throw error
          storedUser = null
        }
        if (!isCurrentProfile(scope) || useAuthStore.getState().profileOwnerId !== profileOwnerId) {
          throw new Error('Profile changed while restoring local user')
        }

        if (!storedUser) {
          const legacyProfile = await readLegacyTrainingProfile(profileOwnerId)
          if (
            !isCurrentProfile(scope) ||
            useAuthStore.getState().profileOwnerId !== profileOwnerId
          ) {
            throw new Error('Profile changed while restoring local user')
          }
          const cachedUser = state.user
          const settings = useSettingsStore.getState()
          const seed: User = {
            ...(cachedUser ?? {}),
            id: cachedUser?.id ?? LOCAL_USER_ID,
            email: cachedUser?.email ?? '',
            username: cachedUser?.username ?? '',
            firstName: legacyProfile?.firstName ?? cachedUser?.firstName ?? '',
            lastName: legacyProfile?.lastName ?? cachedUser?.lastName ?? '',
            createdAt: cachedUser?.createdAt ?? new Date().toISOString(),
            timezone: settings.timeZone,
            measurements: { weightKg: settings.bodyWeight, heightCm: settings.height },
            registrationCompleted:
              legacyProfile?.onboardingCompleted ??
              (cachedUser ? cachedUser.registrationCompleted !== false : false),
            notificationPreferences: cachedUser?.notificationPreferences ?? null,
            notificationFrequency:
              legacyProfile?.notificationFrequency ??
              cachedUser?.notificationFrequency ??
              cachedUser?.notificationPreferences?.schedule?.length ??
              1,
          }

          await initializeLocalUser(db, seed)
          storedUser = await userRepository.getCurrentUser()
        }

        if (!storedUser) throw new Error('Could not restore the local user profile')
        if (profileOwnerForUser(storedUser.id) !== profileOwnerId || !isCurrentProfile(scope)) {
          throw new Error('Local user belongs to a different profile')
        }

        await saveSettingsProfile(scope, {
          timeZone: storedUser.timezone || 'UTC',
          bodyWeight: storedUser.measurements?.weightKg ?? null,
          height: storedUser.measurements?.heightCm ?? null,
        })
        if (!isCurrentProfile(scope)) throw new Error('Profile changed while restoring local user')

        useAuthStore.setState({
          user: storedUser,
          isAuthenticated: true,
          token: null,
          refreshToken: null,
          serverSession: 'unknown',
          isLoading: false,
          isProfileLoading: false,
          isProfileTransitioning: false,
          profileError: null,
        })
      } catch (error) {
        if (!isCurrentProfile(scope) || useAuthStore.getState().profileOwnerId !== profileOwnerId) {
          return
        }
        console.error('[Provider] Could not restore profile database:', error)
        useAuthStore.setState({ startupError: 'We couldn’t restore your local data.' })
      }
    },
    [legacyOwnerId, profileOwnerId]
  )

  const onDatabaseError = useCallback((error: Error) => {
    console.error('[Provider] Could not open or close profile database:', error)
    useAuthStore.setState({ startupError: 'We couldn’t restore your local data.' })
  }, [])

  useEffect(() => {
    initNotifications().catch(() => {})
  }, [])

  const content =
    isStartupReady && !startupError && !isDeviceDataErasing ? (
      <ProfileSQLiteProvider
        key={profileOwnerId}
        databaseName={databaseNameForProfile(profileOwnerId)}
        onInit={onInit}
        onError={onDatabaseError}
      >
        <SyncEngineBootstrap ownerId={profileOwnerId}>
          <OwnerDatabaseContent>{children}</OwnerDatabaseContent>
        </SyncEngineBootstrap>
      </ProfileSQLiteProvider>
    ) : (
      children
    )

  return <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
}
