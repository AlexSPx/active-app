import { useState } from 'react'
import { YStack, XStack, Text, Button, Input, H2 } from 'tamagui'
import { Eye, EyeOff } from '@tamagui/lucide-icons'
import { useRouter } from 'expo-router'
import { useToastController } from '@tamagui/toast'
import { useAuth } from '../../contexts/AuthContext'

const RegisterPage = () => {
  const router = useRouter()
  const toast = useToastController()
  const { register } = useAuth()

  const [formData, setFormData] = useState({
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleRegister = async () => {
    // Basic validation
    if (
      !formData.email ||
      !formData.username ||
      !formData.firstName ||
      !formData.lastName ||
      !formData.password
    ) {
      toast.show('Missing fields', {
        message: 'Please fill in all fields.',
        customData: { type: 'warning' },
      })
      return
    }

    if (formData.password !== formData.confirmPassword) {
      toast.show('Passwords do not match', {
        message: 'Please re-enter matching passwords.',
        customData: { type: 'error' },
      })
      return
    }

    if (formData.password.length < 6) {
      toast.show('Weak password', {
        message: 'Password must be at least 6 characters.',
        customData: { type: 'warning' },
      })
      return
    }

    setIsLoading(true)

    try {
      await register({
        email: formData.email,
        username: formData.username,
        firstName: formData.firstName,
        lastName: formData.lastName,
        password: formData.password,
      })

      toast.show('Welcome!', { message: 'Your account is ready.', customData: { type: 'success' } })
      // No redirect needed; user is authenticated now
    } catch (err: any) {
      const serverMsg = err?.message || 'Please try again.'
      toast.show('Registration failed', { message: serverMsg, customData: { type: 'error' } })
    } finally {
      setIsLoading(false)
    }
  }

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const isFormValid =
    Object.values(formData).every((value) => value.length > 0) &&
    formData.password === formData.confirmPassword &&
    formData.password.length >= 6

  return (
    <YStack flex={1} bg="$color1" px="$4">
      {/* Header */}
      <XStack items="flex-start" mb="$6">
        <YStack flex={1} items="flex-start">
          <H2 fontSize="$7" fontWeight="bold" color="$color12">
            Create Account
          </H2>
        </YStack>
        <YStack width={40} /> {/* Spacer for centering */}
      </XStack>

      {/* Form */}
      <YStack gap="$3" flex={1}>
        {/* Name Fields */}
        <XStack gap="$3">
          <YStack flex={1} gap="$2">
            <Text fontSize="$3" fontWeight="500" color="$color12">
              First Name
            </Text>
            <Input
              placeholder="First Name"
              value={formData.firstName}
              onChangeText={(value) => updateField('firstName', value)}
              autoCapitalize="words"
              autoCorrect={false}
              bg="$color3"
              borderColor="$color6"
              borderWidth="$0.5"
              py="$2"
              px="$4"
              color="$color12"
              placeholderTextColor="$color9"
            />
          </YStack>

          <YStack flex={1} gap="$2">
            <Text fontSize="$3" fontWeight="500" color="$color12">
              Last Name
            </Text>
            <Input
              placeholder="Last Name"
              value={formData.lastName}
              onChangeText={(value) => updateField('lastName', value)}
              autoCapitalize="words"
              autoCorrect={false}
              bg="$color3"
              borderColor="$color6"
              borderWidth="$0.5"
              py="$2"
              px="$4"
              color="$color12"
              placeholderTextColor="$color9"
            />
          </YStack>
        </XStack>

        {/* Username Field */}
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="500" color="$color12">
            Username
          </Text>
          <Input
            placeholder="Username"
            value={formData.username}
            onChangeText={(value) => updateField('username', value)}
            autoCapitalize="none"
            autoCorrect={false}
            bg="$color3"
            borderColor="$color6"
            borderWidth="$0.5"
            py="$2"
            px="$4"
            color="$color12"
            placeholderTextColor="$color9"
          />
        </YStack>

        {/* Email Field */}
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="500" color="$color12">
            Email
          </Text>
          <Input
            placeholder="Email"
            value={formData.email}
            onChangeText={(value) => updateField('email', value)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            bg="$color3"
            borderColor="$color6"
            borderWidth="$0.5"
            py="$2"
            px="$4"
            color="$color12"
            placeholderTextColor="$color9"
          />
        </YStack>

        {/* Password Field */}
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="500" color="$color12">
            Password
          </Text>
          <XStack bg="$color3" borderColor="$color6" borderWidth="$0.5" rounded="$4" items="center">
            <Input
              flex={1}
              unstyled
              placeholder="Password (min 6 characters)"
              value={formData.password}
              onChangeText={(value) => updateField('password', value)}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              color="$color12"
              px="$4"
              placeholderTextColor="$color9"
            />
            <Button bg="transparent" p="$2" onPress={() => setShowPassword(!showPassword)}>
              {showPassword ? (
                <EyeOff size={20} color="$color9" />
              ) : (
                <Eye size={20} color="$color9" />
              )}
            </Button>
          </XStack>
        </YStack>

        {/* Confirm Password Field */}
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="500" color="$color12">
            Confirm Password
          </Text>
          <XStack bg="$color3" borderColor="$color6" borderWidth="$0.5" rounded="$4" items="center">
            <Input
              flex={1}
              unstyled
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChangeText={(value) => updateField('confirmPassword', value)}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              color="$color12"
              px="$4"
              placeholderTextColor="$color9"
            />
            <Button
              bg="transparent"
              p="$2"
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? (
                <EyeOff size={20} color="$color9" />
              ) : (
                <Eye size={20} color="$color9" />
              )}
            </Button>
          </XStack>
        </YStack>

        {/* Sign Up Button */}
        <Button
          size="$5"
          bg="$blue9"
          rounded="$6"
          mt="$4"
          onPress={handleRegister}
          disabled={!isFormValid || isLoading}
          opacity={!isFormValid ? 0.6 : 1}
          pressStyle={{ bg: '$blue10' }}
        >
          <Text fontSize="$5" fontWeight="600" color="white">
            {isLoading ? 'Creating Account...' : 'Sign Up'}
          </Text>
        </Button>

        {/* Sign In Link */}
        <XStack justify="center" mt="$4" gap="$2">
          <Text fontSize="$4" color="$color10">
            Already have an account?
          </Text>
          <Button size="$3" bg="transparent" p="$0" onPress={() => router.push('/welcome/login')}>
            <Text fontSize="$4" color="$blue9" fontWeight="600">
              Sign In
            </Text>
          </Button>
        </XStack>
      </YStack>
    </YStack>
  )
}

export default RegisterPage
