import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useEffect, useState } from 'react'
import { I18nManager, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useResolveClassNames } from 'uniwind'

export function AnimatedTabBar(props: BottomTabBarProps) {
  const [width, setWidth] = useState(0)
  const surfaceStyles = useResolveClassNames('bg-navigation')
  const selectedStyles = useResolveClassNames('bg-featured')
  const selectedIndex = useSharedValue(props.state.index)
  const routeCount = props.state.routes.length
  const tabWidth = width / routeCount
  const isRTL = I18nManager.isRTL

  useEffect(() => {
    selectedIndex.value = withTiming(props.state.index, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    })
  }, [props.state.index, selectedIndex])

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: (isRTL ? routeCount - 1 - selectedIndex.value : selectedIndex.value) * tabWidth,
      },
    ],
  }))

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ borderRadius: 32, ...surfaceStyles, overflow: 'hidden' }}
    >
      {width > 0 && (
        <Animated.View
          pointerEvents="none"
          accessible={false}
          style={[
            {
              position: 'absolute',
              left: 4,
              top: 4,
              bottom: 4,
              width: tabWidth - 8,
              borderRadius: 28,
            },
            selectedStyles,
            highlightStyle,
          ]}
        />
      )}
      <BottomTabBar {...props} />
    </View>
  )
}
