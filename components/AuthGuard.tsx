import { useAuth } from '../contexts/AuthContext'
import { RootLayoutNav } from '../components/RootLayoutNav'
import { useEffect } from 'react'
import { useRouter, useSegments, useRootNavigationState } from 'expo-router'
import { YStack, Spinner } from 'tamagui'

export function AuthGuard() {
  const { isAuthenticated, user, isLoading } = useAuth()
  const router = useRouter()
  const segments = useSegments()
  const navigationState = useRootNavigationState()

  useEffect(() => {
    // Wait until the root navigation is mounted to avoid navigating before mount
    if (!navigationState?.key) return

    const inWelcomeGroup = segments[0] === 'welcome'
    const inLegalGroup = segments[0] === 'legal'
    const isPublicRoute = inWelcomeGroup || inLegalGroup
    const isRegistering = segments[1] === 'register'

    if (!isAuthenticated && !isPublicRoute) {
      // Redirect to welcome screen if not authenticated
      router.replace('/welcome' as any)
    } else if (isAuthenticated) {
      // If authenticated but registration not completed, force to register screen
      // unless already there.
      // Backwards compatibility: only redirect if explicitly false (not undefined)
      if (user && user.registrationCompleted === false && !isRegistering) {
        router.replace('/welcome/register' as any)
      }
      // If authenticated AND registration completed (or legacy/undefined), and trying to access welcome pages
      // redirect to main app. Allow legal pages.
      else if (user && user.registrationCompleted !== false && inWelcomeGroup) {
        router.replace('/(tabs)' as any)
      }
    }
  }, [isAuthenticated, segments, navigationState?.key, user])

  if (isLoading || isAuthenticated == null) {
    return (
      <YStack flex={1} items="center" justify="center" bg="$background">
        <Spinner size="large" color="$blue9" />
      </YStack>
    )
  }

  return <RootLayoutNav />
}
