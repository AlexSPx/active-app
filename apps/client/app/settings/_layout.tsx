import { Stack } from 'expo-router'
import { useResolveClassNames } from 'uniwind'
import { useCadenceColors } from '../../components/ui/useCadenceColors'
import { BackHeaderButton } from '../../navigation/BackHeaderButton'

export default function SettingsStackLayout() {
  const colors = useCadenceColors()
  const titleStyles = useResolveClassNames('text-header font-dm-semibold')
  return (
    <Stack
      screenOptions={{
        title: '',
        headerBackTitle: 'Settings',
        headerTitleAlign: 'left',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.accent,
        headerBackVisible: false,
        headerLeft: () => (
          <BackHeaderButton label="Settings" fallback="/settings" showLabel={false} />
        ),
        headerTitleStyle: {
          ...titleStyles,
          color: colors.foreground,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="dependencies"
        options={{
          headerLeft: () => (
            <BackHeaderButton label="About" fallback="/settings/about" showLabel={false} />
          ),
        }}
      />
      <Stack.Screen
        name="index"
        options={{
          title: 'Settings',
          headerLeft: () => <BackHeaderButton label="Back" fallback="/(tabs)" showLabel={false} />,
        }}
      />
    </Stack>
  )
}
