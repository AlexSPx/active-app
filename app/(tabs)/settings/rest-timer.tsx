import React from 'react'
import {
  YStack,
  XStack,
  Text,
  Paragraph,
  ScrollView,
  Separator,
  Button,
  Switch,
  Label,
} from 'tamagui'
import { Timer as TimerIcon } from '@tamagui/lucide-icons'
import { useSettingsStore } from '../../../stores/settingsStore'
import SmartTimeInput from '../../../components/ui/SmartTimeInput'
import { useRouter, Stack } from 'expo-router'

export default function RestTimerSettingsScreen() {
  const router = useRouter()
  const {
    restTimerEnabled,
    restTimerDefaultSeconds,
    setRestTimerEnabled,
    setRestTimerDefaultSeconds,
  } = useSettingsStore()
  return (
    <YStack flex={1} bg="$background">
      <Stack.Screen options={{ title: 'Rest timer' }} />
      <ScrollView flex={1} showsVerticalScrollIndicator={false}>
        <YStack p="$4" gap="$5">
          <YStack gap="$3">
            <XStack gap="$2" style={{ alignItems: 'center' }}>
              <TimerIcon size={18} color="$color" />
              <Text fontSize="$6" fontWeight="700">
                Rest timer
              </Text>
            </XStack>
            <Paragraph color="$color11">Customize how rest behaves after sets.</Paragraph>
          </YStack>
          <Separator />
          <XStack justify="space-between" items="center" py="$2">
            <YStack style={{ maxWidth: '80%' }}>
              <Label htmlFor="rest-enabled">Enable rest timer</Label>
              <Paragraph size="$2" color="$color11">
                Show a countdown overlay after completing a set.
              </Paragraph>
            </YStack>
            <Switch
              id="rest-enabled"
              checked={restTimerEnabled}
              onCheckedChange={setRestTimerEnabled}
            >
              <Switch.Thumb animation="bouncy" />
            </Switch>
          </XStack>
          <YStack gap="$2" opacity={restTimerEnabled ? 1 : 0.5}>
            <Label>Default duration</Label>
            <XStack gap="$2" items="center">
              <YStack flex={1}>
                <SmartTimeInput
                  seconds={restTimerDefaultSeconds}
                  onChangeSeconds={setRestTimerDefaultSeconds}
                  disabled={!restTimerEnabled}
                />
              </YStack>
              <XStack gap="$2" style={{ flexWrap: 'wrap' }}>
                {[30, 60, 90, 120].map((s) => (
                  <Button
                    key={s}
                    size="$2"
                    variant="outlined"
                    disabled={!restTimerEnabled}
                    onPress={() => setRestTimerDefaultSeconds(s)}
                  >
                    <Text>{s}s</Text>
                  </Button>
                ))}
              </XStack>
            </XStack>
            <Paragraph size="$2" color="$color11">
              Used when the rest timer starts automatically after a set.
            </Paragraph>
          </YStack>
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
