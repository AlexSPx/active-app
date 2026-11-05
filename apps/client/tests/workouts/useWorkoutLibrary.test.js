const React = require('react')
const { act, create } = require('react-test-renderer')
const mockRefetch = jest.fn()
const mockRouter = { push: jest.fn() }
const mockStartWorkout = jest.fn()

jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => mockRouter,
}))
jest.mock('../../features/workouts/hooks/useWorkoutManagement', () => ({
  useWorkoutManagement: () => ({
    startWorkout: mockStartWorkout,
    isWorkoutRunning: () => false,
  }),
}))
jest.mock('../../features/workouts/hooks/useWorkouts', () => ({
  useWorkouts: () => ({
    workouts: [],
    loading: true,
    error: null,
    refetch: mockRefetch,
  }),
}))
jest.mock('../../features/workouts/hooks/useWorkoutMutations', () => ({
  useWorkoutMutations: () => ({
    deleteWorkout: jest.fn(),
    loading: false,
    error: null,
    clearError: jest.fn(),
  }),
}))
jest.mock('../../navigation/useAppNavigation', () => ({
  useAppNavigation: () => ({
    navigateToNewWorkout: jest.fn(),
    navigateToEditWorkout: jest.fn(),
  }),
}))

const { useWorkoutLibrary } = require('../../features/workouts/hooks/useWorkoutLibrary')
let model
function Harness() {
  model = useWorkoutLibrary()
  return null
}

test('pull to refresh has its own pending state and clears when refetch settles', async () => {
  let finishRefetch
  mockRefetch.mockReturnValue(
    new Promise((resolve) => {
      finishRefetch = resolve
    })
  )
  let view
  act(() => {
    view = create(React.createElement(Harness))
  })
  expect(model.loading).toBe(true)
  expect(model.refreshing).toBe(false)

  let refreshPromise
  await act(async () => {
    refreshPromise = model.refresh()
    await Promise.resolve()
  })
  expect(model.refreshing).toBe(true)
  await act(async () => {
    finishRefetch()
    await refreshPromise
  })
  expect(model.refreshing).toBe(false)
  act(() => view.unmount())
})
