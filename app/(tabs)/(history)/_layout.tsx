import { Stack } from 'expo-router'
import { useTheme } from 'tamagui'

export default function HistoryStackLayout() {
  const theme = useTheme()

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerShown: true,
        headerStyle: { backgroundColor: theme.background.val },
        headerTintColor: theme.color.val,
        headerTitleStyle: { color: theme.color.val, fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'History' }} />
      <Stack.Screen name="record/[id]" options={{ title: 'Record' }} />
    </Stack>
  )
}
