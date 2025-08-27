import { useColorScheme } from 'react-native'
import { TamaguiProvider, type TamaguiProviderProps, PortalProvider } from 'tamagui'
import { ToastProvider, ToastViewport } from '@tamagui/toast'
import { CurrentToast } from './CurrentToast'
import { config } from '../tamagui.config'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useUiStore } from '../stores/uiStore'
import FinishedWorkoutCongrats from '../components/FinishedWorkoutCongrats'

export function Provider({ children, ...rest }: Omit<TamaguiProviderProps, 'config'>) {
  const colorScheme = useColorScheme()
  const finishedCongrats = useUiStore((s) => s.finishedCongrats)
  const hideFinishedCongrats = useUiStore((s) => s.hideFinishedCongrats)
  const congratsVisible = finishedCongrats.visible && !!finishedCongrats.payload
  const payload = finishedCongrats.payload

  return (
    <SafeAreaProvider>
      <PortalProvider>
        <TamaguiProvider
          config={config}
          defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}
          {...rest}
        >
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
