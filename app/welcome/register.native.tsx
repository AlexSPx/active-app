import { useState } from 'react'
import { KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { Button, Input, Label, Paragraph, ScrollView, Text, XStack, YStack } from 'tamagui'
import TimeZoneSelector from '../../components/TimeZoneSelector'
import { useUpdateUser } from '../../features/settings'
import { measurementText, parseMeasurement } from '../../features/settings/inputs'
import { useSettingsStore } from '../../features/settings/stores/settingsStore'
import { useTrainingProfileStore } from '../../features/training-profile/stores/trainingProfileStore'

export default function NativeRegisterScreen() {
  const router = useRouter()
  const settings = useSettingsStore()
  const savedProfile = useTrainingProfileStore()
  const { updateUserProfile, isUpdating, error } = useUpdateUser()
  const [firstName, setFirstName] = useState(savedProfile.firstName)
  const [lastName, setLastName] = useState(savedProfile.lastName)
  const [weightUnit, setWeightUnit] = useState(settings.bodyWeightUnit)
  const [heightUnit, setHeightUnit] = useState(settings.heightUnit)
  const [weightText, setWeightText] = useState(
    measurementText(settings.bodyWeight, settings.bodyWeightUnit)
  )
  const [heightText, setHeightText] = useState(
    measurementText(settings.height, settings.heightUnit)
  )
  const [weight, setWeight] = useState<number | null | undefined>(settings.bodyWeight)
  const [height, setHeight] = useState<number | null | undefined>(settings.height)
  const [timeZone, setTimeZone] = useState(settings.timeZone)
  const [saveError, setSaveError] = useState<string | null>(null)
  const valid = weight !== undefined && height !== undefined

  const startTraining = async () => {
    if (!valid || isUpdating) return
    setSaveError(null)

    const saved = await updateUserProfile(
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        timezone: timeZone,
        measurements: { weightKg: weight, heightCm: height },
      },
      { bodyWeightUnit: weightUnit, heightUnit }
    )
    if (!saved) return

    try {
      await savedProfile.completeOnboarding()
      router.replace('/(tabs)' as any)
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : 'Could not save your profile. Try again.'
      )
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <YStack flex={1} bg="$background">
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <YStack p="$page" gap="$section" width="100%" maxW="$content" self="center">
            <YStack gap="$field">
              <Text
                accessibilityRole="header"
                fontSize="$screenTitle"
                lineHeight="$screenTitle"
                fontWeight="600"
              >
                Set up your training profile
              </Text>
              <Paragraph fontSize="$body" lineHeight="$body" color="$colorSubtle">
                These details are optional and stay on this device. You can start training now and
                add them later in Settings.
              </Paragraph>
            </YStack>

            <YStack gap="$field">
              <Text fontSize="$sectionTitle" fontWeight="600">
                Your name{' '}
                <Text color="$colorSubtle" fontSize="$caption">
                  (optional)
                </Text>
              </Text>
              <YStack gap="$compact">
                <Label htmlFor="training-first-name" fontSize="$caption" color="$colorSubtle">
                  First name
                </Label>
                <Input
                  id="training-first-name"
                  accessibilityLabel="First name"
                  height="$action"
                  rounded="$control"
                  bg="$surface"
                  borderColor="$borderColor"
                  placeholder="First name"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </YStack>
              <YStack gap="$compact">
                <Label htmlFor="training-last-name" fontSize="$caption" color="$colorSubtle">
                  Last name
                </Label>
                <Input
                  id="training-last-name"
                  accessibilityLabel="Last name"
                  height="$action"
                  rounded="$control"
                  bg="$surface"
                  borderColor="$borderColor"
                  placeholder="Last name"
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  returnKeyType="done"
                />
              </YStack>
            </YStack>

            <YStack gap="$field">
              <Text fontSize="$sectionTitle" fontWeight="600">
                Body measurements{' '}
                <Text color="$colorSubtle" fontSize="$caption">
                  (optional)
                </Text>
              </Text>
              <YStack gap="$compact">
                <XStack items="center" justify="space-between" gap="$field">
                  <Label htmlFor="onboarding-weight" fontSize="$body">
                    Weight
                  </Label>
                  <UnitSwitch
                    values={['kg', 'lb']}
                    value={weightUnit}
                    onChange={(unit) => {
                      setWeightUnit(unit as 'kg' | 'lb')
                      if (weight !== undefined)
                        setWeightText(measurementText(weight, unit as 'kg' | 'lb'))
                    }}
                  />
                </XStack>
                <Input
                  id="onboarding-weight"
                  accessibilityLabel="Body weight"
                  height="$action"
                  rounded="$control"
                  bg="$surface"
                  borderColor={weight === undefined ? '$destructive' : '$borderColor'}
                  keyboardType="decimal-pad"
                  placeholder="Leave blank"
                  value={weightText}
                  onChangeText={(value) => {
                    setWeightText(value)
                    setWeight(parseMeasurement(value, weightUnit))
                  }}
                />
              </YStack>
              <YStack gap="$compact">
                <XStack items="center" justify="space-between" gap="$field">
                  <Label htmlFor="onboarding-height" fontSize="$body">
                    Height
                  </Label>
                  <UnitSwitch
                    values={['cm', 'in']}
                    value={heightUnit}
                    onChange={(unit) => {
                      setHeightUnit(unit as 'cm' | 'in')
                      if (height !== undefined)
                        setHeightText(measurementText(height, unit as 'cm' | 'in'))
                    }}
                  />
                </XStack>
                <Input
                  id="onboarding-height"
                  accessibilityLabel="Height"
                  height="$action"
                  rounded="$control"
                  bg="$surface"
                  borderColor={height === undefined ? '$destructive' : '$borderColor'}
                  keyboardType="decimal-pad"
                  placeholder="Leave blank"
                  value={heightText}
                  onChangeText={(value) => {
                    setHeightText(value)
                    setHeight(parseMeasurement(value, heightUnit))
                  }}
                />
              </YStack>
              {!valid && (
                <Paragraph fontSize="$caption" color="$destructive">
                  Enter a positive number or leave the measurement blank.
                </Paragraph>
              )}
            </YStack>

            <YStack gap="$field">
              <Text fontSize="$sectionTitle" fontWeight="600">
                Time zone
              </Text>
              <TimeZoneSelector value={timeZone} onValueChange={setTimeZone} />
            </YStack>
          </YStack>
        </ScrollView>

        <YStack p="$page" gap="$field" borderTopWidth={1} borderColor="$borderColor">
          {(error || saveError) && (
            <Paragraph fontSize="$caption" color="$destructive" accessibilityLiveRegion="polite">
              {saveError || error}
            </Paragraph>
          )}
          <Button
            height="$action"
            rounded="$button"
            bg="$primary"
            color="$onPrimary"
            disabled={!valid || isUpdating}
            opacity={!valid || isUpdating ? 0.5 : 1}
            onPress={startTraining}
          >
            {isUpdating ? 'Saving profile…' : 'Start training'}
          </Button>
        </YStack>
      </YStack>
    </KeyboardAvoidingView>
  )
}

function UnitSwitch<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly T[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <XStack bg="$backgroundStrong" p="$compact" rounded="$control">
      {values.map((unit) => (
        <Button
          key={unit}
          size="$3"
          height="$touch"
          rounded="$day"
          bg={value === unit ? '$surface' : '$backgroundTransparent'}
          color={value === unit ? '$primary' : '$colorSubtle'}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === unit }}
          onPress={() => onChange(unit)}
        >
          {unit}
        </Button>
      ))}
    </XStack>
  )
}
