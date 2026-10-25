import { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Uniwind } from 'uniwind'
import { useSettingsStore } from '../features/settings'
import { FeedbackProvider } from '../components/feedback/FeedbackProvider'

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme()
  const theme = useSettingsStore((state) => state.theme)
  const activeTheme = theme === 'system' ? (colorScheme === 'dark' ? 'dark' : 'light') : theme

  useEffect(() => {
    Uniwind.setTheme(theme)
  }, [theme])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const background = activeTheme === 'dark' ? '#2D2235' : '#FAF7FC'
    const foreground = activeTheme === 'dark' ? '#FAF5FC' : '#2D2235'
    document.documentElement.style.colorScheme = activeTheme
    document.documentElement.style.backgroundColor = background
    document.body.style.backgroundColor = background
    document.body.style.color = foreground
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
  }, [activeTheme])

  return (
    <SafeAreaProvider>
      <ThemeProvider value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}>
        <FeedbackProvider>{children}</FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
