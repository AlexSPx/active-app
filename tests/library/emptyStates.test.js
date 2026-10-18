jest.mock('uniwind', () => ({
  useCSSVariable: () => ['#faf7fc', '#2d2235', '#76627e', '#dcd0e4', '#624572', '#faf5fc'],
}))
const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('react-native', () => {
  const React = require('react')
  return Object.fromEntries(
    ['View', 'Text', 'Pressable', 'ScrollView', 'ActivityIndicator'].map((name) => [
      name,
      React.forwardRef((props, ref) =>
        React.createElement(name, { ...props, ref }, props.children)
      ),
    ])
  )
})
jest.mock('@shopify/flash-list', () => ({
  FlashList: ({ data, ListEmptyComponent, ListHeaderComponent }) => {
    const React = require('react')
    return React.createElement(
      'FlashList',
      null,
      ListHeaderComponent || null,
      data && data.length ? null : ListEmptyComponent
    )
  },
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }))
jest.mock('../../utils/haptics', () => ({ haptics: { medium: jest.fn(), light: jest.fn() } }))
jest.mock('../../components/ui/icons', () => ({
  Check: () => null,
  Dumbbell: () => null,
  MoreHorizontal: () => null,
  Play: () => null,
}))
jest.mock('../../components/ui/ActionMenu', () => ({ ActionMenu: () => null }))

const { WorkoutList } = require('../../features/workouts/components/WorkoutList')
const { RoutineList } = require('../../features/routines/components/RoutineList')

const text = (renderer) =>
  renderer.root
    .findAllByType('Text')
    .map((node) => React.Children.toArray(node.props.children).join(''))

test('empty workout and routine libraries show the design guidance copy', () => {
  let workouts
  let routines
  act(() => {
    workouts = create(
      React.createElement(WorkoutList, {
        workouts: [],
        onStartWorkout: jest.fn(),
        isWorkoutRunning: false,
      })
    )
  })
  expect(text(workouts)).toEqual([
    'Make your first workout.',
    'Choose exercises and set your sets and reps.',
  ])
  act(() => {
    routines = create(React.createElement(RoutineList, { routines: [], onActivate: jest.fn() }))
  })
  expect(text(routines)).toEqual([
    'Find your rhythm.',
    'Bring your workouts together into a routine.',
  ])
})
