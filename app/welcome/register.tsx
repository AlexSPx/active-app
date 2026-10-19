import { useState, useMemo, useEffect, useCallback } from 'react'
import { Link, useRouter } from 'expo-router'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import Animated, {
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  FadeOut,
} from 'react-native-reanimated'
import { Clock, Ruler, Weight } from 'lucide-react-native'
import {
  Button,
  SegmentedSelection,
  Surface,
  TextField,
  UiText,
  type SegmentedOption,
} from '../../components/ui/Controls'
import { useCadenceColors } from '../../components/ui/useCadenceColors'
import { useFeedback } from '../../components/feedback/FeedbackProvider'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuthStore } from '../../stores/authStore'
import { useUpdateUser } from '../../features/settings'
import WheelSelector from '../../components/ui/WheelSelector'
import TimeZoneSelector from '../../components/TimeZoneSelector'
import NotificationPermissions from '../../components/NotificationPermissions'
import * as Haptics from 'expo-haptics'
import { WorkOSSignInButton } from '../../components/WorkOSSignInButton'
import { registrationFormSchema, type RegistrationFormData } from '../../lib/schemas/forms'
import { launchFacade } from '../../features/launch/launchFacade'
import LocalProfileRegistration from '../../features/onboarding/components/LocalProfileRegistration'

const WEIGHT_UNIT_OPTIONS: readonly SegmentedOption<RegistrationFormData['weightUnit']>[] = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
]

const HEIGHT_UNIT_OPTIONS: readonly SegmentedOption<RegistrationFormData['heightUnit']>[] = [
  { value: 'cm', label: 'cm' },
  { value: 'in', label: 'in' },
]

const RegisterPage = () =>
  launchFacade.auth.getStartupPlan().kind === 'local-profile' ? (
    <LocalProfileRegistration />
  ) : (
    <AccountRegisterPage />
  )

