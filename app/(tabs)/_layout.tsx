import { Tabs, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Keyboard, Platform, View, useWindowDimensions } from 'react-native'
import { useResolveClassNames } from 'uniwind'
import { Dumbbell, History, Home, Settings as SettingsIcon } from '../../components/ui/icons'
import { RunningWorkoutFloat } from '../../features/workout-session'
import { useCadenceColors } from '../../components/ui/useCadenceColors'
import { useRunningWorkoutStore } from '../../features/workout-session/stores/runningWorkoutStore'
import { TabContentInsetContext } from '../../navigation/TabContentInset'

const TAB_BAR_MARGIN = 8
const TAB_BAR_GAP = 12
const CONTENT_GAP = 16
const RUNNING_CARD_ESTIMATED_HEIGHT = 84

export default function TabLayout() {
  const colors = useCadenceColors()
  const { fontScale } = useWindowDimensions()
  const workoutRunning = useRunningWorkoutStore((state) => !!state.runningWorkout)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [runningCardHeight, setRunningCardHeight] = useState(RUNNING_CARD_ESTIMATED_HEIGHT)
  const titleStyles = useResolveClassNames('text-header font-dm-semibold')
  const workoutTitleStyles = useResolveClassNames('text-workout-header font-dm-semibold')
  const tabBarHeight = Math.max(48, 48 + (fontScale - 1) * 14)
  const runningCardBottomOffset = tabBarHeight + TAB_BAR_MARGIN + TAB_BAR_GAP
  const contentBottomClearance = keyboardVisible
    ? 0
    : workoutRunning
      ? runningCardBottomOffset + runningCardHeight + CONTENT_GAP
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
          safeAreaInsets={{ top: 0, bottom: 0, left: 0, right: 0 }}
          screenOptions={{
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.muted,
            tabBarHideOnKeyboard: true,
            tabBarAllowFontScaling: true,
            tabBarLabelStyle: {
              fontFamily: 'DM Sans Medium',
              fontSize: 10,
              lineHeight: 12,
              marginTop: 1,
            },
            tabBarStyle: {
              position: 'absolute',
              marginHorizontal: 12,
              bottom: TAB_BAR_MARGIN,
              height: tabBarHeight,
              borderTopWidth: 0,
              borderRadius: 24,
              backgroundColor: colors.onAccent,
              elevation: 8,
              shadowColor: '#24192b',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.14,
              shadowRadius: 12,
            },
            sceneStyle: {
              backgroundColor: 'transparent',
            },
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTintColor: colors.accent,
            headerTitleAlign: 'left',
            headerShadowVisible: false,
            headerTitleStyle: {
              ...titleStyles,
              color: colors.foreground,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Home',
              tabBarAccessibilityLabel: 'Home',
              tabBarIcon: ({ color }) => <Home color={color as any} />,
            }}
          />
          <Tabs.Screen
            name="(history)"
            options={{
              title: 'History',
              tabBarAccessibilityLabel: 'History',
              tabBarIcon: ({ color }) => <History color={color as any} />,
              // Use the nested stack header for History screens
              headerShown: false,
            }}
          />
          <Tabs.Screen
            name="(workouts)"
            options={{
              title: 'Workouts',
              headerStyle: { backgroundColor: colors.background, height: 64 },
              headerTitleStyle: {
                ...workoutTitleStyles,
                color: colors.foreground,
              },
              tabBarLabel: 'Workouts',
              tabBarAccessibilityLabel: 'Workouts',
              tabBarIcon: ({ color }) => <Dumbbell color={color as any} />,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              headerShown: false,
              tabBarAccessibilityLabel: 'Settings',
              tabBarIcon: ({ color }) => <SettingsIcon color={color as any} />,
            }}
          />
        </Tabs>

        {/* Running Workout - Floating above tab bar */}
        <RunningWorkoutFloat
          bottomOffset={runningCardBottomOffset}
          hidden={keyboardVisible}
          onHeightChange={setRunningCardHeight}
        />
      </View>
    </TabContentInsetContext.Provider>
  )
}
