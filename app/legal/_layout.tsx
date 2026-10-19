import { Stack } from 'expo-router'
import { useResolveClassNames } from 'uniwind'
import { useCadenceColors } from '../../components/ui/useCadenceColors'

export default function LegalLayout() {
  const colors = useCadenceColors()
  const titleStyles = useResolveClassNames('text-header font-dm-semibold')
  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'Back',
        headerTitleAlign: 'left',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.accent,
        headerTitleStyle: {
          ...titleStyles,
          color: colors.foreground,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="privacy-policy" options={{ title: 'Privacy Policy' }} />
      <Stack.Screen name="terms-of-service" options={{ title: 'Terms of Service' }} />
    </Stack>
  )
}
