const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('react-native', () => ({
  Pressable: (props) => require('react').createElement('Pressable', props, props.children),
  View: (props) => require('react').createElement('View', props, props.children),
  Platform: { OS: 'android' },
  Keyboard: { addListener: jest.fn(() => ({ remove: jest.fn() })) },
  useWindowDimensions: jest.fn(() => ({ fontScale: 1 })),
}))
jest.mock('@react-navigation/bottom-tabs', () => ({
  BottomTabBar: (props) => require('react').createElement('BottomTabBar', props),
}))
jest.mock('@react-navigation/elements', () => ({
  PlatformPressable: (props) =>
    require('react').createElement('PlatformPressable', props, props.children),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 0, left: 0 }),
}))
jest.mock('uniwind', () => ({
  useCSSVariable: () => ['#faf7fc', '#2d2235', '#76627e', '#dcd0e4', '#624572', '#faf5fc'],
  useResolveClassNames: () => ({}),
}))
jest.mock('../../components/ui/Controls', () => {
  const React = require('react')
  return {
    UiText: ({ children, ...props }) => React.createElement('Text', props, children),
  }
})
jest.mock('expo-router', () => {
  const React = require('react')
  const Tabs = (props) => {
    const { useTabContentInset } = require('../../navigation/TabContentInset')
    return React.createElement(
      'Tabs',
      { ...props, contentBottomInset: useTabContentInset() },
      props.children,
      props.tabBar({})
    )
  }
  Tabs.Screen = () => null
  return {
    Tabs,
    usePathname: () => '/',
    useFocusEffect: (callback) => React.useEffect(callback, [callback]),
    useRouter: () => ({ push: mockPush }),
  }
})
jest.mock('../../components/ui/icons', () => ({
  Home: () => null,
  History: () => null,
  Dumbbell: () => null,
  Settings: () => null,
  Clock: () => null,
}))
jest.mock('../../features/workout-session', () => ({
  RunningWorkoutStrip: require('../../features/workout-session/components/RunningWorkoutStrip')
    .default,
}))
jest.mock('../../features/workout-session/stores/runningWorkoutStore', () => ({
  useRunningWorkoutStore: (selector) => (selector ? selector(mockStore) : mockStore),
}))

const { Keyboard, useWindowDimensions } = require('react-native')
const TabLayout = require('../../app/(tabs)/_layout').default
const mockPush = jest.fn()
const mockStore = {
  runningWorkout: null,
  isWorkoutRunning: () => !!mockStore.runningWorkout,
  getElapsedTime: () => 65000,
}
let view
beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  mockStore.runningWorkout = null
  useWindowDimensions.mockReturnValue({ fontScale: 1 })
})
afterEach(() => {
  act(() => view.unmount())
  jest.useRealTimers()
})
const options = () => view.root.findByType('Tabs').props.screenOptions
const bar = () => view.root.findByType('BottomTabBar')
const bottomInset = () => view.root.findByType('Tabs').props.contentBottomInset
const keyboard = (event) => Keyboard.addListener.mock.calls.find(([name]) => name === event)[1]()

test('idle tabs reserve content space and grow for larger text', () => {
  act(() => {
    view = create(React.createElement(TabLayout))
  })
  expect(view.root.findAllByType('Pressable')).toHaveLength(0)
  const normal = options()
  expect(normal.sceneStyle.backgroundColor).toBe('transparent')
  expect(normal.sceneStyle.paddingBottom).toBeUndefined()
  const normalInset = bottomInset()
  expect(normalInset).toBeGreaterThan(normal.tabBarStyle.height)
  useWindowDimensions.mockReturnValue({ fontScale: 1.5 })
  act(() => view.update(React.createElement(TabLayout)))
  expect(options().tabBarStyle.height).toBeGreaterThan(normal.tabBarStyle.height)
  expect(bottomInset()).toBeGreaterThan(normalInset)
})

test('a measured running shortcut clears the content, resumes the session, and hides for the keyboard', () => {
  mockStore.runningWorkout = {
    name: 'Morning workout',
    currentExerciseIndex: 0,
    exercises: [{ name: 'Squat', sessionSets: [{ completed: true }, { completed: false }] }],
  }
  act(() => {
    view = create(React.createElement(TabLayout))
  })
  const shortcut = () => view.root.findByType('Pressable')
  expect(bar().parent.parent.findAllByType('Pressable')).toHaveLength(0)
  expect(options().tabBarStyle.backgroundColor).toBe('transparent')
  expect(options().sceneStyle.backgroundColor).toBe('transparent')
  expect(shortcut().props.accessibilityLabel).toBe('Resume Morning workout, workout in progress')
  expect(shortcut().props.accessibilityValue.text).toContain('1 of 2 sets complete')
  const card = () => view.root.findAllByType('View').find((node) => node.props.onLayout)
  act(() => card().props.onLayout({ nativeEvent: { layout: { height: 132 } } }))
  expect(bottomInset()).toBe(options().tabBarStyle.height + 8 + 126 + 16)
  act(() => shortcut().props.onPress())
  expect(mockPush).toHaveBeenCalledWith('/workouts/session')
  act(() => keyboard('keyboardDidShow'))
  expect(view.root.findAllByType('Pressable')).toHaveLength(0)
  expect(bottomInset()).toBe(0)
  expect(view.root.findAllByType('BottomTabBar')).toHaveLength(0)
  act(() => keyboard('keyboardDidHide'))
  expect(shortcut().props.accessibilityRole).toBe('button')
  expect(bottomInset()).toBe(options().tabBarStyle.height + 8 + 126 + 16)
  mockStore.runningWorkout = null
  act(() => view.update(React.createElement(TabLayout)))
  expect(view.root.findAllByType('Pressable')).toHaveLength(0)
  expect(view.root.findAllByType('BottomTabBar')).toHaveLength(1)
  expect(bottomInset()).toBe(options().tabBarStyle.height + 8 + 16)
})
