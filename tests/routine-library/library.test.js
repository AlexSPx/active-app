const React = require('react')
const { act, create } = require('react-test-renderer')
const mockPush = jest.fn()
const mockNavigation = { addListener: jest.fn(() => jest.fn()) }
const mockListRefetch = jest.fn()
const mockActiveRefetch = jest.fn()
const mockActivate = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()
const mockPreventRemove = jest.fn()

jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
  router: { push: (...args) => mockPush(...args) },
}))
jest.mock('@react-navigation/native', () => ({
  usePreventRemove: (...args) => mockPreventRemove(...args),
}))
jest.mock('../../features/routines', () => ({
  useRoutines: () => ({
    routines: [
      {
        id: 'local-routine',
        name: 'Flexible',
        routineType: 'WEEKLY_COMPLETION',
        pattern: [{ dayIndex: 1, dayType: 'WORKOUT', workoutId: 'local-workout' }],
      },
    ],
    loading: false,
    error: null,
    isStale: false,
    refetch: mockListRefetch,
  }),
  useActiveRoutine: () => ({
    activeRoutine: { id: 'local-routine' },
    loading: false,
    isStale: false,
    refetch: mockActiveRefetch,
  }),
  useRoutineMutations: () => ({
    activateRoutine: mockActivate,
    updateRoutine: mockUpdate,
    deleteRoutine: mockDelete,
    clearError: jest.fn(),
    loading: false,
    error: null,
  }),
}))
jest.mock('../../features/workouts', () => ({
  useWorkouts: () => ({ workouts: [{ id: 'local-workout', title: 'Upper body' }] }),
}))
jest.mock('../../lib/sync', () => ({
  syncEngine: {
    resolveId: (table, id) =>
      ({ 'local-routine': 'saved-routine', 'local-workout': 'saved-workout' })[id] || id,
  },
}))
const { useRoutineLibrary } = require('../../features/routines/hooks/useRoutineLibrary')
let model
function Harness() {
  model = useRoutineLibrary()
  return null
}
let view
beforeEach(() => {
  jest.clearAllMocks()
  mockListRefetch.mockResolvedValue(undefined)
  mockActiveRefetch.mockResolvedValue(undefined)
  mockActivate.mockResolvedValue({ id: 'saved-routine', active: true })
  mockUpdate.mockResolvedValue({ id: 'saved-routine' })
  mockDelete.mockResolvedValue(true)
  act(() => {
    view = create(React.createElement(Harness))
  })
})
afterEach(() => act(() => view.unmount()))

test('one activation reconciles the library and active routine before actions are enabled again', async () => {
  let finishActiveRefresh
  mockActiveRefetch.mockReturnValue(
    new Promise((resolve) => {
      finishActiveRefresh = resolve
    })
  )
  let activation
  await act(async () => {
    activation = model.activate('saved-routine')
    await Promise.resolve()
  })
  expect(mockActivate).toHaveBeenCalledTimes(1)
  expect(mockActivate).toHaveBeenCalledWith('saved-routine')
  expect(mockListRefetch).toHaveBeenCalledTimes(1)
  expect(mockActiveRefetch).toHaveBeenCalledTimes(1)
  expect(model.busy).toBe(true)
  await act(async () => {
    finishActiveRefresh()
    await activation
  })
  expect(model.busy).toBe(false)
})

test('saved IDs drive card titles, active selection, detail and edit navigation', () => {
  expect(model.activeRoutineId).toBe('saved-routine')
  expect(model.routines[0].pattern[0].workoutId).toBe('saved-workout')
  model.detail(model.routines[0])
  model.edit(model.routines[0])
  expect(mockPush.mock.calls).toEqual([
    [{ pathname: '/routines/[id]', params: { id: 'saved-routine' } }],
    [{ pathname: '/routines/edit', params: { id: 'saved-routine' } }],
  ])
})

test('Start today updates only the start date, then refreshes both routine queries', async () => {
  await act(async () => {
    await model.startToday('saved-routine')
  })
  expect(mockUpdate).toHaveBeenCalledWith('saved-routine', { startDate: expect.any(String) })
  expect(Number.isNaN(Date.parse(mockUpdate.mock.calls[0][1].startDate))).toBe(false)
  expect(mockActiveRefetch).toHaveBeenCalledTimes(1)
  expect(mockListRefetch).toHaveBeenCalledTimes(1)
})

test('cancelling deletion does not change data; a failed delete stays open and can be retried', async () => {
  act(() => model.requestDelete('saved-routine'))
  expect(model.confirmOpen).toBe(true)
  act(() => model.setConfirmOpen(false))
  expect(mockDelete).not.toHaveBeenCalled()
  mockDelete.mockResolvedValueOnce(false)
  act(() => model.requestDelete('saved-routine'))
  await act(async () => {
    await model.confirmDelete()
  })
  expect(model.confirmOpen).toBe(true)
  expect(model.busy).toBe(false)
  expect(mockListRefetch).not.toHaveBeenCalled()
  await act(async () => {
    await model.confirmDelete()
  })
  expect(model.confirmOpen).toBe(false)
  expect(mockDelete).toHaveBeenCalledTimes(2)
  expect(mockActiveRefetch).toHaveBeenCalledTimes(1)
})
