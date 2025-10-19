import { Tabs } from 'expo-router'
import { useTheme, YStack } from 'tamagui'
import { Dumbbell, History, Home } from '@tamagui/lucide-icons'
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
          headerShown: true,
          headerStyle: {
            backgroundColor: theme.background.val,
          },
          headerTintColor: theme.color.val,
          headerTitleStyle: {
            color: theme.color.val,
            fontWeight: '700',
          },
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
          name="(history)"
          options={{
            title: 'History',
            tabBarIcon: ({ color }) => <History color={color as any} />,
            // Use the nested stack header for History screens
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="(workouts)"
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
