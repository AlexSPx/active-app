import { memo, useLayoutEffect, useRef } from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useCSSVariable } from 'uniwind'
import { useReduceMotionPreference } from '../../../components/ui/useReduceMotionPreference'
import { Check } from '../../../components/ui/icons'
import {
  Button,
  DurationTargetInput,
  SwipeToDeleteRow,
  useCadenceColors,
} from '../../../components/ui'
import type { Set } from '../../../types/workout-session'

const COMPLETION_COLOR_VARIABLES = ['--color-surface', '--color-raised']
const COMPLETION_BLEND_DURATION_MS = 180
const COMPLETION_SETTLE_DURATION_MS = 240
// The black/white WCAG crossover keeps either choice above 4.5:1.
const CONTRAST_SWITCH_LUMINANCE = 0.179
const CONTRAST_DARK_TEXT = '#000000'
const CONTRAST_LIGHT_TEXT = '#ffffff'

function colorValue(value: string | number | undefined, fallback: string): string {
  if (typeof value === 'number') {
    return `#${(value >>> 0).toString(16).slice(-6).padStart(6, '0')}`
  }
  return value ?? fallback
}

function relativeLuminance(color: string): number {
  'worklet'

  const channels = color.slice(color.indexOf('(') + 1, color.lastIndexOf(')')).split(',')
  const red = Number(channels[0]) / 255
  const green = Number(channels[1]) / 255
  const blue = Number(channels[2]) / 255
  const linearRed = red <= 0.04045 ? red / 12.92 : Math.pow((red + 0.055) / 1.055, 2.4)
  const linearGreen = green <= 0.04045 ? green / 12.92 : Math.pow((green + 0.055) / 1.055, 2.4)
  const linearBlue = blue <= 0.04045 ? blue / 12.92 : Math.pow((blue + 0.055) / 1.055, 2.4)

  return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue
}

interface CardioSessionSetRowProps {
  set: Set
  index: number
  canDelete: boolean
  onUpdateDuration: (seconds: number) => void
  onToggleComplete: () => void
  onDelete: () => void
}

