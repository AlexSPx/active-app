jest.mock('../../services/apiService', () => ({ apiService: {} }))

const { FakeDb, createApi, makeJob } = require('../helpers/syncTestUtils')

function deferred() {
  let resolve
  const promise = new Promise((done) => (resolve = done))
  return { promise, resolve }
}

function makeEngine(api, getNetworkState = async () => ({ isConnected: true })) {
  const { SyncEngine } = require('../../lib/sync/SyncEngine')
  return new SyncEngine({
    api,
    getNetworkState,
    addAppStateListener: () => ({ remove() {} }),
    addNetworkStateListener: () => ({ remove() {} }),
  })
}

test('keeps an interrupted queue item pending with its retry state and idempotency key intact', async () => {
  const requestStarted = deferred()
  const finishRequest = deferred()
  const policyChanged = Object.assign(new Error('Manual offline mode is enabled'), {
    code: 'NETWORK_POLICY_CHANGED',
  })
  const api = createApi({
    updateWorkout: jest.fn(async () => {
      requestStarted.resolve()
      await finishRequest.promise
      throw policyChanged
    }),
  })
  const queued = makeJob({
    id: 'interrupted-edit',
    endpoint: 'updateWorkout',
    payload: ['workout-1', { title: 'Saved offline' }],
    retryCount: 3,
    nextAttemptAt: 0,
  })
  const db = new FakeDb({ jobs: [queued] })
  const engine = makeEngine(api)

  try {
    await engine.init(db, { processOnInit: false })
    const drain = engine.processQueue()
    await requestStarted.promise
    engine.setUploadsEnabled(false)
    finishRequest.resolve()
    await drain

    expect(db.getJob(queued.id)).toMatchObject({
      status: 'pending',
      retry_count: 3,
      next_attempt_at: 0,
      idempotency_key: queued.idempotency_key,
    })
    expect(api.updateWorkout).toHaveBeenCalledTimes(1)
  } finally {
    engine.destroy()
  }
})

test.each([
  [{ isConnected: false, isInternetReachable: true }, 'disconnected'],
  [{ isConnected: true, isInternetReachable: false }, 'unreachable'],
])('does not attempt uploads when expo-network explicitly reports %s', async (networkState) => {
  const api = createApi()
  const db = new FakeDb({
    jobs: [makeJob({ id: 'waiting-upload', endpoint: 'deleteWorkout', payload: ['workout-1'] })],
  })
  const engine = makeEngine(api, async () => networkState)

  try {
    await engine.init(db, { processOnInit: false })
    await engine.processQueue()

    expect(api.deleteWorkout).not.toHaveBeenCalled()
    expect(db.getJob('waiting-upload')).toMatchObject({ status: 'pending', retry_count: 0 })
  } finally {
    engine.destroy()
  }
})

test('bounds a stuck network-state preflight and lets the API request provide the real probe', async () => {
  jest.useFakeTimers()
  const api = createApi()
  const db = new FakeDb({
    jobs: [makeJob({ id: 'unknown-network', endpoint: 'deleteWorkout', payload: ['workout-1'] })],
  })
  const engine = makeEngine(api, () => new Promise(() => {}))

  try {
    await engine.init(db, { processOnInit: false })
    const drain = engine.processQueue()
    await jest.advanceTimersByTimeAsync(3_000)
    await drain

    expect(api.deleteWorkout).toHaveBeenCalledTimes(1)
    expect(db.getJob('unknown-network')).toBeNull()
    expect(jest.getTimerCount()).toBe(0)
  } finally {
    engine.destroy()
    jest.useRealTimers()
  }
})
