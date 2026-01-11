import React, { useState } from 'react'
import { YStack, XStack, Text, Paragraph, ScrollView, Button, AlertDialog, Separator } from 'tamagui'
import { useRouter } from 'expo-router'
import { Trash, Link as LinkIcon, Settings } from '@tamagui/lucide-icons'
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin'
import { useAuth } from '../../../contexts/AuthContext'
import { Alert } from 'react-native'
import { useAuthMutations } from '../../../features/auth'

export default function AccountSettingsScreen() {
  const router = useRouter()
  const { logout } = useAuth()
  const { deleteAccount, linkGoogleAccount, loading, error } = useAuthMutations()
  const [open, setOpen] = useState(false)

  const handleDeleteAccount = async () => {
    const success = await deleteAccount()
    if (success) {
      logout()
    } else {
      Alert.alert('Error', error ?? 'Failed to delete account. Please try again.')
    }
  }

  const handleLinkGoogle = async () => {
    try {
      await GoogleSignin.hasPlayServices()
      const userInfo = await GoogleSignin.signIn()
      if (userInfo.data?.idToken) {
        const success = await linkGoogleAccount(userInfo.data.idToken)
        if (success) {
          Alert.alert('Success', 'Google account linked successfully')
        } else {
          Alert.alert('Error', error ?? 'Failed to link Google account')
        }
      } else {
        throw new Error('No ID token present')
      }
    } catch (err: any) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled the login flow
      } else if (err.code === statusCodes.IN_PROGRESS) {
        // operation (e.g. sign in) is in progress already
      } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Error', 'Google Play Services not available')
      } else {
        console.error(err)
        Alert.alert('Error', 'Failed to link Google account')
      }
    }
  }

  return (
    <YStack flex={1} bg="$background">
      <ScrollView flex={1} showsVerticalScrollIndicator={false}>
        <YStack p="$4" gap="$4">
          <YStack gap="$3">
            <XStack gap="$2" style={{ alignItems: 'center' }}>
              <Settings size={18} color="$color" />
              <Text fontSize="$6" fontWeight="700">
                Account
              </Text>
            </XStack>
            <Paragraph color="$color11">
              Manage your account settings and preferences.
            </Paragraph>
          </YStack>
          
          <Separator mb="$2" />
          
          <YStack gap="$2">
            <Text fontWeight="700">Google Account</Text>
            <Paragraph size="$2" color="$color11">
              Connect your Google account. Note: The Google account must not be already used. You will lose the option to login with password.
            </Paragraph>
            <Button
              icon={<LinkIcon size={18} />}
              onPress={handleLinkGoogle}
              mt="$2"
            >
              Link Google Account
            </Button>
          </YStack>

          <Separator />

          <YStack gap="$2">
            <Text fontWeight="700" color="$red10">Danger Zone</Text>
            <Paragraph size="$2" color="$color11">
              Permanently delete your account
            </Paragraph>
            <Button
              icon={<Trash size={18} />}
              bg="$red10"
              color="white"
              onPress={() => setOpen(true)}
              mt="$2"
            >
              Delete Account
            </Button>
          </YStack>

          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialog.Portal>
              <AlertDialog.Overlay
                key="overlay"
                animation="quick"
                opacity={0.5}
                enterStyle={{ opacity: 0 }}
                exitStyle={{ opacity: 0 }}
              />
              <AlertDialog.Content
                bordered
                elevate
                key="content"
                animation={[
                  'quick',
                  {
                    opacity: {
                      overshootClamping: true,
                    },
                  },
                ]}
                enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
                exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
                x={0}
                scale={1}
                opacity={1}
                y={0}
                width="90%"
                style={{ maxWidth: 350 }}
              >
                <YStack gap="$2">
                  <AlertDialog.Title>Delete Account</AlertDialog.Title>
                  <AlertDialog.Description>
                    Are you sure you want to delete your account? This action cannot be undone and all
                    your data will be permanently lost.
                  </AlertDialog.Description>

                  <XStack gap="$3" justify="flex-end">
                    <AlertDialog.Cancel asChild>
                      <Button><Text>Cancel</Text></Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                      <Button bg="$red10" onPress={handleDeleteAccount}>
                        <Text>Delete</Text>
                      </Button>
                    </AlertDialog.Action>
                  </XStack>
                </YStack>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog>

          <XStack gap="$2">
            <Button flex={1} variant="outlined" onPress={() => router.back()}>
              <Text>Back</Text>
            </Button>
          </XStack>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
