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

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function response(status, data = {}) {
  return { status, ok: status >= 200 && status < 300, json: async () => data }
}

function pendingJson(status = 200) {
  const started = deferred()
  const completed = deferred()
  let signal
  return {
    started: started.promise,
    complete: completed.resolve,
    get signal() {
      return signal
    },
    fetch: async (_url, options) => {
      signal = options.signal
      return {
        ...response(status),
        json: () => {
          started.resolve()
          return new Promise((resolve, reject) => {
            const abort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
            if (signal.aborted) abort()
            else signal.addEventListener('abort', abort, { once: true })
            completed.promise.then(resolve)
          })
        },
      }
    },
  }
}

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
    const rejectedRequest = expect(oldRequest).rejects.toMatchObject({
      code: 'AUTH_SESSION_CHANGED',
    })
    await refreshStarted

    await apiService.invalidatePendingRequests()
    await rejectedRequest
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

describe('ApiService web response bodies during refresh', () => {
  const originalFetch = global.fetch
  let unauthorized
  beforeEach(() => {
    jest.useFakeTimers()
    global.fetch = jest.fn()
    apiService.resumePendingRequests()
    unauthorized = jest.fn()
    apiService.setUnauthorizedHandler(unauthorized)
  })
  afterEach(async () => {
    await apiService.invalidatePendingRequests()
    apiService.resumePendingRequests()
    global.fetch = originalFetch
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('keeps a stalled cookie-refresh 401 body retryable without logging out', async () => {
    const body = pendingJson(401)
    global.fetch.mockResolvedValueOnce(response(401)).mockImplementationOnce(body.fetch)
    const result = apiService.getWorkouts().catch((error) => error)
    await body.started
    await jest.advanceTimersByTimeAsync(config.REQUEST_TIMEOUT)
    expect(body.signal.aborted).toBe(true)
    expect(await result).toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' })
    expect(unauthorized).not.toHaveBeenCalled()
    expect(global.fetch.mock.calls.every(([, options]) => options.credentials === 'include')).toBe(
      true
    )
    expect(jest.getTimerCount()).toBe(0)
  })

  it('aborts a cookie-refresh body and drains it before the next login', async () => {
    const body = pendingJson()
    global.fetch.mockResolvedValueOnce(response(401)).mockImplementationOnce(body.fetch)
    const result = apiService.getWorkouts().catch((error) => error)
    await body.started
    await apiService.invalidatePendingRequests()
    expect(body.signal.aborted).toBe(true)
    expect(await result).toMatchObject({ code: 'AUTH_SESSION_CHANGED' })
    global.fetch.mockResolvedValueOnce(response(200, { token: 'B' }))
    await expect(apiService.login({ email: 'b@example.com', password: 'secret' })).resolves.toEqual(
      { token: 'B' }
    )
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
    expect(unauthorized).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('keeps the deadline on the original post-refresh retry body', async () => {
    const body = pendingJson()
    global.fetch
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200))
      .mockImplementationOnce(body.fetch)
    const result = apiService.getWorkouts().catch((error) => error)
    await body.started
    await jest.advanceTimersByTimeAsync(config.REQUEST_TIMEOUT)
    expect(body.signal.aborted).toBe(true)
    expect(await result).toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' })
    expect(unauthorized).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('keeps the deadline on a queued refresh subscriber retry body', async () => {
    const refreshStarted = deferred()
    const refreshed = deferred()
    const body = pendingJson()
    global.fetch.mockResolvedValueOnce(response(401)).mockImplementationOnce(() => {
      refreshStarted.resolve()
      return refreshed.promise
    })
    const first = apiService.getUser().catch((error) => error)
    await refreshStarted.promise
    global.fetch.mockResolvedValueOnce(response(401))
    const second = apiService.getWorkouts().catch((error) => error)
    await jest.advanceTimersByTimeAsync(0)
    expect(global.fetch).toHaveBeenCalledTimes(3)
    global.fetch.mockImplementation(async (url, options) => {
      if (url.endsWith('/api/workouts')) return body.fetch(url, options)
      return response(200, { id: 'user' })
    })
    refreshed.resolve(response(200))
    await body.started
    expect(await first).toEqual({ id: 'user' })
    await jest.advanceTimersByTimeAsync(config.REQUEST_TIMEOUT)
    expect(body.signal.aborted).toBe(true)
    expect(await second).toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' })
    expect(unauthorized).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('does not strand a late 401 subscriber while a previous retry body is pending', async () => {
    const firstBody = pendingJson()
    global.fetch
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200))
      .mockImplementationOnce(firstBody.fetch)
    const first = apiService.getUser().catch((error) => error)
    await firstBody.started
    global.fetch
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200, [{ id: 'second' }]))
    let secondResult
    const second = apiService.getWorkouts().then(
      (data) => {
        secondResult = data
      },
      (error) => {
        secondResult = error
      }
    )
    try {
      await jest.advanceTimersByTimeAsync(0)
      expect(secondResult).toEqual([{ id: 'second' }])
    } finally {
      firstBody.complete({ id: 'first' })
      await first
    }
    await second
    expect(unauthorized).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })
})
