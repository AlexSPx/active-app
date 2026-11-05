import { Pressable, Text } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { ChevronLeft } from '../components/ui/icons'
import { useCadenceColors } from '../components/ui/useCadenceColors'

type BackHeaderButtonProps = {
  label: string
  fallback: Href
}

export function BackHeaderButton({ label, fallback }: BackHeaderButtonProps) {
  const router = useRouter()
  const colors = useCadenceColors()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      hitSlop={4}
      onPress={() => {
        if (router.canGoBack()) router.back()
        else router.replace(fallback)
      }}
      style={{
        minWidth: 44,
        minHeight: 44,
        marginLeft: -8,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <ChevronLeft size={20} color={colors.accent} aria-hidden />
      <Text
        numberOfLines={1}
        style={{
          maxWidth: 112,
          color: colors.accent,
          fontFamily: 'DM Sans Medium',
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
