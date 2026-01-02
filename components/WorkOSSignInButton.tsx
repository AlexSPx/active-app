import React from 'react'
import { Button, Text, XStack } from 'tamagui'
import { Lock } from '@tamagui/lucide-icons'
import { makeRedirectUri, useAuthRequest } from 'expo-auth-session'
import { useAuthStore } from '../stores/authStore'
import { useRouter } from 'expo-router'
import { Alert } from 'react-native'

// WorkOS Configuration
const discovery = {
  authorizationEndpoint: 'https://api.workos.com/sso/authorize',
  tokenEndpoint: 'https://api.workos.com/sso/token',
}

interface WorkOSSignInButtonProps {
  onSuccess?: (code: string) => void
  label?: string
}

const redirectScheme = process.env.NODE_ENV === 'development' ? 'activenextdev' : 'activenext'

export const WorkOSSignInButton = ({ onSuccess, label = 'Sign in with WorkOS' }: WorkOSSignInButtonProps) => {
  const { loginWithWorkOS } = useAuthStore()
  const router = useRouter()

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID || '',
      redirectUri: makeRedirectUri({
        scheme: redirectScheme,
        path: 'auth/callback',
      }),
      scopes: ['openid', 'profile', 'email'],
      responseType: 'code',
      extraParams: {
        provider: 'authkit',
      },
    },
    discovery
  )

  React.useEffect(() => {
    if (response?.type === 'success') {
      const { code } = response.params
      handleLogin(code)
    } else if (response?.type === 'error') {
      Alert.alert('Authentication Error', 'Failed to sign in with WorkOS.')
      console.error('WorkOS Auth Error:', response.error)
    }
  }, [response])

  const handleLogin = async (code: string) => {
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
  }

  return (
    <Button
      onPress={() => promptAsync()}
      disabled={!request}
      bg="$color9"
      size="$5"
      rounded="$6"
      mt="$4"
      pressStyle={{ opacity: 0.9, scale: 0.98 }}
      animation="fast"
      icon={<Lock size={20} color="$color1" />}
      width="100%"
      height="$6"
    >
      <Text fontWeight="600" color="$color1" fontSize="$4">
        {label}
      </Text>
    </Button>
  )
}
