import { useCallback, useEffect, useState } from 'react'
import { useColorScheme } from 'react-native'
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite'
import { migrateDbIfNeeded } from '../lib/db/migrations'
import { TamaguiProvider, type TamaguiProviderProps, PortalProvider, Theme } from 'tamagui'
import { ToastProvider, ToastViewport } from '@tamagui/toast'
import { QueryClientProvider } from '@tanstack/react-query'
import { CurrentToast } from './CurrentToast'
import { config } from '../tamagui.config'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useUiStore } from '../stores/uiStore'
import FinishedWorkoutCongrats from '../components/FinishedWorkoutCongrats'
import { initNotifications, registerPushNotifications } from '../services/notificationService'
import { PostHogProvider } from 'posthog-react-native'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { useSettingsStore } from '../features/settings'
import { posthog } from '../services/posthog'
import { queryClient } from '../lib/queryClient'
import { queryKeys } from '../lib/queryKeys'
import { syncEngine } from '../lib/sync'
import { replaceQueuedIdReferences } from '../lib/sync/queuePayloadRemap'
import { hydrateFromServer } from '../lib/sync/hydrate'
import { setSharedDatabase } from '../lib/db/connection'
import { useAuthStore } from '../stores/authStore'
import { remapRunningWorkoutId } from '../features/workout-session/stores/runningWorkoutStore'
import { databaseNameForProfile, getProfileScope, isCurrentProfile } from '../lib/profileScope'

function SyncEngineBootstrap({
  children,
  ownerId,
}: {
  children: React.ReactNode
  ownerId: string
}) {
  const db = useSQLiteContext()
  const [readyDb, setReadyDb] = useState<SQLiteDatabase | null>(null)
  const isStartupReady = useAuthStore((state) => state.isStartupReady)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const userId = useAuthStore((state) => state.user?.id)
  const profileOwnerId = useAuthStore((state) => state.profileOwnerId)
  const isProfileTransitioning = useAuthStore((state) => state.isProfileTransitioning)
  const serverSession = useAuthStore((state) => state.serverSession)
  const startupError = useAuthStore((state) => state.startupError)

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
        serverSession === 'valid'
    )
  }, [
    isAuthenticated,
    isProfileTransitioning,
    isStartupReady,
    ownerId,
    profileOwnerId,
    serverSession,
    startupError,
    userId,
  ])

  useEffect(() => {
    if (
      readyDb !== db ||
      !isStartupReady ||
      startupError ||
      isProfileTransitioning ||
      profileOwnerId !== ownerId ||
      !isAuthenticated ||
      !userId ||
      serverSession !== 'valid'
    ) {
      return
    }

    const scope = getProfileScope()
    if (scope.ownerId !== ownerId || !isCurrentProfile(scope)) return

    hydrateFromServer(db)
      .then(() => {
        if (isCurrentProfile(scope)) {
          return queryClient.invalidateQueries({ queryKey: ['profile', ownerId] })
        }
      })
      .catch((error) => {
        if (isCurrentProfile(scope)) {
          console.warn('[SyncEngineBootstrap] Hydration failed (offline?):', error?.message)
        }
      })
  }, [
    db,
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

export function Provider({ children, ...rest }: Omit<TamaguiProviderProps, 'config'>) {
  const colorScheme = useColorScheme()
  const theme = useSettingsStore((state) => state.theme)
  const isStartupReady = useAuthStore((state) => state.isStartupReady)
  const startupError = useAuthStore((state) => state.startupError)
  const profileOwnerId = useAuthStore((state) => state.profileOwnerId)
  const legacyOwnerId = useAuthStore((state) => state.legacyOwnerId)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isProfileTransitioning = useAuthStore((state) => state.isProfileTransitioning)
  const serverSession = useAuthStore((state) => state.serverSession)
  const userId = useAuthStore((state) => state.user?.id)
  const finishedCongrats = useUiStore((state) => state.finishedCongrats)
  const hideFinishedCongrats = useUiStore((state) => state.hideFinishedCongrats)
  const congratsVisible = finishedCongrats.visible && !!finishedCongrats.payload
  const payload = finishedCongrats.payload
  const activeTheme = theme === 'system' ? colorScheme : theme

  const onInit = useCallback(
    (db: SQLiteDatabase) => migrateDbIfNeeded(db, { ownerId: profileOwnerId, legacyOwnerId }),
    [legacyOwnerId, profileOwnerId]
  )

  useEffect(() => {
    initNotifications().catch(() => {})
  }, [])

  useEffect(() => {
    const state = useAuthStore.getState()
    if (
      !state.isStartupReady ||
      state.startupError ||
      state.isProfileTransitioning ||
      !state.isAuthenticated ||
      !state.user?.id ||
      state.serverSession !== 'valid'
    ) {
      return
    }
    registerPushNotifications().catch(() => {})
  }, [isStartupReady, isAuthenticated, isProfileTransitioning, serverSession, startupError, userId])

  const content =
    isStartupReady && !startupError ? (
      <SQLiteProvider
        key={profileOwnerId}
        databaseName={databaseNameForProfile(profileOwnerId)}
        onInit={onInit}
      >
        <SyncEngineBootstrap ownerId={profileOwnerId}>{children}</SyncEngineBootstrap>
      </SQLiteProvider>
    ) : (
      children
    )

  return (
    <SafeAreaProvider>
      <TamaguiProvider
        config={config}
        defaultTheme={activeTheme === 'dark' ? 'dark' : 'light'}
        {...rest}
      >
        <Theme name={activeTheme === 'dark' ? 'dark' : 'light'}>
          <ThemeProvider value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}>
            <QueryClientProvider client={queryClient}>
              <PostHogProvider client={posthog}>
                <PortalProvider>
                  <ToastProvider swipeDirection="horizontal" duration={6000} native={[]}>
                    {content}
                    <CurrentToast />
                    <ToastViewport top="$8" left={0} right={0} />
                    {congratsVisible && payload && (
                      <FinishedWorkoutCongrats
                        data={payload.record}
                        streak={payload.streak}
                        visible={congratsVisible}
                        onClose={hideFinishedCongrats}
                      />
                    )}
                  </ToastProvider>
                </PortalProvider>
              </PostHogProvider>
            </QueryClientProvider>
          </ThemeProvider>
        </Theme>
      </TamaguiProvider>
    </SafeAreaProvider>
  )
}

export default Provider
