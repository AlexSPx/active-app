import { useState } from 'react'
import { Switch, View } from 'react-native'
import { Button, UiText } from './ui/Controls'
import { useSettingsStore, saveSettingsProfile } from '../features/settings/stores/settingsStore'
import { getProfileScope, isCurrentProfile } from '../lib/profileScope'
import {
  configureWeightReminder,
  requestWeightReminderPermission,
} from '../services/notificationService'

export function WeightReminderSettings() {
  const enabled = useSettingsStore((state) => state.weightReminderEnabled)
  const hour = useSettingsStore((state) => state.weightReminderHour)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const update = async (nextEnabled: boolean, nextHour: number) => {
    if (busy) return
    const scope = getProfileScope()
    setBusy(true)
    setError(null)
    try {
      if (nextEnabled) await requestWeightReminderPermission()
      if (!isCurrentProfile(scope)) throw new Error('Profile changed while updating the reminder.')
      await configureWeightReminder(nextEnabled, nextHour)
      if (!isCurrentProfile(scope)) throw new Error('Profile changed while updating the reminder.')
      try {
        await saveSettingsProfile(scope, {
          weightReminderEnabled: nextEnabled,
          weightReminderHour: nextHour,
        })
      } catch (error) {
        if (isCurrentProfile(scope)) await configureWeightReminder(enabled, hour).catch(() => {})
        throw error
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the reminder.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <View className="px-field py-compact">
      <View className="min-h-touch flex-row items-center justify-between gap-field">
        <View className="min-w-0 flex-1">
          <UiText textRole="bodyEmphasis">Daily weigh-in reminder</UiText>
          <UiText textRole="caption">Uses your device’s local time</UiText>
        </View>
        <Switch
          accessibilityLabel="Daily weigh-in reminder"
          accessibilityState={{ checked: enabled, disabled: busy }}
          thumbColorClassName="accent-surface"
          trackColorOnClassName="accent-accent"
          trackColorOffClassName="accent-raised"
          ios_backgroundColorClassName="accent-raised"
          value={enabled}
          disabled={busy}
          onValueChange={(value) => void update(value, hour)}
        />
      </View>
      {enabled && (
        <View className="min-h-touch flex-row items-center justify-between gap-field">
          <UiText textRole="caption">
            Time:{' '}
            {new Date(2000, 0, 1, hour).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </UiText>
          <View className="flex-row gap-compact">
            <Button
              variant="secondary"
              shape="control"
              density="compact"
              className="w-touch px-0"
              accessibilityLabel="Earlier reminder hour"
              disabled={busy}
              onPress={() => void update(true, (hour + 23) % 24)}
            >
              −
            </Button>
            <Button
              variant="secondary"
              shape="control"
              density="compact"
              className="w-touch px-0"
              accessibilityLabel="Later reminder hour"
              disabled={busy}
              onPress={() => void update(true, (hour + 1) % 24)}
            >
              +
            </Button>
          </View>
        </View>
      )}
      {!!error && (
        <UiText textRole="captionDestructive" accessibilityLiveRegion="polite">
          {error}
        </UiText>
      )}
    </View>
  )
}
