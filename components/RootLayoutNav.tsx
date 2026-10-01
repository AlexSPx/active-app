import { StatusBar } from 'expo-status-bar'
import { Stack } from 'expo-router'
import { useTheme, useThemeName, View } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'

export function RootLayoutNav() {
  const themeName = useThemeName()
  const theme = useTheme()
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
      <View flex={1} bg="$background">
        <StatusBar style={themeName === 'dark' ? 'light' : 'dark'} />
        <Stack>
          <Stack.Screen
            name="welcome"
            options={{
              headerShown: false,
              contentStyle: {
                backgroundColor: theme.background.val,
              },
            }}
          />

          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
              contentStyle: {
                backgroundColor: theme.background.val,
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
                backgroundColor: theme.background.val,
              },
              headerTintColor: theme.color.val,
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="routines/new"
            options={{
              title: 'Create Routine',
              headerStyle: {
                backgroundColor: theme.background.val,
              },
              headerTintColor: theme.color.val,
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="routines/edit"
            options={{
              title: 'Edit Routine',
              headerStyle: {
                backgroundColor: theme.background.val,
              },
              headerTintColor: theme.color.val,
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="workouts/new"
            options={{
              title: 'Create Workout',
              headerStyle: {
                backgroundColor: theme.background.val,
              },
              headerTintColor: theme.color.val,
              animation: 'slide_from_right',
              animationDuration: 300,
            }}
          />

          <Stack.Screen
            name="workouts/session"
            options={{
              title: 'Workout Session',
              headerStyle: {
                backgroundColor: theme.background.val,
              },
              headerTintColor: theme.color.val,
              animation: 'fade',
            }}
          />

          <Stack.Screen
            name="workouts/edit"
            options={{
              title: 'Edit Workout',
              headerStyle: {
                backgroundColor: theme.background.val,
              },
              headerTintColor: theme.color.val,
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
                backgroundColor: theme.background.val,
              },
            }}
          />
        </Stack>
      </View>
    </SafeAreaView>
  )
}
