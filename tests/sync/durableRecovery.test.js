jest.mock('../../services/apiService', () => ({ apiService: {} }))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../../services/posthog', () => ({ posthog: { capture: jest.fn() } }))

const { SyncEngine } = require('../../lib/sync/SyncEngine')
const { FakeDb, createApi, makeJob } = require('../helpers/syncTestUtils')

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function engineWith(api, overrides = {}) {
  return new SyncEngine({
    api,
    getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
    addAppStateListener: () => ({ remove() {} }),
    addNetworkStateListener: () => ({ remove() {} }),
    ...overrides,
  })
}

const deleteJob = (id, options = {}) =>
  makeJob({ id, endpoint: 'deleteWorkout', payload: [id], ...options })

describe('durable sync recovery', () => {
  it('automatically drains a 51st ordered job after one external queue trigger', async () => {
    const ids = Array.from({ length: 51 }, (_, index) => `job-${index + 1}`)
    const db = new FakeDb({ jobs: ids.map((id, index) => deleteJob(id, { sequence: index + 1 })) })
    const api = createApi()
    const engine = engineWith(api)
    jest.useFakeTimers()
    try {
      await engine.init(db, { processOnInit: false })
      await engine.processQueue()
      // Flush the automatic successor, without requesting another drain ourselves.
      await jest.advanceTimersByTimeAsync(0)
      expect(api.deleteWorkout.mock.calls).toEqual(ids.map((id) => [id]))
      expect(db.jobs).toEqual([])
    } finally {
      engine.destroy()
      jest.useRealTimers()
    }
  })

  it('shares one drain while network detection and the upload are both pending', async () => {
    const network = deferred()
    const upload = deferred()
    const started = deferred()
    const getNetworkState = jest.fn(() => network.promise)
    const api = createApi({
      deleteWorkout: jest.fn(() => {
        started.resolve()
        return upload.promise
      }),
    })
    const db = new FakeDb({ jobs: [deleteJob('once')] })
    const engine = engineWith(api, { getNetworkState })
    try {
      await engine.init(db, { processOnInit: false })
      const first = engine.processQueue()
      const second = engine.processQueue()
      await Promise.resolve()
      expect(getNetworkState).toHaveBeenCalledTimes(1)
      network.resolve({ isConnected: true, isInternetReachable: true })
      await started.promise
      const third = engine.processQueue()
      expect(api.deleteWorkout).toHaveBeenCalledTimes(1)
      upload.resolve()
      await Promise.all([first, second, third])
      expect(api.deleteWorkout).toHaveBeenCalledTimes(1)
      expect(db.jobs).toEqual([])
    } finally {
      engine.destroy()
    }
  })

  it('waits for an old same-owner upload before recovering processing rows on reinit', async () => {
    const upload = deferred()
    const started = deferred()
    const api = createApi({
      deleteWorkout: jest
        .fn()
        .mockImplementationOnce(() => {
          started.resolve()
          return upload.promise
        })
        .mockResolvedValue(undefined),
    })
    const db = new FakeDb({ jobs: [deleteJob('stable-operation')] })
    const engine = engineWith(api)
    try {
      await engine.init(db, { processOnInit: false })
      const oldDrain = engine.processQueue()
      await started.promise
      engine.destroy()
      let initialized = false
      const reinit = engine.init(db, { processOnInit: false }).then(() => {
        initialized = true
      })
      await Promise.resolve()
      const concurrentDrain = engine.processQueue()
      expect(initialized).toBe(false)
      expect(db.jobs[0].status).toBe('processing')
      expect(api.deleteWorkout).toHaveBeenCalledTimes(1)
      upload.resolve()
      await Promise.all([oldDrain, reinit, concurrentDrain])
      expect(db.jobs[0]).toMatchObject({
        id: 'stable-operation',
        idempotency_key: 'stable-operation-key',
        status: 'pending',
      })
      await engine.processQueue()
      expect(api.deleteWorkout).toHaveBeenCalledTimes(2)
      expect(db.jobs).toEqual([])
    } finally {
      engine.destroy()
    }
  })

  it('rolls back a partial ID remap when same-owner reinit invalidates its transaction', async () => {
    const changedId = deferred()
    const releaseWrite = deferred()
    const db = new FakeDb({
      jobs: [
        makeJob({
          id: 'create',
          endpoint: 'createWorkout',
          payload: { title: 'Offline' },
          localTable: 'workouts',
          localId: 'local',
        }),
        makeJob({
          id: 'update',
          endpoint: 'updateWorkout',
          payload: ['local', { title: 'Edited' }],
        }),
      ],
      tables: { workouts: ['local'] },
    })
    const originalWrite = db.runAsync.bind(db)
    db.runAsync = jest.fn(async (sql, ...params) => {
      await originalWrite(sql, ...params)
      if (sql === 'UPDATE "workouts" SET id = ? WHERE id = ?') {
        changedId.resolve()
        await releaseWrite.promise
      }
    })
    const api = createApi({ createWorkout: jest.fn(async () => ({ id: 'server' })) })
    const engine = engineWith(api)
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await engine.init(db, { processOnInit: false })
      const drain = engine.processQueue()
      const rejectedDrain = expect(drain).rejects.toThrow('Sync lifecycle changed during ID remap')
      await changedId.promise
      const reinit = engine.init(db, { processOnInit: false })
      releaseWrite.resolve()
      await Promise.all([rejectedDrain, reinit])
      expect(db.tables.workouts.has('local')).toBe(true)
      expect(db.tables.workouts.has('server')).toBe(false)
      expect(db.idRemaps.size).toBe(0)
      expect(engine.resolveId('workouts', 'local')).toBe('local')
      expect(db.getJob('create')).toMatchObject({ status: 'pending', local_id: 'local' })
      expect(JSON.parse(db.getJob('update').payload)[0]).toBe('local')
      expect(api.updateWorkout).not.toHaveBeenCalled()
      expect(db.transactionEvents.some((event) => event.type === 'rollback')).toBe(true)
    } finally {
      engine.destroy()
      consoleError.mockRestore()
    }
  })

  it('recovers a crash-left processing row and preserves same-timestamp causal order across restart', async () => {
    const db = new FakeDb({
      jobs: [
        deleteJob('third', { sequence: 3 }),
        deleteJob('first', { sequence: 1, status: 'processing' }),
        deleteJob('second', { sequence: 2 }),
      ],
    })
    const api = createApi()
    const old = engineWith(api)
    await old.init(db, { processOnInit: false })
    old.destroy()
    const restarted = engineWith(api)
    try {
      await restarted.init(db, { processOnInit: false })
      await restarted.processQueue()
      expect(api.deleteWorkout.mock.calls).toEqual([['first'], ['second'], ['third']])
      expect(db.jobs).toEqual([])
    } finally {
      restarted.destroy()
    }
  })

  it('keeps capped retry deadlines across a new instance and prevents later work overtaking the delayed head', async () => {
    jest.useFakeTimers()
    jest.spyOn(Math, 'random').mockReturnValue(0)
    const api = createApi({
      deleteWorkout: jest
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue(undefined),
    })
    const db = new FakeDb({ jobs: [deleteJob('head', { retryCount: 20 }), deleteJob('dependent')] })
    const first = engineWith(api)
    let second
    try {
      await first.init(db, { processOnInit: false })
      await first.processQueue()
      const deadline = db.jobs[0].next_attempt_at
      expect(deadline - Date.now()).toBe(60000)
      expect(db.jobs[0]).toMatchObject({
        retry_count: 21,
        status: 'failed',
        idempotency_key: 'head-key',
      })
      first.destroy()
      let networkListener
      let appListener
      second = engineWith(api, {
        addNetworkStateListener: (callback) => {
          networkListener = callback
          return { remove() {} }
        },
        addAppStateListener: (callback) => {
          appListener = callback
          return { remove() {} }
        },
      })
      await second.init(db, { processOnInit: false })
      await second.processQueue()
      networkListener({ isConnected: true, isInternetReachable: true })
      appListener('active')
      await second.processQueue()
      expect(api.deleteWorkout.mock.calls).toEqual([['head']])
      expect(db.jobs[0].next_attempt_at).toBe(deadline)
      expect(jest.getTimerCount()).toBe(1)
      await jest.advanceTimersByTimeAsync(59999)
      expect(api.deleteWorkout).toHaveBeenCalledTimes(1)
      await jest.advanceTimersByTimeAsync(1)
      expect(api.deleteWorkout.mock.calls).toEqual([['head'], ['head'], ['dependent']])
      expect(db.jobs).toEqual([])
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      first.destroy()
      second?.destroy()
      jest.restoreAllMocks()
      jest.useRealTimers()
    }
  })

  it('resumes a current-lifecycle job paused between marking processing and its upload', async () => {
    const marked = deferred()
    const releaseRead = deferred()
    const db = new FakeDb({ jobs: [deleteJob('paused-before-upload')] })
    const originalRead = db.getFirstAsync.bind(db)
    db.getFirstAsync = jest.fn(async (sql, ...params) => {
      if (sql.includes('FROM sync_queue WHERE id = ?')) {
        marked.resolve()
        await releaseRead.promise
      }
      return originalRead(sql, ...params)
    })
    const api = createApi()
    const engine = engineWith(api)
    try {
      await engine.init(db, { processOnInit: false })
      const drain = engine.processQueue()
      await marked.promise
      engine.setUploadsEnabled(false)
      releaseRead.resolve()
      await drain
      expect(api.deleteWorkout).not.toHaveBeenCalled()
      expect(db.jobs[0].status).toBe('pending')
      const completed = new Promise((resolve) => engine.on('sync:complete', resolve))
      engine.setUploadsEnabled(true)
      await completed
      expect(api.deleteWorkout).toHaveBeenCalledTimes(1)
      expect(db.jobs).toEqual([])
    } finally {
      engine.destroy()
    }
  })

  it('retains a 401 failure until uploads are explicitly re-enabled, then resumes the head', async () => {
    jest.useFakeTimers()
    const unauthorized = Object.assign(new Error('Session expired'), { status: 401 })
    const api = createApi({
      deleteWorkout: jest.fn().mockRejectedValueOnce(unauthorized).mockResolvedValue(undefined),
    })
    const db = new FakeDb({ jobs: [deleteJob('auth-head'), deleteJob('dependent')] })
    let appListener
    let networkListener
    const engine = engineWith(api, {
      addAppStateListener: (callback) => {
        appListener = callback
        return { remove() {} }
      },
      addNetworkStateListener: (callback) => {
        networkListener = callback
        return { remove() {} }
      },
    })
    try {
      await engine.init(db, { processOnInit: false })
      await engine.processQueue()
      expect(db.jobs[0]).toMatchObject({
        id: 'auth-head',
        status: 'failed',
        retry_count: 1,
        next_attempt_at: 0,
        error_message: expect.stringContaining('Session expired'),
      })
      expect(jest.getTimerCount()).toBe(0)
      appListener('active')
      networkListener({ isConnected: true, isInternetReachable: true })
      await engine.processQueue()
      await jest.advanceTimersByTimeAsync(60000)
      expect(api.deleteWorkout.mock.calls).toEqual([['auth-head']])
      const completed = new Promise((resolve) => engine.on('sync:complete', resolve))
      engine.setUploadsEnabled(true)
      await completed
      expect(api.deleteWorkout.mock.calls).toEqual([['auth-head'], ['auth-head'], ['dependent']])
      expect(db.jobs).toEqual([])
    } finally {
      engine.destroy()
      jest.useRealTimers()
    }
  })

  it('allocates durable insertion order without changing operation identity after restart', async () => {
    const db = new FakeDb()
    const engine = engineWith(createApi())
    engine.setUploadsEnabled(false)
    await engine.init(db, { processOnInit: false })
    await engine.enqueue({ apiMethod: 'deleteWorkout', payload: ['first'] })
    const first = { ...db.jobs[0] }
    engine.destroy()
    const restarted = engineWith(createApi())
    restarted.setUploadsEnabled(false)
    try {
      await restarted.init(db, { processOnInit: false })
      await restarted.enqueue({ apiMethod: 'deleteWorkout', payload: ['second'] })
      expect(db.jobs[0]).toMatchObject({
        id: first.id,
        idempotency_key: first.idempotency_key,
        sequence: first.sequence,
      })
      expect(db.jobs[1].sequence).toBeGreaterThan(first.sequence)
      expect(db.jobs[1].id).not.toBe(first.id)
    } finally {
      restarted.destroy()
    }
  })
})
