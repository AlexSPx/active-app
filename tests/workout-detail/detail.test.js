jest.mock('react-native', () => {
  const React = require('react')
  return {
    ...Object.fromEntries(
      ['View', 'Text', 'Pressable', 'ScrollView', 'TextInput', 'ActivityIndicator'].map((name) => [
        name,
        React.forwardRef((props, ref) =>
          React.createElement(name, { ...props, ref }, props.children)
        ),
      ])
    ),
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
  }
})
jest.mock('../../components/ui/icons', () => ({
  ChevronLeft: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
}))
jest.mock('uniwind', () => ({
  useCSSVariable: () => ['#faf7fc', '#2d2235', '#76627e', '#dcd0e4', '#624572', '#faf5fc'],
}))
const React = require('react')
const { act, create } = require('react-test-renderer')
jest.mock('react-native-body-highlighter', () => ({
  __esModule: true,
  default: (props) => require('react').createElement('Body', props),
}))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'workout' }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  Stack: { Screen: (props) => require('react').createElement('Screen', props) },
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 24 }) }))
jest.mock('../../features/workouts/hooks/useWorkouts', () => ({ useWorkouts: jest.fn() }))
jest.mock('../../features/workouts/hooks/useWorkoutManagement', () => ({
  useWorkoutManagement: jest.fn(),
}))
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
const mockPush = jest.fn()
const { MuscleHeatMap } = require('../../features/workouts/components/MuscleHeatMap')
const Detail = require('../../app/workouts/[id]').default
const { useWorkouts } = require('../../features/workouts/hooks/useWorkouts')
const { useWorkoutManagement } = require('../../features/workouts/hooks/useWorkoutManagement')
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
  expect(text(view)).toContain('Chest / Middle back')
  expect(text(view)).toContain('Lats / Biceps / Abductors')
  const bodies = () => view.root.findAllByType('Body')
  expect(bodies().map((body) => body.props.side)).toEqual(['front', 'back'])
  const data = bodies()[0].props.data
  expect(data.find((part) => part.slug === 'chest').color).toBe('#624572')
  expect(data.find((part) => part.slug === 'upper-back').color).toBe('#624572')
  expect(data.find((part) => part.slug === 'biceps').color).toBe('#76627e')
  expect(data.find((part) => part.slug === 'adductors').color).toBe('#dcd0e4')
  const row = view.root.findAllByType('View').find((node) => node.props.onLayout)
  expect(bodies()[0].props.scale * 400).toBe(165)
  act(() => row.props.onLayout({ nativeEvent: { layout: { width: 150 } } }))
  expect(bodies()[0].props.scale * 400 + 12).toBeLessThanOrEqual(150)
  act(() =>
    view.update(React.createElement(MuscleHeatMap, { primaryMuscles: [], secondaryMuscles: [] }))
  )
  expect(text(view)).toContain('No muscle groups listed')
  expect(bodies()).toHaveLength(0)
  act(() => view.unmount())
})

test('mixed targets expand to saved set details and Start respects an active workout', () => {
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
  let view
  act(() => {
    view = create(React.createElement(Detail))
  })
  expect(text(view)).toContain('2 exercises')
  expect(text(view)).toContain('4 sets')
  expect(text(view)).not.toContain('~17 min')
  const exercise = () =>
    view.root
      .findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel?.startsWith('Bench press,'))
  expect(exercise().props.accessibilityState.expanded).toBe(false)
  act(() => exercise().props.onPress())
  expect(exercise().props.accessibilityState.expanded).toBe(true)
  expect(text(view)).toContain('Weight (kg)')
  expect(text(view)).toContain('Reps')
  expect(text(view)).toContain('20')
  expect(text(view)).toContain('8')
  act(() =>
    view.root
      .findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel?.startsWith('Run,'))
      .props.onPress()
  )
  expect(text(view)).toContain('Duration')
  expect(text(view)).toContain('10:00')
  expect(text(view)).toContain('1:00')
  act(() => view.root.findByType('Start').props.onPress())
  expect(startWorkout).toHaveBeenCalledWith(workout)
  running = true
  act(() => view.update(React.createElement(Detail)))
  expect(text(view)).not.toContain('~14 min')
  expect(view.root.findByType('Start').props.isWorkoutRunning).toBe(true)
  act(() => view.root.findByType('Start').props.onPress())
  expect(startWorkout).toHaveBeenCalledTimes(1)
  const footer = view.root
    .findAllByType('View')
    .find((node) => node.props.className?.includes('border-t border-divider'))
  expect(footer.props.style.paddingBottom).toBe(24)
  expect(footer.findAllByType('ScrollView')).toHaveLength(0)
  useWorkouts.mockReturnValue({ workouts: [], loading: false, error: null })
  act(() => view.update(React.createElement(Detail)))
  expect(view.root.findByType('Error').props.message).toBe('Workout not found')
  expect(view.root.findAllByType('Start')).toHaveLength(0)
  act(() => view.unmount())
})

test('detail preserves long names and notes, opens the saved workout editor, and disables empty templates', () => {
  const workout = {
    id: 'workout',
    title: 'A long workout name that wraps across several lines without hiding any words',
    notes: 'Keep the planned targets and train at a comfortable pace.',
    workoutTemplate: { exercises: [] },
  }
  const startWorkout = jest.fn()
  useWorkouts.mockReturnValue({ workouts: [workout], loading: false, error: null })
  useWorkoutManagement.mockReturnValue({ startWorkout, isWorkoutRunning: () => false })
  let view, edit
  act(() => {
    view = create(React.createElement(Detail))
  })
  expect(text(view)).toContain(workout.title)
  expect(text(view)).toContain(workout.notes)
  expect(text(view)).toContain('No exercises in this workout yet')
  expect(view.root.findByType('Start').props.disabled).toBe(true)
  act(() => view.root.findByType('Start').props.onPress())
  expect(startWorkout).not.toHaveBeenCalled()
  act(() => {
    edit = create(view.root.findByType('Screen').props.options.headerRight())
  })
  act(() => edit.root.findByType('Pressable').props.onPress())
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/workouts/edit', params: { id: workout.id } })
  act(() => {
    edit.unmount()
    view.unmount()
  })
})

test('detail shows loading and missing-workout errors without a start action', () => {
  useWorkouts.mockReturnValue({ workouts: [], loading: true, error: null })
  useWorkoutManagement.mockReturnValue({ startWorkout: jest.fn(), isWorkoutRunning: () => false })
  let view
  act(() => {
    view = create(React.createElement(Detail))
  })
  expect(text(view)).toContain('Loading workout…')
  expect(view.root.findAllByType('Start')).toHaveLength(0)
  useWorkouts.mockReturnValue({ workouts: [], loading: false, error: 'Could not load workout' })
  act(() => view.update(React.createElement(Detail)))
  expect(view.root.findByType('Error').props.message).toBe('Could not load workout')
  expect(view.root.findAllByType('Start')).toHaveLength(0)
  act(() => view.unmount())
})
