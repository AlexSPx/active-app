jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: jest.fn(() => ({})) }), {
  virtual: true,
})
let mockSecureStorePackageLoads = 0
jest.mock(
  'expo-secure-store',
  () => {
    mockSecureStorePackageLoads += 1
    return {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 42,
      getItemAsync: jest.fn(),
      setItemAsync: jest.fn(),
      deleteItemAsync: jest.fn(),
    }
  },
  { virtual: true }
)

const AsyncStorage = require('@react-native-async-storage/async-storage')
const SecureStore = require('expo-secure-store')
const { config } = require('../../config/api')
jest.mock('../../config/launchPolicy', () => ({
  ...jest.requireActual('../../config/launchPolicy'),
  isBackendEnabledForLaunch: () => true,
}))

const { apiService } = require('../../services/apiService')
let secureItems = new Map()

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
    AsyncStorage.multiRemove.mockClear()
    secureItems = new Map()
    SecureStore.getItemAsync
      .mockReset()
      .mockImplementation(async (key) => secureItems.get(key) ?? null)
    SecureStore.setItemAsync.mockReset().mockImplementation(async (key, value) => {
      secureItems.set(key, value)
    })
    SecureStore.deleteItemAsync.mockReset().mockImplementation(async (key) => {
      secureItems.delete(key)
    })
  })

  it('adds an idempotency key to a queued mutation request', async () => {
    global.fetch.mockResolvedValueOnce(makeResponse(200, { id: 'server-workout' }))

    await apiService.createWorkout({ title: 'Offline' }, 'operation-key')

    expect(global.fetch.mock.calls[0][1].headers).toMatchObject({
      'Idempotency-Key': 'operation-key',
    })
  })

  it('sends delete preconditions as query parameters and returns cross-root versions', async () => {
    const acknowledgement = {
      deletedWorkoutId: 'workout/1',
      routineVersions: [{ id: 'routine-1', version: 8 }],
    }
    global.fetch.mockResolvedValueOnce(makeResponse(200, acknowledgement))

    await expect(
      apiService.deleteWorkout({ id: 'workout/1', baseVersion: 4 }, 'delete-key')
    ).resolves.toEqual(acknowledgement)

    const [requestUrl, options] = global.fetch.mock.calls[0]
    const parsedUrl = new URL(requestUrl)
    expect(parsedUrl.pathname).toContain('/workout%2F1')
    expect(parsedUrl.searchParams.get('baseVersion')).toBe('4')
    expect(options).toMatchObject({
      method: 'DELETE',
      headers: expect.objectContaining({ 'Idempotency-Key': 'delete-key' }),
    })
  })

  it('sends both routine delete roots and retains typed stale details', async () => {
    global.fetch.mockResolvedValueOnce(
      makeResponse(409, {
        message: 'Profile changed',
        code: 'STALE_VERSION',
        currentVersion: 13,
      })
    )

    await expect(
      apiService.deleteRoutine(
        { id: 'routine-1', baseVersion: 5, profileBaseVersion: 12 },
        'delete-routine-key'
      )
    ).rejects.toMatchObject({
      status: 409,
      message: 'Profile changed',
      code: 'STALE_VERSION',
      currentVersion: 13,
    })

    const parsedUrl = new URL(global.fetch.mock.calls[0][0])
    expect(parsedUrl.searchParams.get('baseVersion')).toBe('5')
    expect(parsedUrl.searchParams.get('profileBaseVersion')).toBe('12')
  })

  it('moves legacy AsyncStorage and hydrated credentials into SecureStore before cleanup', async () => {
    secureItems.set(config.STORAGE_KEYS.TOKEN, 'secure-access')
    secureItems.set(config.STORAGE_KEYS.REFRESH_TOKEN, 'secure-refresh')
    await AsyncStorage.setItem(config.STORAGE_KEYS.TOKEN, 'legacy-access')
    await AsyncStorage.setItem(config.STORAGE_KEYS.REFRESH_TOKEN, 'legacy-refresh')

    await expect(
      apiService.migrateLegacyCredentials({
        token: 'hydrated-access',
        refreshToken: 'hydrated-refresh',
      })
    ).resolves.toEqual({ token: 'legacy-access', refreshToken: 'legacy-refresh' })

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      config.STORAGE_KEYS.TOKEN,
      'legacy-access',
      { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
    )
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      config.STORAGE_KEYS.REFRESH_TOKEN,
      'legacy-refresh',
      { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
    )
    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.TOKEN)).toBeNull()
    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.REFRESH_TOKEN)).toBeNull()

    await expect(
      apiService.migrateLegacyCredentials({
        token: 'hydrated-access',
        refreshToken: 'hydrated-refresh',
      })
    ).resolves.toEqual({ token: 'legacy-access', refreshToken: 'legacy-refresh' })
    secureItems.clear()
    await expect(
      apiService.migrateLegacyCredentials({
        token: 'hydrated-access',
        refreshToken: 'hydrated-refresh',
      })
    ).resolves.toEqual({ token: 'hydrated-access', refreshToken: 'hydrated-refresh' })
  })

  it('keeps legacy values when either SecureStore write fails', async () => {
    await AsyncStorage.setItem(config.STORAGE_KEYS.TOKEN, 'legacy-access')
    await AsyncStorage.setItem(config.STORAGE_KEYS.REFRESH_TOKEN, 'legacy-refresh')
    SecureStore.setItemAsync.mockImplementation(async (key, value) => {
      if (key === config.STORAGE_KEYS.REFRESH_TOKEN) throw new Error('write failed')
    })

    await expect(
      apiService.migrateLegacyCredentials({ token: null, refreshToken: null })
    ).rejects.toThrow('write failed')

    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(2)
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled()
    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.TOKEN)).toBe('legacy-access')
    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.REFRESH_TOKEN)).toBe('legacy-refresh')
  })

  it('does not import SecureStore when its optional native module is missing', async () => {
    const packageLoadCount = mockSecureStorePackageLoads
    const isolatedExpoModulesCore = require('expo-modules-core')
    try {
      await jest.isolateModulesAsync(async () => {
        const expoModulesCore = require('expo-modules-core')
        expoModulesCore.requireOptionalNativeModule.mockReturnValue(null)
        const isolatedAsyncStorage = require('@react-native-async-storage/async-storage')
        const isolatedApiService = require('../../services/apiService').apiService
        await isolatedAsyncStorage.setItem(config.STORAGE_KEYS.TOKEN, 'legacy-access')

        await expect(isolatedApiService.setToken('new-access')).rejects.toMatchObject({
          code: 'SECURE_STORE_UNAVAILABLE',
        })
        await expect(isolatedApiService.getToken()).resolves.toBeNull()
        await expect(isolatedApiService.getRefreshToken()).resolves.toBeNull()
        expect(expoModulesCore.requireOptionalNativeModule).toHaveBeenCalledWith('ExpoSecureStore')
        expect(mockSecureStorePackageLoads).toBe(packageLoadCount)

        await expect(isolatedApiService.removeToken()).resolves.toBeUndefined()
        expect(await isolatedAsyncStorage.getItem(config.STORAGE_KEYS.TOKEN)).toBeNull()
      })
    } finally {
      isolatedExpoModulesCore.requireOptionalNativeModule.mockReturnValue({})
    }
  })

  it('keeps a legacy token if SecureStore removal fails', async () => {
    await AsyncStorage.setItem(config.STORAGE_KEYS.TOKEN, 'legacy-access')
    SecureStore.deleteItemAsync.mockRejectedValue(new Error('delete failed'))

    await expect(apiService.removeToken()).rejects.toThrow('delete failed')

    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.TOKEN)).toBe('legacy-access')
  })

  it('only invalidates the session for terminal refresh failures', async () => {
    await apiService.setToken('access')
    await apiService.setRefreshToken('refresh')
    const unauthorizedHandler = jest.fn()
    apiService.setUnauthorizedHandler(unauthorizedHandler)

    global.fetch
      .mockResolvedValueOnce(makeResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(makeResponse(503, { message: 'unavailable' }))
    await expect(apiService.getWorkouts()).rejects.toMatchObject({ status: 503 })
    expect(unauthorizedHandler).not.toHaveBeenCalled()

    global.fetch.mockReset()
    global.fetch
      .mockResolvedValueOnce(makeResponse(401, { message: 'expired' }))
      .mockRejectedValueOnce(new TypeError('Network request failed'))
    await expect(apiService.getWorkouts()).rejects.toThrow('Network request failed')
    expect(unauthorizedHandler).not.toHaveBeenCalled()

    global.fetch.mockReset()
    global.fetch
      .mockResolvedValueOnce(makeResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(
        makeResponse(200, { token: 'rotated-access', refreshToken: 'rotated-refresh' })
      )
      .mockResolvedValueOnce(makeResponse(200, [{ id: 'workout-1' }]))
    await expect(apiService.getWorkouts()).resolves.toEqual([{ id: 'workout-1' }])
    expect(await apiService.getRefreshToken()).toBe('rotated-refresh')
    expect(unauthorizedHandler).not.toHaveBeenCalled()

    global.fetch.mockReset()
    global.fetch
      .mockResolvedValueOnce(makeResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(makeResponse(401, { message: 'invalid refresh token' }))
    await expect(apiService.getWorkouts()).rejects.toMatchObject({ status: 401 })
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1)

    await apiService.removeRefreshToken()
    global.fetch.mockReset().mockResolvedValueOnce(makeResponse(401, { message: 'expired' }))
    await expect(apiService.getWorkouts()).rejects.toMatchObject({ status: 401 })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(unauthorizedHandler).toHaveBeenCalledTimes(2)
  })

  it('surfaces a legacy-key cleanup failure after SecureStore deletion', async () => {
    secureItems.set(config.STORAGE_KEYS.TOKEN, 'secure-access')
    await AsyncStorage.setItem(config.STORAGE_KEYS.TOKEN, 'legacy-access')
    AsyncStorage.removeItem.mockRejectedValueOnce(new Error('legacy cleanup failed'))

    await expect(apiService.removeToken()).rejects.toThrow('legacy cleanup failed')

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(config.STORAGE_KEYS.TOKEN)
    expect(secureItems.has(config.STORAGE_KEYS.TOKEN)).toBe(false)
    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.TOKEN)).toBe('legacy-access')
  })

  it('does not restore credentials or retry a protected request after logout', async () => {
    await apiService.setToken('old-access')
    await apiService.setRefreshToken('old-refresh')
    await AsyncStorage.setItem(config.STORAGE_KEYS.TOKEN, 'legacy-access')
    await AsyncStorage.setItem(config.STORAGE_KEYS.REFRESH_TOKEN, 'legacy-refresh')

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
    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.TOKEN)).toBeNull()
    expect(await AsyncStorage.getItem(config.STORAGE_KEYS.REFRESH_TOKEN)).toBeNull()
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
