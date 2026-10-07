jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

const { apiService } = require('../../services/apiService')

describe('ApiService credential-generation fencing', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('does not run a stale 401 handler after response parsing crosses sessions', async () => {
    await apiService.setToken('token-A')
    const unauthorized = jest.fn()
    apiService.setUnauthorizedHandler(unauthorized)

    let started
    const parsingStarted = new Promise((resolve) => {
      started = resolve
    })
    let finishParsing
    const delayedJson = new Promise((resolve) => {
      finishParsing = resolve
    })
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => {
        started()
        return delayedJson
      },
    })

    const request = apiService.login({ email: 'a@example.com', password: 'secret' })
    await parsingStarted
    await apiService.setToken('token-B')
    finishParsing({ message: 'Unauthorized' })

    await expect(request).rejects.toThrow(
      'Authentication changed before the request could be retried'
    )
    expect(unauthorized).not.toHaveBeenCalled()
  })

  it('discards a successful response whose parsing finishes after logout invalidates requests', async () => {
    let started
    const parsingStarted = new Promise((resolve) => {
      started = resolve
    })
    let finishParsing
    const delayedJson = new Promise((resolve) => {
      finishParsing = resolve
    })
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => {
        started()
        return delayedJson
      },
    })

    const request = apiService.getWorkouts()
    await parsingStarted
    apiService.invalidatePendingRequests()
    finishParsing([{ id: 'workout-A' }])

    await expect(request).rejects.toThrow(
      'Authentication changed before the request could be retried'
    )
  })
})
