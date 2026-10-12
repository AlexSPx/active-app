let mockValues = new Map()
let mockReadError = null
let mockWriteError = null
let mockWriteStarted
let mockWriteGate

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key) => {
      if (mockReadError) throw mockReadError
      return mockValues.get(key) ?? null
    }),
    setItem: jest.fn(async (key, value) => {
      if (mockWriteError) throw mockWriteError
      if (mockWriteGate && value === 'true') {
        mockWriteStarted?.()
        await mockWriteGate
      }
      mockValues.set(key, value)
    }),
  },
}))

function boot() {
  jest.resetModules()
  return require('../../stores/networkStore')
}

beforeEach(() => {
  mockValues = new Map()
  mockReadError = null
  mockWriteError = null
  mockWriteStarted = null
  mockWriteGate = null
})

test('restores manual offline before allowing API policy checks and persists the change', async () => {
  mockValues.set('manual-offline-v1', 'true')
  const { useNetworkStore, networkPolicy } = boot()

  expect(useNetworkStore.getState()).toMatchObject({ manualOffline: true, isReady: false })
  await networkPolicy.ready()

  expect(useNetworkStore.getState()).toMatchObject({ manualOffline: true, isReady: true })
  expect(() => networkPolicy.assertOnline()).toThrow(
    expect.objectContaining({ code: 'MANUAL_OFFLINE' })
  )

  await useNetworkStore.getState().setManualOffline(false)
  expect(mockValues.get('manual-offline-v1')).toBe('false')
  expect(networkPolicy.assertOnline()).toBe(networkPolicy.generation)
})

test('fails closed after a storage read error and can recover through retryRestore', async () => {
  mockReadError = new Error('offline preference unavailable')
  const { useNetworkStore, networkPolicy } = boot()

  await networkPolicy.ready()
  expect(useNetworkStore.getState()).toMatchObject({
    manualOffline: true,
    isReady: true,
    restoreError: expect.any(String),
  })
  expect(() => networkPolicy.assertOnline()).toThrow(
    expect.objectContaining({ code: 'NETWORK_PREFERENCE_ERROR' })
  )

  mockReadError = null
  mockValues.set('manual-offline-v1', 'false')
  await useNetworkStore.getState().retryRestore()

  expect(useNetworkStore.getState()).toMatchObject({
    manualOffline: false,
    isReady: true,
    restoreError: null,
  })
  expect(() => networkPolicy.assertOnline()).not.toThrow()
})

test('fails closed on a malformed persisted preference', async () => {
  mockValues.set('manual-offline-v1', 'maybe')
  const { useNetworkStore, networkPolicy } = boot()

  await networkPolicy.ready()

  expect(useNetworkStore.getState()).toMatchObject({
    manualOffline: true,
    isReady: true,
    restoreError: expect.any(String),
  })
  expect(() => networkPolicy.assertOnline()).toThrow(
    expect.objectContaining({ code: 'NETWORK_PREFERENCE_ERROR' })
  )
})

test('a stale preference write cannot override a newer offline choice', async () => {
  mockValues.set('manual-offline-v1', 'false')
  const { useNetworkStore, networkPolicy } = boot()
  await networkPolicy.ready()

  let releaseWrite
  let startedWrite
  mockWriteGate = new Promise((resolve) => {
    releaseWrite = resolve
  })
  const started = new Promise((resolve) => {
    startedWrite = resolve
    mockWriteStarted = resolve
  })

  const enablingOffline = useNetworkStore.getState().setManualOffline(true)
  await started
  const disablingOffline = useNetworkStore.getState().setManualOffline(false)
  await Promise.resolve()
  releaseWrite()
  await Promise.all([enablingOffline, disablingOffline])

  expect(mockValues.get('manual-offline-v1')).toBe('false')
  expect(useNetworkStore.getState().manualOffline).toBe(false)
  expect(() => networkPolicy.assertOnline()).not.toThrow()
})
