import { useEffect, useState } from 'react'
import { Button, Paragraph, Text, XStack, YStack } from 'tamagui'
import { useAuth } from '../../../contexts/AuthContext'
import { useUpdateUser } from '../../settings'
import { launchFacade } from '../../launch/launchFacade'

export function TrainingReminders() {
  const { user } = useAuth()
  const frequency = launchFacade.training.getReminderFrequency(user)
  return frequency === null ? null : <ReminderControls initialFrequency={frequency} />
}

function ReminderControls({ initialFrequency }: { initialFrequency: number }) {
  const { updateUserProfile, isUpdating, error } = useUpdateUser()
  const [frequency, setFrequency] = useState(initialFrequency)
  useEffect(() => setFrequency(initialFrequency), [initialFrequency])
  const changeFrequency = async (value: number) => {
    const updated = await updateUserProfile({ notificationFrequency: value })
    if (updated) setFrequency(value)
  }
  return (
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
  )
}
