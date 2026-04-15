import { useMemo } from 'react'
import { usePathname, useRouter, Slot } from 'expo-router'
import { YStack, XStack, Tabs, Text, Separator } from 'tamagui'
export default function WorkoutsLayout() {
  const pathname = usePathname()
  const router = useRouter()

  const current = useMemo<'workouts' | 'routines'>(() => {
    if (!pathname) return 'workouts'
    return pathname.endsWith('/routines') ? 'routines' : 'workouts'
  }, [pathname])

  return (
    <YStack flex={1} bg="$background">
      <YStack px="$4">
        <Tabs
          value={current}
          onValueChange={(v: any) => {
            if (v === 'routines') router.replace({ pathname: '/(tabs)/(workouts)/routines' })
            else router.replace({ pathname: '/(tabs)/(workouts)' })
          }}
        >
          <XStack justify="center" width="100%">
            <Tabs.List alignItems="center" justifyContent="center" gap="$4">
              <Tabs.Tab value="workouts">
                <Text color={current === 'workouts' ? '$color' : '$color10'}>Workouts</Text>
              </Tabs.Tab>
              <Separator self="stretch" vertical />
              <Tabs.Tab value="routines">
                <Text color={current === 'routines' ? '$color' : '$color10'}>Routines</Text>
              </Tabs.Tab>
            </Tabs.List>
          </XStack>
        </Tabs>
      </YStack>

      <YStack flex={1}>
        <Slot />
      </YStack>
    </YStack>
  )
}
