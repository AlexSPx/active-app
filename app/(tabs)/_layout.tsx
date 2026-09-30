import { Tabs } from 'expo-router'
import { getConfig, getVariableValue, useTheme, YStack } from 'tamagui'
import { Dumbbell, History, Home, Settings as SettingsIcon } from '@tamagui/lucide-icons'
import { RunningWorkoutFloat } from '../../features/workout-session'

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
          },
          headerTintColor: theme.color.val,
          headerShadowVisible: false,
          headerTitleStyle: {
            color: theme.color.val,
            fontWeight: '700',
            fontSize: getVariableValue(getConfig().fonts.body.size.header),
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
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            headerShown: false,
            tabBarIcon: ({ color }) => <SettingsIcon color={color as any} />,
          }}
        />
      </Tabs>

      {/* Running Workout - Floating above tab bar */}
      <RunningWorkoutFloat />
    </YStack>
  )
}
