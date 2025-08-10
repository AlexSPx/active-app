import { useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { Stack } from 'expo-router'
import { useTheme, View } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'

export function RootLayoutNav() {
  const colorScheme = useColorScheme()
  const theme = useTheme()
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
        <View flex={1} bg="$background">
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
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
    </ThemeProvider>
  )
}
