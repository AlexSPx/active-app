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
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View className="flex-1 bg-background">
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <Stack>
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
            name="exercises/search"
            options={{
              title: 'Search Exercises',
              headerStyle: {
                backgroundColor: colors.background,
              },
              headerTintColor: colors.foreground,
              headerTitleStyle: { ...titleStyles, color: colors.foreground },
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="routines/new"
            options={{
              title: 'Create Routine',
              headerStyle: {
                backgroundColor: colors.background,
              },
              headerTintColor: colors.foreground,
              headerTitleStyle: { ...titleStyles, color: colors.foreground },
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="routines/edit"
            options={{
              title: 'Edit Routine',
              headerStyle: {
                backgroundColor: colors.background,
              },
              headerTintColor: colors.foreground,
              headerTitleStyle: { ...titleStyles, color: colors.foreground },
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="workouts/new"
            options={{
              title: 'Create Workout',
              headerStyle: {
                backgroundColor: colors.background,
              },
              headerTintColor: colors.foreground,
              headerTitleStyle: { ...titleStyles, color: colors.foreground },
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="workouts/session"
            options={{
              title: 'Workout Session',
              headerStyle: {
                backgroundColor: colors.background,
              },
              headerTintColor: colors.foreground,
              headerTitleStyle: { ...titleStyles, color: colors.foreground },
              animation: 'fade',
            }}
          />

          <Stack.Screen
            name="workouts/edit"
            options={{
              title: 'Edit Workout',
              headerStyle: {
                backgroundColor: colors.background,
              },
              headerTintColor: colors.foreground,
              headerTitleStyle: { ...titleStyles, color: colors.foreground },
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

          <Stack.Screen
            name="modal"
            options={{
              title: 'Tamagui + Expo',
              presentation: 'modal',
              animation: 'slide_from_right',
              gestureEnabled: true,
              gestureDirection: 'horizontal',
              contentStyle: {
                backgroundColor: colors.background,
              },
            }}
          />
        </Stack>
      </View>
    </SafeAreaView>
  )
}
