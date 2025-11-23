import { useEffect, useState } from 'react'
import { YStack, XStack, Text, Button, Input, H2 } from 'tamagui'
import { Eye, EyeOff } from '@tamagui/lucide-icons'
import { useAuth } from '../../contexts/AuthContext'
import { useToastController } from '@tamagui/toast'
import { GoogleSignInButton } from '../../components/GoogleSignInButton'

const LoginPage = () => {
  const { login, isLoading, error, clearError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const toast = useToastController()

  const handleLogin = async () => {
    if (!email || !password) {
      toast.show('Missing credentials', { message: 'Enter your email and password.' })
      return
    }

    try {
      clearError()
      await login({ email, password })
      // success handled upstream (AuthGuard)
    } catch (err) {
      console.error('Login failed:', err)
      const msg = err instanceof Error ? err.message : 'Please try again.'
      toast.show('Login failed', { message: msg })
    }
  }

  // Surface auth context errors via toast
  useEffect(() => {
    if (error) {
      toast.show('Login error', { message: error })
    }
  }, [error])

  const isFormValid = email.length > 0 && password.length > 0

  return (
    <YStack flex={1} bg="$background" px="$4">
      {/* Logo and Title */}
      <YStack gap="$2" mb="$8">
        <XStack items="center" gap="$3">
          <XStack width={32} height={32} bg="$color12" rounded="$3" items="center" justify="center">
            <Text fontSize="$4" color="$color1" fontWeight="bold">
              A
            </Text>
          </XStack>
          <Text fontSize="$5" fontWeight="600" color="$color12">
            ActiveNext
          </Text>
        </XStack>

        <YStack gap="$1">
          <H2 fontSize="$8" fontWeight="bold" color="$color12">
            Welcome Back!
          </H2>
          <Text fontSize="$4" color="$color10">
            Sign in to continue your fitness journey
          </Text>
        </YStack>
      </YStack>

      {/* Form */}
      <YStack gap="$3" flex={1}>
        {/* Email Input */}
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="500" color="$color12">
            Email
          </Text>
          <Input
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
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

        {/* Password Input */}
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="500" color="$color12">
            Password
          </Text>
          <XStack bg="$color3" borderColor="$color6" borderWidth="$0.5" rounded="$4" items="center">
            <Input
              flex={1}
              unstyled
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
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

        {/* Forgot Password */}
        <XStack justify="flex-end" mt="$2">
          <Button size="$3" bg="transparent" p="$0">
            <Text fontSize="$3" color="$color10">
              Forgotten Password?
            </Text>
          </Button>
        </XStack>

        {/* Sign In Button */}
        <Button
          size="$5"
          bg="$blue9"
          rounded="$6"
          mt="$4"
          onPress={handleLogin}
          disabled={!isFormValid || isLoading}
          opacity={!isFormValid ? 0.6 : 1}
          pressStyle={{ bg: '$blue10' }}
        >
          <Text fontSize="$5" fontWeight="600" color="white">
            {isLoading ? 'Signing In...' : 'Sign In'}
          </Text>
        </Button>

        <XStack items="center" gap="$3" my="$4">
          <YStack height={1} flex={1} bg="$color6" />
          <Text color="$color10" fontSize="$3">OR</Text>
          <YStack height={1} flex={1} bg="$color6" />
        </XStack>

        <GoogleSignInButton />
      </YStack>
    </YStack>
  )
}

export default LoginPage
