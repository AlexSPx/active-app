const React = require('react')
const { act, create } = require('react-test-renderer')
jest.mock('tamagui', () => ({
  ...Object.fromEntries(
    ['YStack', 'XStack', 'Text', 'ScrollView', 'Button'].map((name) => [
      name,
      (props) => require('react').createElement(name, props, props.children),
    ])
  ),
  useTheme: () => ({
    background: { val: 'page' },
    primary: { val: 'accent' },
    color: { val: 'text' },
  }),
  getTokenValue: () => 20,
  getVariableValue: (value) => value,
  getConfig: () => ({ fonts: { body: { size: { header: 18 } } } }),
}))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'local-routine' }),
  useRouter: jest.fn(),
  Stack: { Screen: (props) => require('react').createElement('Screen', props) },
}))
jest.mock('@tamagui/lucide-icons', () => ({ ChevronRight: () => null }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 24 }) }))
jest.mock('../../features/routines', () => ({
  useRoutines: jest.fn(),
  useActiveRoutine: jest.fn(() => ({ activeRoutine: null })),
}))
jest.mock('../../features/workouts', () => ({
  useWorkouts: jest.fn(),
  MuscleHeatMap: (props) => require('react').createElement('Muscles', props),
}))
jest.mock('../../features/settings', () => ({
  useSettingsStore: () => ({ restTimerEnabled: true, restTimerDefaultSeconds: 90 }),
}))
jest.mock('../../components/ui/LoadingSpinner', () => ({ LoadingSpinner: () => null }))
jest.mock('../../components/ui/ErrorDisplay', () => ({
  ErrorDisplay: (props) => require('react').createElement('Error', props),
}))
jest.mock('../../lib/sync', () => ({
  syncEngine: {
    resolveId: (table, id) =>
      ({ 'local-routine': 'server-routine', 'local-workout': 'server-workout' })[id] || id,
    onIdRemap: jest.fn(() => () => {}),
  },
}))
const Detail = require('../../app/routines/[id]').default
const { useRoutines } = require('../../features/routines')
const { useWorkouts } = require('../../features/workouts')
const { useRouter } = require('expo-router')
const { syncEngine } = require('../../lib/sync')
const text = (view) =>
  view.root
    .findAllByType('Text')
    .map((node) => React.Children.toArray(node.props.children).join(''))
    .join('\n')
const workout = {
  id: 'local-workout',
  title: 'Long workout title',
  workoutTemplate: {
    exercises: [
      {
        exerciseId: 'bench',
        category: 'STRENGTH',
        reps: [8, 8],
        primaryMuscles: ['CHEST'],
        secondaryMuscles: ['TRICEPS'],
      },
      {
        exerciseId: 'run',
        category: 'CARDIO',
        durationSeconds: [600],
        primaryMuscles: [],
        secondaryMuscles: [],
      },
    ],
  },
}
const routine = {
  id: 'local-routine',
  name: 'My routine',
  routineType: 'SEQUENTIAL',
  pattern: [
    { dayIndex: 3, dayType: 'WORKOUT', workoutId: 'local-workout' },
    { dayIndex: 2, dayType: 'REST', workoutId: null },
    { dayIndex: 1, dayType: 'WORKOUT', workoutId: 'server-workout' },
  ],
}
let navigation
beforeEach(() => {
  navigation = { push: jest.fn(), back: jest.fn(), setParams: jest.fn() }
  useRouter.mockReturnValue(navigation)
  useRoutines.mockReturnValue({ routines: [routine], loading: false, error: null })
  useWorkouts.mockReturnValue({
    workouts: [workout],
    loading: false,
    error: null,
    refetch: jest.fn(),
  })
})

