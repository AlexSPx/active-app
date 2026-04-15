import { useColorScheme } from 'react-native'
import { useEffect } from 'react'
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
import { FloatingDevTools, InstalledApp } from '@react-buoy/core'
import { NetworkModal } from '@react-buoy/network'
import { Globe } from '@react-buoy/shared-ui'
import { initNotifications, registerPushNotifications } from '../services/notificationService'
import { PostHogProvider } from 'posthog-react-native'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { useSettingsStore } from '../features/settings'
import { posthog } from '../services/posthog'
import { queryClient } from '../lib/queryClient'
import { syncEngine } from '../lib/sync'
import { apiService } from '../services/apiService'
import { WorkoutRepository } from '../lib/repositories/WorkoutRepository'
import { RoutineRepository } from '../lib/repositories/RoutineRepository'
import { hydrateFromServer } from '../lib/sync/hydrate'
import { setSharedDatabase } from '../lib/db/connection'

const TOOLS: InstalledApp[] = [
  {
    id: 'network',
    name: 'NETWORK',
    description: 'Network request logger',
    slot: 'both',
    icon: ({ size }) => <Globe size={size} color="#38bdf8" />,
    component: NetworkModal,
    props: {},
  },
]

/**
 * Inner component that has access to SQLiteContext.
 * Initializes the SyncEngine and runs server hydration on mount.
 */
function SyncEngineBootstrap({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext()
  setSharedDatabase(db)

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      // 1. Initialize SyncEngine with the shared DB handle
      await syncEngine.init(db)

      // 2. Hydrate local DB from server (best-effort, not blocking)
      if (!cancelled) {
        hydrateFromServer(db).catch((err) => {
          console.warn('[Hydration] Server hydration failed (offline?):', err?.message)
        })
      }
    }

    bootstrap().catch(console.error)

    return () => {
      cancelled = true
      syncEngine.destroy()
    }
  }, [db])

  return <>{children}</>
}



export function Provider({ children, ...rest }: Omit<TamaguiProviderProps, 'config'>) {
  const colorScheme = useColorScheme()
  const theme = useSettingsStore((s) => s.theme)
  const finishedCongrats = useUiStore((s) => s.finishedCongrats)
  const hideFinishedCongrats = useUiStore((s) => s.hideFinishedCongrats)
  const congratsVisible = finishedCongrats.visible && !!finishedCongrats.payload
  const payload = finishedCongrats.payload

  const activeTheme = theme === 'system' ? colorScheme : theme

  useEffect(() => {
    initNotifications().catch(() => {})
    registerPushNotifications().catch(() => {})
  }, [])

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

