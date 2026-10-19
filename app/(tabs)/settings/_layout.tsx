import { Stack, usePathname } from 'expo-router'
import { useResolveClassNames } from 'uniwind'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { BackHeaderButton } from '../../../navigation/BackHeaderButton'
import { TabHeader } from '../../../navigation/TabHeader'

export default function SettingsStackLayout() {
  const pathname = usePathname()
  const colors = useCadenceColors()
  const titleStyles = useResolveClassNames('text-header font-dm-semibold')
  const isSettingsMenu = pathname.replace(/\/$/, '').endsWith('/settings')
  return (
    <Stack
      screenOptions={{
        title: isSettingsMenu ? 'Settings' : '',
        header: isSettingsMenu ? () => <TabHeader title="Settings" /> : undefined,
        headerBackTitle: 'Settings',
        headerTitleAlign: 'left',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.accent,
        headerBackVisible: false,
        headerLeft: () =>
          isSettingsMenu ? null : <BackHeaderButton label="Settings" fallback="/settings" />,
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
