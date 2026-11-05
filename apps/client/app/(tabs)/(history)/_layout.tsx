import { Stack } from 'expo-router'
import { useResolveClassNames } from 'uniwind'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { BackHeaderButton } from '../../../navigation/BackHeaderButton'
import { TabHeader } from '../../../navigation/TabHeader'

export default function HistoryStackLayout() {
  const colors = useCadenceColors()
  const titleStyles = useResolveClassNames('text-header font-dm-semibold')
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerShown: true,
        headerTitleAlign: 'left',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.accent,
        headerTitleStyle: {
          ...titleStyles,
          color: colors.foreground,
        },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'History', header: () => <TabHeader title="History" /> }}
      />
      <Stack.Screen
        name="record/[id]"
        options={{
          title: '',
          headerBackTitle: 'History',
          headerBackVisible: false,
          headerLeft: () => <BackHeaderButton label="History" fallback="/(tabs)/(history)" />,
        }}
      />
    </Stack>
  )
}
