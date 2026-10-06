import { useState } from 'react'
import { Button, Input, Label, Paragraph, Switch, Text, XStack, YStack } from 'tamagui'
import { SettingsPage } from '../../../components/settings/SettingsPage'
import { useSettingsStore } from '../../../features/settings'
import { parseRestDuration } from '../../../features/settings/inputs'

export default function RestTimerSettingsScreen() {
  const {
    restTimerEnabled,
    restTimerDefaultSeconds,
    setRestTimerEnabled,
    setRestTimerDefaultSeconds,
  } = useSettingsStore()
  const [minutes, setMinutes] = useState(String(Math.floor(restTimerDefaultSeconds / 60)))
  const [seconds, setSeconds] = useState(String(restTimerDefaultSeconds % 60))
  const duration = parseRestDuration(minutes, seconds)
  const updateDuration = (m: string, s: string) => {
    setMinutes(m)
    setSeconds(s)
    const next = parseRestDuration(m, s)
    if (next !== null) setRestTimerDefaultSeconds(next)
  }
  return (
    <SettingsPage title="Rest timer" description="Choose how long to rest after a set.">
      <XStack items="center" justify="space-between" gap="$field">
        <YStack flex={1} gap="$compact">
          <Label htmlFor="rest-enabled" fontSize="$body" fontWeight="600">
            Start after each set
          </Label>
          <Paragraph fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
            Show the countdown when you finish a set.
          </Paragraph>
        </YStack>
        <Switch
          id="rest-enabled"
          accessibilityLabel="Start after each set"
          checked={restTimerEnabled}
          onCheckedChange={setRestTimerEnabled}
          bg={restTimerEnabled ? '$primary' : '$backgroundStrong'}
        >
          <Switch.Thumb bg="$surface" />
        </Switch>
      </XStack>
      <YStack gap="$field" opacity={restTimerEnabled ? 1 : 0.5}>
        <Text fontSize="$body" fontWeight="600">
          Default duration
        </Text>
        <XStack gap="$field" items="center">
          <YStack flex={1} gap="$compact">
            <Input
              id="rest-minutes"
              accessibilityLabel="Rest minutes"
              keyboardType="number-pad"
              value={minutes}
              onChangeText={(value) => updateDuration(value, seconds)}
              disabled={!restTimerEnabled}
              fontSize="$metric"
              height="$6"
              text="center"
              rounded="$control"
              bg="$surface"
              borderColor="$borderColor"
            />
            <Label htmlFor="rest-minutes" fontSize="$caption" color="$colorSubtle" text="center">
              minutes
            </Label>
          </YStack>
          <Text fontSize="$metric" color="$colorSubtle">
            :
          </Text>
          <YStack flex={1} gap="$compact">
            <Input
              id="rest-seconds"
              accessibilityLabel="Rest seconds"
              keyboardType="number-pad"
              value={seconds}
              onChangeText={(value) => updateDuration(minutes, value)}
              disabled={!restTimerEnabled}
              fontSize="$metric"
              height="$6"
              text="center"
              rounded="$control"
              bg="$surface"
              borderColor="$borderColor"
            />
            <Label htmlFor="rest-seconds" fontSize="$caption" color="$colorSubtle" text="center">
              seconds
            </Label>
          </YStack>
        </XStack>
        <XStack gap="$compact" flexWrap="wrap">
          {[
            [30, '30 sec'],
            [60, '1 min'],
            [90, '1:30'],
            [120, '2 min'],
          ].map(([value, label]) => (
            <Button
              key={value}
              flex={1}
              height="$touch"
              rounded="$day"
              fontSize="$caption"
              disabled={!restTimerEnabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: duration === value }}
              bg={duration === value ? '$backgroundAccent' : '$backgroundStrong'}
              color={duration === value ? '$primary' : '$colorSubtle'}
              onPress={() =>
                updateDuration(String(Math.floor(Number(value) / 60)), String(Number(value) % 60))
              }
            >
              {label}
            </Button>
          ))}
        </XStack>
        <Paragraph fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
          Used when the timer starts after a completed set.
        </Paragraph>
      </YStack>
      <Paragraph
        fontSize="$caption"
        lineHeight="$caption"
        color={restTimerEnabled && duration === null ? '$destructive' : '$colorSubtle'}
        accessibilityLiveRegion="polite"
      >
        {!restTimerEnabled
          ? 'Timer off. Your duration is kept.'
          : duration === null
            ? 'Enter a duration from 0:01 to 59:59.'
            : 'Changes apply automatically.'}
      </Paragraph>
      <Paragraph fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
        Turn the timer off to train without an automatic countdown. Your duration is kept for next
        time.
      </Paragraph>
    </SettingsPage>
  )
}
