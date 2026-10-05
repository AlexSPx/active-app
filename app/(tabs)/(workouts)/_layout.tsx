import { useMemo } from 'react'
import { usePathname, useRouter, Slot } from 'expo-router'
import { YStack, XStack, Button, Text } from 'tamagui'
export default function WorkoutsLayout() {
  const pathname = usePathname()
  const router = useRouter()

  const current = useMemo<'workouts' | 'routines'>(() => {
    if (!pathname) return 'workouts'
    return pathname.endsWith('/routines') ? 'routines' : 'workouts'
  }, [pathname])

  return (
    <YStack flex={1} bg="$background">
      <YStack width="100%" maxW="$content" self="center" px="$page">
        <XStack
          mt="$card"
          mb="$section"
          bg="$backgroundStrong"
          p="$compact"
          gap="$compact"
          rounded="$menu"
        >
          <Button
            unstyled
            flex={1}
            minH="$touch"
            py="$2"
            bg={current === 'workouts' ? '$surface' : '$backgroundTransparent'}
            accessibilityRole="tab"
            accessibilityState={{ selected: current === 'workouts' }}
            onPress={() => router.replace({ pathname: '/(tabs)/(workouts)' })}
            pressStyle={{ opacity: 0.9 }}
            rounded="$control"
          >
            <Text
              fontSize="$caption"
              fontWeight="600"
              color={current === 'workouts' ? '$primary' : '$colorSubtle'}
              text="center"
            >
              Workouts
            </Text>
          </Button>
          <Button
            unstyled
            flex={1}
            minH="$touch"
            py="$2"
            bg={current === 'routines' ? '$surface' : '$backgroundTransparent'}
            accessibilityRole="tab"
            accessibilityState={{ selected: current === 'routines' }}
            onPress={() => router.replace({ pathname: '/(tabs)/(workouts)/routines' })}
            pressStyle={{ opacity: 0.9 }}
            rounded="$control"
          >
            <Text
              fontSize="$caption"
              fontWeight="600"
              color={current === 'routines' ? '$primary' : '$colorSubtle'}
              text="center"
            >
              Routines
            </Text>
          </Button>
        </XStack>
      </YStack>

      <YStack flex={1}>
        <Slot />
      </YStack>
    </YStack>
  )
}
