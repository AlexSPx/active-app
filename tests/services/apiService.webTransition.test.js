jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }))

const { apiService } = require('../../services/apiService')

describe('ApiService web credential transitions', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  afterEach(() => {
    apiService.resumePendingRequests()
    jest.restoreAllMocks()
  })

  it('aborts and drains an old cookie refresh before the next login exchange', async () => {
    let markRefreshStarted
    const refreshStarted = new Promise((resolve) => {
      markRefreshStarted = resolve
    })
    let lateRefreshResponse

    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Unauthorized' }),
      })
      .mockImplementationOnce((_url, options) => {
        markRefreshStarted()
        return new Promise((resolve, reject) => {
          lateRefreshResponse = resolve
          options.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
          })
        })
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 'B' }) })

    const oldRequest = apiService.getWorkouts()
    await refreshStarted

    await apiService.invalidatePendingRequests()
    await expect(oldRequest).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' })
    await expect(apiService.login({ email: 'b@example.com', password: 'secret' })).resolves.toEqual({
      token: 'B',
    })

    lateRefreshResponse({ ok: true, status: 200, json: async () => ({ token: 'A' }) })
    expect(global.fetch).toHaveBeenCalledTimes(3)
    expect(global.fetch.mock.calls[2][1]).toMatchObject({ credentials: 'include' })
  })
})
