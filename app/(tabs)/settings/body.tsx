import { useState } from 'react'
import { View } from 'react-native'
import { SettingsCard, SettingsPage } from '../../../components/settings/SettingsPage'
import { Button, SegmentedSelection, TextField, UiText } from '../../../components/ui/Controls'
import { useSettingsStore, useUpdateUser } from '../../../features/settings'
import { measurementText, parseMeasurement } from '../../../features/settings/inputs'

export default function BodySettingsScreen() {
  const settings = useSettingsStore()
  const [weight, setWeight] = useState<number | null | undefined>(settings.bodyWeight)
  const [height, setHeight] = useState<number | null | undefined>(settings.height)
  const [weightUnit, setWeightUnit] = useState(settings.bodyWeightUnit)
  const [heightUnit, setHeightUnit] = useState(settings.heightUnit)
  const [weightText, setWeightText] = useState(measurementText(weight, weightUnit))
  const [heightText, setHeightText] = useState(measurementText(height, heightUnit))
  const [saved, setSaved] = useState(false)
  const { updateUserProfile, isUpdating, error } = useUpdateUser()
  const valid = weight !== undefined && height !== undefined
  const dirty =
    weight !== settings.bodyWeight ||
    height !== settings.height ||
    weightUnit !== settings.bodyWeightUnit ||
    heightUnit !== settings.heightUnit

  const save = async () => {
    if (!valid || !dirty || isUpdating) return
    const user = await updateUserProfile(
      { measurements: { weightKg: weight, heightCm: height } },
      { bodyWeightUnit: weightUnit, heightUnit }
    )
    if (!user) return
    setSaved(true)
  }

  return (
    <SettingsPage
      title="Body measurements"
      description="Your weight, height, and preferred units."
      footer={
        <>
          <UiText
            textRole={error || !valid ? 'captionDestructive' : 'caption'}
            accessibilityLiveRegion="polite"
          >
            {error ||
              (!valid
                ? 'Use a positive number, or leave the measurement blank.'
                : dirty
                  ? 'Save to update your measurements.'
                  : saved
                    ? 'Measurements saved.'
                    : 'No changes to save.')}
          </UiText>
          <Button
            className="h-action"
            disabled={!valid || !dirty}
            loading={isUpdating}
            onPress={save}
          >
            {isUpdating ? 'Saving…' : 'Save measurements'}
          </Button>
        </>
      }
    >
      <SettingsCard>
        <View className="flex-row items-center justify-between gap-field">
          <View className="flex-row items-baseline gap-compact">
            <UiText>Body weight</UiText>
            <UiText textRole="caption">(optional)</UiText>
          </View>
          <SegmentedSelection
            value={weightUnit}
            options={[
              { label: 'kg', value: 'kg' },
              { label: 'lb', value: 'lb' },
            ]}
            onValueChange={(unit) => {
              setWeightUnit(unit)
              if (weight !== undefined) setWeightText(measurementText(weight, unit))
            }}
            accessibilityLabel="Weight unit"
            disabled={isUpdating}
            className="w-32"
          />
        </View>
        <View className="flex-row items-center gap-field">
          <TextField
            id="body-weight"
            accessibilityLabel="Body weight"
            className="flex-1"
            invalid={weight === undefined}
            keyboardType="decimal-pad"
            placeholder="Not set"
            value={weightText}
            disabled={isUpdating}
            onChangeText={(text) => {
              setWeightText(text)
              setWeight(parseMeasurement(text, weightUnit))
              setSaved(false)
            }}
          />
          <UiText textRole="caption">{weightUnit}</UiText>
        </View>
      </SettingsCard>
      <SettingsCard>
        <View className="flex-row items-center justify-between gap-field">
          <View className="flex-row items-baseline gap-compact">
            <UiText>Height</UiText>
            <UiText textRole="caption">(optional)</UiText>
          </View>
          <SegmentedSelection
            value={heightUnit}
            options={[
              { label: 'cm', value: 'cm' },
              { label: 'in', value: 'in' },
            ]}
            onValueChange={(unit) => {
              setHeightUnit(unit)
              if (height !== undefined) setHeightText(measurementText(height, unit))
            }}
            accessibilityLabel="Height unit"
            disabled={isUpdating}
            className="w-32"
          />
        </View>
        <View className="flex-row items-center gap-field">
          <TextField
            id="body-height"
            accessibilityLabel="Height"
            className="flex-1"
            invalid={height === undefined}
            keyboardType="decimal-pad"
            placeholder="Not set"
            value={heightText}
            disabled={isUpdating}
            onChangeText={(text) => {
              setHeightText(text)
              setHeight(parseMeasurement(text, heightUnit))
              setSaved(false)
            }}
          />
          <UiText textRole="caption">{heightUnit}</UiText>
        </View>
      </SettingsCard>
      <UiText textRole="caption">
        Switching units converts the current value. Leave a measurement blank if you prefer not to
        add it.
      </UiText>
    </SettingsPage>
  )
}
