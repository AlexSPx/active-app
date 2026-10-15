import { Stack } from 'expo-router'
import { useTheme } from 'tamagui'

export default function WelcomeLayout() {
  const theme = useTheme()

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: theme.background.val,
        },
        animation: 'slide_from_right',
      }}
    />
  )
}
