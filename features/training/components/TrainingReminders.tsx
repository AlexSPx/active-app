import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button, UiText } from '../../../components/ui/Controls'
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
    <View className="gap-field">
      <UiText textRole="bodyEmphasis">Streak reminders</UiText>
      <UiText textRole="caption">How often should Active remind you?</UiText>
      <View
        className="flex-row flex-wrap gap-compact"
        accessibilityRole="radiogroup"
        accessibilityLabel="Streak reminders"
      >
        {[0, 1, 2, 3].map((value) => (
          <Button
            key={value}
            className="flex-1"
            shape="control"
            density="compact"
            variant={frequency === value ? 'selected' : 'secondary'}
            disabled={isUpdating}
            accessibilityRole="radio"
            accessibilityLabel={value === 0 ? 'Off' : `${value} / day`}
            accessibilityState={{ checked: frequency === value }}
            onPress={() => changeFrequency(value)}
          >
            <UiText textRole={frequency === value ? 'captionEmphasis' : 'caption'}>
              {value === 0 ? 'Off' : `${value} / day`}
            </UiText>
          </Button>
        ))}
      </View>
      <UiText textRole={error ? 'captionDestructive' : 'caption'} accessibilityLiveRegion="polite">
        {error ||
          (isUpdating
            ? 'Updating reminders…'
            : frequency === 0
              ? 'Streak reminders off.'
              : `${frequency === 1 ? 'One reminder' : `${frequency} reminders`} per day.`)}
      </UiText>
    </View>
  )
}
