import { useEffect, useCallback } from 'react'
import { Alert, Platform } from 'react-native'
import { Lock } from './ui/icons'
import { Button, UiText } from './ui/Controls'
import { useCadenceColors } from './ui/useCadenceColors'
import { useAuthStore } from '../stores/authStore'
import { useRouter } from 'expo-router'

// WorkOS Configuration
const discovery = {
  authorizationEndpoint: 'https://api.workos.com/sso/authorize',
}

interface WorkOSSignInButtonProps {
  onSuccess?: (code: string) => void
  label?: string
}

const getRedirectUri = () => {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/auth/callback`
}

export const WorkOSSignInButton = (props: WorkOSSignInButtonProps) => {
  if (Platform.OS !== 'web') return null

  return <WebWorkOSSignInButton {...props} />
}

const WebWorkOSSignInButton = ({
  onSuccess,
  label = 'Sign in with WorkOS',
}: WorkOSSignInButtonProps) => {
  const { loginWithWorkOS } = useAuthStore()
  const router = useRouter()
  const colors = useCadenceColors()
  const redirectUri = getRedirectUri()

  const handleLogin = useCallback(
    async (code: string) => {
      try {
        await loginWithWorkOS(code)
        if (onSuccess) {
          onSuccess(code)
        }
        router.replace('/(tabs)')
      } catch (error) {
        console.error('WorkOS Login Failed:', error)
        Alert.alert('Login Failed', 'Could not complete login with WorkOS.')
      }
    },
    [loginWithWorkOS, onSuccess, router]
  )

  // Listen for messages from popup window (web only)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin
      if (event.origin !== window.location.origin) return

      if (event.data?.type === 'workos-auth-callback') {
        console.log('WorkOS: Received callback message', event.data)
        const { code, error, state: returnedState } = event.data

        // Validate state to prevent CSRF attacks
        const savedState = sessionStorage.getItem('workos_auth_state')
        sessionStorage.removeItem('workos_auth_state') // Clean up

        // Extract original state if it contains flow type
        const receivedState = returnedState?.split('|')[0] || returnedState

        if (!savedState || savedState !== receivedState) {
          console.error('WorkOS: State mismatch - possible CSRF attack')
          Alert.alert('Authentication Error', 'Security validation failed. Please try again.')
          return
        }

        if (error) {
          console.error('WorkOS OAuth error:', error)
          Alert.alert('Authentication Error', 'Failed to sign in with WorkOS.')
        } else if (code) {
          handleLogin(code)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleLogin])

  const handleWebAuth = () => {
    console.log('WorkOS: web auth handler called')
    const clientId = process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID || ''

    // Generate cryptographically secure state for CSRF protection
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    const state = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')

    // Save state to sessionStorage for validation when callback returns
    sessionStorage.setItem('workos_auth_state', state)

    const authUrl = new URL(discovery.authorizationEndpoint)
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'openid profile email')
    authUrl.searchParams.set('provider', 'authkit')
    // state is added below with flow type appended

    console.log('WorkOS: Opening auth URL', authUrl.toString())

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

    if (isMobile) {
      // Append flow type to state so callback knows not to look for opener
      authUrl.searchParams.set('state', `${state}|redirect`)
      window.location.href = authUrl.toString()
    } else {
      // Append flow type to state
      authUrl.searchParams.set('state', `${state}|popup`)
      // Open popup for desktop
      const width = 500
      const height = 600
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      window.open(
        authUrl.toString(),
        'workos-auth',
        `width=${width},height=${height},left=${left},top=${top}`
      )
    }
  }

  return (
    <Button
      onPress={handleWebAuth}
      className="mt-field min-h-action w-full flex-row gap-compact rounded-control"
      accessibilityLabel={label}
    >
      <Lock size={20} color={colors.onAccent} />
      <UiText textRole="buttonOnAccent">{label}</UiText>
    </Button>
  )
}
