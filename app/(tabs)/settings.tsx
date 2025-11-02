import React from 'react'
import {
  YStack,
  XStack,
  Text,
  Button,
  Separator,
  Paragraph,
  Avatar,
  Switch,
  Label,
  ScrollView,
} from 'tamagui'
import { useAuth } from '../../contexts/AuthContext'
import { LogOut, Timer as TimerIcon, Settings as SettingsIcon } from '@tamagui/lucide-icons'
import { useSettingsStore } from '../../stores/settingsStore'
import SmartTimeInput from '../../components/ui/SmartTimeInput'

export default function SettingsScreen() {
  const { user, logout } = useAuth()
  const {
    restTimerEnabled,
    restTimerDefaultSeconds,
    setRestTimerEnabled,
    setRestTimerDefaultSeconds,
  } = useSettingsStore()

  const initials = React.useMemo(() => {
    if (!user) return '?'
    const parts = [user.firstName, user.lastName].filter(Boolean)
    if (parts.length === 0 && user.username) return user.username.slice(0, 2).toUpperCase()
    return parts
      .map((p) => (p?.[0] || '').toUpperCase())
      .join('')
      .slice(0, 2)
  }, [user])

  return (
    <YStack flex={1} bg="$background">
      <ScrollView flex={1} showsVerticalScrollIndicator={false}>
        <YStack p="$4" gap="$4">
          <YStack gap="$3">
            <Text fontSize="$6" fontWeight="700">
              Account
            </Text>
            <XStack items="center" gap="$3">
              <Avatar circular size="$6">
                <Avatar.Fallback
                  backgroundColor="$blue9"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text color="white" fontSize="$9" fontWeight="700">
                    {initials}
                  </Text>
                </Avatar.Fallback>
              </Avatar>
              <YStack>
                <Text fontSize="$6" fontWeight="700">
                  {user?.firstName || user?.username || 'User'} {user?.lastName || ''}
                </Text>
                <Text fontSize="$3" color="$color11">
                  @{user?.username || '—'}
                </Text>
                <Paragraph fontSize="$2" color="$color11">
                  {user?.email || '—'}
                </Paragraph>
              </YStack>
            </XStack>
          </YStack>

          <Separator />

          <YStack gap="$3">
            <XStack items="center" gap="$2">
              <TimerIcon size={18} color="$color" />
              <Text fontSize="$6" fontWeight="700">
                Rest timer
              </Text>
            </XStack>
            <Paragraph color="$color11">Customize how rest behaves after sets.</Paragraph>

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
          </YStack>

          <Separator />

          <Button size="$5" bg="$red9" pressStyle={{ bg: '$red10' }} onPress={logout}>
            <LogOut size={18} color="white" />
            <Text ml="$2" color="white" fontWeight="700">
              Log out
            </Text>
          </Button>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
