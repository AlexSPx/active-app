import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { UiText } from './Controls'

const DELETE_DISTANCE = 80
const GESTURE_SLOP = 12

export function SwipeToDeleteRow({
  children,
  onDelete,
  canDelete = true,
}: {
  children: ReactNode
  onDelete: () => void
  canDelete?: boolean
}) {
  const translateX = useSharedValue(0)
  const gesture = Gesture.Pan()
    .enabled(canDelete)
    .activeOffsetX(-GESTURE_SLOP)
    .failOffsetY([-GESTURE_SLOP, GESTURE_SLOP])
    .onUpdate((event) => {
      translateX.value = Math.min(0, event.translationX)
    })
    .onEnd(() => {
      const shouldDelete = canDelete && translateX.value < -DELETE_DISTANCE
      translateX.value = withSpring(0)
      if (shouldDelete) runOnJS(onDelete)()
    })

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))
  const deleteStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -GESTURE_SLOP ? 1 : 0,
  }))

  return (
    <GestureHandlerRootView style={styles.root}>
      <View className="mb-compact overflow-hidden rounded-control">
        <Animated.View
          className="absolute inset-0 items-end justify-center rounded-control bg-destructive px-field"
          style={[StyleSheet.absoluteFillObject, deleteStyle]}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <UiText textRole="buttonOnAccent">Delete</UiText>
        </Animated.View>
        <GestureDetector gesture={gesture}>
          <Animated.View style={rowStyle}>{children}</Animated.View>
        </GestureDetector>
      </View>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%' },
})
