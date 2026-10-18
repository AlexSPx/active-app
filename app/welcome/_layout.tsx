import { Stack } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from 'tamagui'

export default function WelcomeLayout() {
  const theme = useTheme()

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background.val }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: theme.background.val,
          },
          animation: 'slide_from_right',
        }}
      />
    </SafeAreaView>
  )
}
