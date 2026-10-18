import { useEffect, useRef, useState } from 'react'
import { Link, useRouter } from 'expo-router'
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native'
import { ChevronLeft, Clock3, Ruler, Weight } from '../../../components/ui/icons'
import {
  Button,
  SegmentedSelection,
  Surface,
  TextField,
  UiText,
} from '../../../components/ui/Controls'
import NotificationPermissions from '../../../components/NotificationPermissions'
import { useUpdateUser } from '../../settings'
import { launchFacade } from '../../launch/launchFacade'
import { useRegistrationController } from '../useRegistrationController'
import { useAuthStore } from '../../../stores/authStore'

const stepTitles = {
  agreement: 'Your local profile',
  personal: 'Personal details',
  body: 'Body measurements',
  notifications: 'Notifications',
} as const

export default function LocalProfileRegistration() {
  const router = useRouter()
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

  const clearSaveError = () => setSaveError(null)
  const selectedTitle = stepTitles[registration.step]

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
          <View className="mx-auto w-full max-w-[560px] flex-1 gap-section px-page pb-section pt-compact">
            <Button variant="ghost" className="self-start" onPress={goBack}>
              <View className="flex-row items-center gap-compact">
                <ChevronLeft size={18} aria-hidden />
                <UiText textRole="captionEmphasis">
                  {registration.step === 'agreement' ? 'Welcome' : 'Back'}
                </UiText>
              </View>
            </Button>

            <View className="gap-field">
              <UiText accessibilityRole="header" textRole="screenTitle">
                Set up your profile
              </UiText>
              <View
                className="flex-row gap-compact"
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
                    className={`h-1 flex-1 rounded-full ${index <= registration.stepIndex ? 'bg-accent' : 'bg-divider'}`}
                  />
                ))}
              </View>
              <View className="flex-row items-center justify-between gap-field">
                <UiText textRole="bodyEmphasis">{selectedTitle}</UiText>
                <UiText textRole="caption">
                  Step {registration.stepIndex + 1} of {registration.stepCount}
                </UiText>
              </View>
            </View>

            {registration.step === 'agreement' && (
              <View className="gap-section">
                <UiText accessibilityRole="header" textRole="cardTitle">
                  Your training, in one place
                </UiText>
                <UiText textRole="bodyMuted">
                  Start with a profile saved on this device. Your workouts and progress stay here,
                  and you can erase them any time in Settings.
                </UiText>
                <Surface>
                  <UiText textRole="bodyEmphasis">Before you continue</UiText>
                  <UiText textRole="bodyMuted">
                    Read the terms of service and privacy policy for this version of Active.
                  </UiText>
                  <View className="flex-row flex-wrap gap-compact">
                    <Link href="/legal/terms-of-service" asChild>
                      <Button variant="secondary" density="compact">
                        Terms of Service
                      </Button>
                    </Link>
                    <Link href="/legal/privacy-policy" asChild>
                      <Button variant="secondary" density="compact">
                        Privacy Policy
                      </Button>
                    </Link>
                  </View>
                  <View className="flex-row items-center gap-field">
                    <Switch
                      accessibilityLabel="Agree to the Terms of Service and acknowledge the Privacy Policy"
                      value={registration.agreementAccepted}
                      onValueChange={registration.setAgreementAccepted}
                    />
                    <UiText textRole="body" className="flex-1">
                      I agree to the Terms of Service and acknowledge the Privacy Policy.
                    </UiText>
                  </View>
                </Surface>
              </View>
            )}

            {registration.step === 'personal' && (
              <View className="gap-section">
                <UiText textRole="bodyMuted">
                  Add a name to your training profile. You can leave these fields blank.
                </UiText>
                <Surface>
                  <View className="gap-compact">
                    <UiText textRole="captionEmphasis">Username · optional</UiText>
                    <TextField
                      id="registration-username"
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
                  <View className="gap-compact">
                    <UiText textRole="captionEmphasis">First name · optional</UiText>
                    <TextField
                      id="registration-first-name"
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
                  <View className="gap-compact">
                    <UiText textRole="captionEmphasis">Last name · optional</UiText>
                    <TextField
                      id="registration-last-name"
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
                </Surface>
              </View>
            )}

            {registration.step === 'body' && (
              <View className="gap-section">
                <UiText textRole="bodyMuted">
                  Add your current measurements. You can leave either field blank or update it
                  later.
                </UiText>
                <Surface>
                  <View className="gap-field">
                    <View className="flex-row items-center justify-between gap-field">
                      <View className="flex-row items-center gap-compact">
                        <Weight size={18} aria-hidden />
                        <UiText textRole="bodyEmphasis">Weight</UiText>
                      </View>
                      <SegmentedSelection
                        value={registration.values.weightUnit}
                        options={[
                          { value: 'kg', label: 'kg' },
                          { value: 'lb', label: 'lb' },
                        ]}
                        onValueChange={registration.setWeightUnit}
                        accessibilityLabel="Weight unit"
                        className="w-32"
                      />
                    </View>
                    <View className="flex-row items-center gap-field">
                      <TextField
                        id="registration-weight"
                        accessibilityLabel="Weight"
                        className="flex-1"
                        invalid={!!registration.errors.weight || !!registration.weightEntryError}
                        keyboardType="decimal-pad"
                        placeholder="Not set"
                        value={registration.weightText}
                        onChangeText={(value) => {
                          clearSaveError()
                          registration.updateWeightText(value)
                        }}
                      />
                      <UiText textRole="caption">{registration.values.weightUnit}</UiText>
                    </View>
                    {(registration.weightEntryError || registration.errors.weight?.message) && (
                      <UiText textRole="captionDestructive" accessibilityLiveRegion="polite">
                        {registration.weightEntryError || registration.errors.weight?.message}
                      </UiText>
                    )}
                  </View>

                  <View className="gap-field">
                    <View className="flex-row items-center justify-between gap-field">
                      <View className="flex-row items-center gap-compact">
                        <Ruler size={18} aria-hidden />
                        <UiText textRole="bodyEmphasis">Height</UiText>
                      </View>
                      <SegmentedSelection
                        value={registration.values.heightUnit}
                        options={[
                          { value: 'cm', label: 'cm' },
                          { value: 'in', label: 'in' },
                        ]}
                        onValueChange={registration.setHeightUnit}
                        accessibilityLabel="Height unit"
                        className="w-32"
                      />
                    </View>
                    <View className="flex-row items-center gap-field">
                      <TextField
                        id="registration-height"
                        accessibilityLabel="Height"
                        className="flex-1"
                        invalid={!!registration.errors.height || !!registration.heightEntryError}
                        keyboardType="decimal-pad"
                        placeholder="Not set"
                        value={registration.heightText}
                        onChangeText={(value) => {
                          clearSaveError()
                          registration.updateHeightText(value)
                        }}
                      />
                      <UiText textRole="caption">{registration.values.heightUnit}</UiText>
                    </View>
                    {(registration.heightEntryError || registration.errors.height?.message) && (
                      <UiText textRole="captionDestructive" accessibilityLiveRegion="polite">
                        {registration.heightEntryError || registration.errors.height?.message}
                      </UiText>
                    )}
                  </View>
                </Surface>
                <UiText textRole="caption">
                  Measurements are optional. Weight must be 20–300 kg and height 100–250 cm.
                </UiText>
              </View>
            )}

            {registration.step === 'notifications' && (
              <View className="gap-section">
                <View className="flex-row items-center gap-field">
                  <Clock3 size={20} aria-hidden />
                  <UiText accessibilityRole="header" textRole="cardTitle">
                    Choose what works for you
                  </UiText>
                </View>
                <UiText textRole="bodyMuted">
                  Notifications and alarms are optional. You can finish setup without allowing them
                  and change access later in Settings.
                </UiText>
                <Surface>
                  <NotificationPermissions />
                </Surface>
              </View>
            )}
          </View>
        </ScrollView>

        <View className="border-t border-divider px-page pb-page pt-compact">
          <View className="mx-auto w-full max-w-[560px] gap-field">
            {!!saveError && (
              <UiText textRole="captionDestructive" accessibilityLiveRegion="polite" selectable>
                {saveError}
              </UiText>
            )}
            <View className="flex-row gap-field">
              <Button variant="surface" className="flex-1" disabled={isUpdating} onPress={goBack}>
                {registration.step === 'agreement' ? 'Cancel' : 'Back'}
              </Button>
              <Button
                className="flex-1"
                disabled={
                  isUpdating ||
                  (registration.step === 'agreement' && !registration.agreementAccepted)
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
      </View>
    </KeyboardAvoidingView>
  )
}
