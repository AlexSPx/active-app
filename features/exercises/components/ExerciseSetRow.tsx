import { Text, Input, XStack, YStack, Button } from 'tamagui'
import { StyleSheet } from 'react-native'
import { useEffect } from 'react'
import { useToastController } from '@tamagui/toast'
import { Trash2 } from '@tamagui/lucide-icons'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler'

const SWIPE_THRESHOLD = -80

type SetRowProps = {
  index: number
  weight: number | null | undefined
  reps: number | null | undefined
  onChange: (key: 'weight' | 'reps', value: number | null) => void
  onDelete: () => () => void
}

export function ExerciseSetRow({ index, weight, reps, onChange, onDelete }: SetRowProps) {
  const toast = useToastController()
  const translateX = useSharedValue(0)

  const deleteSet = () => {
    const undo = onDelete()
    toast.show('Set deleted', {
      duration: 5000,
      message: 'Tap Undo to restore its values.',
      customData: { undo },
    })
  }

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
        runOnJS(deleteSet)()
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
    <GestureHandlerRootView>
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
            <YStack gap="$1">
              <XStack items="center" gap="$2" bg="$surface" p="$1" r="$2">
                {/* Set Number */}
                <YStack flex={0.6} items="center">
                  <Text fontSize="$4" fontWeight="600" color="$color">
                    {index + 1}
                  </Text>
                </YStack>

                {/* Weight Input */}
                <Input
                  flex={1.2}
                  size="$4"
                  height={48}
                  placeholder="kg"
                  py="$0"
                  px="$3"
                  fontSize="$4"
                  accessibilityLabel={`Set ${index + 1} weight in kilograms`}
                  keyboardType="numeric"
                  value={weight === null || typeof weight === 'undefined' ? '' : String(weight)}
                  onChangeText={(text) => {
                    if (text.trim() === '') {
                      onChange('weight', null)
                      return
                    }
                    const weightValue = Number.parseFloat(text)
                    if (!Number.isNaN(weightValue)) {
                      onChange('weight', weightValue)
                    }
                  }}
                  bg="$backgroundPress"
                  borderColor="$borderColor"
                />

                {/* Reps Input */}
                <Input
                  flex={1.2}
                  size="$4"
                  height={48}
                  py="$0"
                  px="$3"
                  fontSize="$4"
                  accessibilityLabel={`Set ${index + 1} reps`}
                  placeholder="reps"
                  keyboardType="numeric"
                  value={reps === null || typeof reps === 'undefined' ? '' : String(reps)}
                  onChangeText={(text) => {
                    if (text.trim() === '') {
                      onChange('reps', null)
                      return
                    }
                    const repsValue = Number.parseInt(text)
                    if (!Number.isNaN(repsValue)) {
                      onChange('reps', repsValue)
                    }
                  }}
                  bg="$backgroundPress"
                  borderColor="$borderColor"
                />
              </XStack>
              <XStack justify="flex-end">
                <Button
                  size="$3"
                  height={48}
                  accessibilityLabel={`Delete set ${index + 1}`}
                  accessibilityHint="You can undo this for a few seconds."
                  icon={<Trash2 size={18} color="$red10" />}
                  color="$red10"
                  onPress={deleteSet}
                >
                  Delete
                </Button>
              </XStack>
            </YStack>
          </Animated.View>
        </GestureDetector>
      </YStack>
    </GestureHandlerRootView>
  )
}

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
