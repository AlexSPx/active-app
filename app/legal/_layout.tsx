import { Stack } from 'expo-router'
import { useTheme } from 'tamagui'

export default function LegalLayout() {
  const theme = useTheme()
  
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.background.val,
        },
        headerTintColor: theme.color.val,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="privacy-policy"
        options={{
          title: 'Privacy Policy',
        }}
      />
      <Stack.Screen
        name="terms-of-service"
        options={{
          title: 'Terms of Service',
        }}
      />
    </Stack>
  )
}
