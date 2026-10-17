import { Stack } from 'expo-router'
import { useResolveClassNames } from 'uniwind'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'

export default function SettingsStackLayout() {
  const colors = useCadenceColors()
  const titleStyles = useResolveClassNames('text-header font-dm-semibold')
  return (
    <Stack
      screenOptions={{
        title: 'Settings',
        headerBackTitle: 'Settings',
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
    />
  )
}
