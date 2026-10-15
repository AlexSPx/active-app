import { useAuth } from '../contexts/AuthContext'
import { RootLayoutNav } from '../components/RootLayoutNav'
import { useEffect } from 'react'
import { useRouter, useSegments, useRootNavigationState } from 'expo-router'
import { Button, Text, YStack, Spinner } from 'tamagui'
import { initializeAuth, useAuthStore } from '../stores/authStore'
import { launchFacade } from '../features/launch/launchFacade'

export function AuthGuard() {
  const { isAuthenticated, user, isLoading } = useAuth()
  const isStartupReady = useAuthStore((state) => state.isStartupReady)
  const startupError = useAuthStore((state) => state.startupError)
  const logoutRetryRequired = useAuthStore((state) => state.logoutRetryRequired)
  const authError = useAuthStore((state) => state.error)
  const retryLogout = useAuthStore((state) => state.logout)
  const isProfileTransitioning = useAuthStore((state) => state.isProfileTransitioning)
  const profileOwnerId = useAuthStore((state) => state.profileOwnerId)
  const isProfileLoading = useAuthStore((state) => state.isProfileLoading)
  const retryProfile = useAuthStore((state) => state.fetchUser)
  const router = useRouter()
  const segments = useSegments()
  const navigationState = useRootNavigationState()

  useEffect(() => {
    // Wait until the root navigation is mounted to avoid navigating before mount
    if (!navigationState?.key || !isStartupReady) return

    const destination = launchFacade.auth.resolveDestination({
      isAuthenticated,
      user,
      profileOwnerId,
      firstSegment: segments[0],
      secondSegment: segments[1],
    })
    if (destination) router.replace(destination as any)
  }, [isAuthenticated, isStartupReady, segments, navigationState?.key, profileOwnerId, user])

  if (!isStartupReady || isAuthenticated == null || (isLoading && !isAuthenticated)) {
    return (
      <YStack flex={1} items="center" justify="center" bg="$background">
        <Spinner size="large" color="$blue9" />
      </YStack>
    )
  }

  if (logoutRetryRequired) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$4" bg="$background" p="$6">
        <Text fontSize="$6" fontWeight="700" color="$color12">
          Sign-out needs to be retried
        </Text>
        <Text color="$color11" style={{ textAlign: 'center' }}>
          {authError || 'We couldn’t finish signing out. Please try again.'}
        </Text>
        <Button onPress={() => void retryLogout()}>Retry sign out</Button>
      </YStack>
    )
  }

  if (startupError) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$4" bg="$background" p="$6">
        <Text fontSize="$6" fontWeight="700" color="$color12">
          Local data needs to be restored
        </Text>
        <Text color="$color11" style={{ textAlign: 'center' }}>
          {startupError}
        </Text>
        <Button onPress={() => void initializeAuth(true)}>Retry</Button>
      </YStack>
    )
  }

  if (isProfileTransitioning) {
    return (
      <YStack flex={1} items="center" justify="center" bg="$background">
        <Spinner size="large" color="$blue9" />
      </YStack>
    )
  }

  if (isAuthenticated && !user) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$4" bg="$background" p="$6">
        {isProfileLoading ? (
          <>
            <Spinner size="large" color="$blue9" />
            <Text color="$color11">Restoring your profile…</Text>
          </>
        ) : (
          <>
            <Text fontSize="$6" fontWeight="700" color="$color12">
              Your sign-in is saved
            </Text>
            <Text color="$color11" style={{ textAlign: 'center' }}>
              We couldn’t load your profile. Check your connection and try again.
            </Text>
            <Button onPress={() => void retryProfile().catch(() => {})}>Retry</Button>
          </>
        )}
      </YStack>
    )
  }

  return <RootLayoutNav />
}
