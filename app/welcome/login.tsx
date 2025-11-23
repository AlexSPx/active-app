import { useEffect, useState } from 'react'
import { YStack, XStack, Text, Button, Input, H2, Label } from 'tamagui'
import { Eye, EyeOff, Mail, Lock } from '@tamagui/lucide-icons'
import { useAuth } from '../../contexts/AuthContext'
import { useToastController } from '@tamagui/toast'
import { GoogleSignInButton } from '../../components/GoogleSignInButton'
import { Platform, KeyboardAvoidingView } from 'react-native'

import { InputField } from '../../components/ui/InputField'

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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <YStack flex={1} bg="$background" px="$4" pt="$8" pb="$4">
        {/* Header */}
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

          <YStack gap="$1" mt="$4">
            <H2 fontSize="$8" fontWeight="bold" color="$color12">
              Welcome Back!
            </H2>
            <Text fontSize="$4" color="$color10">
              Sign in to continue your fitness journey
            </Text>
          </YStack>
        </YStack>

        {/* Form */}
        <YStack gap="$4" flex={1}>
          {/* Email Input */}
          <YStack gap="$2">
            <Label color="$color11" fontSize="$3">Email</Label>
            <InputField
              icon={Mail}
              placeholder="hello@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </YStack>

          {/* Password Input */}
          <YStack gap="$2">
            <Label color="$color11" fontSize="$3">Password</Label>
            <XStack bg="$color3" borderColor="$color5" borderWidth={1} rounded="$4" items="center" px="$3">
              <Lock size={20} color="$color9" />
              <Input
                flex={1}
                unstyled
                py="$3"
                px="$3"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                color="$color12"
                placeholderTextColor="$color9"
              />
              <Button chromeless p="$2" onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={20} color="$color9" /> : <Eye size={20} color="$color9" />}
              </Button>
            </XStack>
          </YStack>

          {/* Forgot Password */}
          <XStack justify="flex-end">
            <Button size="$3" chromeless p="$0">
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
            mt="$2"
            onPress={handleLogin}
            disabled={!isFormValid || isLoading}
            opacity={!isFormValid ? 0.6 : 1}
            pressStyle={{ bg: '$blue10', scale: 0.98 }}
            animation="fast"
          >
            <Text fontSize="$5" fontWeight="600" color="white">
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Text>
          </Button>

          <XStack items="center" gap="$3" my="$2">
            <YStack height={1} flex={1} bg="$color6" />
            <Text color="$color10" fontSize="$3">OR</Text>
            <YStack height={1} flex={1} bg="$color6" />
          </XStack>

          <GoogleSignInButton />
        </YStack>
      </YStack>
    </KeyboardAvoidingView>
  )
}

export default LoginPage
