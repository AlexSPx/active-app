import { useState, useMemo, useEffect, useCallback } from 'react'
import { YStack, XStack, Text, Button, H2, ScrollView, Label, AnimatePresence } from 'tamagui'
import { Clock, Ruler, Weight } from '@tamagui/lucide-icons'
import { useRouter, Link } from 'expo-router'
import { useToastController } from '@tamagui/toast'
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
import { UpdateUserRequest } from 'types/api'
import { registrationFormSchema, type RegistrationFormData } from '../../lib/schemas/forms'

const STEPS = ['Account', 'Personal', 'Body', 'Time Zone', 'Notifications']

const RegisterPage = () => {
  const router = useRouter()
  const toast = useToastController()
  const { user, logout } = useAuthStore()
  const { updateUserProfile } = useUpdateUser()

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)

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
    if (user && !initialized && !user.registrationCompleted) {
      if (user.email) setValue('email', user.email)
      if (user.username) setValue('username', user.username)
      if (user.firstName) setValue('firstName', user.firstName)
      if (user.lastName) setValue('lastName', user.lastName)

      setValue('isWorkOSAuth', true)
      setStep(1)
      setInitialized(true)

      toast.show('Complete Profile', {
        message: 'Please complete your profile details to continue.',
        duration: 3000,
      })
    }
  }, [user, initialized, setValue, toast])

  // --- Helpers for Body Step ---
  const weightValuesKg = useMemo(
    () => Array.from({ length: Math.floor((200 - 30) / 0.5) + 1 }, (_, i) => Number((30 + i * 0.5).toFixed(1))),
    []
  )
  const weightValuesLb = useMemo(
    () => Array.from({ length: 440 - 70 + 1 }, (_, i) => 70 + i),
    []
  )
  const heightValuesCm = useMemo(
    () => Array.from({ length: 220 - 120 + 1 }, (_, i) => 120 + i),
    []
  )
  const heightValuesIn = useMemo(
    () => Array.from({ length: 86 - 48 + 1 }, (_, i) => 48 + i),
    []
  )

  const displayWeight = useMemo(() => {
    if (weight === null) return null
    return weightUnit === 'kg' ? Number(weight.toFixed(1)) : Math.round(weight * 2.20462)
  }, [weight, weightUnit])

  const displayHeight = useMemo(() => {
    if (heightVal === null) return null
    return heightUnit === 'cm' ? Math.round(heightVal) : Math.round(heightVal / 2.54)
  }, [heightVal, heightUnit])

  const onSelectWeight = useCallback((val: number | null) => {
    if (val === null) {
      setValue('weight', null)
      return
    }
    const kg = weightUnit === 'kg' ? val : val / 2.20462
    setValue('weight', Math.round(kg * 100) / 100)
    Haptics.selectionAsync()
  }, [weightUnit, setValue])

  const onSelectHeight = useCallback((val: number | null) => {
    if (val === null) {
      setValue('height', null)
      return
    }
    const cm = heightUnit === 'cm' ? val : val * 2.54
    setValue('height', Math.round(cm))
    Haptics.selectionAsync()
  }, [heightUnit, setValue])

  // --- Step Validation ---
  const isStepValid = useCallback(() => {
    switch (step) {
      case 0: // Account
        return false // WorkOS button handles validation implicitly
      case 1: // Personal
        return firstName.length > 0 && lastName.length > 0 && username.length > 0
      case 2: // Body
        return weight !== null && heightVal !== null
      case 3: // Time Zone
        return true
      case 4: // Notifications
        return true
      default:
        return false
    }
  }, [step, firstName, lastName, username, weight, heightVal])

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setDirection(1)
      setStep(step + 1)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } else {
      handleRegister()
    }
  }, [step])

  const handleBack = useCallback(async () => {
    if (isWorkOSAuth && step === 1) {
      await logout()
      router.replace('/')
      return
    }

    if (step > 0) {
      setDirection(-1)
      setStep(step - 1)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } else {
      router.back()
    }
  }, [isWorkOSAuth, step, logout, router])

  const handleWorkOSSuccess = useCallback(async (code: string) => {
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
  }, [setValue])

  const handleRegister = useCallback(async () => {
    setIsLoading(true)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    try {
      const data = getValues()
      if (!data.isWorkOSAuth || (user && user.registrationCompleted)) {
        throw new Error('Please use WorkOS to sign up.')
      }

      const updateUserRequest: UpdateUserRequest = {
        username: data.username || undefined,
        firstName: data.firstName,
        lastName: data.lastName,
        timezone: data.timezone,
        measurements: {
          weightKg: data.weight,
          heightCm: data.height,
        },
        registrationCompleted: true,
        notificationFrequency: data.notificationFrequency,
      }
      await updateUserProfile(updateUserRequest)

      router.replace('/(tabs)' as any)
      toast.show('Welcome!', { message: 'Account created successfully.', customData: { type: 'success' } })
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      const serverMsg = err?.message || 'Please try again.'
      toast.show('Registration failed', { message: serverMsg, customData: { type: 'error' } })
    } finally {
      setIsLoading(false)
    }
  }, [getValues, user, updateUserProfile, router, toast])

  // --- Render Components ---
  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <YStack gap="$4" items="center" justify="center" flex={1}>
            <Text fontSize="$5" style={{ textAlign: 'center' }} color="$color11" mb="$4">
              Create an account to track your workouts and progress.
            </Text>
            <WorkOSSignInButton onSuccess={handleWorkOSSuccess} label="Sign Up with WorkOS" />

            <Text fontSize="$2" color="$color11" style={{ textAlign: 'center' }} mt="$4">
              By creating an account, you agree to our{' '}
              <Link href="/legal/terms-of-service" asChild>
                <Text color="$blue9" textDecorationLine="underline">Terms of Service</Text>
              </Link>
              {' '}and{' '}
              <Link href="/legal/privacy-policy" asChild>
                <Text color="$blue9" textDecorationLine="underline">Privacy Policy</Text>
              </Link>
              .
            </Text>
          </YStack>
        )
      case 1:
        return (
          <YStack gap="$4">
            <YStack gap="$2">
              <Label color="$color11" fontSize="$3">Username</Label>
              <InputField
                placeholder="coolrunner123"
                value={username}
                onChangeText={(val) => setValue('username', val)}
              />
            </YStack>
            <YStack gap="$2">
              <Label color="$color11" fontSize="$3">First Name</Label>
              <InputField
                placeholder="Jane"
                value={firstName}
                onChangeText={(val) => setValue('firstName', val)}
              />
            </YStack>
            <YStack gap="$2">
              <Label color="$color11" fontSize="$3">Last Name</Label>
              <InputField
                placeholder="Doe"
                value={lastName}
                onChangeText={(val) => setValue('lastName', val)}
              />
            </YStack>
          </YStack>
        )
      case 2:
        return (
          <YStack gap="$4">
            <YStack bg="$color2" p="$4" rounded="$6" gap="$4">
              <XStack justify="space-between" items="center">
                <XStack gap="$2" items="center">
                  <Weight size={20} color="$blue9" />
                  <Text fontWeight="600" fontSize="$5">Weight</Text>
                </XStack>
                <XStack bg="$color4" p="$1" rounded="$4">
                  <Button
                    size="$2"
                    chromeless
                    bg={weightUnit === 'kg' ? '$background' : 'transparent'}
                    onPress={() => { setValue('weightUnit', 'kg'); Haptics.selectionAsync() }}
                    rounded="$3"
                  >kg</Button>
                  <Button
                    size="$2"
                    chromeless
                    bg={weightUnit === 'lb' ? '$background' : 'transparent'}
                    onPress={() => { setValue('weightUnit', 'lb'); Haptics.selectionAsync() }}
                    rounded="$3"
                  >lb</Button>
                </XStack>
              </XStack>
              <WheelSelector
                values={weightUnit === 'kg' ? weightValuesKg : weightValuesLb}
                selected={displayWeight}
                onChange={(v) => onSelectWeight(v as number | null)}
                formatItem={(v) => weightUnit === 'kg' ? Number(v).toFixed(1) : Math.round(Number(v)).toString()}
                itemHeight={40}
              />
            </YStack>

            <YStack bg="$color2" p="$4" rounded="$6" gap="$4">
              <XStack justify="space-between" items="center">
                <XStack gap="$2" items="center">
                  <Ruler size={20} color="$blue9" />
                  <Text fontWeight="600" fontSize="$5">Height</Text>
                </XStack>
                <XStack bg="$color4" p="$1" rounded="$4">
                  <Button
                    size="$2"
                    chromeless
                    bg={heightUnit === 'cm' ? '$background' : 'transparent'}
                    onPress={() => { setValue('heightUnit', 'cm'); Haptics.selectionAsync() }}
                    rounded="$3"
                  >cm</Button>
                  <Button
                    size="$2"
                    chromeless
                    bg={heightUnit === 'in' ? '$background' : 'transparent'}
                    onPress={() => { setValue('heightUnit', 'in'); Haptics.selectionAsync() }}
                    rounded="$3"
                  >in</Button>
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
      case 3:
        return (
          <YStack gap="$4">
            <YStack bg="$color2" p="$4" rounded="$6" gap="$4">
              <XStack gap="$2" items="center">
                <Clock size={20} color="$blue9" />
                <Text fontWeight="600" fontSize="$5">Time Zone</Text>
              </XStack>
              <TimeZoneSelector
                value={timezone}
                onValueChange={(tz) => setValue('timezone', tz)}
              />
            </YStack>
          </YStack>
        )
      case 4:
        return (
          <YStack gap="$4">
            <NotificationPermissions
              onStatusChange={() => {}}
            />
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
        <YStack
          mb="$6"
          animation="quick"
          enterStyle={{ opacity: 0, y: -20 }}
          opacity={1}
          y={0}
        >
          <H2 fontSize="$8" fontWeight="bold" mb="$4">Create Account</H2>

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
              <Text fontSize="$3" fontWeight="600" color="$color11">{STEPS[step]}</Text>
              <Text fontSize="$3" color="$color10">Step {step + 1} of {STEPS.length}</Text>
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
            <Text>{step === 0 || (isWorkOSAuth && step === 1) ? 'Cancel' : 'Back'}</Text>
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
