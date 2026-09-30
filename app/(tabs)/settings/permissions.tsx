import { useState } from 'react'
import { Button, Paragraph, Text, XStack, YStack } from 'tamagui'
import { useAuth } from '../../../contexts/AuthContext'
import { useUpdateUser } from '../../../features/settings'
import NotificationPermissions from '../../../components/NotificationPermissions'
import { SettingsPage } from '../../../components/settings/SettingsPage'

export default function PermissionsScreen() {
  const { user } = useAuth()
  const { updateUserProfile, isUpdating, error } = useUpdateUser()
  const [frequency, setFrequency] = useState(user?.notificationPreferences.schedule?.length ?? 1)
  const changeFrequency = async (value: number) => {
    const updated = await updateUserProfile({ notificationFrequency: value })
    if (updated) setFrequency(value)
  }
  return (
    <SettingsPage title="Permissions" description="Control notifications and timely reminders.">
      <NotificationPermissions />
      <YStack gap="$field">
        <Text fontSize="$body" fontWeight="600">
          Streak reminders
        </Text>
        <Paragraph fontSize="$caption" color="$colorSubtle">
          How often should Active remind you?
        </Paragraph>
        <XStack gap="$compact" flexWrap="wrap">
          {[0, 1, 2, 3].map((value) => (
            <Button
              key={value}
              flex={1}
              height="$touch"
              rounded="$day"
              disabled={isUpdating}
              fontSize="$caption"
              bg={frequency === value ? '$backgroundAccent' : '$backgroundStrong'}
              color={frequency === value ? '$primary' : '$colorSubtle'}
              accessibilityRole="radio"
              accessibilityState={{ checked: frequency === value }}
              onPress={() => changeFrequency(value)}
            >
              {value === 0 ? 'Off' : `${value} / day`}
            </Button>
          ))}
        </XStack>
        <Paragraph
          fontSize="$caption"
          lineHeight="$caption"
          color={error ? '$destructive' : '$colorSubtle'}
          accessibilityLiveRegion="polite"
        >
          {error ||
            (isUpdating
              ? 'Updating reminders…'
              : frequency === 0
                ? 'Streak reminders off.'
                : `${frequency === 1 ? 'One reminder' : `${frequency} reminders`} per day.`)}
        </Paragraph>
      </YStack>
      <Paragraph fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
        Your device controls permission access. You can change it at any time in device settings.
      </Paragraph>
    </SettingsPage>
  )
}
