import { Stack } from 'expo-router'
import { useTheme } from 'tamagui'

export default function HistoryStackLayout() {
  const theme = useTheme()

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.background.val },
        headerTintColor: theme.color.val,
        headerTitleStyle: { color: theme.color.val, fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'History' }} />
      {/* Add detail screens here later, e.g., record/[id].tsx */}
    </Stack>
  )
}
