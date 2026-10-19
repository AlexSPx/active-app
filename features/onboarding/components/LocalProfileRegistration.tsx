import { useEffect, useRef, useState } from 'react'
import { Link, useRouter } from 'expo-router'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import {
  BarChart2,
  Check,
  ChevronLeft,
  Dumbbell,
  Plus,
  Ruler,
  Weight,
} from '../../../components/ui/icons'
import { Button, TextField, UiText } from '../../../components/ui/Controls'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import NotificationPermissions from '../../../components/NotificationPermissions'
import { useUpdateUser } from '../../settings'
import { launchFacade } from '../../launch/launchFacade'
import { useRegistrationController } from '../useRegistrationController'
import { useAuthStore } from '../../../stores/authStore'

const stepTitles = {
  agreement: 'Your local profile.',
  personal: 'About you.',
  body: 'Your starting point.',
  notifications: 'A timely reminder.',
} as const

const backLabels = {
  agreement: 'Welcome',
  personal: 'Terms',
  body: 'Personal details',
  notifications: 'Body measurements',
} as const

const progressLabels = {
  agreement: 'Terms',
  personal: 'Personal',
  body: 'Body',
  notifications: 'Notifications',
} as const

type UnitOption<T extends string> = { value: T; label: string }

function UnitSelector<T extends string>({
  value,
  options,
  onValueChange,
  accessibilityLabel,
}: {
  value: T
  options: readonly UnitOption<T>[]
  onValueChange: (value: T) => void
  accessibilityLabel: string
}) {
  return (
    <View
      className="min-w-[88px] flex-row gap-1 rounded-control bg-background p-1"
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = value === option.value
        return (
          <Button
            key={option.value}
            variant={selected ? 'primary' : 'ghost'}
            className="min-h-[34px] flex-1 px-compact"
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onValueChange(option.value)}
          >
            <UiText textRole={selected ? 'buttonOnAccent' : 'caption'}>{option.label}</UiText>
          </Button>
        )
      })}
    </View>
  )
}

