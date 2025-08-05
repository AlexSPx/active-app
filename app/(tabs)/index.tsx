import { YStack, XStack, Text, Button, Card } from 'tamagui'
import { useRouter } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'

export default function HomeScreen() {
  const router = useRouter()
  const { logout, user } = useAuth()

  return (
    <YStack flex={1} bg="$background">
      {/* Header Section */}
      <YStack p="$4" gap="$2">
        <XStack justify="space-between" items="center">
          <YStack>
            <Text fontSize="$8" fontWeight="900" color="$color">
              Good morning
            </Text>
            <Text fontSize="$5" color="$colorSubtle">
              Ready to crush your goals?
            </Text>
            {user && (
              <Text fontSize="$3" color="$colorSubtle" mt="$1">
                Welcome back, {user.firstName || user.username}!
              </Text>
            )}
          </YStack>
          <Button size="$3" bg="$red9" onPress={logout} pressStyle={{ bg: '$red10' }}>
            <Text color="white" fontSize="$3">
              Logout
            </Text>
          </Button>
        </XStack>
      </YStack>

      {/* Today's Workout Card */}
      <YStack p="$4" pt="$0">
        <Card
          bg="$backgroundAccent"
          borderColor="$borderAccent"
          borderWidth={2}
          padding="$5"
          borderRadius="$6"
          elevate
          pressStyle={{ scale: 0.98 }}
        >
          <YStack gap="$3">
            <XStack items="center">
              <YStack gap="$1">
                <Text fontSize="$2" fontWeight="600" color="$primary" textTransform="uppercase">
                  TODAY'S WORKOUT
                </Text>
                <Text fontSize="$7" fontWeight="800" color="$onPrimary">
                  Push Day
                </Text>
              </YStack>
              <Text fontSize="$8">🔥</Text>
            </XStack>

            <XStack gap="$4" mt="$2">
              <XStack items="center" gap="$2">
                <Text fontSize="$4" color="$primary">
                  ⏱️
                </Text>
                <Text fontSize="$3" color="$onPrimary" fontWeight="600">
                  45 min
                </Text>
              </XStack>
              <XStack items="center" gap="$2">
                <Text fontSize="$4" color="$primary">
                  🏋️‍♂️
                </Text>
                <Text fontSize="$3" color="$onPrimary" fontWeight="600">
                  6 exercises
                </Text>
              </XStack>
            </XStack>

            <YStack mt="$3">
              <Button bg="$primary" size="$5" onPress={() => router.push('/workouts/new')}>
                <Text fontSize="$5" fontWeight="700" color="$onPrimary">
                  Start Workout
                </Text>
              </Button>
            </YStack>
          </YStack>
        </Card>
      </YStack>

      {/* Stats Grid */}
      <YStack p="$4" pt="$2" gap="$3">
        <Text fontSize="$6" fontWeight="700" color="$color">
          Your Progress
        </Text>

        <XStack gap="$3">
          <Card flex={1} bg="$surface" borderColor="$borderColor" padding="$4" borderRadius="$4">
            <YStack gap="$2">
              <Text fontSize="$6" color="$primary">
                🔥
              </Text>
              <Text fontSize="$6" fontWeight="800" color="$color">
                5
              </Text>
              <Text fontSize="$2" color="$colorSubtle">
                Day Streak
              </Text>
            </YStack>
          </Card>

          <Card flex={1} bg="$surface" borderColor="$borderColor" padding="$4" borderRadius="$4">
            <YStack gap="$2">
              <Text fontSize="$6" color="$secondary">
                🏆
              </Text>
              <Text fontSize="$6" fontWeight="800" color="$color">
                48
              </Text>
              <Text fontSize="$2" color="$colorSubtle">
                Total Workouts
              </Text>
            </YStack>
          </Card>
        </XStack>
      </YStack>
    </YStack>
  )
}
