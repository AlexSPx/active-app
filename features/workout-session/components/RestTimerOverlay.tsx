import { useLayoutEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Button, UiText } from '../../../components/ui/Controls'
import { useReduceMotionPreference } from '../../../components/ui/useReduceMotionPreference'

const ENTRANCE_DURATION_MS = 280
const EXIT_DURATION_MS = 180
const REDUCED_MOTION_DURATION_MS = 120
const ENTRANCE_OFFSET = 6
const EXIT_OFFSET = 4
const PROGRESS_DURATION_MS = 1000
const PROGRESS_CATCH_UP_DURATION_MS = 320

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
  const reduceMotion = useReduceMotionPreference()
  const [rendered, setRendered] = useState(active)
  const renderedRef = useRef(active)
  const opacity = useSharedValue(0)
  const translateY = useSharedValue(active && !reduceMotion ? ENTRANCE_OFFSET : 0)
  const progress = total <= 0 ? 0 : Math.max(0, Math.min(1, 1 - remaining / total))
  const animatedProgress = useSharedValue(active ? progress : 0)
  const previousTimerValues = useRef({ remaining, total, active, reduceMotion })

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: reduceMotion ? 0 : translateY.value }],
  }))
  const progressStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value * 100}%`,
  }))

  useLayoutEffect(() => {
    const easing = Easing.out(Easing.cubic)

    if (active) {
      if (!renderedRef.current) {
        renderedRef.current = true
        setRendered(true)
        opacity.value = 0
        translateY.value = reduceMotion ? 0 : ENTRANCE_OFFSET
      }

      opacity.value = withTiming(1, {
        duration: reduceMotion ? REDUCED_MOTION_DURATION_MS : ENTRANCE_DURATION_MS,
        easing,
      })
      translateY.value = reduceMotion
        ? 0
        : withTiming(0, { duration: ENTRANCE_DURATION_MS, easing })

      return () => {
        cancelAnimation(opacity)
        cancelAnimation(translateY)
      }
    }

    if (!renderedRef.current) return

    const exitDuration = reduceMotion ? REDUCED_MOTION_DURATION_MS : EXIT_DURATION_MS
    opacity.value = withTiming(0, { duration: exitDuration, easing })
    translateY.value = reduceMotion
      ? 0
      : withTiming(EXIT_OFFSET, { duration: EXIT_DURATION_MS, easing })

    const exitTimeout = setTimeout(() => {
      renderedRef.current = false
      setRendered(false)
    }, exitDuration)

    return () => {
      clearTimeout(exitTimeout)
      cancelAnimation(opacity)
      cancelAnimation(translateY)
    }
  }, [active, reduceMotion, opacity, translateY])

  useLayoutEffect(() => {
    const previous = previousTimerValues.current
    previousTimerValues.current = { remaining, total, active, reduceMotion }
    const timerValuesChanged = remaining !== previous.remaining || total !== previous.total
    const activeChanged = active !== previous.active
    const reduceMotionChanged = reduceMotion !== previous.reduceMotion

    if (!active) {
      cancelAnimation(animatedProgress)
      animatedProgress.value = 0
      return
    }

    if (activeChanged || reduceMotionChanged || reduceMotion || total !== previous.total) {
      cancelAnimation(animatedProgress)
      animatedProgress.value = progress
      return
    }

    if (!timerValuesChanged) {
      return
    }

    const remainingChange = Math.abs(remaining - previous.remaining)
    const duration = remainingChange > 1 ? PROGRESS_CATCH_UP_DURATION_MS : PROGRESS_DURATION_MS

    animatedProgress.value = withTiming(progress, {
      duration,
      easing: Easing.linear,
    })
  }, [active, animatedProgress, progress, reduceMotion, remaining, total])

  if (!rendered) return null

  const minutes = Math.floor(remaining / 60)
  const seconds = Math.floor(remaining % 60)
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`

  return (
    <Animated.View
      pointerEvents={active ? 'box-none' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      className="absolute left-0 right-0 px-page pb-section"
      style={[{ bottom: bottomOffset }, overlayStyle]}
    >
      <View className="gap-field rounded-card border border-divider bg-surface p-card shadow-lg">
        <UiText textRole="captionEmphasis" accessibilityRole="header">
          Rest
        </UiText>
        <UiText
          textRole="screenTitle"
          className="text-center"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatted}
        </UiText>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Rest timer progress"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          className="h-2 overflow-hidden rounded-full bg-raised"
        >
          <Animated.View className="h-full rounded-full bg-accent" style={progressStyle} />
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
    </Animated.View>
  )
}
