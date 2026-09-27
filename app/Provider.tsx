import { useColorScheme } from 'react-native'
import { useEffect, useRef } from 'react'
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite'
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

// Track which DB instances have already been hydrated to avoid double-runs
const hydratedDbs = new WeakSet<object>()



/**
 * Inner component that has access to SQLiteContext.
 * Initializes the SyncEngine, registers the shared DB handle, and
 * runs hydration whenever the user authenticates.
 */
function SyncEngineBootstrap({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  // Always keep the singleton reference pointing at the live handle
  setSharedDatabase(db)

  // On mount: init SyncEngine (drains leftover queue from previous session)
  useEffect(() => {
    const unsubscribeIdRemap = syncEngine.onIdRemap((tableName, oldId, newId) => {
      if (tableName !== 'workouts') return

      remapRunningWorkoutId(oldId, newId)
      for (const queryKey of [queryKeys.workouts.all, queryKeys.routines.all]) {
        queryClient.setQueriesData({ queryKey }, (data) =>
          replaceQueuedIdReferences(data, oldId, newId).value
        )
      }
    })
    syncEngine.init(db).catch(console.error)
    return () => {
      unsubscribeIdRemap()
      syncEngine.destroy()
    }
  }, [db])

  // Whenever auth state transitions to authenticated, hydrate and invalidate
  const prevAuthRef = useRef<boolean | null>(null)
  useEffect(() => {
    const wasAuthenticated = prevAuthRef.current
    prevAuthRef.current = isAuthenticated

    // Skip: not authenticated, or already was authenticated before this render
    if (!isAuthenticated || wasAuthenticated === true) return

    // Skip if this exact DB handle was already hydrated (prevents double-fires on re-renders)
    if (hydratedDbs.has(db)) {
      console.log('[SyncEngineBootstrap] DB already hydrated, skipping')
      return
    }
    hydratedDbs.add(db)

    console.log('[SyncEngineBootstrap] Auth detected — hydrating...')
    hydrateFromServer(db)
      .then(() => {
        console.log('[SyncEngineBootstrap] Hydration complete — invalidating queries')
        return queryClient.invalidateQueries()
      })
      .catch((err) => {
        // Remove from set so it can be retried on next auth transition
        hydratedDbs.delete(db)
        console.warn('[SyncEngineBootstrap] Hydration failed (offline?):', err?.message)
      })
  }, [isAuthenticated, db])

  return <>{children}</>
}



export function Provider({ children, ...rest }: Omit<TamaguiProviderProps, 'config'>) {
  const colorScheme = useColorScheme()
  const theme = useSettingsStore((s) => s.theme)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const userId = useAuthStore((s) => s.user?.id)
  const finishedCongrats = useUiStore((s) => s.finishedCongrats)
  const hideFinishedCongrats = useUiStore((s) => s.hideFinishedCongrats)
  const congratsVisible = finishedCongrats.visible && !!finishedCongrats.payload
  const payload = finishedCongrats.payload

  const activeTheme = theme === 'system' ? colorScheme : theme

  useEffect(() => {
    initNotifications().catch(() => {})
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !userId) return
    registerPushNotifications().catch(() => {})
  }, [isAuthenticated, userId])

  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="active.db" onInit={migrateDbIfNeeded}>
        <QueryClientProvider client={queryClient}>
        <PostHogProvider client={posthog}>
          <SyncEngineBootstrap>
            <TamaguiProvider
              config={config}
              defaultTheme={activeTheme === 'dark' ? 'dark' : 'light'}
              {...rest}
            >
              <Theme name={activeTheme === 'dark' ? 'dark' : 'light'}>
              <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                <PortalProvider>
                  {/* <FloatingDevTools apps={TOOLS} actions={{}} environment="local" userRole="admin" /> */}

                  <ToastProvider
                    swipeDirection="horizontal"
                    duration={6000}
                    native={
                      [
                        // uncomment the next line to do native toasts on mobile. NOTE: it'll require you making a dev build and won't work with Expo Go
                        // 'mobile'
                      ]
                    }
                  >
                    {children}
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
              </ThemeProvider>
              </Theme>
            </TamaguiProvider>
          </SyncEngineBootstrap>
        </PostHogProvider>
      </QueryClientProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  )
}

export default Provider
