import { useAuth } from '../contexts/AuthContext'
import { RootLayoutNav } from '../components/RootLayoutNav'
import { useEffect } from 'react'
import { useRouter, useSegments, useRootNavigationState } from 'expo-router'

export function AuthGuard() {
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const segments = useSegments()
  const navigationState = useRootNavigationState()

  useEffect(() => {
    // Wait until the root navigation is mounted to avoid navigating before mount
    if (!navigationState?.key) return

    const inAuthGroup = segments[0] === 'welcome'

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to welcome screen if not authenticated
      router.replace('/welcome' as any)
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to main app if authenticated
      router.replace('/(tabs)' as any)
    }
  }, [isAuthenticated, segments, navigationState?.key])

  return <RootLayoutNav />
}
