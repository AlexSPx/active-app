import { YStack, XStack, Text, Checkbox } from 'tamagui'
import { StyleSheet } from 'react-native'
import { useEffect, memo, useState, useRef } from 'react'
import { Check } from '@tamagui/lucide-icons'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler'
import SmartTimeInput from '../../../components/ui/SmartTimeInput'
import type { Set } from '../../../types/workout-session'

const SWIPE_THRESHOLD = -80

interface CardioSessionSetRowProps {
  set: Set
  index: number
  onUpdateDuration: (seconds: number) => void
  onToggleComplete: () => void
  onDelete: () => void
}

// Format raw digits to live M:SS display as user types
// Shows digits as if they're being entered into MM:SS slots from right to left
// "7" -> "0:07", "70" -> "0:70", "700" -> "7:00"
const formatRawDigits = (raw: string): string => {
  if (!raw) return '0:00'
  const digits = raw.replace(/\D/g, '')
  if (!digits) return '0:00'

  // Pad left with zeros to ensure we can always extract last 2 as seconds
  const padded = digits.padStart(3, '0')
  const secondsPart = padded.slice(-2)
  const minutesPart = padded.slice(0, -2)

  const mins = parseInt(minutesPart, 10) || 0
  const secs = parseInt(secondsPart, 10)

  return `${mins}:${String(secs).padStart(2, '0')}`
}

// Convert raw digit string to total seconds for storage
const digitsToSeconds = (raw: string): number => {
  if (!raw) return 0
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 0

  const padded = digits.padStart(3, '0')
  const secondsPart = padded.slice(-2)
  const minutesPart = padded.slice(0, -2)

  const mins = parseInt(minutesPart, 10) || 0
  const secs = parseInt(secondsPart, 10)

  return mins * 60 + secs
}

// Convert total seconds back to raw digit string (for re-editing)
const secondsToDigits = (total: number): string => {
  if (!total || total <= 0) return ''
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}${String(s).padStart(2, '0')}`
}

export const CardioSessionSetRow = memo(
  function CardioSessionSetRow({
    set,
    index,
    onUpdateDuration,
    onToggleComplete,
    onDelete,
  }: CardioSessionSetRowProps) {
    const translateX = useSharedValue(0)
    const [displaySeconds, setDisplaySeconds] = useState(set.durationSeconds ?? 0)

    useEffect(() => {
      translateX.value = 0
    }, [index, translateX])

    const gesture = Gesture.Pan()
      .onUpdate((e) => {
        if (e.translationX < 0) {
          translateX.value = e.translationX
        }
      })
      .onEnd(() => {
        if (translateX.value < SWIPE_THRESHOLD) {
          translateX.value = withSpring(0)
          runOnJS(onDelete)()
        } else {
          translateX.value = withSpring(0)
        }
      })

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }))

    const deleteStyle = useAnimatedStyle(() => ({
      opacity: translateX.value < SWIPE_THRESHOLD ? 1 : 0,
    }))

    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <YStack style={styles.container}>
          <Animated.View
            style={[StyleSheet.absoluteFillObject, styles.deleteBackground, deleteStyle]}
          >
            <Text color="white" fontSize="$4">
              🗑️
            </Text>
          </Animated.View>
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.row, animatedStyle]}>
              <XStack items="center" gap="$compact" bg={set.completed ? '$primary' : '$surface'}>
                {/* Set Number */}
                <YStack width="$setRow" items="center">
                  <Text fontSize="$caption" color={set.completed ? '$onPrimary' : '$colorSubtle'}>
                    {index + 1}
                  </Text>
                </YStack>
                {/* Duration Input */}
                <YStack flex={1} items="center">
                  <SmartTimeInput
                    height="$touch"
                    rounded="$day"
                    px="$compact"
                    fontSize="$body"
                    text="center"
                    bg={set.completed ? '$primary' : '$backgroundStrong'}
                    borderColor={set.completed ? '$primary' : '$borderColor'}
                    color={set.completed ? '$onPrimary' : '$color'}
                    placeholderTextColor={set.completed ? '$onPrimary' : '$placeholderColor'}
                    focusStyle={
                      set.completed
                        ? { bg: '$primary', borderColor: '$onPrimary', color: '$onPrimary' }
                        : undefined
                    }
                    accessibilityLabel={`Interval ${index + 1} duration in minutes and seconds`}
                    seconds={displaySeconds}
                    onChangeSeconds={(secs) => {
                      // optimistic local update
                      setDisplaySeconds(secs)
                      // persist via parent
                      onUpdateDuration(secs)
                    }}
                    placeholder="0:00"
                  />
                </YStack>
                <YStack width="$setRow" items="center">
                  <Checkbox
                    unstyled
                    width="$setRow"
                    height="$setRow"
                    rounded="$block"
                    items="center"
                    justify="center"
                    borderWidth="$0.5"
                    hitSlop={6}
                    checked={set.completed}
                    onCheckedChange={onToggleComplete}
                    accessibilityLabel={`Interval ${index + 1} completed`}
                    bg={set.completed ? '$primary' : '$backgroundStrong'}
                    borderColor={set.completed ? '$primary' : '$borderColor'}
                  >
                    <Checkbox.Indicator>
                      <Check size="$iconSmall" color="$onPrimary" strokeWidth={2} />
                    </Checkbox.Indicator>
                  </Checkbox>
                </YStack>
              </XStack>
            </Animated.View>
          </GestureDetector>
        </YStack>
      </GestureHandlerRootView>
    )
  },
  (prev, next) => {
    return (
      prev.set.id === next.set.id &&
      prev.set.durationSeconds === next.set.durationSeconds &&
      prev.set.completed === next.set.completed &&
      prev.index === next.index
    )
  }
)

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
  },
  deleteBackground: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    borderRadius: 8,
  },
  row: {
    borderRadius: 8,
    width: '100%',
  },
})

export default CardioSessionSetRow
