jest.mock('../../lib/hooks/useRepository', () => ({ useExerciseRepository: jest.fn() }))
jest.mock('../../lib/hooks/useProfileQueryKeys', () => ({
  useProfileQueryKeys: jest.fn(),
}))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { QueryClient, QueryClientProvider, onlineManager } = require('@tanstack/react-query')
const { useExerciseRepository } = require('../../lib/hooks/useRepository')
const { useProfileQueryKeys } = require('../../lib/hooks/useProfileQueryKeys')
const { queryKeys } = require('../../lib/queryKeys')
const { useExerciseSearch } = require('../../features/exercises/hooks/useExerciseSearch')

describe('useExerciseSearch', () => {
  beforeEach(() => {
    useProfileQueryKeys.mockReturnValue(queryKeys.forOwner('owner-a'))
  })

  afterEach(() => {
    onlineManager.setOnline(true)
  })

  it('runs local exercise search while React Query is offline', async () => {
    const repository = {
      searchNetworkMode: 'always',
      search: jest.fn(async () => [{ id: 'local:exercise:bench' }]),
    }
    useExerciseRepository.mockReturnValue(repository)
    onlineManager.setOnline(false)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    let search
    function Probe() {
      search = useExerciseSearch().searchExercises
      return null
    }

    let renderer
    act(() => {
      renderer = create(
        React.createElement(QueryClientProvider, { client }, React.createElement(Probe))
      )
    })
    await act(async () => {
      await search('bench')
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(repository.search).toHaveBeenCalledWith('bench')
    await act(async () => renderer.unmount())
    client.clear()
  })

  it('keeps results while refining a search, then clears them for empty input and profile changes', async () => {
    const bench = [{ id: 'bench', name: 'Bench press' }]
    let resolveNext
    const repository = {
      searchNetworkMode: 'always',
      search: jest.fn((query) =>
        query === 'b'
          ? Promise.resolve(bench)
          : new Promise((resolve) => {
              resolveNext = resolve
            })
      ),
    }
    useExerciseRepository.mockReturnValue(repository)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    let result
    function Probe() {
      result = useExerciseSearch()
      return null
    }
    let renderer
    act(() => {
      renderer = create(
        React.createElement(QueryClientProvider, { client }, React.createElement(Probe))
      )
    })
    try {
      act(() => {
        void result.searchExercises('b')
      })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
      expect(result.exercises).toEqual(bench)
      await act(async () => {
        await result.searchExercises('be')
      })
      expect(result.loading).toBe(false)
      expect(result.exercises).toEqual(bench)
      await act(async () => {
        resolveNext([])
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
      expect(result.exercises).toEqual([])

      await act(async () => {
        await result.searchExercises('b')
      })
      expect(result.exercises).toEqual(bench)
      act(() => result.clearSearch())
      expect(result.exercises).toEqual([])

      await act(async () => {
        await result.searchExercises('b')
      })
      useProfileQueryKeys.mockReturnValue(queryKeys.forOwner('owner-b'))
      act(() =>
        renderer.update(
          React.createElement(QueryClientProvider, { client }, React.createElement(Probe))
        )
      )
      expect(result.exercises).toEqual([])
    } finally {
      act(() => renderer.unmount())
      client.clear()
    }
  })
})
