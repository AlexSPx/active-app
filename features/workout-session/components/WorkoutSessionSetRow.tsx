import { YStack, XStack, Text, Checkbox, Input } from 'tamagui'
import { StyleSheet } from 'react-native'
import { useEffect, memo } from 'react'
import { Check } from '@tamagui/lucide-icons'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler'
import type { Set } from '../../../types/workout-session'

const SWIPE_THRESHOLD = -80

interface WorkoutSessionSetRowProps {
  set: Set
  index: number
  onUpdateSet: (field: 'reps' | 'weight', value: number) => void
  onToggleComplete: () => void
  onDelete: () => void
}

export const WorkoutSessionSetRow = memo(
  function WorkoutSessionSetRow({
    set,
    index,
    onUpdateSet,
    onToggleComplete,
    onDelete,
  }: WorkoutSessionSetRowProps) {
    const translateX = useSharedValue(0)

    // Reset position when component re-renders (e.g., when a set is deleted)
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
          // Reset position before deleting
          translateX.value = withSpring(0)
          // Auto-delete when swipe threshold is reached
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
          {/* Delete Background - absolutely positioned */}
          <Animated.View
            style={[StyleSheet.absoluteFillObject, styles.deleteBackground, deleteStyle]}
          >
            <Text color="white" fontSize="$4">
              🗑️
            </Text>
          </Animated.View>

          {/* Swipeable Row */}
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.row, animatedStyle]}>
              <XStack items="center" gap="$compact" bg={set.completed ? '$primary' : '$surface'}>
                {/* Set Number */}
                <YStack width="$setRow" items="center">
                  <Text fontSize="$caption" color={set.completed ? '$onPrimary' : '$colorSubtle'}>
                    {index + 1}
                  </Text>
                </YStack>

                {/* Weight Input */}
                <YStack flex={1} items="center">
                  <Input
                    width="100%"
                    height="$setRow"
                    minH="$setRow"
                    rounded="$day"
                    text="center"
                    fontSize="$body"
                    py="$0"
                    px="$compact"
                    accessibilityLabel={`Set ${index + 1} weight in kilograms`}
                    placeholder="kg"
                    keyboardType="numeric"
                    value={set.weight?.toString() || ''}
                    onChangeText={(text) => {
                      if (text.trim() === '') {
                        onUpdateSet('weight', undefined as any)
                        return
                      }
                      const weight = Number.parseFloat(text)
                      if (!Number.isNaN(weight)) onUpdateSet('weight', weight)
                    }}
                    bg={set.completed ? '$primary' : '$backgroundStrong'}
                    borderColor={set.completed ? '$primary' : '$borderColor'}
                    color={set.completed ? '$onPrimary' : '$color'}
                    placeholderTextColor={set.completed ? '$onPrimary' : '$placeholderColor'}
                    focusStyle={
                      set.completed
                        ? { bg: '$primary', borderColor: '$onPrimary', color: '$onPrimary' }
                        : undefined
                    }
                  />
                </YStack>

                {/* Reps Input */}
                <YStack flex={1} items="center">
                  <Input
                    width="100%"
                    height="$setRow"
                    minH="$setRow"
                    rounded="$day"
                    text="center"
                    fontSize="$body"
                    py="$0"
                    px="$compact"
                    accessibilityLabel={`Set ${index + 1} reps`}
                    placeholder="reps"
                    keyboardType="numeric"
                    value={set.reps?.toString() || ''}
                    onChangeText={(text) => {
                      if (text.trim() === '') {
                        onUpdateSet('reps', undefined as any)
                        return
                      }
                      const reps = Number.parseInt(text)
                      if (!Number.isNaN(reps)) onUpdateSet('reps', reps)
                    }}
                    bg={set.completed ? '$primary' : '$backgroundStrong'}
                    borderColor={set.completed ? '$primary' : '$borderColor'}
                    color={set.completed ? '$onPrimary' : '$color'}
                    placeholderTextColor={set.completed ? '$onPrimary' : '$placeholderColor'}
                    focusStyle={
                      set.completed
                        ? { bg: '$primary', borderColor: '$onPrimary', color: '$onPrimary' }
                        : undefined
                    }
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
                    accessibilityLabel={`Set ${index + 1} completed`}
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
  (prevProps, nextProps) => {
    // Only re-render if set data has changed
    return (
      prevProps.set.id === nextProps.set.id &&
      prevProps.set.weight === nextProps.set.weight &&
      prevProps.set.reps === nextProps.set.reps &&
      prevProps.set.completed === nextProps.set.completed &&
      prevProps.index === nextProps.index
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
