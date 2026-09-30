import { Stack } from 'expo-router'
import { getConfig, useTheme } from 'tamagui'

export default function HistoryStackLayout() {
  const theme = useTheme()
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerShown: true,
        headerStyle: { backgroundColor: theme.background.val },
        headerTintColor: theme.primary.val,
        headerTitleStyle: {
          color: theme.color.val,
          fontWeight: '700',
          fontSize: getConfig().fonts.body.size.header as number,
        },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'History' }} />
      <Stack.Screen name="record/[id]" options={{ title: 'Session record' }} />
    </Stack>
  )
}
