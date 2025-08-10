import { YStack, XStack, Text, Button, H1, H2 } from 'tamagui'
import { useRouter } from 'expo-router'
import { Dumbbell, Zap, Target } from '@tamagui/lucide-icons'

export default function WelcomeHome() {
  const router = useRouter()

  const handleLogin = () => {
    router.push('/welcome/login')
  }

  const handleSignup = () => {
    router.push('/welcome/register')
  }

  return (
    <YStack flex={1} bg="$color1">
      {/* Hero Section with Gradient Background */}
      <YStack flex={1} justify="center" items="center" px="$6">
        {/* App Logo/Icon */}
        <YStack items="center" mb="$8">
          <XStack
            width={80}
            height={80}
            bg="$blue9"
            rounded="$6"
            items="center"
            justify="center"
            mb="$4"
          >
            <Dumbbell size={40} color="white" />
          </XStack>

          <YStack items="center">
            <H1 fontSize="$9" fontWeight="800" color="$color12">
              ActiveNext
            </H1>
            <Text fontSize="$5" color="$color10" mt="$2">
              Your Fitness Journey Starts Here
            </Text>
          </YStack>
        </YStack>

        {/* Feature Highlights */}
        <YStack gap="$4" mb="$8" width="100%">
          <XStack items="center" gap="$3">
            <XStack
              width={40}
              height={40}
              bg="$green8"
              rounded="$3"
              items="center"
              justify="center"
            >
              <Target size={20} color="white" />
            </XStack>
            <YStack flex={1}>
              <Text fontSize="$4" fontWeight="600" color="$color12">
                Track Your Progress
              </Text>
              <Text fontSize="$3" color="$color10">
                Monitor workouts and achieve your goals
              </Text>
            </YStack>
          </XStack>

          <XStack items="center" gap="$3">
            <XStack width={40} height={40} bg="$red8" rounded="$3" items="center" justify="center">
              <Zap size={20} color="white" />
            </XStack>
            <YStack flex={1}>
              <Text fontSize="$4" fontWeight="600" color="$color12">
                Stay Motivated
              </Text>
              <Text fontSize="$3" color="$color10">
                Get personalized insights and recommendations
              </Text>
            </YStack>
          </XStack>

          <XStack items="center" gap="$3">
            <XStack width={40} height={40} bg="$blue8" rounded="$3" items="center" justify="center">
              <Dumbbell size={20} color="white" />
            </XStack>
            <YStack flex={1}>
              <Text fontSize="$4" fontWeight="600" color="$color12">
                Custom Workouts
              </Text>
              <Text fontSize="$3" color="$color10">
                Create and customize your perfect routine
              </Text>
            </YStack>
          </XStack>
        </YStack>

        {/* Action Buttons */}
        <YStack gap="$3" width="100%">
          <Button
            size="$5"
            bg="$blue9"
            rounded="$6"
            onPress={handleLogin}
            pressStyle={{ bg: '$blue10' }}
          >
            <Text fontSize="$5" fontWeight="600" color="white">
              Sign In
            </Text>
          </Button>

          <Button
            size="$5"
            bg="transparent"
            borderColor="$blue9"
            borderWidth="$1"
            rounded="$6"
            onPress={handleSignup}
            pressStyle={{ bg: '$blue2' }}
          >
            <Text fontSize="$5" fontWeight="600" color="$blue9">
              Create Account
            </Text>
          </Button>
        </YStack>
      </YStack>
    </YStack>
  )
}
