const mockRouter = { back: jest.fn(), push: jest.fn() }
const mockWorkout = {
  id: 'server-workout',
  title: 'Strength day',
  workoutTemplate: { exercises: [] },
}
const mockUseWorkout = jest.fn()
const mockResolveId = jest.fn((_table, id) => id)

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'local-workout' }),
  useRouter: () => mockRouter,
}))
jest.mock('../../features/workouts/hooks/useWorkout', () => ({ useWorkout: mockUseWorkout }))
jest.mock('../../features/workouts/hooks/useWorkoutManagement', () => ({
  useWorkoutManagement: () => ({ startWorkout: jest.fn(), isWorkoutRunning: () => false }),
}))
jest.mock('../../features/workouts/hooks/useWorkoutIdRemap', () => ({
  useWorkoutIdRemap: jest.fn(),
}))
jest.mock('../../lib/sync', () => ({ syncEngine: { resolveId: mockResolveId } }))

const { useWorkoutDetail } = require('../../features/workouts/hooks/useWorkoutDetail')

test('detail resolves the workout and edit/copy actions navigate with its stable ID', () => {
  mockResolveId.mockImplementation((_table, id) => (id === 'local-workout' ? 'server-workout' : id))
  mockUseWorkout.mockReturnValue({ workout: mockWorkout, loading: false, error: null })
  let detail
  function Probe() {
    detail = useWorkoutDetail()
    return null
  }
  const React = require('react')
  const { act, create } = require('react-test-renderer')
  let renderer
  act(() => {
    renderer = create(React.createElement(Probe))
  })

  expect(mockUseWorkout).toHaveBeenCalledWith('server-workout')
  detail.editWorkout()
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/workouts/edit',
    params: { id: 'server-workout' },
  })
  detail.duplicateWorkout()
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: '/workouts/new',
    params: { duplicateId: 'server-workout' },
  })
  act(() => renderer.unmount())
})
