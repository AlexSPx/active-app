import { useColorScheme } from 'react-native'
import { useEffect } from 'react'
import { TamaguiProvider, type TamaguiProviderProps, PortalProvider, Theme } from 'tamagui'
import { ToastProvider, ToastViewport } from '@tamagui/toast'
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
import { useSettingsStore } from '../stores/settingsStore'
import { posthog } from '../services/posthog'

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
      <PostHogProvider client={posthog}>
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
      </PostHogProvider>
    </SafeAreaProvider>
  )
}

export default Provider
