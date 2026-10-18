import { Stack } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCadenceColors } from '../../components/ui/useCadenceColors'

export default function WelcomeLayout() {
  const colors = useCadenceColors()

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: colors.background,
          },
          animation: 'slide_from_right',
        }}
      />
    </SafeAreaView>
  )
}