const AccountRegisterPage = () => {
  const localProfile = launchFacade.auth.getStartupPlan().kind === 'local-profile'
  const STEPS = localProfile
    ? ['Account', 'Personal', 'Body', 'Notifications']
    : ['Account', 'Personal', 'Body', 'Time Zone', 'Notifications']
  const router = useRouter()
  const toast = useFeedback()
  const colors = useCadenceColors()
  const { user, logout } = useAuthStore()
  const { updateUserProfile } = useUpdateUser()

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const accountStep = launchFacade.onboarding.accountStep()

  const {
    watch,
    setValue,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationFormSchema),
    defaultValues: {
      email: '',
      isWorkOSAuth: false,
      username: '',
      firstName: '',
      lastName: '',
      weight: 70,
      height: 170,
      weightUnit: 'kg',
      heightUnit: 'cm',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      notificationFrequency: 1,
    },
    mode: 'onChange',
  })

  // Watch form values
  const isWorkOSAuth = watch('isWorkOSAuth')
  const username = watch('username')
  const firstName = watch('firstName')
  const lastName = watch('lastName')
  const weight = watch('weight')
  const heightVal = watch('height')
  const weightUnit = watch('weightUnit')
  const heightUnit = watch('heightUnit')
  const timezone = watch('timezone')
  const streakFreq = watch('notificationFrequency')

  // Effect to pre-fill data if user is already authenticated
  useEffect(() => {
    const initialization = launchFacade.onboarding.initialization(user)
    if (!initialization || initialized) return
    const values = initialization.values
    if (values.email) setValue('email', values.email)
    if (values.username) setValue('username', values.username)
    if (values.firstName) setValue('firstName', values.firstName)
    if (values.lastName) setValue('lastName', values.lastName)
    if (values.timezone) setValue('timezone', values.timezone)
    if (values.isWorkOSAuth) setValue('isWorkOSAuth', true)
    if (initialization.startAt !== null) setStep(initialization.startAt)
    setInitialized(true)
    if (initialization.notice) {
      toast.show('Complete Profile', {
        message: initialization.notice,
        duration: 3000,
      })
    }
  }, [user, initialized, setValue, toast])

  // --- Helpers for Body Step ---
  const weightValuesKg = useMemo(
    () =>
      Array.from({ length: Math.floor((200 - 30) / 0.5) + 1 }, (_, i) =>
        Number((30 + i * 0.5).toFixed(1))
      ),
    []
  )
  const weightValuesLb = useMemo(() => Array.from({ length: 440 - 70 + 1 }, (_, i) => 70 + i), [])
  const heightValuesCm = useMemo(() => Array.from({ length: 220 - 120 + 1 }, (_, i) => 120 + i), [])
  const heightValuesIn = useMemo(() => Array.from({ length: 86 - 48 + 1 }, (_, i) => 48 + i), [])

  const displayWeight = useMemo(() => {
    if (weight === null) return null
    return weightUnit === 'kg' ? Number(weight.toFixed(1)) : Math.round(weight * 2.20462)
  }, [weight, weightUnit])

  const displayHeight = useMemo(() => {
    if (heightVal === null) return null
    return heightUnit === 'cm' ? Math.round(heightVal) : Math.round(heightVal / 2.54)
  }, [heightVal, heightUnit])

  const onSelectWeight = useCallback(
    (val: number | null) => {
      if (val === null) {
        setValue('weight', null)
        return
      }
      const kg = weightUnit === 'kg' ? val : val / 2.20462
      setValue('weight', Math.round(kg * 100) / 100)
      Haptics.selectionAsync()
    },
    [weightUnit, setValue]
  )

  const onSelectHeight = useCallback(
    (val: number | null) => {
      if (val === null) {
        setValue('height', null)
        return
      }
      const cm = heightUnit === 'cm' ? val : val * 2.54
      setValue('height', Math.round(cm))
      Haptics.selectionAsync()
    },
    [heightUnit, setValue]
  )

  // --- Step Validation ---
  const isStepValid = useCallback(
    () =>
      launchFacade.onboarding.isStepValid(step, {
        firstName,
        lastName,
        username,
        weight,
        height: heightVal,
      }),
    [step, firstName, lastName, username, weight, heightVal]
  )

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setDirection(1)
      setStep(step + 1)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } else {
      handleRegister()
    }
  }, [step])

  const backAction = launchFacade.onboarding.backAction({ step, isWorkOSAuth })
  const handleBack = useCallback(async () => {
    switch (backAction) {
      case 'sign-out':
        await logout()
        router.replace('/')
        return
      case 'previous-step':
        setDirection(-1)
        setStep(step - 1)
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        return
      case 'leave-registration':
        router.back()
        return
    }
  }, [backAction, step, logout, router])

  const handleWorkOSSuccess = useCallback(
    async (code: string) => {
      setValue('isWorkOSAuth', true)
      try {
        const { user } = useAuthStore.getState()
        if (user) {
          if (user.firstName) setValue('firstName', user.firstName)
          if (user.lastName) setValue('lastName', user.lastName)
          if (user.email) setValue('email', user.email)
          if (user.username) setValue('username', user.username)
        }

        setDirection(1)
        setStep(1)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } catch (error) {
        console.error('Error fetching user details after WorkOS Sign-In:', error)
      }
    },
    [setValue]
  )

  const handleRegister = useCallback(async () => {
    setIsLoading(true)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    try {
      const data = getValues()
      const submissionError = launchFacade.onboarding.submissionError({
        isWorkOSAuth: data.isWorkOSAuth,
        registrationCompleted: user?.registrationCompleted,
      })
      if (submissionError) throw new Error(submissionError)

      const updateUserRequest = launchFacade.onboarding.createProfileUpdate({
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        timezone: data.timezone,
        weight: data.weight,
        height: data.height,
        notificationFrequency: data.notificationFrequency,
      })
      const saved = await updateUserProfile(updateUserRequest, {
        bodyWeightUnit: data.weightUnit,
        heightUnit: data.heightUnit,
      })
      if (!saved) {
        throw new Error('Could not save profile')
      }

      router.replace('/(tabs)' as any)
      toast.show('Welcome!', {
        message: 'Account created successfully.',
      })
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      const serverMsg = err?.message || 'Please try again.'
      toast.show('Registration failed', { message: serverMsg })
    } finally {
      setIsLoading(false)
    }
  }, [getValues, user, updateUserProfile, router, toast])

  // --- Render Components ---
  const renderStepContent = () => {
    switch (STEPS[step]) {
      case 'Account':
        return (
          <View className="mt-section items-center gap-section">
            <UiText textRole="bodyMuted" className="text-center">
              {accountStep.description}
            </UiText>
            {accountStep.action.kind === 'continue' ? (
              <Button
                variant="primary"
                className="w-full"
                onPress={() => {
                  setDirection(1)
                  setStep(1)
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                }}
              >
                <UiText textRole="buttonOnAccent">{accountStep.action.label}</UiText>
              </Button>
            ) : (
              <WorkOSSignInButton
                onSuccess={handleWorkOSSuccess}
                label={accountStep.action.label}
              />
            )}

            <UiText textRole="caption" className="px-compact text-center">
              {accountStep.action.kind === 'continue'
                ? 'By setting up a local profile, you agree to our '
                : 'By creating an account, you agree to our '}
              <Link href="/legal/terms-of-service" asChild>
                <UiText accessibilityRole="link" className="text-accent underline">
                  Terms of Service
                </UiText>
              </Link>{' '}
              and{' '}
              <Link href="/legal/privacy-policy" asChild>
                <UiText accessibilityRole="link" className="text-accent underline">
                  Privacy Policy
                </UiText>
              </Link>
              .
            </UiText>
          </View>
        )
      case 'Personal':
        return (
          <View className="gap-field">
            <View className="gap-compact">
              <UiText textRole="bodyEmphasis">Username</UiText>
              <TextField
                accessibilityLabel="Username"
                placeholder="coolrunner123"
                value={username}
                onChangeText={(val) => setValue('username', val)}
              />
            </View>
            <View className="gap-compact">
              <UiText textRole="bodyEmphasis">First Name</UiText>
              <TextField
                accessibilityLabel="First Name"
                placeholder="Jane"
                value={firstName}
                onChangeText={(val) => setValue('firstName', val)}
              />
            </View>
            <View className="gap-compact">
              <UiText textRole="bodyEmphasis">Last Name</UiText>
              <TextField
                accessibilityLabel="Last Name"
                placeholder="Doe"
                value={lastName}
                onChangeText={(val) => setValue('lastName', val)}
              />
            </View>
          </View>
        )
      case 'Body':
        return (
          <View className="gap-field">
            <Surface className="gap-field">
              <View className="flex-row items-center justify-between gap-field">
                <View className="flex-row items-center gap-compact">
                  <Weight size={20} color={colors.accent} aria-hidden />
                  <UiText textRole="cardTitle">Weight</UiText>
                </View>
                <SegmentedSelection
                  value={weightUnit}
                  options={WEIGHT_UNIT_OPTIONS}
                  onValueChange={(unit) => {
                    setValue('weightUnit', unit)
                    Haptics.selectionAsync()
                  }}
                  accessibilityLabel="Weight unit"
                />
              </View>
              <WheelSelector
                values={weightUnit === 'kg' ? weightValuesKg : weightValuesLb}
                selected={displayWeight}
                onChange={onSelectWeight}
                formatItem={(v) =>
                  weightUnit === 'kg' ? Number(v).toFixed(1) : Math.round(Number(v)).toString()
                }
                itemHeight={40}
              />
            </Surface>

            <Surface className="gap-field">
              <View className="flex-row items-center justify-between gap-field">
                <View className="flex-row items-center gap-compact">
                  <Ruler size={20} color={colors.accent} aria-hidden />
                  <UiText textRole="cardTitle">Height</UiText>
                </View>
                <SegmentedSelection
                  value={heightUnit}
                  options={HEIGHT_UNIT_OPTIONS}
                  onValueChange={(unit) => {
                    setValue('heightUnit', unit)
                    Haptics.selectionAsync()
                  }}
                  accessibilityLabel="Height unit"
                />
              </View>
              <WheelSelector
                values={heightUnit === 'cm' ? heightValuesCm : heightValuesIn}
                selected={displayHeight}
                onChange={onSelectHeight}
                formatItem={(v) => Math.round(Number(v)).toString()}
                itemHeight={40}
              />
            </Surface>
          </View>
        )
      case 'Time Zone':
        return (
          <Surface className="gap-field">
            <View className="flex-row items-center gap-compact">
              <Clock size={20} color={colors.accent} aria-hidden />
              <UiText textRole="cardTitle">Time Zone</UiText>
            </View>
            <TimeZoneSelector value={timezone} onValueChange={(tz) => setValue('timezone', tz)} />
          </Surface>
        )
      case 'Notifications':
        return <NotificationPermissions onStatusChange={() => {}} />
      default:
        return null
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="mx-auto w-full max-w-[560px] flex-1 px-page pb-page pt-section">
        <Animated.View entering={FadeInUp.duration(180)} className="mb-section">
          <UiText accessibilityRole="header" textRole="screenTitle" className="mb-field">
            {launchFacade.onboarding.title()}
          </UiText>

          <View
            className="mb-compact flex-row gap-compact"
            accessibilityRole="progressbar"
            accessibilityLabel="Registration progress"
            accessibilityValue={{
              min: 1,
              max: STEPS.length,
              now: step + 1,
              text: `Step ${step + 1} of ${STEPS.length}`,
            }}
          >
            {STEPS.map((s, i) => {
              const isLockedStep = isWorkOSAuth && i === 0
              const isActive = i <= step

              return (
                <View
                  key={s}
                  className={`h-1 flex-1 rounded-full ${isLockedStep || isActive ? 'bg-accent' : 'bg-divider'}`}
                />
              )
            })}
          </View>
          <View className="flex-row justify-between">
            <UiText textRole="captionEmphasis">{STEPS[step]}</UiText>
            <UiText textRole="caption">
              Step {step + 1} of {STEPS.length}
            </UiText>
          </View>
        </Animated.View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            key={step}
            entering={direction > 0 ? FadeInRight.duration(180) : FadeInLeft.duration(180)}
            exiting={FadeOut.duration(120)}
            className="gap-section pb-section"
          >
            {renderStepContent()}
          </Animated.View>
        </ScrollView>

        <Animated.View entering={FadeInDown.duration(180)} className="mt-field flex-row gap-field">
          <Button variant="surface" className="flex-1" onPress={handleBack} disabled={isLoading}>
            <UiText textRole="bodyEmphasis">
              {backAction === 'leave-registration' || backAction === 'sign-out' ? 'Cancel' : 'Back'}
            </UiText>
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onPress={handleNext}
            disabled={!isStepValid() || isLoading}
          >
            <UiText textRole="buttonOnAccent">
              {isLoading ? 'Creating...' : step === STEPS.length - 1 ? 'Finish' : 'Next'}
            </UiText>
          </Button>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  )
}

export default RegisterPage
