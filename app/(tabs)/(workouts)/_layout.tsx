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
      <XStack
        mt={12}
        mx={20}
        mb={20}
        bg="$surface"
        p={4}
        gap={4}
        borderColor="$borderColor"
        borderWidth={1}
        style={{ borderRadius: 12 }}
      >
        <Button
          unstyled
          flex={1}
          py={9}
          bg={current === 'workouts' ? '$backgroundStrong' : 'transparent'}
          onPress={() => router.replace({ pathname: '/(tabs)/(workouts)' })}
          pressStyle={{ opacity: 0.9 }}
          style={{ borderRadius: 9 }}
        >
          <Text
            fontSize={14}
            fontWeight="500"
            color={current === 'workouts' ? '$color' : '$colorMuted'}
            style={{ textAlign: 'center' }}
          >
            Workouts
          </Text>
        </Button>
        <Button
          unstyled
          flex={1}
          py={9}
          bg={current === 'routines' ? '$backgroundStrong' : 'transparent'}
          onPress={() => router.replace({ pathname: '/(tabs)/(workouts)/routines' })}
          pressStyle={{ opacity: 0.9 }}
          style={{ borderRadius: 9 }}
        >
          <Text
            fontSize={14}
            fontWeight="500"
            color={current === 'routines' ? '$color' : '$colorMuted'}
            style={{ textAlign: 'center' }}
          >
            Routines
          </Text>
        </Button>
      </XStack>

      <YStack flex={1}>
        <Slot />
      </YStack>
    </YStack>
  )
}
