import { Stack } from 'expo-router'
import { useTheme } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function WelcomeLayout() {
  const theme = useTheme()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color1.val }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: theme.color1.val,
          },
          animation: 'slide_from_right',
        }}
      />
    </SafeAreaView>
  )
}
