import { useEffect } from 'react'
import { YStack, XStack, Text, Button, Card, Progress } from 'tamagui'

interface RestTimerOverlayProps {
  active: boolean
  remaining: number
  total: number
  onExtend: () => void
  onSkip: () => void
}

// A floating overlay shown when a rest timer is active.
// Future configuration (enable/disable + duration) to be added in settings; kept simple for now.
export function RestTimerOverlay({
  active,
  remaining,
  total,
  onExtend,
  onSkip,
}: RestTimerOverlayProps) {
  useEffect(() => {
    // Potential animation hook / focus effects
  }, [active])

  if (!active) return null

  const progress = 1 - remaining / total
  const minutes = Math.floor(remaining / 60)
  const seconds = Math.floor(remaining % 60)
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`

  return (
    <YStack
      position="absolute"
      style={{ left: 0, right: 0, bottom: 0 }}
      px="$4"
      pb="$6"
      pointerEvents="box-none"
    >
      <Card
        elevate
        bg="$background"
        p="$4"
        borderColor="$borderColor"
        animation="quick"
        enterStyle={{ opacity: 0, y: 20 }}
        exitStyle={{ opacity: 0, y: 20 }}
      >
        <YStack gap="$3">
          <Text fontSize="$6" fontWeight="700" color="$primary">
            Rest
          </Text>
          <Text fontSize="$9" fontWeight="800" color="$color" style={{ textAlign: 'center' }}>
            {formatted}
          </Text>
          <Progress value={progress * 100} mx={0} size="$4" bg="$backgroundPress">
            <Progress.Indicator animation="bouncy" bg="$primary" />
          </Progress>
          <XStack gap="$3" style={{ justifyContent: 'space-between' }}>
            <Button
              flex={1}
              size="$4"
              variant="outlined"
              borderColor="$borderColor"
              color="$color"
              onPress={onSkip}
            >
              <Text numberOfLines={1}>Skip</Text>
            </Button>
            <Button flex={1} size="$4" bg="$primary" color="$onPrimary" onPress={onExtend}>
              <Text numberOfLines={1}>+15s</Text>
            </Button>
          </XStack>
          <Text fontSize="$2" color="$colorSubtle" style={{ textAlign: 'center' }}>
            Automatically starts after completing a set
          </Text>
        </YStack>
      </Card>
    </YStack>
  )
}
