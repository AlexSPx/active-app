import React, { useState } from 'react'
import { YStack, XStack, Text, Paragraph, ScrollView, Button, AlertDialog } from 'tamagui'
import { Link } from 'expo-router'
import { ChevronRight, Trash } from '@tamagui/lucide-icons'
import { useAuth } from '../../../contexts/AuthContext'
import { Alert } from 'react-native'
import { apiService } from '../../../services/apiService'
import { MenuRow } from '.'

export default function AccountSettingsScreen() {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)

  const handleDeleteAccount = async () => {
    try {
      await apiService.deleteAccount()
      logout()
    } catch (error) {
      console.error('Failed to delete account:', error)
      Alert.alert('Error', 'Failed to delete account. Please try again.')
    }
  }

  return (
    <YStack flex={1} bg="$background">
      <ScrollView flex={1} showsVerticalScrollIndicator={false}>
        <YStack p="$4" gap="$2">
          <MenuRow
            icon={<Trash size={18} color="white" />}
            title="Delete account"
            description="Permanently delete your account"
            onPress={() => setOpen(true)}
            danger
          />

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
        </YStack>
      </ScrollView>
    </YStack>
  )
}
