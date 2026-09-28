import { Text, YStack, XStack, Button } from 'tamagui'
import { StyleSheet } from 'react-native'
import { memo, useEffect } from 'react'
import { useToastController } from '@tamagui/toast'
import { Trash2 } from '@tamagui/lucide-icons'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler'
import SmartTimeInput from '../../../components/ui/SmartTimeInput'

interface CardioEditorSetRowProps {
  index: number
  durationSeconds: number | null | undefined
  onChange: (seconds: number | null) => void
  onDelete: () => () => void
}

const SWIPE_THRESHOLD = -80

export const CardioEditorSetRow = memo(function CardioEditorSetRow({
  index,
  durationSeconds,
  onChange,
  onDelete,
}: CardioEditorSetRowProps) {
  const toast = useToastController()
  const translateX = useSharedValue(0)

  const deleteInterval = () => {
    const undo = onDelete()
    toast.show('Interval deleted', {
      duration: 5000,
      message: 'Tap Undo to restore its value.',
      customData: { undo },
    })
  }

  useEffect(() => {
    translateX.value = 0
  }, [index, translateX])

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationX < 0) translateX.value = e.translationX
    })
    .onEnd(() => {
      if (translateX.value < SWIPE_THRESHOLD) {
        translateX.value = withSpring(0)
        runOnJS(deleteInterval)()
      } else {
        translateX.value = withSpring(0)
      }
    })

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))
  const deleteStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < SWIPE_THRESHOLD ? 1 : 0,
  }))

  return (
    <GestureHandlerRootView>
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
            <YStack gap="$1">
              <XStack items="center" gap="$2" bg="$surface" p="$1" r="$2">
                <YStack flex={1} items="center">
                  <Text fontSize="$4" fontWeight="600" color="$color">
                    {index + 1}
                  </Text>
                </YStack>
                <YStack flex={2} items="center">
                  <SmartTimeInput
                    seconds={typeof durationSeconds === 'number' ? durationSeconds : 0}
                    onChangeSeconds={(secs) => onChange(Number.isFinite(secs) ? secs : null)}
                    placeholder="0:00"
                    size="$4"
                    height={48}
                    fontSize="$4"
                    accessibilityLabel={`Interval ${index + 1} duration in minutes and seconds`}
                  />
                </YStack>
              </XStack>
              <XStack justify="flex-end">
                <Button
                  size="$3"
                  height={48}
                  accessibilityLabel={`Delete interval ${index + 1}`}
                  accessibilityHint="You can undo this for a few seconds."
                  icon={<Trash2 size={18} color="$red10" />}
                  color="$red10"
                  onPress={deleteInterval}
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
})

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
  row: { borderRadius: 8, width: '100%' },
})

export default CardioEditorSetRow
