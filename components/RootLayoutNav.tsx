import { StatusBar } from 'expo-status-bar'
import { Stack } from 'expo-router'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useResolveClassNames, useUniwind } from 'uniwind'
import { useCadenceColors } from './ui/useCadenceColors'

export function RootLayoutNav() {
  const { theme } = useUniwind()
  const colors = useCadenceColors()
  const titleStyles = useResolveClassNames('text-header font-dm-semibold')
  const pageHeader = {
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.accent,
    headerTitleAlign: 'left' as const,
    headerShadowVisible: false,
    headerTitleStyle: { ...titleStyles, color: colors.foreground },
  }
  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View className="flex-1 bg-background">
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen
            name="welcome"
            options={{
              headerShown: false,
              contentStyle: {
                backgroundColor: colors.background,
              },
            }}
          />

          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
              contentStyle: {
                backgroundColor: colors.background,
              },
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="+not-found"
            options={{
              title: 'Page Not Found',
              headerBackTitle: 'Back',
              ...pageHeader,
            }}
          />

          <Stack.Screen
            name="exercises/search"
            options={{
              title: 'Search Exercises',
              headerBackTitle: 'Workouts',
              ...pageHeader,
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="routines/new"
            options={{
              title: 'Create Routine',
              headerBackTitle: 'Routines',
              ...pageHeader,
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="routines/edit"
            options={{
              title: 'Edit Routine',
              headerBackTitle: 'Routines',
              ...pageHeader,
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="workouts/new"
            options={{
              title: 'Create Workout',
              headerBackTitle: 'Workouts',
              ...pageHeader,
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="workouts/session"
            options={{
              title: 'Workout Session',
              headerBackTitle: 'Workouts',
              ...pageHeader,
              animation: 'fade',
            }}
          />

          <Stack.Screen
            name="workouts/edit"
            options={{
              title: 'Edit Workout',
              headerBackTitle: 'Workouts',
              ...pageHeader,
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="legal"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />
        </Stack>
      </View>
    </SafeAreaView>
  )
}
