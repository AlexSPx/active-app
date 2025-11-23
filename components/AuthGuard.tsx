import { useAuth } from '../contexts/AuthContext'
import { RootLayoutNav } from '../components/RootLayoutNav'
import { useEffect } from 'react'
import { useRouter, useSegments, useRootNavigationState } from 'expo-router'

export function AuthGuard() {
  const { isAuthenticated, user } = useAuth()
  const router = useRouter()
  const segments = useSegments()
  const navigationState = useRootNavigationState()

  useEffect(() => {
    // Wait until the root navigation is mounted to avoid navigating before mount
    if (!navigationState?.key) return

    const inAuthGroup = segments[0] === 'welcome'
    const isRegistering = segments[1] === 'register'

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to welcome screen if not authenticated
      router.replace('/welcome' as any)
    } else if (isAuthenticated) {
      // If authenticated but registration not completed, force to register screen
      // unless already there.
      // Backwards compatibility: only redirect if explicitly false (not undefined)
      if (user && user.registrationCompleted === false && !isRegistering) {
        router.replace('/welcome/register' as any)
      }
      // If authenticated AND registration completed (or legacy/undefined), and trying to access auth pages
      // redirect to main app
      else if (user && user.registrationCompleted !== false && inAuthGroup) {
        router.replace('/(tabs)' as any)
      }
    }
  }, [isAuthenticated, segments, navigationState?.key, user])

  return <RootLayoutNav />
}
