import type { BottomTabBarButtonProps } from 'expo-router/js-tabs'
import { PlatformPressable } from 'expo-router/react-navigation'
import { Tabs, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Keyboard, Platform, View, useWindowDimensions } from 'react-native'
import { Dumbbell, History, Home, Library } from '../../components/ui/icons'
import { RunningWorkoutStrip } from '../../features/workout-session'
import { useRunningWorkoutStore } from '../../features/workout-session/stores/runningWorkoutStore'
import { AnimatedTabBar } from '../../navigation/AnimatedTabBar'
import { TabContentInsetContext } from '../../navigation/TabContentInset'
import { TabHeader } from '../../navigation/TabHeader'

const TAB_BAR_MARGIN = 8
const CONTENT_GAP = 16
const RUNNING_STRIP_ESTIMATED_HEIGHT = 48

function TabBarButton(props: BottomTabBarButtonProps) {
  const [pressed, setPressed] = useState(false)

  return (
    <PlatformPressable
      {...props}
      pressColor="transparent"
      pressOpacity={1}
      onPressIn={(event) => {
        setPressed(true)
        props.onPressIn?.(event)
      }}
      onPressOut={(event) => {
        setPressed(false)
        props.onPressOut?.(event)
      }}
      style={[
        props.style,
        {
          justifyContent: 'center',
          padding: 0,
          borderRadius: 28,
        },
      ]}
    >
      {pressed && (
        <View
          pointerEvents="none"
          accessible={false}
          className="bg-featured"
          style={{
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: -4,
            right: -4,
            borderRadius: 9999,
            opacity: 0.5,
          }}
        />
      )}
      {props.children}
    </PlatformPressable>
  )
}

export default function TabLayout() {
  const { fontScale } = useWindowDimensions()
  const workoutRunning = useRunningWorkoutStore((state) => !!state.runningWorkout)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [runningStripHeight, setRunningStripHeight] = useState(RUNNING_STRIP_ESTIMATED_HEIGHT)
  const tabBarHeight = Math.max(72, 72 + (fontScale - 1) * 18)
  const contentBottomClearance = keyboardVisible
    ? 0
    : workoutRunning
      ? tabBarHeight + TAB_BAR_MARGIN + runningStripHeight + CONTENT_GAP
      : tabBarHeight + TAB_BAR_MARGIN + CONTENT_GAP

  useFocusEffect(
    useCallback(() => {
      setKeyboardVisible(false)
    }, [])
  )

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true))
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return (
    <TabContentInsetContext.Provider value={contentBottomClearance}>
      <View className="flex-1 bg-background">
        <Tabs
          tabBar={(props) =>
            keyboardVisible ? null : (
              <View
                style={{
                  position: 'absolute',
                  left: 16,
                  right: 16,
                  bottom: TAB_BAR_MARGIN,
                }}
              >
                <RunningWorkoutStrip onHeightChange={setRunningStripHeight} />
                <AnimatedTabBar {...props} />
              </View>
            )
          }
          safeAreaInsets={{ top: 0, bottom: 0, left: 0, right: 0 }}
          screenOptions={{
            tabBarActiveTintColor: '#2d2235',
            tabBarInactiveTintColor: '#76627d',
            tabBarLabelPosition: 'below-icon',
            tabBarHideOnKeyboard: true,
            tabBarAllowFontScaling: true,
            tabBarLabelStyle: {
              fontFamily: 'DM Sans Medium',
              fontSize: 12,
              lineHeight: 16,
              marginTop: 4,
            },
            tabBarIconStyle: { width: 24, height: 24 },
            tabBarItemStyle: { padding: 4 },
            tabBarButton: (props) => <TabBarButton {...props} />,
            tabBarStyle: {
              height: tabBarHeight,
              borderTopWidth: 0,
              backgroundColor: 'transparent',
              elevation: 0,
            },
            sceneStyle: {
              backgroundColor: 'transparent',
            },
            header: ({ options }) => <TabHeader title={options.title ?? ''} />,
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Home',
              tabBarAccessibilityLabel: 'Home',
              tabBarIcon: ({ color }) => <Home color={color} size={24} />,
            }}
          />
          <Tabs.Screen
            name="(history)"
            options={{
              title: 'History',
              tabBarAccessibilityLabel: 'History',
              tabBarIcon: ({ color }) => <History color={color} size={24} />,
              // Use the nested stack header for History screens
              headerShown: false,
            }}
          />
          <Tabs.Screen
            name="(workouts)"
            options={{
              title: 'Workouts',
              tabBarLabel: 'Workouts',
              tabBarAccessibilityLabel: 'Workouts',
              tabBarIcon: ({ color }) => <Dumbbell color={color} size={24} />,
            }}
          />
          <Tabs.Screen
            name="exercises"
            options={{
              title: 'Exercises',
              tabBarAccessibilityLabel: 'Exercises',
              tabBarIcon: ({ color }) => <Library color={color} size={24} />,
            }}
          />
        </Tabs>
      </View>
    </TabContentInsetContext.Provider>
  )
}
