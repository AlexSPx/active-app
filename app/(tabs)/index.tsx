import { YStack, XStack, Text, Button, Card } from 'tamagui'
import { useRouter } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'
import { WeeklyView } from '../../components/WeeklyView'
import { TodayView } from '../../components/TodayView'

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

      {/* Weekly View */}
      <YStack p="$4" pt="$0">
        <WeeklyView />
      </YStack>

      {/* Today View */}
      <YStack p="$4" pt="$0">
        <TodayView />
      </YStack>
    </YStack>
  )
}
