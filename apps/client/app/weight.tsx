import { useState } from 'react'
import { View } from 'react-native'
import { SettingsPage } from '../components/settings/SettingsPage'
import { Button, Surface, TextField, UiText } from '../components/ui/Controls'
import { WeightWidget } from '../components/WeightWidget'
import { useSettingsStore, useUpdateUser } from '../features/settings'
import { measurementText, parseMeasurement } from '../features/settings/inputs'

export default function WeightScreen() {
  const history = useSettingsStore((state) => state.weightHistory)
  const height = useSettingsStore((state) => state.height)
  const unit = useSettingsStore((state) => state.bodyWeightUnit)
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const { updateUserProfile, isUpdating, error } = useUpdateUser()
  const weight = parseMeasurement(text, unit)
  const save = async () => {
    if (typeof weight !== 'number' || weight <= 0 || isUpdating) return
    const user = await updateUserProfile(
      { measurements: { weightKg: weight, heightCm: height } },
      { recordWeight: true }
    )
    if (user) {
      setText('')
      setSaved(true)
    }
  }
  return (
    <SettingsPage title="Body weight" description="Log weigh-ins and follow your progress.">
      <WeightWidget />
      <Surface>
        <UiText textRole="bodyEmphasis">Add a weigh-in</UiText>
        <View className="flex-row items-center gap-field">
          <TextField
            id="new-weight"
            accessibilityLabel={`Weight in ${unit}`}
            className="flex-1"
            keyboardType="decimal-pad"
            placeholder="Weight"
            value={text}
            onChangeText={(value) => {
              setText(value)
              setSaved(false)
            }}
          />
          <UiText>{unit}</UiText>
        </View>
        <Button
          disabled={typeof weight !== 'number' || weight <= 0}
          loading={isUpdating}
          onPress={() => void save()}
        >
          Log weight
        </Button>
        {!!error && (
          <UiText textRole="captionDestructive" accessibilityLiveRegion="polite">
            {error}
          </UiText>
        )}
        {saved && (
          <UiText textRole="caption" accessibilityLiveRegion="polite">
            Weigh-in saved.
          </UiText>
        )}
      </Surface>
      <Surface>
        <UiText textRole="bodyEmphasis">Weigh-in history</UiText>
        {history.length === 0 && (
          <UiText textRole="caption">Your weigh-ins will appear here.</UiText>
        )}
        {[...history].reverse().map((entry) => (
          <View key={entry.id} className="flex-row justify-between gap-field">
            <UiText textRole="caption">
              {entry.initial ? 'Previous measurement' : new Date(entry.recordedAt).toLocaleString()}
            </UiText>
            <UiText>
              {measurementText(entry.weightKg, unit)} {unit}
            </UiText>
          </View>
        ))}
      </Surface>
    </SettingsPage>
  )
}
