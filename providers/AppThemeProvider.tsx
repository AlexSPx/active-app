import { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ToastProvider, ToastViewport } from '@tamagui/toast'
import { PortalProvider, TamaguiProvider, Theme } from 'tamagui'
import { Uniwind } from 'uniwind'
import { useSettingsStore } from '../features/settings'
import { config } from '../tamagui.config'
import { CurrentToast } from '../components/feedback/CurrentToast'

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme()
  const theme = useSettingsStore((state) => state.theme)
  const activeTheme = theme === 'system' ? colorScheme : theme
  const tamaguiTheme = activeTheme === 'dark' ? 'dark' : 'light'

  useEffect(() => {
    Uniwind.setTheme(theme)
  }, [theme])

  return (
    <SafeAreaProvider>
      <TamaguiProvider config={config} defaultTheme={tamaguiTheme}>
        <Theme name={tamaguiTheme}>
          <ThemeProvider value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}>
            <PortalProvider>
              <ToastProvider swipeDirection="horizontal" duration={6000} native={[]}>
                {children}
                <CurrentToast />
                <ToastViewport top="$8" left={0} right={0} />
              </ToastProvider>
            </PortalProvider>
          </ThemeProvider>
        </Theme>
      </TamaguiProvider>
    </SafeAreaProvider>
  )
}
