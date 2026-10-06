jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

const AsyncStorage = require('@react-native-async-storage/async-storage')
const { apiService } = require('../../services/apiService')

function makeResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 401 ? 'Unauthorized' : 'OK',
    json: async () => body,
  }
}

describe('API credential refresh', () => {
  beforeEach(async () => {
    global.fetch = jest.fn()
    await AsyncStorage.clear()
  })

  it('does not restore credentials or retry a protected request after logout', async () => {
    await apiService.setToken('old-access')
    await apiService.setRefreshToken('old-refresh')

    let beginRefresh
    let releaseRefresh
    const refreshStarted = new Promise((resolve) => (beginRefresh = resolve))
    const refreshGate = new Promise((resolve) => (releaseRefresh = resolve))
    const unauthorizedHandler = jest.fn()
    apiService.setUnauthorizedHandler(unauthorizedHandler)
    global.fetch
      .mockResolvedValueOnce(makeResponse(401, { message: 'expired' }))
      .mockImplementationOnce(async () => {
        beginRefresh()
        await refreshGate
        return makeResponse(200, { token: 'new-access', refreshToken: 'new-refresh' })
      })

    const request = apiService.getWorkouts()
    await refreshStarted
    await Promise.all([apiService.removeToken(), apiService.removeRefreshToken()])
    releaseRefresh()

    await expect(request).rejects.toThrow(
      'Authentication changed before the request could be retried'
    )
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(await apiService.getToken()).toBeNull()
    expect(await apiService.getRefreshToken()).toBeNull()
    expect(unauthorizedHandler).not.toHaveBeenCalled()
  })
})
