import { Link } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Settings, UserRound } from '../components/ui/icons'
import { useCadenceColors } from '../components/ui/useCadenceColors'

export function TabHeader({ title }: { title: string }) {
  const { top } = useSafeAreaInsets()
  const colors = useCadenceColors()

  return (
    <View className="bg-background" style={{ paddingTop: top }}>
      <View className="min-h-16 flex-row items-center justify-between gap-field px-page py-field">
        <Text
          accessibilityRole="header"
          className="flex-1 text-header font-dm-semibold text-foreground"
        >
          {title}
        </Text>
        <Link href="/settings" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            accessibilityHint="Open your profile and app settings"
            className="h-touch w-touch items-center justify-center rounded-full border border-divider bg-surface active:bg-raised focus:border-2 focus:border-accent"
          >
            <UserRound size={22} color={colors.accent} aria-hidden />
            <View className="absolute -bottom-0.5 -right-0.5 h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-raised">
              <Settings size={12} color={colors.accent} aria-hidden />
            </View>
          </Pressable>
        </Link>
      </View>
    </View>
  )
}
