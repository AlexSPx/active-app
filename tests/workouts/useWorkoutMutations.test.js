const mockInvalidateQueries = jest.fn()
const mockDeleteWorkout = jest.fn(async () => undefined)
const mockResolveId = jest.fn((_table, id) => id)
let mockRunningWorkout = null

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  useMutation: (options) => ({
    mutateAsync: async (value) => {
      const result = await options.mutationFn(value)
      options.onSuccess?.(result)
      return result
    },
    reset: jest.fn(),
    isPending: false,
    error: null,
  }),
}))
jest.mock('../../lib/hooks/useProfileQueryKeys', () => ({
  useProfileQueryKeys: () => ({
    workouts: { all: ['workouts'] },
    routines: { all: ['routines'] },
    records: { all: ['records'] },
  }),
}))
jest.mock('../../lib/hooks/useRepository', () => ({
  useWorkoutRepository: () => ({ delete: mockDeleteWorkout }),
}))
jest.mock('../../lib/sync', () => ({ syncEngine: { resolveId: mockResolveId } }))
jest.mock('../../features/workout-session/stores/runningWorkoutStore', () => ({
  useRunningWorkoutStore: { getState: () => ({ runningWorkout: mockRunningWorkout }) },
}))

const { useWorkoutMutations } = require('../../features/workouts/hooks/useWorkoutMutations')

describe('useWorkoutMutations deletion', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRunningWorkout = null
    mockResolveId.mockImplementation((_table, id) => id)
  })

  it('keeps the running workout completable when its local ID has remapped', async () => {
    mockRunningWorkout = { id: 'local_running' }
    mockResolveId.mockImplementation((_table, id) =>
      id === 'local_running' ? 'server_running' : id
    )
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const mutations = useWorkoutMutations()
      await expect(mutations.deleteWorkout('server_running')).resolves.toBe(false)
      expect(mockDeleteWorkout).not.toHaveBeenCalled()
      expect(mockInvalidateQueries).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('deletes another workout and refreshes workouts, routines and history', async () => {
    mockRunningWorkout = { id: 'current' }
    const mutations = useWorkoutMutations()
    await expect(mutations.deleteWorkout('other')).resolves.toBe(true)
    expect(mockDeleteWorkout).toHaveBeenCalledWith('other')
    expect(mockInvalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['workouts'] }],
      [{ queryKey: ['routines'] }],
      [{ queryKey: ['records'] }],
    ])
  })
})
