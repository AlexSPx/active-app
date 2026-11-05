import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export function TabHeader({ title }: { title: string }) {
  const { top } = useSafeAreaInsets()

  return (
    <View className="bg-background" style={{ paddingTop: top }}>
      <View className="min-h-16 justify-center px-page py-card">
        <Text accessibilityRole="header" className="text-header font-dm-semibold text-foreground">
          {title}
        </Text>
      </View>
    </View>
  )
}
