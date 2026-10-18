const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('react-native', () => ({
  View: (props) => require('react').createElement('View', props, props.children),
  Platform: { OS: 'android' },
  Keyboard: { addListener: jest.fn(() => ({ remove: jest.fn() })) },
  useWindowDimensions: jest.fn(() => ({ fontScale: 1 })),
}))
jest.mock('uniwind', () => ({
  useCSSVariable: () => ['#faf7fc', '#2d2235', '#76627e', '#dcd0e4', '#624572', '#faf5fc'],
  useResolveClassNames: () => ({}),
}))
jest.mock('expo-router', () => {
  const React = require('react')
  const Tabs = (props) => React.createElement('Tabs', props, props.children)
  Tabs.Screen = () => null
  return {
    Tabs,
    usePathname: () => '/',
    useFocusEffect: (callback) => React.useEffect(callback, [callback]),
    useRouter: () => ({ push: mockPush }),
  }
})
jest.mock('tamagui', () =>
  Object.fromEntries(
    ['Button', 'Text', 'XStack', 'YStack'].map((name) => [
      name,
      (props) => require('react').createElement(name, props, props.children),
    ])
  )
)
jest.mock('../../components/ui/icons', () => ({
  Home: () => null,
  History: () => null,
  Dumbbell: () => null,
  Settings: () => null,
  Clock: () => null,
  Play: () => null,
}))
jest.mock('../../features/workout-session', () => ({
  RunningWorkoutFloat: require('../../features/workout-session/components/RunningWorkoutFloat')
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
const keyboard = (event) => Keyboard.addListener.mock.calls.find(([name]) => name === event)[1]()

test('idle tabs reserve content space and grow for larger text', () => {
  act(() => {
    view = create(React.createElement(TabLayout))
  })
  expect(view.root.findAllByType('Button')).toHaveLength(0)
  const normal = options()
  expect(normal.sceneStyle.paddingBottom).toBeGreaterThan(normal.tabBarStyle.height)
  useWindowDimensions.mockReturnValue({ fontScale: 1.5 })
  act(() => view.update(React.createElement(TabLayout)))
  expect(options().tabBarStyle.height).toBeGreaterThan(normal.tabBarStyle.height)
  expect(options().sceneStyle.paddingBottom).toBeGreaterThan(normal.sceneStyle.paddingBottom)
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
  const shortcut = () => view.root.findByType('Button')
  expect(shortcut().props.accessibilityLabel).toBe('Resume Morning workout, workout in progress')
  expect(shortcut().props.accessibilityValue.text).toContain('1 of 2 sets complete')
  const card = () => view.root.findAllByType('YStack').find((node) => node.props.onLayout)
  act(() => card().props.onLayout({ nativeEvent: { layout: { height: 132 } } }))
  expect(options().sceneStyle.paddingBottom).toBeGreaterThanOrEqual(card().props.b + 132)
  act(() => shortcut().props.onPress())
  expect(mockPush).toHaveBeenCalledWith('/workouts/session')
  act(() => keyboard('keyboardDidShow'))
  expect(view.root.findAllByType('Button')).toHaveLength(0)
  expect(options().sceneStyle.paddingBottom).toBe(0)
  act(() => keyboard('keyboardDidHide'))
  expect(shortcut().props.accessibilityRole).toBe('button')
  expect(options().sceneStyle.paddingBottom).toBeGreaterThanOrEqual(card().props.b + 132)
})
