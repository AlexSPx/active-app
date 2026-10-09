jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }))
jest.mock(
  'expo-secure-store',
  () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  }),
  { virtual: true }
)

const AsyncStorage = require('@react-native-async-storage/async-storage')
const SecureStore = require('expo-secure-store')
const { config } = require('../../config/api')
const { apiService } = require('../../services/apiService')

describe('ApiService web credential transitions', () => {
  beforeEach(async () => {
    global.fetch = jest.fn()
    await AsyncStorage.clear()
    SecureStore.getItemAsync.mockClear()
    SecureStore.setItemAsync.mockClear()
    SecureStore.deleteItemAsync.mockClear()
  })

  afterEach(() => {
    apiService.resumePendingRequests()
    jest.restoreAllMocks()
  })

  it('clears legacy token keys and stays on cookie auth without SecureStore', async () => {
    await AsyncStorage.setItem(config.STORAGE_KEYS.TOKEN, 'stale-access')
    await AsyncStorage.setItem(config.STORAGE_KEYS.REFRESH_TOKEN, 'stale-refresh')

    await expect(
      apiService.migrateLegacyCredentials({
        token: 'persisted-access',
        refreshToken: 'persisted-refresh',
      })
    ).resolves.toEqual({ token: null, refreshToken: null })
    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.TOKEN)).toBeNull()
    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.REFRESH_TOKEN)).toBeNull()
    await expect(apiService.getToken()).resolves.toBeNull()
    await expect(apiService.getRefreshToken()).resolves.toBeNull()
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled()
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled()
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
    await expect(apiService.login({ email: 'b@example.com', password: 'secret' })).resolves.toEqual(
      {
        token: 'B',
      }
    )

    lateRefreshResponse({ ok: true, status: 200, json: async () => ({ token: 'A' }) })
    expect(global.fetch).toHaveBeenCalledTimes(3)
    expect(global.fetch.mock.calls[2][1]).toMatchObject({ credentials: 'include' })
  })
})
