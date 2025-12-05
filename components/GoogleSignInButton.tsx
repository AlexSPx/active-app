import React from 'react'
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin'
import { Button, Text, XStack, YStack, useTheme } from 'tamagui'
import { Alert } from 'react-native'
import { useAuthStore } from '../stores/authStore'
import { useRouter } from 'expo-router'

// Configure Google Sign-In
GoogleSignin.configure({
    webClientId: process.env.GOOGLE_CLIENT_ID,
    offlineAccess: true,
})

interface GoogleSignInButtonProps {
    onSuccess?: (idToken: string) => void
}

export const GoogleSignInButton = ({ onSuccess }: GoogleSignInButtonProps) => {
    const { loginWithGoogle } = useAuthStore()
    const router = useRouter()
    const theme = useTheme()

    const signIn = async () => {
        try {
            await GoogleSignin.hasPlayServices()
            const userInfo = await GoogleSignin.signIn()
            if (userInfo.data?.idToken) {
                await loginWithGoogle(userInfo.data.idToken)
                if (onSuccess) {
                    onSuccess(userInfo.data.idToken)
                } else {
                    router.replace('/(tabs)')
                }
            } else {
                throw new Error('No ID token present')
            }
        } catch (error: any) {
            if (error.code === statusCodes.SIGN_IN_CANCELLED) {
                // user cancelled the login flow
            } else if (error.code === statusCodes.IN_PROGRESS) {
                // operation (e.g. sign in) is in progress already
            } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                // play services not available or outdated
                Alert.alert('Error', 'Google Play Services not available')
            } else {
                // some other error happened
                console.error(error)
                Alert.alert('Error', 'Google Sign-In failed')
            }
        }
    }

    return (
        <Button
            onPress={signIn}
            bg="$background"
            borderColor="$borderColor"
            borderWidth={1}
            hoverStyle={{ bg: '$backgroundHover' }}
            pressStyle={{ bg: '$backgroundPress' }}
            height={48}
            mt="$4"
        >
            <XStack items="center" gap="$2">
                {/* Simple G icon or text if no icon available immediately */}
                <Text color="$color" fontWeight="600">
                    Sign in with Google
                </Text>
            </XStack>
        </Button>
    )
}
