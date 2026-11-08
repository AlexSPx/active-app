import { BottomTabBar, type BottomTabBarProps } from 'expo-router/js-tabs'
import { useEffect, useState } from 'react'
import { I18nManager, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useResolveClassNames } from 'uniwind'

const TAB_BAR_INSET = 8

export function AnimatedTabBar(props: BottomTabBarProps) {
  const [layout, setLayout] = useState({ width: 0, height: 72 })
  const surfaceStyles = useResolveClassNames('bg-navigation')
  const selectedStyles = useResolveClassNames('bg-featured')
  const selectedIndex = useSharedValue(props.state.index)
  const routeCount = props.state.routes.length
  const tabWidth = (layout.width - TAB_BAR_INSET * 2) / routeCount
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
        translateX: (isRTL ? -selectedIndex.value : selectedIndex.value) * tabWidth,
      },
    ],
  }))

  return (
    <View
      onLayout={(event) => setLayout(event.nativeEvent.layout)}
      style={{
        borderRadius: layout.height / 2,
        paddingHorizontal: TAB_BAR_INSET,
        ...surfaceStyles,
        overflow: 'hidden',
      }}
    >
      {layout.width > 0 && (
        <Animated.View
          pointerEvents="none"
          accessible={false}
          style={[
            {
              position: 'absolute',
              start: TAB_BAR_INSET,
              top: TAB_BAR_INSET,
              bottom: TAB_BAR_INSET,
              width: tabWidth,
              borderRadius: Math.max(0, layout.height / 2 - TAB_BAR_INSET),
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
