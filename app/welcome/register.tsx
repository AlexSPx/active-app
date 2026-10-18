import { useState, useMemo, useEffect, useCallback } from 'react'
import { YStack, XStack, Text, Button, H2, ScrollView, Label, AnimatePresence } from 'tamagui'
import { Clock, Ruler, Weight } from '../../components/ui/icons'
import { useRouter, Link } from 'expo-router'
import { useFeedback } from '../../components/feedback/FeedbackProvider'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuthStore } from '../../stores/authStore'
import { useUpdateUser } from '../../features/settings'
import WheelSelector from '../../components/ui/WheelSelector'
import TimeZoneSelector from '../../components/TimeZoneSelector'
import NotificationPermissions from '../../components/NotificationPermissions'
import { Platform, KeyboardAvoidingView } from 'react-native'
import * as Haptics from 'expo-haptics'
import { WorkOSSignInButton } from '../../components/WorkOSSignInButton'
import { InputField } from '../../components/ui/InputField'
import { registrationFormSchema, type RegistrationFormData } from '../../lib/schemas/forms'
import { launchFacade } from '../../features/launch/launchFacade'

const RegisterPage = () => {
  const localProfile = launchFacade.auth.getStartupPlan().kind === 'local-profile'
  const STEPS = localProfile
    ? ['Account', 'Personal', 'Body', 'Notifications']
    : ['Account', 'Personal', 'Body', 'Time Zone', 'Notifications']
  const router = useRouter()
  const toast = useFeedback()
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
          <YStack gap="$4" items="center" mt="$6">
            <Text fontSize="$5" style={{ textAlign: 'center' }} color="$color11" mb="$4">
              {accountStep.description}
            </Text>
            {accountStep.action.kind === 'continue' ? (
              <Button
                size="$5"
                bg="$blue9"
                rounded="$6"
                width="100%"
                onPress={() => {
                  setDirection(1)
                  setStep(1)
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                }}
                pressStyle={{ bg: '$blue10', scale: 0.98 }}
                animation="fast"
              >
                <Text color="white" fontWeight="700" fontSize="$4">
                  {accountStep.action.label}
                </Text>
              </Button>
            ) : (
              <WorkOSSignInButton
                onSuccess={handleWorkOSSuccess}
                label={accountStep.action.label}
              />
            )}

            <Text fontSize="$2" color="$color11" style={{ textAlign: 'center' }} mt="$2" px="$2">
              {accountStep.action.kind === 'continue'
                ? 'By setting up a local profile, you agree to our '
                : 'By creating an account, you agree to our '}
              <Link href="/legal/terms-of-service" asChild>
                <Text color="$blue9" textDecorationLine="underline">
                  Terms of Service
                </Text>
              </Link>{' '}
              and{' '}
              <Link href="/legal/privacy-policy" asChild>
                <Text color="$blue9" textDecorationLine="underline">
                  Privacy Policy
                </Text>
              </Link>
              .
            </Text>
          </YStack>
        )
      case 'Personal':
        return (
          <YStack gap="$4">
            <YStack gap="$2">
              <Label color="$color11" fontSize="$3">
                Username
              </Label>
              <InputField
                placeholder="coolrunner123"
                value={username}
                onChangeText={(val) => setValue('username', val)}
              />
            </YStack>
            <YStack gap="$2">
              <Label color="$color11" fontSize="$3">
                First Name
              </Label>
              <InputField
                placeholder="Jane"
                value={firstName}
                onChangeText={(val) => setValue('firstName', val)}
              />
            </YStack>
            <YStack gap="$2">
              <Label color="$color11" fontSize="$3">
                Last Name
              </Label>
              <InputField
                placeholder="Doe"
                value={lastName}
                onChangeText={(val) => setValue('lastName', val)}
              />
            </YStack>
          </YStack>
        )
      case 'Body':
        return (
          <YStack gap="$4">
            <YStack bg="$color2" p="$4" rounded="$6" gap="$4">
              <XStack justify="space-between" items="center">
                <XStack gap="$2" items="center">
                  <Weight size={20} color="$blue9" />
                  <Text fontWeight="600" fontSize="$5">
                    Weight
                  </Text>
                </XStack>
                <XStack bg="$color4" p="$1" rounded="$4">
                  <Button
                    size="$2"
                    chromeless
                    bg={weightUnit === 'kg' ? '$background' : 'transparent'}
                    onPress={() => {
                      setValue('weightUnit', 'kg')
                      Haptics.selectionAsync()
                    }}
                    rounded="$3"
                  >
                    kg
                  </Button>
                  <Button
                    size="$2"
                    chromeless
                    bg={weightUnit === 'lb' ? '$background' : 'transparent'}
                    onPress={() => {
                      setValue('weightUnit', 'lb')
                      Haptics.selectionAsync()
                    }}
                    rounded="$3"
                  >
                    lb
                  </Button>
                </XStack>
              </XStack>
              <WheelSelector
                values={weightUnit === 'kg' ? weightValuesKg : weightValuesLb}
                selected={displayWeight}
                onChange={(v) => onSelectWeight(v as number | null)}
                formatItem={(v) =>
                  weightUnit === 'kg' ? Number(v).toFixed(1) : Math.round(Number(v)).toString()
                }
                itemHeight={40}
              />
            </YStack>

            <YStack bg="$color2" p="$4" rounded="$6" gap="$4">
              <XStack justify="space-between" items="center">
                <XStack gap="$2" items="center">
                  <Ruler size={20} color="$blue9" />
                  <Text fontWeight="600" fontSize="$5">
                    Height
                  </Text>
                </XStack>
                <XStack bg="$color4" p="$1" rounded="$4">
                  <Button
                    size="$2"
                    chromeless
                    bg={heightUnit === 'cm' ? '$background' : 'transparent'}
                    onPress={() => {
                      setValue('heightUnit', 'cm')
                      Haptics.selectionAsync()
                    }}
                    rounded="$3"
                  >
                    cm
                  </Button>
                  <Button
                    size="$2"
                    chromeless
                    bg={heightUnit === 'in' ? '$background' : 'transparent'}
                    onPress={() => {
                      setValue('heightUnit', 'in')
                      Haptics.selectionAsync()
                    }}
                    rounded="$3"
                  >
                    in
                  </Button>
                </XStack>
              </XStack>
              <WheelSelector
                values={heightUnit === 'cm' ? heightValuesCm : heightValuesIn}
                selected={displayHeight}
                onChange={(v) => onSelectHeight(v as number | null)}
                formatItem={(v) => Math.round(Number(v)).toString()}
                itemHeight={40}
              />
            </YStack>
          </YStack>
        )
      case 'Time Zone':
        return (
          <YStack gap="$4">
            <YStack bg="$color2" p="$4" rounded="$6" gap="$4">
              <XStack gap="$2" items="center">
                <Clock size={20} color="$blue9" />
                <Text fontWeight="600" fontSize="$5">
                  Time Zone
                </Text>
              </XStack>
              <TimeZoneSelector value={timezone} onValueChange={(tz) => setValue('timezone', tz)} />
            </YStack>
          </YStack>
        )
      case 'Notifications':
        return (
          <YStack gap="$4">
            <NotificationPermissions onStatusChange={() => {}} />
          </YStack>
        )
      default:
        return null
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <YStack flex={1} bg="$background" px="$4" pt="$8" pb="$4">
        {/* Header */}
        <YStack mb="$6" animation="quick" enterStyle={{ opacity: 0, y: -20 }} opacity={1} y={0}>
          <H2 fontSize="$8" fontWeight="bold" mb="$4">
            {launchFacade.onboarding.title()}
          </H2>

          {/* Step Indicator */}
          <YStack>
            <XStack gap="$2" mb="$2">
              {STEPS.map((s, i) => {
                const isLockedStep = isWorkOSAuth && i === 0
                const isActive = i <= step

                return (
                  <YStack
                    key={s}
                    flex={1}
                    height={4}
                    bg={isLockedStep ? '$success' : isActive ? '$blue9' : '$color4'}
                    rounded="$4"
                    animation="fast"
                  />
                )
              })}
            </XStack>
            <XStack justify="space-between">
              <Text fontSize="$3" fontWeight="600" color="$color11">
                {STEPS[step]}
              </Text>
              <Text fontSize="$3" color="$color10">
                Step {step + 1} of {STEPS.length}
              </Text>
            </XStack>
          </YStack>
        </YStack>

        {/* Content with Animation */}
        <ScrollView flex={1} showsVerticalScrollIndicator={false}>
          <AnimatePresence exitBeforeEnter custom={{ direction }} initial={false}>
            <YStack
              key={step}
              animation="fast"
              enterStyle={{ opacity: 0, x: direction * 10, scale: 0.95 }}
              exitStyle={{ opacity: 0, x: direction * -10, scale: 0.95 }}
              x={0}
              scale={1}
              opacity={1}
              pb="$8"
            >
              {renderStepContent()}
            </YStack>
          </AnimatePresence>
        </ScrollView>

        {/* Footer Navigation */}
        <XStack
          gap="$3"
          mt="$2"
          animation="quick"
          enterStyle={{ opacity: 0, y: 20 }}
          opacity={1}
          y={0}
        >
          <Button
            flex={1}
            variant="outlined"
            onPress={handleBack}
            disabled={isLoading}
            borderColor="$color5"
            color="$color11"
          >
            <Text>
              {backAction === 'leave-registration' || backAction === 'sign-out' ? 'Cancel' : 'Back'}
            </Text>
          </Button>
          <Button
            flex={1}
            bg="$blue9"
            onPress={handleNext}
            disabled={!isStepValid() || isLoading}
            opacity={!isStepValid() ? 0.5 : 1}
            pressStyle={{ bg: '$blue10', scale: 0.98 }}
            animation="fast"
          >
            <Text>{isLoading ? 'Creating...' : step === STEPS.length - 1 ? 'Finish' : 'Next'}</Text>
          </Button>
        </XStack>
      </YStack>
    </KeyboardAvoidingView>
  )
}

export default RegisterPage