export const CardioSessionSetRow = memo(
  function CardioSessionSetRow({
    set,
    index,
    canDelete,
    onUpdateDuration,
    onToggleComplete,
    onDelete,
  }: CardioSessionSetRowProps) {
    const colors = useCadenceColors()
    const [surfaceVariable, raisedVariable] = useCSSVariable(COMPLETION_COLOR_VARIABLES)
    const surfaceColor = colorValue(surfaceVariable, colors.background)
    const raisedColor = colorValue(raisedVariable, colors.background)
    const reduceMotion = useReduceMotionPreference()
    const completionProgress = useSharedValue(set.completed ? 1 : 0)
    const checkReveal = useSharedValue(set.completed ? 1 : 0)
    const checkSettle = useSharedValue(1)
    const previousSet = useRef({ id: set.id, completed: set.completed })
    const previousReduceMotion = useRef(reduceMotion)
    const pendingUserCompletion = useRef<boolean | null>(null)

    const rowStyle = useAnimatedStyle(
      () => ({
        backgroundColor: interpolateColor(
          completionProgress.value,
          [0, 1],
          [surfaceColor, colors.accent]
        ),
      }),
      [surfaceColor, colors.accent]
    )
    const numberStyle = useAnimatedStyle(() => {
      const progress = completionProgress.value
      if (progress <= 0) return { color: colors.muted }
      if (progress >= 1) return { color: colors.onAccent }

      const backgroundColor = interpolateColor(progress, [0, 1], [surfaceColor, colors.accent])
      const isLightBackground = relativeLuminance(backgroundColor) > CONTRAST_SWITCH_LUMINANCE
      return { color: isLightBackground ? CONTRAST_DARK_TEXT : CONTRAST_LIGHT_TEXT }
    }, [surfaceColor, colors.accent, colors.muted, colors.onAccent])
    const checkboxStyle = useAnimatedStyle(
      () => ({
        backgroundColor: interpolateColor(
          completionProgress.value,
          [0, 1],
          [raisedColor, colors.accent]
        ),
        borderColor: interpolateColor(
          completionProgress.value,
          [0, 1],
          [colors.divider, colors.accent]
        ),
      }),
      [raisedColor, colors.divider, colors.accent]
    )
    const checkStyle = useAnimatedStyle(() => ({
      opacity: checkReveal.value,
      transform: [{ scale: checkSettle.value }],
    }))

    useLayoutEffect(() => {
      const previous = previousSet.current
      const target = set.completed ? 1 : 0
      const reduceMotionJustEnabled = !previousReduceMotion.current && reduceMotion

      if (previous.id !== set.id || reduceMotionJustEnabled) {
        pendingUserCompletion.current = null
        cancelAnimation(completionProgress)
        cancelAnimation(checkReveal)
        cancelAnimation(checkSettle)
        completionProgress.value = target
        checkReveal.value = target
        checkSettle.value = 1
      } else if (previous.completed !== set.completed) {
        const wasUserInitiated = pendingUserCompletion.current === set.completed
        pendingUserCompletion.current = null
        if (!wasUserInitiated) {
          cancelAnimation(completionProgress)
          cancelAnimation(checkReveal)
          cancelAnimation(checkSettle)
          completionProgress.value = target
          checkReveal.value = target
          checkSettle.value = 1
        }
      }

      previousSet.current = { id: set.id, completed: set.completed }
      previousReduceMotion.current = reduceMotion
    }, [set.id, set.completed, reduceMotion, completionProgress, checkReveal, checkSettle])

    const animateCompletion = (completed: boolean) => {
      const target = completed ? 1 : 0
      if (reduceMotion) {
        completionProgress.value = target
        checkReveal.value = target
        checkSettle.value = 1
        return
      }

      const easing = Easing.out(Easing.cubic)
      completionProgress.value = withTiming(target, {
        duration: completed ? COMPLETION_BLEND_DURATION_MS : 140,
        easing,
      })
      checkReveal.value = withTiming(target, {
        duration: completed ? COMPLETION_BLEND_DURATION_MS : 110,
        easing,
      })
      checkSettle.value = completed
        ? withSequence(
            withTiming(1.045, { duration: 110, easing }),
            withTiming(1, { duration: COMPLETION_SETTLE_DURATION_MS - 110, easing })
          )
        : withTiming(1, { duration: 110, easing })
    }

    const handleToggleComplete = () => {
      const nextCompleted = !set.completed
      pendingUserCompletion.current = nextCompleted
      animateCompletion(nextCompleted)
      onToggleComplete()
    }

    return (
      <SwipeToDeleteRow onDelete={onDelete} canDelete={canDelete}>
        <Animated.View
          className="w-full min-w-0 flex-row items-center gap-compact"
          style={rowStyle}
        >
          <View className="w-8 items-center">
            <Animated.Text
              className="text-caption font-dm-regular"
              style={numberStyle}
              accessibilityLabel={`Interval ${index + 1}`}
              accessibilityHint={
                canDelete
                  ? 'Swipe left or use the Delete action to remove this interval.'
                  : 'At least one interval is required.'
              }
              accessibilityActions={canDelete ? [{ name: 'delete', label: 'Delete interval' }] : []}
              onAccessibilityAction={(event) => {
                if (canDelete && event.nativeEvent.actionName === 'delete') onDelete()
              }}
            >
              {index + 1}
            </Animated.Text>
          </View>
          <DurationTargetInput
            mode="session"
            index={index}
            seconds={set.durationSeconds ?? 0}
            completed={set.completed}
            onChange={onUpdateDuration}
          />
          <View className="w-touch items-center">
            <Button
              variant="secondary"
              shape="control"
              density="compact"
              className="h-touch w-touch min-w-touch border border-divider p-0"
              hitSlop={6}
              onPress={handleToggleComplete}
              accessibilityRole="checkbox"
              accessibilityLabel={`Interval ${index + 1} completed`}
              accessibilityState={{ checked: set.completed }}
            >
              <Animated.View
                className="absolute inset-0 rounded-control border"
                style={checkboxStyle}
                pointerEvents="none"
                accessible={false}
              />
              <Animated.View style={checkStyle} pointerEvents="none" accessible={false}>
                <Check size={18} color={colors.onAccent} strokeWidth={2} aria-hidden />
              </Animated.View>
            </Button>
          </View>
        </Animated.View>
      </SwipeToDeleteRow>
    )
  },
  (prev, next) => {
    return (
      prev.set.id === next.set.id &&
      prev.set.durationSeconds === next.set.durationSeconds &&
      prev.set.completed === next.set.completed &&
      prev.index === next.index &&
      prev.canDelete === next.canDelete
    )
  }
)

export default CardioSessionSetRow