test('cycles preserve real day order and rest rows; flexible weeks use any-order workout rows and weekly totals', () => {
  let view
  act(() => {
    view = create(React.createElement(Detail))
  })
  expect(text(view)).toContain('3-day cycle · 2 training · 1 rest')
  expect(text(view)).toContain('4 sets · 2 intervals · ~32 min per cycle')
  expect(text(view).match(/Day \d/g)).toEqual(['Day 1', 'Day 2', 'Day 3'])
  expect(text(view)).toContain('Rest day')
  const row = view.root
    .findAllByType('YStack')
    .find((node) => node.props.accessibilityLabel === 'View Long workout title, day 1')
  act(() => row.props.onPress())
  expect(navigation.push).toHaveBeenCalledWith({
    pathname: '/workouts/[id]',
    params: { id: 'server-workout' },
  })
  act(() =>
    view.root
      .findAllByType('Button')
      .find((node) => node.props.children === 'Edit routine')
      .props.onPress()
  )
  expect(navigation.push).toHaveBeenCalledWith({
    pathname: '/routines/edit',
    params: { id: 'server-routine' },
  })
  expect(navigation.setParams).toHaveBeenCalledWith({ id: 'server-routine' })
  const listener = syncEngine.onIdRemap.mock.calls.at(-1)[0]
  act(() => listener('routines', 'local-routine', 'synced-routine'))
  expect(navigation.setParams).toHaveBeenCalledWith({ id: 'synced-routine' })
  useRoutines.mockReturnValue({
    routines: [{ ...routine, routineType: 'WEEKLY_COMPLETION' }],
    loading: false,
  })
  act(() => view.update(React.createElement(Detail)))
  expect(text(view)).toContain('Flexible week · 2 workouts · Any order')
  expect(text(view)).toContain('~32 min per week')
  expect(text(view)).toContain('Monday–Sunday')
  expect(text(view)).not.toMatch(/Day \d|Rest day|per cycle|Repeating cycle/)
  const footer = view.root.findAllByType('YStack').find((node) => node.props.borderTopWidth === 1)
  expect(footer.props.pb).toBe(24)
  expect(footer.findAllByType('ScrollView')).toHaveLength(0)
  act(() => view.unmount())
})

test('unknown workouts retain distinct loading, failure, unassigned and unavailable states without complete totals', () => {
  const missing = {
    ...routine,
    pattern: [
      { dayIndex: 1, dayType: 'WORKOUT', workoutId: null },
      { dayIndex: 2, dayType: 'WORKOUT', workoutId: 'missing' },
    ],
  }
  useRoutines.mockReturnValue({ routines: [missing], loading: false })
  const retry = jest.fn()
  useWorkouts.mockReturnValue({ workouts: [], loading: true, error: null, refetch: retry })
  let view
  act(() => {
    view = create(React.createElement(Detail))
  })
  expect(text(view)).toContain('No workout assigned')
  expect(text(view)).toContain('Loading workout…')
  expect(text(view)).not.toContain('min per cycle')
  useWorkouts.mockReturnValue({ workouts: [], loading: false, error: 'Offline', refetch: retry })
  act(() => view.update(React.createElement(Detail)))
  expect(view.root.findByType('Error').props.message).toBe('Offline')
  expect(text(view)).toContain('Retry loading your workouts.')
  act(() =>
    view.root
      .findAllByType('Button')
      .find((node) => node.props.children === 'Retry workouts')
      .props.onPress()
  )
  expect(retry).toHaveBeenCalledTimes(1)
  useWorkouts.mockReturnValue({ workouts: [], loading: false, error: null, refetch: retry })
  act(() => view.update(React.createElement(Detail)))
  expect(text(view)).toContain('Coverage includes available workouts only.')
  expect(text(view)).toContain('This saved workout is unavailable.')
  expect(text(view)).not.toContain('was deleted')
  useRoutines.mockReturnValue({ routines: [], loading: false })
  act(() => view.update(React.createElement(Detail)))
  expect(view.root.findByType('Error').props.message).toBe('Routine not found')
  act(() => view.unmount())
})
