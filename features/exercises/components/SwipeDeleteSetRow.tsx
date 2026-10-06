import type { ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import { Text, YStack, getTokenValue } from 'tamagui'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'

export function SwipeDeleteSetRow({
  children,
  onDelete,
}: {
  children: ReactNode
  onDelete: () => void
}) {
  const translateX = useSharedValue(0)
  const threshold = getTokenValue('$action', 'size')
  const gesture = Gesture.Pan()
    .activeOffsetX(-getTokenValue('$field', 'space'))
    .failOffsetY([-getTokenValue('$field', 'space'), getTokenValue('$field', 'space')])
    .onUpdate((event) => {
      translateX.value = Math.min(0, event.translationX)
    })
    .onEnd(() => {
      if (translateX.value < -threshold) runOnJS(onDelete)()
      translateX.value = withSpring(0)
    })
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))
  const deleteStyle = useAnimatedStyle(() => ({ opacity: translateX.value < 0 ? 1 : 0 }))

  return (
    <GestureHandlerRootView>
      <YStack overflow="hidden" rounded="$day" mb="$compact">
        <Animated.View
          style={[StyleSheet.absoluteFillObject, deleteStyle]}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <YStack flex={1} bg="$destructive" justify="center" items="flex-end" px="$field">
            <Text color="$surface" fontSize="$caption">
              Delete
            </Text>
          </YStack>
        </Animated.View>
        <GestureDetector gesture={gesture}>
          <Animated.View style={animatedStyle}>{children}</Animated.View>
        </GestureDetector>
      </YStack>
    </GestureHandlerRootView>
  )
}
