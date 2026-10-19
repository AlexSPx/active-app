import { useAuth } from '../contexts/AuthContext'
import { RootLayoutNav } from '../components/RootLayoutNav'
import { useEffect } from 'react'
import { useRouter, useSegments, useRootNavigationState } from 'expo-router'
import { View } from 'react-native'
import { initializeAuth, useAuthStore } from '../stores/authStore'
import { launchFacade } from '../features/launch/launchFacade'
import { Button, UiText } from './ui/Controls'
import { LoadingSpinner } from './ui/LoadingSpinner'

function RecoveryScreen({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string
  message: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <View className="flex-1 items-center justify-center bg-background p-page">
      <View className="w-full max-w-[480px] items-center gap-field">
        <UiText accessibilityRole="header" textRole="screenTitle" className="text-center">
          {title}
        </UiText>
        <UiText textRole="bodyMuted" className="text-center">
          {message}
        </UiText>
        <Button className="w-full" onPress={onAction}>
          {actionLabel}
        </Button>
      </View>
    </View>
  )
}

function LoadingScreen({ text }: { text?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <LoadingSpinner text={text} />
    </View>
  )
}

export function AuthGuard() {
  const { isAuthenticated, user, isLoading } = useAuth()
  const isStartupReady = useAuthStore((state) => state.isStartupReady)
  const startupError = useAuthStore((state) => state.startupError)
  const isDeviceDataErasing = useAuthStore((state) => state.isDeviceDataErasing)
  const deviceDataEraseError = useAuthStore((state) => state.deviceDataEraseError)
  const retryDeviceDataErase = useAuthStore((state) => state.eraseDeviceData)
  const logoutRetryRequired = useAuthStore((state) => state.logoutRetryRequired)
  const authError = useAuthStore((state) => state.error)
  const retryLogout = useAuthStore((state) => state.logout)
  const isProfileTransitioning = useAuthStore((state) => state.isProfileTransitioning)
  const profileOwnerId = useAuthStore((state) => state.profileOwnerId)
  const isProfileLoading = useAuthStore((state) => state.isProfileLoading)
  const retryProfile = useAuthStore((state) => state.fetchUser)
  const router = useRouter()
  const segments = useSegments()
  const routeSegments: readonly string[] = segments
  const navigationState = useRootNavigationState()

  useEffect(() => {
    // Wait until the root navigation is mounted to avoid navigating before mount
    if (!navigationState?.key || !isStartupReady) return

    const destination = launchFacade.auth.resolveDestination({
      isAuthenticated,
      user,
      profileOwnerId,
      firstSegment: routeSegments[0],
      secondSegment: routeSegments[1],
      thirdSegment: routeSegments[2],
    })
    if (destination) router.replace(destination as any)
  }, [isAuthenticated, isStartupReady, segments, navigationState?.key, profileOwnerId, user])

  if (isDeviceDataErasing) {
    if (deviceDataEraseError) {
      return (
        <RecoveryScreen
          title="Data erase needs to be retried"
          message={deviceDataEraseError}
          actionLabel="Retry clearing this device"
          onAction={() => void retryDeviceDataErase().catch(() => {})}
        />
      )
    }
    return <LoadingScreen text="Clearing data on this device…" />
  }

  if (!isStartupReady || isAuthenticated == null || (isLoading && !isAuthenticated)) {
    return <LoadingScreen />
  }

  if (logoutRetryRequired) {
    return (
      <RecoveryScreen
        title="Sign-out needs to be retried"
        message={authError || 'We couldn’t finish signing out. Please try again.'}
        actionLabel="Retry sign out"
        onAction={() => void retryLogout()}
      />
    )
  }

  if (startupError) {
    return (
      <RecoveryScreen
        title="Local data needs to be restored"
        message={startupError}
        actionLabel="Retry"
        onAction={() => void initializeAuth(true)}
      />
    )
  }

  if (isProfileTransitioning) {
    return <LoadingScreen />
  }

  if (isAuthenticated && !user) {
    if (isProfileLoading) return <LoadingScreen text="Restoring your profile…" />
    return (
      <RecoveryScreen
        title="Your sign-in is saved"
        message="We couldn’t load your profile. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => void retryProfile().catch(() => {})}
      />
    )
  }

  return <RootLayoutNav />
}
