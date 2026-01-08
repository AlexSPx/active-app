import React, { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { Alert, Platform } from 'react-native'
import { View, Text, Spinner, ScrollView } from 'tamagui'
import { useAuthStore } from '../../stores/authStore'
import { config } from '../../config/api'

/**
 * OAuth callback handler for web platform.
 * This route receives the authorization code from WorkOS
 * and completes the authentication flow.
 * 
 * When opened as a popup, it sends the result back to the opener
 * and closes itself. When opened directly, it handles the auth inline.
 */
export default function AuthCallback() {
  const router = useRouter()
  const { loginWithWorkOS } = useAuthStore()

    console.log("AuthCallback");

  const [logs, setLogs] = React.useState<string[]>([])
  
  const addLog = (msg: string) => {
    console.log(msg)
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`])
  }

  useEffect(() => {
    if (Platform.OS !== 'web') {
      router.replace('/')
      return
    }

    const handleCallback = async () => {
      addLog('Starting handleCallback')
      addLog(`API Base URL: ${config.API_BASE_URL}`)
      // Parse params from URL (useLocalSearchParams may not work in popup context)
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get('code')
      const error = urlParams.get('error')
      const state = urlParams.get('state')

      addLog(`Params: code=${code ? 'YES' : 'NO'}, error=${error}, state=${state}`)

      // Check if we're in a popup opened by our auth flow
      // We also check the state for explicitly requested flow type
      let isPopup = window.opener && !window.opener.closed
      addLog(`Initial isPopup check: ${isPopup}`)
      
      if (state && state.includes('|redirect')) {
        addLog('Found |redirect in state, forcing isPopup = false')
        isPopup = false
      }

      if (isPopup) {
        addLog('Handling as popup flow')
        // Send the result back to the opener window
        console.log('Callback: Sending message to opener with code:', code ? 'present' : 'missing')
        window.opener.postMessage(
          {
            type: 'workos-auth-callback',
            code,
            error,
            state, // Pass back full state
          },
          window.location.origin
        )
        addLog('Message sent to opener, closing window...')
        window.close()
        return
      }

      // Not a popup - handle auth directly (fallback for direct navigation)
      addLog('Handling as redirect flow')
      if (error) {
        addLog(`OAuth error: ${error}`)
        console.error('OAuth error:', error)
        setTimeout(() => router.replace('/welcome/home'), 3000) // Delay to see logs
        return
      }

      if (code) {
        try {
          addLog('Attempting loginWithWorkOS...')
          await loginWithWorkOS(code)
          addLog('Login success! Redirecting to /(tabs)...')
          setTimeout(() => router.replace('/(tabs)'), 1000)
        } catch (err) {
          addLog(`Login failed: ${err}`)
          console.error('Login failed:', err)
          setTimeout(() => router.replace('/welcome/home'), 3000)
        }
      } else {
        addLog('No code found, redirecting home')
        setTimeout(() => router.replace('/welcome/home'), 3000)
      }
    }

    handleCallback()
  }, [])

  return (
    <View flex={1} justify="center" items="center" bg="$background">
      <Spinner size="large" color="$color9" />
      <Text mt="$4" color="$color11">
        Completing sign in...
      </Text>  
    </View>
  )
}
