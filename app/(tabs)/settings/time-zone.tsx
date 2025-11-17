import React from 'react'
import { YStack, XStack, Text, Paragraph, ScrollView, Separator, Button } from 'tamagui'
import TimeZoneSelector from '../../../components/TimeZoneSelector'
import { useRouter, Stack } from 'expo-router'
import { Settings as SettingsIcon } from '@tamagui/lucide-icons'

export default function TimeZoneSettingsScreen() {
  const router = useRouter()
  return (
    <YStack flex={1} bg="$background">
      <Stack.Screen options={{ title: 'Time zone' }} />
      <ScrollView flex={1} showsVerticalScrollIndicator={false}>
        <YStack p="$4" gap="$5">
          <YStack gap="$3">
            <XStack gap="$2" style={{ alignItems: 'center' }}>
              <SettingsIcon size={18} color="$color" />
              <Text fontSize="$6" fontWeight="700">
                Time zone
              </Text>
            </XStack>
            <Paragraph color="$color11">
              Choose how times are displayed relative to your location.
            </Paragraph>
          </YStack>
          <Separator />
          <TimeZoneSelector />
          <XStack gap="$2">
            <Button flex={1} variant="outlined" onPress={() => router.back()}>
              Back
            </Button>
          </XStack>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
