import { useAuth } from '../contexts/AuthContext'
import { RootLayoutNav } from '../components/RootLayoutNav'
import { useEffect } from 'react'
import { useRouter, useSegments } from 'expo-router'

export function AuthGuard() {
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    const inAuthGroup = segments[0] === 'welcome'

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to welcome screen if not authenticated
      router.replace('/welcome' as any)
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to main app if authenticated
      router.replace('/(tabs)' as any)
    }
  }, [isAuthenticated, segments])

  return <RootLayoutNav />
}
