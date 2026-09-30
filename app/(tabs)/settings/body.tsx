import React, { useState } from 'react'
import { Button, Input, Label, Paragraph, Text, XStack, YStack } from 'tamagui'
import { SettingsPage } from '../../../components/settings/SettingsPage'
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
    const user = await updateUserProfile({ measurements: { weightKg: weight, heightCm: height } })
    if (!user) return
    settings.setBodyWeight(weight)
    settings.setHeight(height)
    settings.setBodyWeightUnit(weightUnit)
    settings.setHeightUnit(heightUnit)
    setSaved(true)
  }

  return (
    <SettingsPage
      title="Body measurements"
      description="Your weight, height, and preferred units."
      footer={
        <>
          <Paragraph
            fontSize="$caption"
            lineHeight="$caption"
            color={error || !valid ? '$destructive' : '$colorSubtle'}
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
          </Paragraph>
          <Button
            height="$action"
            rounded="$button"
            bg="$primary"
            color="$onPrimary"
            disabled={!valid || !dirty || isUpdating}
            opacity={!valid || !dirty || isUpdating ? 0.5 : 1}
            onPress={save}
          >
            {isUpdating ? 'Saving…' : 'Save measurements'}
          </Button>
        </>
      }
    >
      <YStack gap="$field">
        <XStack items="center" justify="space-between" gap="$field">
          <Label htmlFor="body-weight" fontSize="$body">
            Body weight{' '}
            <Text color="$colorSubtle" fontSize="$caption">
              (optional)
            </Text>
          </Label>
          <XStack bg="$backgroundStrong" p="$compact" rounded="$control">
            {(['kg', 'lb'] as const).map((unit) => (
              <Button
                key={unit}
                size="$3"
                height="$touch"
                rounded="$day"
                disabled={isUpdating}
                bg={weightUnit === unit ? '$surface' : '$backgroundTransparent'}
                color={weightUnit === unit ? '$primary' : '$colorSubtle'}
                accessibilityRole="radio"
                accessibilityState={{ checked: weightUnit === unit }}
                onPress={() => {
                  setWeightUnit(unit)
                  if (weight !== undefined) setWeightText(measurementText(weight, unit))
                }}
              >
                {unit}
              </Button>
            ))}
          </XStack>
        </XStack>
        <XStack items="center" gap="$field">
          <Input
            id="body-weight"
            accessibilityLabel="Body weight"
            flex={1}
            height="$action"
            rounded="$control"
            bg="$surface"
            borderColor={weight === undefined ? '$destructive' : '$borderColor'}
            fontSize="$cardTitle"
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
          <Text fontSize="$body" color="$colorSubtle">
            {weightUnit}
          </Text>
        </XStack>
      </YStack>
      <YStack gap="$field">
        <XStack items="center" justify="space-between" gap="$field">
          <Label htmlFor="body-height" fontSize="$body">
            Height{' '}
            <Text color="$colorSubtle" fontSize="$caption">
              (optional)
            </Text>
          </Label>
          <XStack bg="$backgroundStrong" p="$compact" rounded="$control">
            {(['cm', 'in'] as const).map((unit) => (
              <Button
                key={unit}
                size="$3"
                height="$touch"
                rounded="$day"
                disabled={isUpdating}
                bg={heightUnit === unit ? '$surface' : '$backgroundTransparent'}
                color={heightUnit === unit ? '$primary' : '$colorSubtle'}
                accessibilityRole="radio"
                accessibilityState={{ checked: heightUnit === unit }}
                onPress={() => {
                  setHeightUnit(unit)
                  if (height !== undefined) setHeightText(measurementText(height, unit))
                }}
              >
                {unit}
              </Button>
            ))}
          </XStack>
        </XStack>
        <XStack items="center" gap="$field">
          <Input
            id="body-height"
            accessibilityLabel="Height"
            flex={1}
            height="$action"
            rounded="$control"
            bg="$surface"
            borderColor={height === undefined ? '$destructive' : '$borderColor'}
            fontSize="$cardTitle"
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
          <Text fontSize="$body" color="$colorSubtle">
            {heightUnit}
          </Text>
        </XStack>
      </YStack>
      <Paragraph fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
        Switching units converts the current value. Leave a measurement blank if you prefer not to
        add it.
      </Paragraph>
    </SettingsPage>
  )
}
