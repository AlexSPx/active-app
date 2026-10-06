import { Stack } from 'expo-router'
import { getConfig, getVariableValue, useTheme } from 'tamagui'

export default function LegalLayout() {
  const theme = useTheme()
  return (
    <Stack
      screenOptions={{
        title: 'Settings',
        headerBackTitle: 'Settings',
        headerTitleAlign: 'left',
        headerStyle: { backgroundColor: theme.background.val },
        headerTintColor: theme.primary.val,
        headerTitleStyle: {
          color: theme.color.val,
          fontSize: getVariableValue(getConfig().fonts.body.size.header),
          fontWeight: '700',
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.background.val },
      }}
    />
  )
}
