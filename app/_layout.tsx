import '../global.css'
import { useEffect } from 'react'
import { useFonts } from 'expo-font'
import { SplashScreen } from 'expo-router'
import { AppLifecycleProvider } from '../providers/AppLifecycleProvider'
import { AppThemeProvider } from '../providers/AppThemeProvider'
import { AuthProvider } from '../contexts/AuthContext'
import { AuthGuard } from '../components/AuthGuard'

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router'

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'DM Sans': require('../assets/fonts/DM-Sans-Regular.ttf'),
    'DM Sans Medium': require('../assets/fonts/DM-Sans-Medium.ttf'),
    'DM Sans Semibold': require('../assets/fonts/DM-Sans-SemiBold.ttf'),
  })

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // Hide the splash screen after the fonts have loaded (or an error was returned) and the UI is ready.
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) {
    return null
  }

  return (
    <AppThemeProvider>
      <AppLifecycleProvider>
        <AuthProvider>
          <AuthGuard />
        </AuthProvider>
      </AppLifecycleProvider>
    </AppThemeProvider>
  )
}
