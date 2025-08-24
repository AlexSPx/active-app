import { YStack, Text, Button } from 'tamagui'
import { useRouter, useNavigation } from 'expo-router'
import { useLayoutEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { WeeklyView } from '../../components/WeeklyView'
import { TodayView } from '../../components/TodayView'

export default function HomeScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const { logout, user } = useAuth()

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Home',
      headerRight: () => (
        <Button size="$2" onPress={logout} bg="$red9" pressStyle={{ bg: '$red10' }}>
          <Text color="white">Logout</Text>
        </Button>
      ),
    })
  }, [navigation, logout])

  return (
    <YStack flex={1} bg="$background">
      {/* Content starts below native header */}

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
