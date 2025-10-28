import { useColorScheme } from 'react-native'
import { useEffect } from 'react'
import { TamaguiProvider, type TamaguiProviderProps, PortalProvider } from 'tamagui'
import { ToastProvider, ToastViewport } from '@tamagui/toast'
import { CurrentToast } from './CurrentToast'
import { config } from '../tamagui.config'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useUiStore } from '../stores/uiStore'
import FinishedWorkoutCongrats from '../components/FinishedWorkoutCongrats'
import { FloatingDevTools, InstalledApp } from '@react-buoy/core'
import { NetworkModal } from '@react-buoy/network'
import { Globe } from '@react-buoy/shared-ui'
import { initNotifications } from '../services/notificationService'

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
  const finishedCongrats = useUiStore((s) => s.finishedCongrats)
  const hideFinishedCongrats = useUiStore((s) => s.hideFinishedCongrats)
  const congratsVisible = finishedCongrats.visible && !!finishedCongrats.payload
  const payload = finishedCongrats.payload

  useEffect(() => {
    initNotifications().catch(() => {})
  }, [])

  return (
    <SafeAreaProvider>
      <PortalProvider>
        <TamaguiProvider
          config={config}
          defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}
          {...rest}
        >
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
                data={payload}
                visible={congratsVisible}
                onClose={hideFinishedCongrats}
              />
            )}
          </ToastProvider>
        </TamaguiProvider>
      </PortalProvider>
    </SafeAreaProvider>
  )
}

export default Provider
