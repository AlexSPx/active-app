import { useState } from 'react'
import { YStack, XStack, Text, Button, Input, H2 } from 'tamagui'
import { Eye, EyeOff, Apple } from '@tamagui/lucide-icons'
import { useAuth } from '../../contexts/AuthContext'
import { SafeAreaView } from 'react-native-safe-area-context'

const LoginPage = () => {
  const { login, isLoading, error, clearError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) {
      return
    }

    try {
      clearError()
      await login({ email, password })
      console.log('Login successful')
    } catch (error) {
      console.error('Login failed:', error)
    }
  }

  const handleSocialLogin = (provider: string) => {
    console.log(`${provider} login attempted`)
    // For demo purposes, use demo credentials
    if (provider === 'Demo') {
      setEmail('alex@mail.com')
      setPassword('password123')
      login({ email: 'alex@mail.com', password: 'password123' }).catch(console.error)
    }
  }

  const handleSkip = () => {
    // For demo purposes, use demo credentials
    login({ email: 'demo@example.com', password: 'demo123' }).catch(console.error)
  }

  const isFormValid = email.length > 0 && password.length > 0

  return (
    <YStack flex={1} bg="$color1" px="$4">
      {/* Header */}
      <XStack justify="space-between" items="center" mb="$8">
        <YStack />
        <Button size="$3" bg="transparent" p="$2" onPress={handleSkip}>
          <Text fontSize="$4" color="$color11">
            Skip
          </Text>
        </Button>
      </XStack>

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
        {/* Error Display */}
        {error && (
          <XStack bg="$red3" borderColor="$red7" borderWidth="$0.5" rounded="$4" p="$3" mb="$2">
            <Text fontSize="$3" color="$red11">
              {error}
            </Text>
          </XStack>
        )}

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
      </YStack>
    </YStack>
  )
}

export default LoginPage
