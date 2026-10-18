jest.mock('uniwind', () => ({
  useCSSVariable: () => ['#faf7fc', '#2d2235', '#76627e', '#dcd0e4', '#624572', '#faf5fc'],
}))
const React = require('react')
const { act, create } = require('react-test-renderer')
jest.mock('react-native', () => {
  const React = require('react')
  return {
    ...Object.fromEntries(
      ['View', 'Text', 'Pressable', 'ScrollView', 'ActivityIndicator'].map((name) => [
        name,
        React.forwardRef((props, ref) =>
          React.createElement(name, { ...props, ref }, props.children)
        ),
      ])
    ),
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
  }
})
jest.mock('../../navigation/BackHeaderButton', () => ({ BackHeaderButton: () => null }))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'local-routine' }),
  useRouter: jest.fn(),
  Stack: { Screen: (props) => require('react').createElement('Screen', props) },
}))
jest.mock('../../components/ui/icons', () => ({
  Check: () => null,
  ChevronRight: () => null,
  Clock3: () => null,
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 24 }) }))
jest.mock('../../features/routines', () => ({
  useRoutines: jest.fn(),
  useActiveRoutine: jest.fn(() => ({ activeRoutine: null })),
  useRoutineMutations: jest.fn(() => ({
    activateRoutine: jest.fn(async () => ({ id: 'server-routine' })),
    loading: false,
    error: null,
    clearError: jest.fn(),
  })),
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
const { useRoutines, useActiveRoutine, useRoutineMutations } = require('../../features/routines')
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
  expect(text(view)).toContain('3-day cycle')
  expect(text(view)).toContain('2 training days')
  expect(text(view)).toContain('1 rest day')
  expect(text(view)).toContain('6 sets per cycle')
  expect(text(view).match(/Day \d/g)).toEqual(['Day 1', 'Day 2', 'Day 3'])
  expect(text(view)).toContain('Rest day')
  expect(text(view)).toContain('2 exercises / 3 sets')
  const row = view.root
    .findAllByType('Pressable')
    .find((node) => node.props.accessibilityLabel === 'View Long workout title, day 1')
  act(() => row.props.onPress())
  expect(navigation.push).toHaveBeenCalledWith({
    pathname: '/workouts/[id]',
    params: { id: 'server-workout' },
  })
  act(() =>
    view.root
      .findAllByType('Pressable')
      .find((node) =>
        node.findAllByType('Text').some((text) => text.props.children === 'Edit routine')
      )
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
  expect(text(view)).toContain('Flexible week')
  expect(text(view)).toContain('2 workouts')
  expect(text(view)).toContain('Any order')
  expect(text(view)).toContain('6 sets per week')
  expect(text(view)).toContain('Monday–Sunday')
  expect(text(view)).not.toMatch(/Day \d|Rest day|per cycle|Repeating cycle/)
  const footer = view.root
    .findAllByType('View')
    .find((node) => node.props.testID === 'routine-detail-actions')
  expect(footer.props.style.paddingBottom).toBe(24)
  expect(footer.findAllByType('ScrollView')).toHaveLength(0)
  act(() => view.unmount())
})

test('activates an inactive routine from the detail screen and hides the action once active', async () => {
  const activateRoutine = jest.fn(async () => ({ id: 'server-routine' }))
  const refetch = jest.fn(async () => {})
  useActiveRoutine.mockReturnValue({ activeRoutine: null, refetch })
  useRoutineMutations.mockReturnValue({
    activateRoutine,
    loading: false,
    error: null,
    clearError: jest.fn(),
  })
  let view
  act(() => {
    view = create(React.createElement(Detail))
  })
  const activate = () =>
    view.root
      .findAllByType('Pressable')
      .find((node) =>
        node.findAllByType('Text').some((text) => text.props.children === 'Set as active routine')
      )
  await act(async () => activate().props.onPress())
  expect(activateRoutine).toHaveBeenCalledWith('server-routine')
  expect(refetch).toHaveBeenCalledTimes(1)
  useActiveRoutine.mockReturnValue({ activeRoutine: { id: 'server-routine' }, refetch })
  act(() => view.update(React.createElement(Detail)))
  expect(text(view)).toContain('Active')
  expect(activate()).toBeUndefined()
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
      .findAllByType('Pressable')
      .find((node) =>
        node.findAllByType('Text').some((text) => text.props.children === 'Retry workouts')
      )
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

test('a resolved workout with a blank title gets a useful title and matching accessibility label', () => {
  useWorkouts.mockReturnValue({
    workouts: [{ ...workout, title: '  ' }],
    loading: false,
    error: null,
  })
  let view
  act(() => {
    view = create(React.createElement(Detail))
  })
  expect(text(view)).toContain('Untitled workout')
  expect(
    view.root
      .findAllByType('Pressable')
      .some((node) => node.props.accessibilityLabel === 'View Untitled workout, day 1')
  ).toBe(true)
  act(() => view.unmount())
})
