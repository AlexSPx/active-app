import { Stack } from 'expo-router'
import { useTheme, YStack } from 'tamagui'

export default function SettingsStackLayout() {
  const theme = useTheme()
  return (
    <YStack flex={1} bg="$background">
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
    </YStack>
  )
}
