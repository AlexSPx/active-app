jest.mock('../../lib/hooks/useRepository', () => ({ useExerciseRepository: jest.fn() }))
jest.mock('../../lib/hooks/useProfileQueryKeys', () => ({
  useProfileQueryKeys: () => ({ exercises: { search: (query) => ['exercises', query] } }),
}))

const React = require('react')
const { act, create } = require('react-test-renderer')
const { QueryClient, QueryClientProvider, onlineManager } = require('@tanstack/react-query')
const { useExerciseRepository } = require('../../lib/hooks/useRepository')
const { useExerciseSearch } = require('../../features/exercises/hooks/useExerciseSearch')

describe('useExerciseSearch', () => {
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
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
})
