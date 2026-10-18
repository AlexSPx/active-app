import { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { TamaguiProvider, Theme } from 'tamagui'
import { Uniwind } from 'uniwind'
import { useSettingsStore } from '../features/settings'
import { config } from '../tamagui.config'
import { FeedbackProvider } from '../components/feedback/FeedbackProvider'

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
            <FeedbackProvider>{children}</FeedbackProvider>
          </ThemeProvider>
        </Theme>
      </TamaguiProvider>
    </SafeAreaProvider>
  )
}
