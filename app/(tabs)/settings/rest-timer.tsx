import { useState } from 'react'
import { Switch, View } from 'react-native'
import { SettingsCard, SettingsPage } from '../../../components/settings/SettingsPage'
import { Button, TextField, UiText } from '../../../components/ui/Controls'
import { useSettingsStore } from '../../../features/settings'
import { parseRestDuration } from '../../../features/settings/inputs'

const presets = [
  { value: 30, label: '30 sec' },
  { value: 60, label: '1 min' },
  { value: 90, label: '1:30' },
  { value: 120, label: '2 min' },
] as const

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
      <SettingsCard>
        <View className="flex-row items-center justify-between gap-field">
          <View className="flex-1 gap-compact">
            <UiText textRole="bodyEmphasis">Start after each set</UiText>
            <UiText textRole="caption">Show the countdown when you finish a set.</UiText>
          </View>
          <Switch
            accessibilityLabel="Start after each set"
            accessibilityState={{ checked: restTimerEnabled }}
            thumbColorClassName="accent-surface"
            trackColorOnClassName="accent-accent"
            trackColorOffClassName="accent-raised"
            ios_backgroundColorClassName="accent-raised"
            value={restTimerEnabled}
            onValueChange={setRestTimerEnabled}
          />
        </View>
      </SettingsCard>
      <SettingsCard>
        <View className={`gap-field ${restTimerEnabled ? '' : 'opacity-50'}`}>
          <UiText textRole="bodyEmphasis">Default duration</UiText>
          <View className="flex-row items-center gap-field">
            <View className="flex-1 gap-compact">
              <TextField
                id="rest-minutes"
                accessibilityLabel="Rest minutes"
                keyboardType="number-pad"
                textAlign="center"
                value={minutes}
                onChangeText={(value) => updateDuration(value, seconds)}
                disabled={!restTimerEnabled}
              />
              <UiText textRole="caption" className="text-center">
                minutes
              </UiText>
            </View>
            <UiText textRole="cardTitleMuted">:</UiText>
            <View className="flex-1 gap-compact">
              <TextField
                id="rest-seconds"
                accessibilityLabel="Rest seconds"
                keyboardType="number-pad"
                textAlign="center"
                value={seconds}
                onChangeText={(value) => updateDuration(minutes, value)}
                disabled={!restTimerEnabled}
              />
              <UiText textRole="caption" className="text-center">
                seconds
              </UiText>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-compact">
            {presets.map(({ value, label }) => {
              const selected = duration === value
              return (
                <Button
                  key={value}
                  variant={selected ? 'primary' : 'secondary'}
                  shape="control"
                  className="flex-1"
                  disabled={!restTimerEnabled}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ checked: selected }}
                  onPress={() => updateDuration(String(Math.floor(value / 60)), String(value % 60))}
                >
                  {label}
                </Button>
              )
            })}
          </View>
          <UiText textRole="caption">Used when the timer starts after a completed set.</UiText>
        </View>
      </SettingsCard>
      <UiText
        textRole={restTimerEnabled && duration === null ? 'captionDestructive' : 'caption'}
        accessibilityLiveRegion="polite"
      >
        {!restTimerEnabled
          ? 'Timer off. Your duration is kept.'
          : duration === null
            ? 'Enter a duration from 0:01 to 59:59.'
            : 'Changes apply automatically.'}
      </UiText>
      <UiText textRole="caption">
        Turn the timer off to train without an automatic countdown. Your duration is kept for next
        time.
      </UiText>
    </SettingsPage>
  )
}
