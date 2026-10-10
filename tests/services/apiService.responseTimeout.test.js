jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: jest.fn(() => ({})) }), {
  virtual: true,
})
jest.mock(
  'expo-secure-store',
  () => ({
    getItemAsync: jest.fn(async () => null),
    setItemAsync: jest.fn(async () => {}),
    deleteItemAsync: jest.fn(async () => {}),
  }),
  { virtual: true }
)

const ExpoModulesCore = require('expo-modules-core')
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

// Fetch body readers reject on abort even after response headers have arrived.
function stalledBody(status = 200, reader = 'json', abortGate = Promise.resolve()) {
  const started = deferred()
  let signal
  global.fetch.mockImplementationOnce(async (_url, options) => {
    signal = options.signal
    return {
      status,
      ok: status >= 200 && status < 300,
      statusText: status === 401 ? 'Unauthorized' : 'Unavailable',
      [reader]: () => {
        started.resolve()
        return new Promise((_resolve, reject) => {
          const abort = () => {
            void abortGate.then(() =>
              reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
            )
          }
          if (signal.aborted) abort()
          else signal.addEventListener('abort', abort, { once: true })
        })
      },
    }
  })
  return {
    started: started.promise,
    get signal() {
      return signal
    },
  }
}

const login = () => apiService.login({ email: 'a@example.com', password: 'secret' })

describe('ApiService response-body deadlines', () => {
  const originalFetch = global.fetch
  let unauthorized

  beforeEach(() => {
    jest.useFakeTimers()
    global.fetch = jest.fn()
    ExpoModulesCore.requireOptionalNativeModule.mockReturnValue({})
    apiService.resumePendingRequests()
    unauthorized = jest.fn()
    apiService.setUnauthorizedHandler(unauthorized)
    SecureStore.setItemAsync.mockClear()
  })

  afterEach(async () => {
    await apiService.invalidatePendingRequests()
    apiService.resumePendingRequests()
    global.fetch = originalFetch
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it.each([200, 401, 503])(
    'times out stalled JSON after %i headers without swallowing abort or logging out',
    async (status) => {
      const body = stalledBody(status)
      const result = login().catch((error) => error)
      await body.started
      expect(global.fetch.mock.calls[0][1].headers['X-Platform']).toBe('native')
      await jest.advanceTimersByTimeAsync(config.REQUEST_TIMEOUT - 1)
      expect(body.signal.aborted).toBe(false)
      await jest.advanceTimersByTimeAsync(1)
      // Assert abort first so the old implementation fails without awaiting a never-settled body.
      expect(body.signal.aborted).toBe(true)
      expect(await result).toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' })
      expect(unauthorized).not.toHaveBeenCalled()
      expect(jest.getTimerCount()).toBe(0)
    }
  )

  it('times out a stalled protected 401 before starting refresh', async () => {
    const body = stalledBody(401)
    const result = apiService.getWorkouts().catch((error) => error)
    await body.started
    await jest.advanceTimersByTimeAsync(config.REQUEST_TIMEOUT)
    expect(body.signal.aborted).toBe(true)
    expect(await result).toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(unauthorized).not.toHaveBeenCalled()
  })

  it('keeps the deadline while consuming a text body', async () => {
    const body = stalledBody(200, 'text')
    const result = apiService.getTermsOfService().catch((error) => error)
    await body.started
    await jest.advanceTimersByTimeAsync(config.REQUEST_TIMEOUT)
    expect(body.signal.aborted).toBe(true)
    expect(await result).toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' })
    expect(jest.getTimerCount()).toBe(0)
  })

  it('aborts and awaits body settlement before the next credential write', async () => {
    const abortGate = deferred()
    const body = stalledBody(401, 'json', abortGate.promise)
    const result = login().catch((error) => error)
    await body.started
    let invalidated = false
    const transition = apiService.invalidatePendingRequests().then(async () => {
      invalidated = true
      await apiService.setToken('next-session')
    })
    try {
      await Promise.resolve()
      expect(body.signal.aborted).toBe(true)
      expect(invalidated).toBe(false)
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
    } finally {
      abortGate.resolve()
      await transition
    }
    expect(await result).toMatchObject({ code: 'AUTH_SESSION_CHANGED' })
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1)
    expect(unauthorized).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  it.each([
    ['JSON', 'json', { id: 'complete' }, { id: 'complete' }],
    ['text', 'text', 'terms', 'terms'],
    ['malformed JSON', 'json', new SyntaxError('Invalid JSON'), {}],
  ])(
    'preserves completed %s behavior and removes its abort registration',
    async (_label, reader, value, expected) => {
      let signal
      global.fetch.mockImplementationOnce(async (_url, options) => {
        signal = options.signal
        return {
          ok: true,
          status: 200,
          [reader]: async () => {
            if (value instanceof Error) throw value
            return value
          },
        }
      })
      await expect(reader === 'text' ? apiService.getTermsOfService() : login()).resolves.toEqual(
        expected
      )
      expect(jest.getTimerCount()).toBe(0)
      await apiService.invalidatePendingRequests()
      expect(signal.aborted).toBe(false)
    }
  )

  it('preserves HTTP error details and malformed-error fallback', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Unavailable',
      json: async () => ({ message: 'Try later', code: 'BUSY' }),
    })
    await expect(login()).rejects.toMatchObject({ status: 503, code: 'BUSY', message: 'Try later' })
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Unavailable',
      json: async () => {
        throw new SyntaxError('Invalid JSON')
      },
    })
    await expect(login()).rejects.toMatchObject({ status: 503, message: 'Unavailable' })
    expect(jest.getTimerCount()).toBe(0)
  })

  it.each([false, true])(
    'forwards caller cancellation (already aborted: %s) and removes its listener',
    async (alreadyAborted) => {
      const caller = new AbortController()
      const removed = jest.spyOn(caller.signal, 'removeEventListener')
      if (alreadyAborted) caller.abort()
      const body = stalledBody()
      const result = apiService
        .requestWithoutRefresh('/caller-cancelled', { signal: caller.signal })
        .catch((error) => error)
      await body.started
      if (!alreadyAborted) caller.abort()
      expect(body.signal.aborted).toBe(true)
      expect(await result).toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' })
      expect(removed).toHaveBeenCalledWith('abort', expect.any(Function))
      expect(jest.getTimerCount()).toBe(0)
      removed.mockRestore()
    }
  )

  it('cleans up failed fetches without turning a network failure into a timeout', async () => {
    let signal
    const failure = new TypeError('Network request failed')
    global.fetch.mockImplementationOnce(async (_url, options) => {
      signal = options.signal
      throw failure
    })
    await expect(login()).rejects.toBe(failure)
    expect(jest.getTimerCount()).toBe(0)
    await apiService.invalidatePendingRequests()
    expect(signal.aborted).toBe(false)
  })
})
