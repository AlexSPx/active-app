import { Link, Tabs } from 'expo-router'
import { Button, Text, useTheme, XStack, YStack } from 'tamagui'
import { Clock, Dumbbell, History, Home, Play } from '@tamagui/lucide-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import RunningWorkoutFloat from '../../components/workout-session/RunningWorkoutFloat'

export default function TabLayout() {
  const theme = useTheme()

  return (
    <YStack flex={1} bg="$background">
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.primary.val,
          tabBarStyle: {
            backgroundColor: theme.background.val,
            borderTopColor: theme.borderColor.val,
          },
          headerStyle: {
            backgroundColor: theme.background.val,
            borderBottomColor: theme.borderColor.val,
          },
          headerTintColor: theme.color.val,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <Home color={color as any} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: ({ color }) => <History color={color as any} />,
          }}
        />
        <Tabs.Screen
          name="workouts"
          options={{
            title: 'Workouts',
            tabBarIcon: ({ color }) => <Dumbbell color={color as any} />,
          }}
        />
      </Tabs>

      {/* Running Workout - Floating above tab bar */}
      <RunningWorkoutFloat />
    </YStack>
  )
}
