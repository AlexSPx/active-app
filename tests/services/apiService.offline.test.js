let mockValues = new Map()
let mockReadGate = null
let mockReadStarted
let mockSecureItems = new Map()

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key) => {
      mockReadStarted?.()
      if (mockReadGate) await mockReadGate
      return mockValues.get(key) ?? null
    }),
    setItem: jest.fn(async (key, value) => mockValues.set(key, value)),
    removeItem: jest.fn(async (key) => mockValues.delete(key)),
    multiRemove: jest.fn(async (keys) => keys.forEach((key) => mockValues.delete(key))),
  },
}))
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }))
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: jest.fn(() => ({})) }), {
  virtual: true,
})
jest.mock(
  'expo-secure-store',
  () => ({
    getItemAsync: jest.fn(async (key) => mockSecureItems.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => mockSecureItems.set(key, value)),
    deleteItemAsync: jest.fn(async (key) => mockSecureItems.delete(key)),
  }),
  { virtual: true }
)

function boot() {
  jest.resetModules()
  const network = require('../../stores/networkStore')
  const { apiService } = require('../../services/apiService')
  return { ...network, apiService }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function response(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => String(body),
  }
}

beforeEach(() => {
  mockValues = new Map()
  mockReadGate = null
  mockReadStarted = null
  mockSecureItems = new Map()
  global.fetch = jest.fn(async () => response({ id: 'user' }))
})

test('waits for the saved offline preference before making an API request', async () => {
  mockValues.set('manual-offline-v1', 'true')
  const read = deferred()
  mockReadGate = read.promise
  const started = new Promise((resolve) => (mockReadStarted = resolve))
  const { apiService } = boot()

  const login = apiService.login({ email: 'test@example.com', password: 'secret' })
  await started
  expect(global.fetch).not.toHaveBeenCalled()

  read.resolve()
  await expect(login).rejects.toMatchObject({ code: 'MANUAL_OFFLINE' })
  expect(global.fetch).not.toHaveBeenCalled()
})

test('blocks login, signup, protected, refresh, and text requests while manually offline', async () => {
  const { apiService, networkPolicy, useNetworkStore } = boot()
  await networkPolicy.ready()
  await useNetworkStore.getState().setManualOffline(true)

  const requests = [
    apiService.login({ email: 'test@example.com', password: 'secret' }),
    apiService.signup({ email: 'test@example.com', password: 'secret' }),
    apiService.getWorkouts(),
    apiService.refreshToken(),
    apiService.getPrivacyPolicy(),
    apiService.probeAvailability(),
  ]
  for (const request of requests) {
    await expect(request).rejects.toMatchObject({ code: 'MANUAL_OFFLINE' })
  }
  expect(global.fetch).not.toHaveBeenCalled()
})

test('aborts an in-flight response body with a policy error, not a timeout', async () => {
  const { apiService, networkPolicy, useNetworkStore } = boot()
  await networkPolicy.ready()
  await useNetworkStore.getState().setManualOffline(false)

  const bodyStarted = deferred()
  let signal
  global.fetch.mockImplementationOnce(async (_url, options) => {
    signal = options.signal
    return {
      ok: true,
      status: 200,
      json: () => {
        bodyStarted.resolve()
        return new Promise((_resolve, reject) => {
          const abort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
          if (signal.aborted) abort()
          else signal.addEventListener('abort', abort, { once: true })
        })
      },
    }
  })

  const result = apiService.login({ email: 'test@example.com', password: 'secret' }).catch((e) => e)
  await bodyStarted.promise
  await useNetworkStore.getState().setManualOffline(true)

  await expect(result).resolves.toMatchObject({ code: 'NETWORK_POLICY_CHANGED' })
  expect(signal.aborted).toBe(true)
})

test('rejects a late response after offline mode is turned back on', async () => {
  const { apiService, networkPolicy, useNetworkStore } = boot()
  await networkPolicy.ready()
  await useNetworkStore.getState().setManualOffline(false)

  const requestStarted = deferred()
  const responseGate = deferred()
  let signal
  global.fetch.mockImplementationOnce((_url, options) => {
    signal = options.signal
    requestStarted.resolve()
    return responseGate.promise
  })

  const result = apiService.login({ email: 'test@example.com', password: 'secret' }).catch((e) => e)
  await requestStarted.promise
  await useNetworkStore.getState().setManualOffline(true)
  await useNetworkStore.getState().setManualOffline(false)
  responseGate.resolve(response({ id: 'late-user' }))

  await expect(result).resolves.toMatchObject({ code: 'NETWORK_POLICY_CHANGED' })
  expect(signal.aborted).toBe(true)
})
