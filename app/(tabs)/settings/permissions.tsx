import React, { useState } from 'react'
import { YStack, XStack, Text, Button, ScrollView } from 'tamagui'
import { Clock } from '@tamagui/lucide-icons'
import { useAuth } from '../../../contexts/AuthContext'
import { useUpdateUser } from '../../../features/settings'
import NotificationPermissions from '../../../components/NotificationPermissions'
import * as Haptics from 'expo-haptics'

export default function PermissionsScreen() {
  const { user } = useAuth()
  const { updateUserProfile } = useUpdateUser()
  const [streakFreq, setStreakFreq] = useState(user?.notificationPreferences.schedule?.length ?? 1)

  const handleFreqChange = async (n: number) => {
    setStreakFreq(n)
    Haptics.selectionAsync()
    try {
        await updateUserProfile({ notificationFrequency: n })
    } catch (error) {
        console.error("Failed to update notification frequency", error)
    }
  }

  return (
    <YStack flex={1} bg="$background">
      <ScrollView flex={1}>
        <YStack p="$4" gap="$4">
          <NotificationPermissions />

          <YStack bg="$color2" p="$4" rounded="$6" gap="$3">
            <XStack gap="$3" items="center" mb="$2">
            <YStack bg="$surfaceHover" p="$2" rounded="$4">
                <Clock size={20} color="$secondary" />
            </YStack>
            <YStack>
                <Text fontWeight="600">Streak Reminders</Text>
                <Text fontSize="$2" color="$color11">How often should we remind you?</Text>
            </YStack>
            </XStack>

            <XStack gap="$2" justify="space-between">
            {[0, 1, 2, 3].map(n => (
                <Button
                key={n}
                flex={1}
                size="$3"
                bg={streakFreq === n ? '$blue9' : '$color4'}
                onPress={() => handleFreqChange(n)}
                color={streakFreq === n ? 'white' : '$color11'}
                pressStyle={{ opacity: 0.8 }}
                animation="fast"
                >
                <Text>{n}</Text>
                </Button>
            ))}
            </XStack>
        </YStack>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
