const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('tamagui', () => ({
  YStack: (props) => require('react').createElement('YStack', props, props.children),
  XStack: (props) => require('react').createElement('XStack', props, props.children),
  Button: (props) => require('react').createElement('Button', props, props.children),
  Text: (props) => require('react').createElement('Text', props, props.children),
  Dialog: Object.assign(
    (props) => require('react').createElement('Dialog', props, props.children),
    {
      Portal: (props) => require('react').createElement('Portal', props, props.children),
      Overlay: (props) => require('react').createElement('Overlay', props, props.children),
      Content: (props) => require('react').createElement('Content', props, props.children),
    }
  ),
}))
jest.mock('@tamagui/sheet', () => ({ Sheet: () => null }))
jest.mock('@tamagui/lucide-icons', () => ({ AlertTriangle: () => null, Trash2: () => null }))
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  BackHandler: { addEventListener: () => ({ remove: jest.fn() }) },
}))
jest.mock('expo-router', () => ({
  useNavigation: () => ({ addListener: () => jest.fn() }),
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('../../features/workouts', () => ({
  useWorkoutManagement: () => ({ startWorkout: jest.fn(), isWorkoutRunning: () => false }),
  useWorkouts: () => ({
    workouts: [{ id: 'workout', title: 'Pull Day' }],
    loading: false,
    error: null,
    refetch: mockRefetch,
  }),
  WorkoutList: (props) => require('react').createElement('WorkoutList', props),
  useWorkoutMutations: () => {
    const [error, setError] = require('react').useState(null)
    return {
      deleteWorkout: async (id) => {
        const result = await mockDeleteWorkout(id)
        if (!result) setError('Finish or cancel this running workout before deleting it.')
        return result
      },
      loading: false,
      error,
      clearError: () => setError(null),
    }
  },
}))
jest.mock('../../features/routines', () => ({ useRoutines: () => ({ routines: [] }) }))
jest.mock('../../navigation/useAppNavigation', () => ({
  useAppNavigation: () => ({ navigateToNewWorkout: jest.fn(), navigateToEditWorkout: jest.fn() }),
}))
jest.mock('../../components/ui/LoadingSpinner', () => ({ LoadingSpinner: () => null }))
jest.mock('../../components/ui/ErrorDisplay', () => ({
  ErrorDisplay: (props) => require('react').createElement('Error', props),
}))
jest.mock('../../components/ui/CreateTopButton', () => ({ CreateTopButton: () => null }))

const mockDeleteWorkout = jest.fn()
const mockRefetch = jest.fn(async () => undefined)
const Workouts = require('../../app/(tabs)/(workouts)/index').default

test('failed deletion keeps confirmation open and shows the running workout error', async () => {
  mockDeleteWorkout.mockResolvedValueOnce(false)
  let view
  await act(async () => {
    view = create(React.createElement(Workouts))
  })
  await act(async () => view.root.findByType('WorkoutList').props.onDeleteWorkout('workout'))
  await act(async () =>
    view.root
      .findAllByType('Button')
      .find((button) => button.props.children === 'Delete workout')
      .props.onPress()
  )

  expect(view.root.findByType('Dialog').props.open).toBe(true)
  expect(view.root.findByType('Error').props.message).toBe(
    'Finish or cancel this running workout before deleting it.'
  )
  expect(mockRefetch).not.toHaveBeenCalled()
  await act(async () => view.unmount())
})

test('successful deletion closes confirmation and refreshes the list', async () => {
  mockDeleteWorkout.mockResolvedValueOnce(true)
  let view
  await act(async () => {
    view = create(React.createElement(Workouts))
  })
  await act(async () => view.root.findByType('WorkoutList').props.onDeleteWorkout('workout'))
  await act(async () =>
    view.root
      .findAllByType('Button')
      .find((button) => button.props.children === 'Delete workout')
      .props.onPress()
  )

  expect(mockDeleteWorkout).toHaveBeenCalledWith('workout')
  expect(mockRefetch).toHaveBeenCalledTimes(1)
  expect(view.root.findByType('Dialog').props.open).toBe(false)
  await act(async () => view.unmount())
})
