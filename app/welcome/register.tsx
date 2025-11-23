import { useState, useMemo, useEffect } from 'react'
import { YStack, XStack, Text, Button, Input, H2, ScrollView, Label, AnimatePresence } from 'tamagui'
import { Eye, EyeOff, Check, Bell, Clock, User, Mail, Lock, Ruler, Weight } from '@tamagui/lucide-icons'
import { useRouter } from 'expo-router'
import { useToastController } from '@tamagui/toast'
import { useAuth } from '../../contexts/AuthContext'
import { useAuthStore } from '../../stores/authStore'
import { useUpdateUser } from '../../hooks/useUpdateUser'
import WheelSelector from '../../components/ui/WheelSelector'
import TimeZoneSelector from '../../components/TimeZoneSelector'
import NotificationPermissions from '../../components/NotificationPermissions'
import * as Notifications from 'expo-notifications'
import { Platform, Alert, KeyboardAvoidingView, NativeModules } from 'react-native'
import { startActivityAsync, ActivityAction } from 'expo-intent-launcher';
import * as Linking from 'expo-linking'
import * as Application from 'expo-application'
import * as Haptics from 'expo-haptics'
import { GoogleSignInButton } from '../../components/GoogleSignInButton'
import { useSettingsStore } from 'stores/settingsStore'

const STEPS = ['Account', 'Personal', 'Body', 'Time Zone', 'Notifications']

const InputField = ({ icon: Icon, ...props }: any) => (
  <XStack
    bg="$color3"
    borderColor="$color5"
    borderWidth={1}
    rounded="$4"
    items="center"
    px="$3"
    animation="fast"
    pressStyle={{ borderColor: '$blue9' }}
    focusStyle={{ borderColor: '$blue9' }}
  >
    {Icon && <Icon size={20} color="$color9" />}
    <Input
      flex={1}
      unstyled
      py="$3"
      px="$3"
      color="$color12"
      placeholderTextColor="$color9"
      {...props}
    />
  </XStack>
)

