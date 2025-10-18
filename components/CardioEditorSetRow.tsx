import { Text, YStack, XStack, Button } from 'tamagui'
import { StyleSheet } from 'react-native'
import { memo, useEffect } from 'react'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler'
import SmartTimeInput from './ui/SmartTimeInput'

interface CardioEditorSetRowProps {
  index: number
  durationSeconds: number | null | undefined
  onChange: (seconds: number | null) => void
  onDelete: () => void
}

const SWIPE_THRESHOLD = -80

export const CardioEditorSetRow = memo(function CardioEditorSetRow({
  index,
  durationSeconds,
  onChange,
  onDelete,
}: CardioEditorSetRowProps) {
  const translateX = useSharedValue(0)

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
        runOnJS(onDelete)()
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
                />
              </YStack>
            </XStack>
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
