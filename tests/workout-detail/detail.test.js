const React = require('react')
const { act, create } = require('react-test-renderer')
jest.mock('tamagui', () => ({
  ...Object.fromEntries(
    ['YStack', 'XStack', 'Text', 'Button', 'ScrollView', 'Circle'].map((name) => [
      name,
      (props) => require('react').createElement(name, props, props.children),
    ])
  ),
  getTokenValue: (name) => ({ $muscleDiagram: 144, $field: 12, $page: 20 })[name],
  getConfig: () => ({ fonts: { body: { size: { header: 18 } } } }),
  getVariableValue: (value) => value,
  useTheme: jest.fn(() => ({
    background: { val: 'page' },
    color: { val: 'text' },
    primary: { val: 'primary' },
    trainingMuted: { val: 'supporting' },
    borderColor: { val: 'neutral' },
  })),
}))
jest.mock('react-native-body-highlighter', () => ({
  __esModule: true,
  default: (props) => require('react').createElement('Body', props),
}))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'workout' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Stack: { Screen: (props) => require('react').createElement('Screen', props) },
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 24 }) }))
jest.mock('../../features/workouts', () => ({
  useWorkouts: jest.fn(),
  useWorkoutManagement: jest.fn(),
  MuscleHeatMap: () => null,
}))
jest.mock('../../features/settings', () => ({ useSettingsStore: jest.fn() }))
jest.mock('../../features/workouts/hooks/useWorkoutIdRemap', () => ({
  useWorkoutIdRemap: jest.fn(),
}))
jest.mock('../../components/ui/StartWorkoutButton', () => ({
  StartWorkoutButton: (props) => require('react').createElement('Start', props),
}))
jest.mock('../../components/ui/LoadingSpinner', () => ({ LoadingSpinner: () => null }))
jest.mock('../../components/ui/ErrorDisplay', () => ({
  ErrorDisplay: (props) => require('react').createElement('Error', props),
}))
const { MuscleHeatMap } = require('../../features/workouts/components/MuscleHeatMap')
const Detail = require('../../app/workouts/[id]').default
const { useWorkouts, useWorkoutManagement } = require('../../features/workouts')
const { useSettingsStore } = require('../../features/settings')
const text = (view) =>
  view.root
    .findAllByType('Text')
    .map((node) => React.Children.toArray(node.props.children).join(''))
    .join('\n')

test('muscle diagrams preserve named groups, primary precedence, themed neutral parts and narrow widths', () => {
  let view
  act(() => {
    view = create(
      React.createElement(MuscleHeatMap, {
        primaryMuscles: [' chest ', 'CHEST', 'middle back'],
        secondaryMuscles: ['Chest', 'lats', 'biceps', 'abductors'],
      })
    )
  })
  expect(text(view)).toContain('Chest · Middle back')
  expect(text(view)).toContain('Lats · Biceps · Abductors')
  const bodies = () => view.root.findAllByType('Body')
  expect(bodies().map((body) => body.props.side)).toEqual(['front', 'back'])
  const data = bodies()[0].props.data
  expect(data.find((part) => part.slug === 'chest').color).toBe('primary')
  expect(data.find((part) => part.slug === 'upper-back').color).toBe('primary')
  expect(data.find((part) => part.slug === 'biceps').color).toBe('supporting')
  expect(data.find((part) => part.slug === 'adductors').color).toBe('neutral')
  const row = view.root.findAllByType('XStack').find((node) => node.props.onLayout)
  act(() => row.props.onLayout({ nativeEvent: { layout: { width: 220 } } }))
  expect(bodies()[0].props.scale * 400 + 12).toBeLessThanOrEqual(220)
  act(() =>
    view.update(React.createElement(MuscleHeatMap, { primaryMuscles: [], secondaryMuscles: [] }))
  )
  expect(text(view)).toContain('No muscle groups listed')
  expect(bodies()).toHaveLength(0)
  act(() => view.unmount())
})

test('mixed targets use cardio duration, rest preferences update estimates, and Start respects an active workout', () => {
  const workout = {
    id: 'workout',
    title: 'Mixed session',
    workoutTemplate: {
      exercises: [
        {
          exerciseId: 'bench',
          exerciseTitle: 'Bench press',
          category: 'STRENGTH',
          reps: [8, 8],
          weight: [20, 20],
        },
        {
          exerciseId: 'run',
          exerciseTitle: 'Run',
          category: 'CARDIO',
          durationSeconds: [600, 60],
          reps: [],
          weight: [],
        },
      ],
    },
  }
  useWorkouts.mockReturnValue({ workouts: [workout], loading: false, error: null })
  const startWorkout = jest.fn()
  let running = false
  useWorkoutManagement.mockImplementation(() => ({ startWorkout, isWorkoutRunning: () => running }))
  useSettingsStore.mockReturnValue({ restTimerEnabled: true, restTimerDefaultSeconds: 90 })
  let view
  act(() => {
    view = create(React.createElement(Detail))
  })
  expect(text(view)).toContain('2 exercises · 2 sets · 2 intervals · ~17 min')
  expect(text(view)).toContain('2 intervals · 10:00 / 1:00')
  act(() => view.root.findByType('Start').props.onPress())
  expect(startWorkout).toHaveBeenCalledWith(workout)
  useSettingsStore.mockReturnValue({ restTimerEnabled: false, restTimerDefaultSeconds: 90 })
  running = true
  act(() => view.update(React.createElement(Detail)))
  expect(text(view)).toContain('~14 min')
  expect(view.root.findByType('Start').props.isWorkoutRunning).toBe(true)
  act(() => view.root.findByType('Start').props.onPress())
  expect(startWorkout).toHaveBeenCalledTimes(1)
  const footer = view.root.findAllByType('YStack').find((node) => node.props.borderTopWidth === 1)
  expect(footer.props.pb).toBe(24)
  expect(footer.findAllByType('ScrollView')).toHaveLength(0)
  useWorkouts.mockReturnValue({ workouts: [], loading: false, error: null })
  act(() => view.update(React.createElement(Detail)))
  expect(view.root.findByType('Error').props.message).toBe('Workout not found')
  expect(view.root.findAllByType('Start')).toHaveLength(0)
  act(() => view.unmount())
})