const RegisterPage = () => {
  const router = useRouter()
  const toast = useToastController()
  const { register, user } = useAuth()
  const { updateUserProfile } = useUpdateUser()
  
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Effect to pre-fill data if user is already authenticated (e.g. Google Sign-In or redirected)
  useEffect(() => {
    if (user && !initialized) {
      if (user.email) setEmail(user.email)
      if (user.username) setUsername(user.username)
      if (user.firstName) setFirstName(user.firstName)
      if (user.lastName) setLastName(user.lastName)

      // If we have a user, we skip the account creation step
      setIsGoogleAuth(true)
      setStep(1)
      setInitialized(true)
      
      toast.show('Complete Profile', { 
        message: 'Please complete your profile details to continue.',
        duration: 3000
      })
    }
  }, [user, initialized])

  // Step 1: Account
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isGoogleAuth, setIsGoogleAuth] = useState(false)

  // Step 2: Personal
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Step 3: Body
  const [weight, setWeight] = useState<number | null>(70)
  const [heightVal, setHeightVal] = useState<number | null>(170)
  const [weightUnit, setWeightUnitState] = useState<'kg' | 'lb'>('kg')
  const [heightUnit, setHeightUnitState] = useState<'cm' | 'in'>('cm')

  // Step 4: Time Zone
  const [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')

  // Step 5: Notifications
  const [streakFreq, setStreakFreq] = useState(1)
  const [notificationsAllowed, setNotificationsAllowed] = useState(false)

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

  const onSelectWeight = (val: number | null) => {
    if (val === null) {
      setWeight(null)
      return
    }
    const kg = weightUnit === 'kg' ? val : val / 2.20462
    setWeight(Math.round(kg * 100) / 100)
    Haptics.selectionAsync()
  }

  const onSelectHeight = (val: number | null) => {
    if (val === null) {
      setHeightVal(null)
      return
    }
    const cm = heightUnit === 'cm' ? val : val * 2.54
    setHeightVal(Math.round(cm))
    Haptics.selectionAsync()
  }

  // --- Validation ---
  const isStepValid = () => {
    return true

    switch (step) {
      case 0: // Account
        return (
          email.length > 0 &&
          username.length > 0 &&
          password.length >= 6 &&
          password === confirmPassword
        )
      case 1: // Personal
        return firstName.length > 0 && lastName.length > 0
      case 2: // Body
        return weight !== null && heightVal !== null
      case 3: // Time Zone
        return true
      case 4: // Notifications
        return true
      default:
        return false
    }
  }

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setDirection(1)
      setStep(step + 1)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } else {
      handleRegister()
    }
  }

  const handleBack = () => {
    // If Google Auth, prevent going back to step 0 (Account)
    if (isGoogleAuth && step === 1) {
      router.back()
      return
    }

    if (step > 0) {
      setDirection(-1)
      setStep(step - 1)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } else {
      router.back()
    }
  }

  const handleGoogleSuccess = async (idToken: string) => {
    setIsGoogleAuth(true)
    // Fetch user details to pre-fill form
    try {
      const { user } = useAuthStore.getState()
      if (user) {
        if (user.firstName) setFirstName(user.firstName)
        if (user.lastName) setLastName(user.lastName)
      }

      // Move to next step
      setDirection(1)
      setStep(1)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (error) {
      console.error('Error fetching user details after Google Sign-In:', error)
    }
  }

  const handleRegister = async () => {
    setIsLoading(true)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    try {
      if (!isGoogleAuth) {
        await register({
          email,
          username,
          firstName,
          lastName,
          password,
        })
      }

      await updateUserProfile({
        timezone: timeZone,
        measurements: {
          weightKg: weight,
          heightCm: heightVal,
        },
        registrationCompleted: true,
      })
      router.replace('/(tabs)' as any)
      toast.show('Welcome!', { message: 'Account created successfully.', customData: { type: 'success' } })
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      const serverMsg = err?.message || 'Please try again.'
      toast.show('Registration failed', { message: serverMsg, customData: { type: 'error' } })
    } finally {
      setIsLoading(false)
    }
  }

  // --- Render Components ---


  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <YStack gap="$4">
            <YStack gap="$2">
              <Label color="$color11" fontSize="$3">Email</Label>
              <InputField icon={Mail} placeholder="hello@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            </YStack>
            <YStack gap="$2">
              <Label color="$color11" fontSize="$3">Username</Label>
              <InputField icon={User} placeholder="username" value={username} onChangeText={setUsername} autoCapitalize="none" />
            </YStack>
            <YStack gap="$2">
              <Label color="$color11" fontSize="$3">Password</Label>
              <XStack bg="$color3" borderColor="$color5" borderWidth={1} rounded="$4" items="center" px="$3">
                <Lock size={20} color="$color9" />
                <Input
                  flex={1}
                  unstyled
                  py="$3"
                  px="$3"
                  placeholder="Min 6 characters"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  color="$color12"
                  placeholderTextColor="$color9"
                />
                <Button chromeless p="$2" onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={20} color="$color9" /> : <Eye size={20} color="$color9" />}
                </Button>
              </XStack>
            </YStack>
            <YStack gap="$2">
              <Label color="$color11" fontSize="$3">Confirm Password</Label>
              <XStack bg="$color3" borderColor="$color5" borderWidth={1} rounded="$4" items="center" px="$3">
                <Lock size={20} color="$color9" />
                <Input
                  flex={1}
                  unstyled
                  py="$3"
                  px="$3"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  color="$color12"
                  placeholderTextColor="$color9"
                />
                <Button chromeless p="$2" onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  {showConfirmPassword ? <EyeOff size={20} color="$color9" /> : <Eye size={20} color="$color9" />}
                </Button>
              </XStack>
            </YStack>

            <XStack items="center" gap="$3" my="$2">
              <YStack height={1} flex={1} bg="$color6" />
              <Text color="$color10" fontSize="$3">OR</Text>
              <YStack height={1} flex={1} bg="$color6" />
            </XStack>

            <GoogleSignInButton onSuccess={handleGoogleSuccess} />
          </YStack >
        )
      case 1:
        return (
          <YStack gap="$4">
            <YStack gap="$2">
              <Label color="$color11" fontSize="$3">First Name</Label>
              <InputField placeholder="Jane" value={firstName} onChangeText={setFirstName} />
            </YStack>
            <YStack gap="$2">
              <Label color="$color11" fontSize="$3">Last Name</Label>
              <InputField placeholder="Doe" value={lastName} onChangeText={setLastName} />
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
                    onPress={() => { setWeightUnitState('kg'); Haptics.selectionAsync() }}
                    rounded="$3"
                  >kg</Button>
                  <Button
                    size="$2"
                    chromeless
                    bg={weightUnit === 'lb' ? '$background' : 'transparent'}
                    onPress={() => { setWeightUnitState('lb'); Haptics.selectionAsync() }}
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
                    onPress={() => { setHeightUnitState('cm'); Haptics.selectionAsync() }}
                    rounded="$3"
                  >cm</Button>
                  <Button
                    size="$2"
                    chromeless
                    bg={heightUnit === 'in' ? '$background' : 'transparent'}
                    onPress={() => { setHeightUnitState('in'); Haptics.selectionAsync() }}
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
            <YStack gap="$2">
              <Label color="$color11" fontSize="$3">Time Zone</Label>
              <TimeZoneSelector value={timeZone} onValueChange={setTimeZone} />
            </YStack>
          </YStack>
        )
      case 4:
        return (
          <YStack gap="$4">
            <NotificationPermissions
              onStatusChange={({ notifications }) => setNotificationsAllowed(notifications)}
            />

            <YStack bg="$color2" p="$4" rounded="$6" gap="$3">
              <XStack gap="$3" items="center" mb="$2">
                <YStack bg="$surfaceHover" p="$2" rounded="$4">
                  <Clock size={20} color="$secondary" />
                </YStack>
                <YStack>
                  <Text fontWeight="600">Streak Reminders</Text>
                  <Text fontSize="$2" color="$color11">How often should we remind you?</Text>
                </YStack>
              </XStack>

              <XStack gap="$2" justify="space-between">
                {[0, 1, 2, 3].map(n => (
                  <Button
                    key={n}
                    flex={1}
                    size="$3"
                    bg={streakFreq === n ? '$blue9' : '$color4'}
                    onPress={() => { setStreakFreq(n); Haptics.selectionAsync() }}
                    color={streakFreq === n ? 'white' : '$color11'}
                    pressStyle={{ opacity: 0.8 }}
                    animation="fast"
                  >
                    {`${n}`}
                  </Button>
                ))}
              </XStack>
            </YStack>
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
        <YStack mb="$6">
          <H2 fontSize="$8" fontWeight="bold" mb="$4">Create Account</H2>

          {/* Step Indicator */}
          <YStack>
            <XStack gap="$2" mb="$2">
              {STEPS.map((s, i) => {
                // Special styling for locked step 0 during Google Auth
                const isLockedStep = isGoogleAuth && i === 0
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
        <XStack gap="$3" mt="$2">
          <Button
            flex={1}
            variant="outlined"
            onPress={handleBack}
            disabled={isLoading}
            borderColor="$color5"
            color="$color11"
          >
            {step === 0 || (isGoogleAuth && step === 1) ? 'Cancel' : 'Back'}
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
            {isLoading ? 'Creating...' : step === STEPS.length - 1 ? 'Finish' : 'Next'}
          </Button>
        </XStack>
      </YStack>
    </KeyboardAvoidingView>
  )
}

export default RegisterPage
