import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { useResolveClassNames } from 'uniwind'
import { Dumbbell, History, Home, Settings as SettingsIcon } from '@tamagui/lucide-icons'
import { RunningWorkoutFloat } from '../../features/workout-session'
import { useCadenceColors } from '../../components/ui/useCadenceColors'

export default function TabLayout() {
  const colors = useCadenceColors()
  const titleStyles = useResolveClassNames('text-header font-dm-semibold')

  return (
    <View className="flex-1 bg-background">
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.accent,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.divider,
          },
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.foreground,
          headerShadowVisible: false,
          headerTitleStyle: {
            ...titleStyles,
            color: colors.foreground,
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
    </View>
  )
}
