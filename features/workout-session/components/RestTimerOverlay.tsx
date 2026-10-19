import { View } from 'react-native'
import { Button, UiText } from '../../../components/ui/Controls'

interface RestTimerOverlayProps {
  active: boolean
  remaining: number
  total: number
  onExtend: () => void
  onSkip: () => void
  nextStepText: string
  bottomOffset?: number
}

// A floating overlay shown when a rest timer is active.
export function RestTimerOverlay({
  active,
  remaining,
  total,
  onExtend,
  onSkip,
  nextStepText,
  bottomOffset = 0,
}: RestTimerOverlayProps) {
  if (!active) return null

  const progress = total <= 0 ? 0 : Math.max(0, Math.min(1, 1 - remaining / total))
  const minutes = Math.floor(remaining / 60)
  const seconds = Math.floor(remaining % 60)
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 px-page pb-section"
      style={{ bottom: bottomOffset }}
    >
      <View className="gap-field rounded-card border border-divider bg-surface p-card shadow-lg">
        <UiText textRole="captionEmphasis" accessibilityRole="header">
          Rest
        </UiText>
        <UiText textRole="screenTitle" className="text-center">
          {formatted}
        </UiText>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Rest timer progress"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          className="h-2 overflow-hidden rounded-full bg-raised"
        >
          <View className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </View>
        <View className="flex-row gap-field">
          <Button
            variant="surface"
            shape="control"
            className="flex-1"
            onPress={onSkip}
            accessibilityLabel="Skip rest timer"
          >
            Skip
          </Button>
          <Button
            variant="primary"
            shape="control"
            className="flex-1"
            onPress={onExtend}
            accessibilityLabel="Extend rest timer by 15 seconds"
          >
            +15s
          </Button>
        </View>
        <UiText textRole="caption" className="text-center">
          {nextStepText}
        </UiText>
      </View>
    </View>
  )
}