export default function LocalProfileRegistration() {
  const router = useRouter()
  const colors = useCadenceColors()
  const { user } = useAuthStore()
  const registration = useRegistrationController(user)
  const { updateUserProfile, isUpdating } = useUpdateUser()
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveInProgress = useRef(false)
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [registration.step])

  const goBack = () => {
    if (registration.back()) return
    if (router.canGoBack()) router.back()
    else router.replace('/welcome')
  }

  const continueSetup = async () => {
    const result = await registration.next()
    if (result.kind !== 'complete') return
    if (saveInProgress.current) return

    saveInProgress.current = true
    setSaveError(null)
    try {
      const values = result.values
      const update = launchFacade.onboarding.createProfileUpdate({
        username: values.username,
        firstName: values.firstName,
        lastName: values.lastName,
        timezone: values.timezone,
        weight: values.weight,
        height: values.height,
        notificationFrequency: values.notificationFrequency,
      })
      const saved = await updateUserProfile(update, {
        bodyWeightUnit: values.weightUnit,
        heightUnit: values.heightUnit,
      })
      if (!saved) {
        setSaveError('Your profile could not be saved. Your answers are still here; try again.')
        return
      }
      router.replace('/(tabs)')
    } catch {
      setSaveError('Your profile could not be saved. Your answers are still here; try again.')
    } finally {
      saveInProgress.current = false
    }
  }

  const skipMeasurements = () => {
    setSaveError(null)
    registration.skipBody()
  }

  const clearSaveError = () => setSaveError(null)

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 bg-background">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="mx-auto w-full max-w-[480px] flex-1 px-page pb-section pt-compact">
            <View className="h-12 flex-row items-center justify-between gap-field">
              <Button
                variant="ghost"
                density="compact"
                className="min-h-[44px] self-start px-0"
                accessibilityLabel={`Back to ${backLabels[registration.step]}`}
                onPress={goBack}
              >
                <View className="flex-row items-center gap-compact">
                  <ChevronLeft size={18} aria-hidden />
                  <UiText textRole="captionEmphasis">{backLabels[registration.step]}</UiText>
                </View>
              </Button>
              {registration.step === 'body' ? (
                <Button
                  variant="ghost"
                  density="compact"
                  className="min-h-[44px] px-0"
                  accessibilityLabel="Skip measurements"
                  onPress={skipMeasurements}
                >
                  <UiText textRole="captionEmphasis">Skip</UiText>
                </Button>
              ) : (
                <View className="h-11 w-11" />
              )}
            </View>

            <View className="mb-section mt-compact">
              <View
                className="mb-compact flex-row gap-compact"
                accessibilityRole="progressbar"
                accessibilityLabel="Profile setup progress"
                accessibilityValue={{
                  min: 1,
                  max: registration.stepCount,
                  now: registration.stepIndex + 1,
                  text: `Step ${registration.stepIndex + 1} of ${registration.stepCount}`,
                }}
              >
                {Array.from({ length: registration.stepCount }, (_, index) => (
                  <View
                    key={index}
                    className={`h-[3px] flex-1 rounded-full ${index <= registration.stepIndex ? 'bg-accent' : 'bg-divider'}`}
                  />
                ))}
              </View>
              <View className="flex-row items-center justify-between gap-field">
                <UiText textRole="caption">{progressLabels[registration.step]}</UiText>
                <UiText textRole="caption">
                  Step {registration.stepIndex + 1} of {registration.stepCount}
                </UiText>
              </View>
            </View>

            <View className="gap-field">
              <UiText accessibilityRole="header" textRole="screenTitle">
                {stepTitles[registration.step]}
              </UiText>

              {registration.step === 'agreement' && (
                <>
                  <UiText textRole="bodyMuted">
                    Set up a profile to keep your workouts, routines and progress together.
                  </UiText>

                  <View className="mt-section rounded-[20px] bg-surface px-card py-compact">
                    <View className="flex-row items-start gap-field py-section">
                      <Dumbbell size={20} color={colors.accent} aria-hidden />
                      <View className="flex-1 gap-1">
                        <UiText textRole="bodyEmphasis">Your training, in one place</UiText>
                        <UiText textRole="caption">
                          Start with your own exercises and routines.
                        </UiText>
                      </View>
                    </View>
                    <View className="flex-row items-start gap-field border-t border-divider py-section">
                      <BarChart2 size={20} color={colors.accent} aria-hidden />
                      <View className="flex-1 gap-1">
                        <UiText textRole="bodyEmphasis">A record of every session</UiText>
                        <UiText textRole="caption">Keep track of your sets and progress.</UiText>
                      </View>
                    </View>
                  </View>

                  <UiText textRole="caption" className="mt-field">
                    Read the terms and privacy policy before continuing.
                  </UiText>
                  <View className="mt-compact flex-row items-center justify-between gap-field">
                    <Link href="/legal/terms-of-service" asChild>
                      <Button variant="ghost" density="compact" className="min-h-[44px] px-0">
                        <UiText textRole="captionEmphasis" className="underline">
                          Terms of Service
                        </UiText>
                      </Button>
                    </Link>
                    <Link href="/legal/privacy-policy" asChild>
                      <Button variant="ghost" density="compact" className="min-h-[44px] px-0">
                        <UiText textRole="captionEmphasis" className="underline">
                          Privacy Policy
                        </UiText>
                      </Button>
                    </Link>
                  </View>
                  <Pressable
                    className="mt-section w-full flex-row items-start gap-field rounded-[16px] bg-surface p-field"
                    accessibilityRole="checkbox"
                    accessibilityLabel="I agree to the Terms of Service and Privacy Policy."
                    accessibilityState={{ checked: registration.agreementAccepted }}
                    onPress={() =>
                      registration.setAgreementAccepted(!registration.agreementAccepted)
                    }
                  >
                    <View
                      className={`mt-0.5 h-5 w-5 items-center justify-center rounded-[5px] border ${registration.agreementAccepted ? 'border-accent bg-accent' : 'border-divider bg-background'}`}
                    >
                      {registration.agreementAccepted && (
                        <Check size={14} color={colors.onAccent} aria-hidden />
                      )}
                    </View>
                    <UiText textRole="body" className="flex-1">
                      I agree to the Terms of Service and Privacy Policy.
                    </UiText>
                  </Pressable>
                </>
              )}

              {registration.step === 'personal' && (
                <>
                  <UiText textRole="bodyMuted">
                    Add a name to your training profile. You can leave these fields blank.
                  </UiText>
                  <View className="mt-section overflow-hidden rounded-[18px] bg-surface">
                    <View className="gap-compact p-field">
                      <View className="flex-row items-center justify-between gap-field">
                        <UiText textRole="bodyEmphasis">Username</UiText>
                        <UiText textRole="caption">Optional</UiText>
                      </View>
                      <TextField
                        id="registration-username"
                        backgroundTone="background"
                        accessibilityLabel="Username"
                        accessibilityHint="Optional, up to 50 characters"
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={50}
                        placeholder="e.g. coolrunner123"
                        value={registration.values.username}
                        onChangeText={(value) => {
                          clearSaveError()
                          registration.setUsername(value)
                        }}
                      />
                      {!!registration.errors.username?.message && (
                        <UiText textRole="captionDestructive" accessibilityLiveRegion="polite">
                          {registration.errors.username.message}
                        </UiText>
                      )}
                    </View>
                    <View className="gap-compact border-t border-divider p-field">
                      <View className="flex-row items-center justify-between gap-field">
                        <UiText textRole="bodyEmphasis">First name</UiText>
                        <UiText textRole="caption">Optional</UiText>
                      </View>
                      <TextField
                        id="registration-first-name"
                        backgroundTone="background"
                        accessibilityLabel="First name"
                        accessibilityHint="Optional, up to 50 characters"
                        autoCapitalize="words"
                        maxLength={50}
                        placeholder="e.g. Jane"
                        value={registration.values.firstName}
                        onChangeText={(value) => {
                          clearSaveError()
                          registration.setFirstName(value)
                        }}
                      />
                      {!!registration.errors.firstName?.message && (
                        <UiText textRole="captionDestructive" accessibilityLiveRegion="polite">
                          {registration.errors.firstName.message}
                        </UiText>
                      )}
                    </View>
                    <View className="gap-compact border-t border-divider p-field">
                      <View className="flex-row items-center justify-between gap-field">
                        <UiText textRole="bodyEmphasis">Last name</UiText>
                        <UiText textRole="caption">Optional</UiText>
                      </View>
                      <TextField
                        id="registration-last-name"
                        backgroundTone="background"
                        accessibilityLabel="Last name"
                        accessibilityHint="Optional, up to 50 characters"
                        autoCapitalize="words"
                        maxLength={50}
                        placeholder="e.g. Doe"
                        value={registration.values.lastName}
                        onChangeText={(value) => {
                          clearSaveError()
                          registration.setLastName(value)
                        }}
                      />
                      {!!registration.errors.lastName?.message && (
                        <UiText textRole="captionDestructive" accessibilityLiveRegion="polite">
                          {registration.errors.lastName.message}
                        </UiText>
                      )}
                    </View>
                  </View>
                </>
              )}

              {registration.step === 'body' && (
                <>
                  <UiText textRole="bodyMuted">
                    Add your current measurements. You can update them later, or skip for now.
                  </UiText>
                  <View className="mt-section gap-field">
                    <View className="gap-field rounded-[18px] bg-surface p-card">
                      <View className="flex-row items-center justify-between gap-field">
                        <View className="flex-row items-center gap-compact">
                          <Weight size={18} color={colors.accent} aria-hidden />
                          <UiText textRole="bodyEmphasis">Weight</UiText>
                        </View>
                        <UnitSelector
                          value={registration.values.weightUnit}
                          options={[
                            { value: 'kg', label: 'kg' },
                            { value: 'lb', label: 'lb' },
                          ]}
                          onValueChange={registration.setWeightUnit}
                          accessibilityLabel="Weight unit"
                        />
                      </View>
                      <View className="flex-row items-center gap-compact">
                        <Button
                          variant="ghost"
                          className="h-11 w-11 rounded-control border border-divider px-0"
                          accessibilityLabel="Decrease weight"
                          onPress={() => {
                            clearSaveError()
                            registration.adjustWeight(-1)
                          }}
                        >
                          <UiText textRole="captionEmphasis" className="text-[22px]">
                            −
                          </UiText>
                        </Button>
                        <View className="relative flex-1">
                          <TextField
                            id="registration-weight"
                            backgroundTone="background"
                            appearance="measurement"
                            accessibilityLabel="Weight"
                            className="flex-1"
                            invalid={
                              !!registration.errors.weight || !!registration.weightEntryError
                            }
                            keyboardType="decimal-pad"
                            value={registration.weightText}
                            onChangeText={(value) => {
                              clearSaveError()
                              registration.updateWeightText(value)
                            }}
                          />
                          <View className="absolute right-3 top-[24px]" pointerEvents="none">
                            <UiText textRole="caption">{registration.values.weightUnit}</UiText>
                          </View>
                        </View>
                        <Button
                          variant="ghost"
                          className="h-11 w-11 rounded-control border border-divider px-0"
                          accessibilityLabel="Increase weight"
                          onPress={() => {
                            clearSaveError()
                            registration.adjustWeight(1)
                          }}
                        >
                          <Plus size={17} color={colors.accent} aria-hidden />
                        </Button>
                      </View>
                      {(registration.weightEntryError || registration.errors.weight?.message) && (
                        <UiText textRole="captionDestructive" accessibilityLiveRegion="polite">
                          {registration.weightEntryError || registration.errors.weight?.message}
                        </UiText>
                      )}
                    </View>

                    <View className="gap-field rounded-[18px] bg-surface p-card">
                      <View className="flex-row items-center justify-between gap-field">
                        <View className="flex-row items-center gap-compact">
                          <Ruler size={18} color={colors.accent} aria-hidden />
                          <UiText textRole="bodyEmphasis">Height</UiText>
                        </View>
                        <UnitSelector
                          value={registration.values.heightUnit}
                          options={[
                            { value: 'cm', label: 'cm' },
                            { value: 'in', label: 'in' },
                          ]}
                          onValueChange={registration.setHeightUnit}
                          accessibilityLabel="Height unit"
                        />
                      </View>
                      <View className="flex-row items-center gap-compact">
                        <Button
                          variant="ghost"
                          className="h-11 w-11 rounded-control border border-divider px-0"
                          accessibilityLabel="Decrease height"
                          onPress={() => {
                            clearSaveError()
                            registration.adjustHeight(-1)
                          }}
                        >
                          <UiText textRole="captionEmphasis" className="text-[22px]">
                            −
                          </UiText>
                        </Button>
                        <View className="relative flex-1">
                          <TextField
                            id="registration-height"
                            backgroundTone="background"
                            appearance="measurement"
                            accessibilityLabel="Height"
                            className="flex-1"
                            invalid={
                              !!registration.errors.height || !!registration.heightEntryError
                            }
                            keyboardType="decimal-pad"
                            value={registration.heightText}
                            onChangeText={(value) => {
                              clearSaveError()
                              registration.updateHeightText(value)
                            }}
                          />
                          <View className="absolute right-3 top-[24px]" pointerEvents="none">
                            <UiText textRole="caption">{registration.values.heightUnit}</UiText>
                          </View>
                        </View>
                        <Button
                          variant="ghost"
                          className="h-11 w-11 rounded-control border border-divider px-0"
                          accessibilityLabel="Increase height"
                          onPress={() => {
                            clearSaveError()
                            registration.adjustHeight(1)
                          }}
                        >
                          <Plus size={17} color={colors.accent} aria-hidden />
                        </Button>
                      </View>
                      {(registration.heightEntryError || registration.errors.height?.message) && (
                        <UiText textRole="captionDestructive" accessibilityLiveRegion="polite">
                          {registration.heightEntryError || registration.errors.height?.message}
                        </UiText>
                      )}
                    </View>
                  </View>
                  <UiText textRole="caption" className="mt-field">
                    Both measurements are optional.
                  </UiText>
                </>
              )}

              {registration.step === 'notifications' && (
                <>
                  <UiText textRole="bodyMuted">
                    Choose whether to receive rest alerts and training reminders.
                  </UiText>
                  <View className="mt-section overflow-hidden rounded-[18px] bg-surface">
                    <NotificationPermissions onboarding />
                  </View>
                  <UiText textRole="caption" className="mt-field">
                    You can finish without enabling either permission and change these choices later
                    in Settings.
                  </UiText>
                </>
              )}
            </View>
          </View>
        </ScrollView>

        <View className="border-t border-divider px-page pb-4 pt-[14px]">
          <View className="mx-auto w-full max-w-[480px] gap-field">
            {!!saveError && (
              <UiText textRole="captionDestructive" accessibilityLiveRegion="polite" selectable>
                {saveError}
              </UiText>
            )}
            <Button
              className="w-full"
              disabled={
                isUpdating || (registration.step === 'agreement' && !registration.agreementAccepted)
              }
              loading={isUpdating}
              onPress={continueSetup}
            >
              {isUpdating
                ? 'Saving…'
                : registration.step === 'notifications'
                  ? 'Finish setup'
                  : 'Continue'}
            </Button>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
