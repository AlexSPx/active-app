const React = require('react')
const { act, create } = require('react-test-renderer')

jest.mock('tamagui', () => ({
  getTokenValue: () => 20,
  YStack: (props) => require('react').createElement('YStack', props, props.children),
  XStack: (props) => require('react').createElement('XStack', props, props.children),
  Button: (props) => require('react').createElement('Button', props, props.children),
  Text: (props) => require('react').createElement('Text', props, props.children),
}))
jest.mock(
  '../../components/ui/CadenceOverlay',
  () => ({
    CadenceOverlay: (props) =>
      require('react').createElement('Overlay', props, props.open ? props.children : null),
  }),
  { virtual: true }
)
jest.mock('../../components/ui/icons', () => ({ AlertTriangle: () => null, Trash2: () => null }))
jest.mock('expo-router', () => ({
  useNavigation: () => ({ addListener: () => jest.fn(), setOptions: jest.fn() }),
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
    const [loading, setLoading] = require('react').useState(false)
    const [error, setError] = require('react').useState(null)
    return {
      deleteWorkout: async (id) => {
        setLoading(true)
        const result = await mockDeleteWorkout(id)
        setLoading(false)
        if (!result) setError('Finish or cancel this running workout before deleting it.')
        return result
      },
      loading,
      error,
      clearError: () => setError(null),
    }
  },
}))
jest.mock('../../features/routines', () => ({
  useRoutines: () => ({
    routines: [{ id: 'routine', name: 'Weekly', pattern: [] }],
    loading: false,
    refetch: mockRoutineRefetch,
  }),
  useActiveRoutine: () => ({ activeRoutine: null, refetch: jest.fn() }),
  RoutineList: (props) => require('react').createElement('RoutineList', props),
  useRoutineMutations: () => {
    const [loading, setLoading] = require('react').useState(false)
    const [error, setError] = require('react').useState(null)
    return {
      deleteRoutine: async (id) => {
        setLoading(true)
        const ok = await mockDeleteRoutine(id)
        setLoading(false)
        if (!ok) setError('Could not delete routine. Try again.')
        return ok
      },
      loading,
      error,
      clearError: () => setError(null),
      activateRoutine: jest.fn(),
      updateRoutine: jest.fn(),
    }
  },
}))
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
const mockDeleteRoutine = jest.fn()
const mockRoutineRefetch = jest.fn(async () => undefined)
const Routines = require('../../app/(tabs)/(workouts)/routines').default
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

  expect(view.root.findByType('Overlay').props.open).toBe(true)
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
  expect(view.root.findByType('Overlay').props.open).toBe(false)
  await act(async () => view.unmount())
})

beforeEach(() => {
  jest.clearAllMocks()
})

test('routine deletion failure stays available for retry, then refreshes after success', async () => {
  mockDeleteRoutine.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  let view
  await act(async () => {
    view = create(React.createElement(Routines))
  })
  act(() => view.root.findByType('RoutineList').props.onDeleteRoutine('routine'))
  const deleteButton = () =>
    view.root
      .findAllByType('Button')
      .find((button) => button.props.children?.props?.children === 'Delete routine')
  await act(async () => deleteButton().props.onPress())
  expect(view.root.findByType('Overlay').props.open).toBe(true)
  expect(view.root.findByType('Error').props.message).toBe('Could not delete routine. Try again.')
  expect(mockRoutineRefetch).not.toHaveBeenCalled()
  await act(async () => deleteButton().props.onPress())
  expect(mockDeleteRoutine).toHaveBeenNthCalledWith(2, 'routine')
  expect(mockRoutineRefetch).toHaveBeenCalledTimes(1)
  expect(view.root.findByType('Overlay').props.open).toBe(false)
  act(() => view.unmount())
})

test.each([
  ['workout', Workouts, 'WorkoutList', 'onDeleteWorkout', mockDeleteWorkout],
  ['routine', Routines, 'RoutineList', 'onDeleteRoutine', mockDeleteRoutine],
])(
  '%s deletion blocks dismissal and cancel until the request finishes',
  async (entity, Screen, list, open, deleteItem) => {
    let finish
    deleteItem.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    let view, request
    await act(async () => {
      view = create(React.createElement(Screen))
    })
    act(() => view.root.findByType(list).props[open](entity))
    act(() => {
      request = view.root
        .findAllByType('Button')
        .find((button) => {
          const label = button.props.children?.props?.children ?? button.props.children
          return label === `Delete ${entity}`
        })
        .props.onPress()
    })
    expect(view.root.findByType('Overlay').props.dismissible).toBe(false)
    expect(
      view.root
        .findAllByType('Button')
        .find((button) => button.props.children?.props?.children === 'Cancel').props.disabled
    ).toBe(true)
    await act(async () => {
      finish(true)
      await request
    })
    expect(view.root.findByType('Overlay').props.open).toBe(false)
    act(() => view.unmount())
  }
)

test.each([
  ['workout', Workouts, 'WorkoutList', 'onDeleteWorkout', mockDeleteWorkout],
  ['routine', Routines, 'RoutineList', 'onDeleteRoutine', mockDeleteRoutine],
])(
  'cancelling %s deletion does not delete data',
  async (entity, Screen, list, open, deleteItem) => {
    let view
    await act(async () => {
      view = create(React.createElement(Screen))
    })
    act(() => view.root.findByType(list).props[open](entity))
    act(() =>
      view.root
        .findAllByType('Button')
        .find((button) => button.props.children?.props?.children === 'Cancel')
        .props.onPress()
    )
    expect(deleteItem).not.toHaveBeenCalled()
    expect(view.root.findByType('Overlay').props.open).toBe(false)
    act(() => view.unmount())
  }
)
