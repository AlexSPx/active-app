import { useEffect } from 'react'
import { useFonts } from 'expo-font'
import { SplashScreen } from 'expo-router'
import Provider from './Provider'
import { AuthProvider } from '../contexts/AuthContext'
import { AuthGuard } from '../components/AuthGuard'
import { usePathname } from 'expo-router'
import { posthog } from '../services/posthog'

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
  const [interLoaded, interError] = useFonts({
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
  })

  const pathname = usePathname()

  useEffect(() => {
    if (pathname) {
      posthog.screen(pathname)
    }
  }, [pathname])

  useEffect(() => {
    if (interLoaded || interError) {
      // Hide the splash screen after the fonts have loaded (or an error was returned) and the UI is ready.
      SplashScreen.hideAsync()
    }
  }, [interLoaded, interError])

  if (!interLoaded && !interError) {
    return null
  }

  return (
    <Providers>
      <AuthProvider>
        <AuthGuard />
      </AuthProvider>
    </Providers>
  )
}

const Providers = ({ children }: { children: React.ReactNode }) => {
  return <Provider>{children}</Provider>
}
