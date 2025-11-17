import { Stack } from 'expo-router'
import { useTheme } from 'tamagui'

export default function SettingsStackLayout() {
  const theme = useTheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="body" options={{ title: 'Body measurements' }} />
      <Stack.Screen name="time-zone" options={{ title: 'Time zone' }} />
      <Stack.Screen name="rest-timer" options={{ title: 'Rest timer' }} />
    </Stack>
  )
}
