import { YStack, XStack, Text, Button, Input } from 'tamagui'
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
import type { Set } from '../../types/workout-session'

const SWIPE_THRESHOLD = -80

interface WorkoutSessionSetRowProps {
  set: Set
  index: number
  previousSet?: { reps: number; weight: number }
  onUpdateSet: (field: 'reps' | 'weight', value: number) => void
  onToggleComplete: () => void
  onDelete: () => void
}

export const WorkoutSessionSetRow = memo(
  function WorkoutSessionSetRow({
    set,
    index,
    previousSet,
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
              <XStack
                items="center"
                gap="$2"
                bg={set.completed ? '$primary' : '$surface'}
                p="$1"
                opacity={set.completed ? 0.8 : 1}
              >
                {/* Set Number */}
                <YStack flex={1} items="center">
                  <Text
                    fontSize="$4"
                    fontWeight="600"
                    color={set.completed ? '$onPrimary' : '$color'}
                  >
                    {index + 1}
                  </Text>
                </YStack>

                {/* Previous Set Data */}
                <YStack flex={1} items="center">
                  {previousSet ? (
                    <Text fontSize="$3" color={set.completed ? '$onPrimary' : '$colorSubtle'}>
                      {previousSet.weight}×{previousSet.reps}
                    </Text>
                  ) : (
                    <Text fontSize="$3" color={set.completed ? '$onPrimary' : '$colorSubtle'}>
                      -
                    </Text>
                  )}
                </YStack>

                {/* Weight Input */}
                <YStack flex={1} items="center">
                  <Input
                    width="100%"
                    size="$3"
                    py="$0"
                    px="$3"
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
                    bg={set.completed ? '$surface' : '$backgroundPress'}
                    borderColor={set.completed ? '$onPrimary' : '$borderColor'}
                    color={set.completed ? '$color' : '$color'}
                    opacity={set.completed ? 0.9 : 1}
                  />
                </YStack>

                {/* Reps Input */}
                <YStack flex={1} items="center">
                  <Input
                    width="100%"
                    size="$3"
                    py="$0"
                    px="$3"
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
                    bg={set.completed ? '$surface' : '$backgroundPress'}
                    borderColor={set.completed ? '$onPrimary' : '$borderColor'}
                    color={set.completed ? '$color' : '$color'}
                    opacity={set.completed ? 0.9 : 1}
                  />
                </YStack>

                {/* Complete Button */}
                <YStack width={40} items="center">
                  <Button
                    size="$3"
                    width={40}
                    circular
                    bg={set.completed ? '$primary' : '$backgroundPress'}
                    borderColor={set.completed ? '$primary' : '$borderColor'}
                    onPress={onToggleComplete}
                    icon={set.completed ? <Check size={16} color="$onPrimary" /> : undefined}
                  />
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
    marginBottom: 4,
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
