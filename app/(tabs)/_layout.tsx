import { BottomTabBar, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs'
import { PlatformPressable } from '@react-navigation/elements'
import { Tabs, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Keyboard, Platform, View, useWindowDimensions } from 'react-native'
import { useResolveClassNames } from 'uniwind'
import { Dumbbell, History, Home, Settings as SettingsIcon } from '../../components/ui/icons'
import { RunningWorkoutStrip } from '../../features/workout-session'
import { useRunningWorkoutStore } from '../../features/workout-session/stores/runningWorkoutStore'
import { TabContentInsetContext } from '../../navigation/TabContentInset'
import { TabHeader } from '../../navigation/TabHeader'

const TAB_BAR_MARGIN = 8
const CONTENT_GAP = 16
const RUNNING_STRIP_ESTIMATED_HEIGHT = 48

function TabBarButton(props: BottomTabBarButtonProps) {
  const selectedStyles = useResolveClassNames('bg-featured')

  return (
    <PlatformPressable
      {...props}
      style={[
        props.style,
        {
          justifyContent: 'center',
          padding: 0,
          borderRadius: 28,
        },
        props['aria-selected'] ? selectedStyles : undefined,
      ]}
    />
  )
}

export default function TabLayout() {
  const { fontScale } = useWindowDimensions()
  const workoutRunning = useRunningWorkoutStore((state) => !!state.runningWorkout)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [runningStripHeight, setRunningStripHeight] = useState(RUNNING_STRIP_ESTIMATED_HEIGHT)
  const tabBarSurfaceStyles = useResolveClassNames('bg-navigation')
  const tabBarHeight = Math.max(64, 64 + (fontScale - 1) * 18)
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
                <View
                  style={{
                    borderRadius: 32,
                    ...tabBarSurfaceStyles,
                    overflow: 'hidden',
                  }}
                >
                  <BottomTabBar {...props} />
                </View>
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
            name="settings"
            options={{
              title: 'Settings',
              headerShown: false,
              tabBarAccessibilityLabel: 'Settings',
              tabBarIcon: ({ color }) => <SettingsIcon color={color} size={24} />,
            }}
          />
        </Tabs>
      </View>
    </TabContentInsetContext.Provider>
  )
}
