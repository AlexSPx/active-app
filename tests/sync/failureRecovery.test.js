jest.mock('../../services/apiService', () => ({ apiService: {} }))
jest.mock('../../config/launchPolicy', () => ({
  ...jest.requireActual('../../config/launchPolicy'),
  isSyncEnabledForLaunch: () => true,
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../../services/posthog', () => ({ posthog: { capture: jest.fn() } }))

const { SyncEngine } = require('../../lib/sync/SyncEngine')
const { setActiveProfileOwner } = require('../../lib/profileScope')
const { FakeDb, createApi, makeJob } = require('../helpers/syncTestUtils')

function engineWith(api) {
  return new SyncEngine({
    api,
    getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
    addAppStateListener: () => ({ remove() {} }),
    addNetworkStateListener: () => ({ remove() {} }),
  })
}

function permanentError(message = 'rejected') {
  return Object.assign(new Error(message), { status: 409 })
}

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('failed sync recovery', () => {
  afterEach(() => setActiveProfileOwner('local:device'))

  it('persists an auth pause across restart and resumes the exact queued request only after confirmation', async () => {
    const payload = '[  "workout-auth" , { "title": "Keep bytes" } ]'
    const job = makeJob({
      id: 'auth-update',
      endpoint: 'updateWorkout',
      payload: [],
    })
    job.payload = payload
    const db = new FakeDb({ jobs: [job] })
    const unauthorized = Object.assign(new Error('Session expired'), { status: 401 })
    const api = createApi({
      updateWorkout: jest
        .fn()
        .mockRejectedValueOnce(unauthorized)
        .mockResolvedValue({ id: 'workout-auth', version: 1 }),
    })
    const first = engineWith(api)

    await first.init(db, { processOnInit: false })
    await first.processQueue()
    expect(first.authPaused).toBe(true)
    expect(db.getJob('auth-update')).toMatchObject({
      status: 'auth_required',
      payload,
      idempotency_key: 'auth-update-key',
      error_message: 'Session expired',
    })
    first.destroy()

    const restarted = engineWith(api)
    try {
      await restarted.init(db, { processOnInit: false })
      expect(restarted.authPaused).toBe(true)
      await restarted.processQueue()
      expect(api.updateWorkout).toHaveBeenCalledTimes(1)

      const completed = new Promise((resolve) => restarted.on('sync:complete', resolve))
      restarted.setUploadsEnabled(true)
      await completed

      expect(api.updateWorkout.mock.calls).toEqual([
        ['workout-auth', { title: 'Keep bytes' }, 'auth-update-key'],
        ['workout-auth', { title: 'Keep bytes' }, 'auth-update-key'],
      ])
      expect(db.getJob('auth-update')).toBeNull()
    } finally {
      restarted.destroy()
    }
  })

  it('blocks direct and transitive temporary-ID work while an unrelated later job proceeds', async () => {
    const api = createApi({
      createWorkout: jest.fn().mockRejectedValue(permanentError('invalid workout')),
    })
    const db = new FakeDb({
      tables: {
        workouts: ['local-workout'],
        workout_records: ['local-record'],
        routines: ['local-routine'],
      },
      jobs: [
        makeJob({
          id: 'create-workout',
          endpoint: 'createWorkout',
          payload: { title: 'Offline' },
          localTable: 'workouts',
          localId: 'local-workout',
        }),
        makeJob({
          id: 'update-workout',
          endpoint: 'updateWorkout',
          payload: ['local-workout', { title: 'Edited' }],
        }),
        makeJob({
          id: 'create-routine',
          endpoint: 'createRoutine',
          payload: { name: 'Plan', pattern: [{ workoutId: 'local-workout' }] },
          localTable: 'routines',
          localId: 'local-routine',
        }),
        makeJob({
          id: 'update-routine',
          endpoint: 'updateRoutine',
          payload: ['local-routine', { name: 'Edited plan' }],
        }),
        makeJob({
          id: 'delete-routine',
          endpoint: 'deleteRoutine',
          payload: ['local-routine'],
        }),
        makeJob({
          id: 'record-workout',
          endpoint: 'recordWorkout',
          payload: { workoutId: 'local-workout', notes: 'Offline result' },
          localTable: 'workout_records',
          localId: 'local-record',
        }),
        makeJob({
          id: 'delete-record',
          endpoint: 'deleteWorkoutRecord',
          payload: ['local-record'],
        }),
        makeJob({
          id: 'independent',
          endpoint: 'deleteWorkout',
          payload: ['server-workout'],
        }),
      ],
    })
    const engine = engineWith(api)
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await engine.init(db, { processOnInit: false })
      await engine.processQueue()

      expect(api.createWorkout).toHaveBeenCalledTimes(1)
      expect(api.deleteWorkout).toHaveBeenCalledWith('server-workout', 'independent-key')
      expect(api.updateWorkout).not.toHaveBeenCalled()
      expect(api.createRoutine).not.toHaveBeenCalled()
      expect(api.updateRoutine).not.toHaveBeenCalled()
      expect(api.deleteRoutine).not.toHaveBeenCalled()
      expect(api.recordWorkout).not.toHaveBeenCalled()
      expect(api.deleteWorkoutRecord).not.toHaveBeenCalled()
      expect(db.getJob('independent')).toBeNull()
      expect(db.getJob('create-workout')).toMatchObject({
        status: 'dead_letter',
        error_message: '409: invalid workout',
      })

      const jobs = await engine.listJobs()
      for (const id of [
        'update-workout',
        'create-routine',
        'update-routine',
        'delete-routine',
        'record-workout',
        'delete-record',
      ]) {
        expect(jobs.find((job) => job.id === id)?.blocked_reason).toBeTruthy()
      }
      expect(db.tables.workouts.has('local-workout')).toBe(true)
      expect(db.tables.routines.has('local-routine')).toBe(true)
      expect(db.tables.workout_records.has('local-record')).toBe(true)
    } finally {
      engine.destroy()
      consoleError.mockRestore()
    }
  })

  it('keeps discarded failures as durable blockers and can retry the selected row', async () => {
    const api = createApi({
      createWorkout: jest.fn(async () => ({ id: 'server-workout', version: 0 })),
    })
    const db = new FakeDb({
      tables: { workouts: ['local-workout'] },
      jobs: [
        makeJob({
          id: 'failed-create',
          endpoint: 'createWorkout',
          payload: { title: 'Offline' },
          status: 'dead_letter',
          localTable: 'workouts',
          localId: 'local-workout',
        }),
        makeJob({
          id: 'dependent-update',
          endpoint: 'updateWorkout',
          payload: ['local-workout', { title: 'Edited' }],
        }),
      ],
    })
    const originalPayload = db.getJob('failed-create').payload
    const originalKey = db.getJob('failed-create').idempotency_key
    const engine = engineWith(api)
    try {
      await engine.init(db, { processOnInit: false })
      await engine.discardJob('failed-create')

      expect(db.getJob('failed-create')).toMatchObject({ status: 'discarded' })
      expect(db.getJob('dependent-update')).toMatchObject({ status: 'pending' })
      expect(db.tables.workouts.has('local-workout')).toBe(true)
      expect((await engine.listJobs()).find((job) => job.id === 'failed-create')).toBeUndefined()
      expect(
        (await engine.listJobs()).find((job) => job.id === 'dependent-update').blocked_reason
      ).toBeTruthy()
      expect(api.updateWorkout).not.toHaveBeenCalled()

      engine.setUploadsEnabled(false)
      await engine.retryJob('failed-create')
      expect(db.getJob('failed-create')).toMatchObject({
        status: 'pending',
        payload: originalPayload,
        idempotency_key: originalKey,
      })

      const completed = new Promise((resolve) => engine.on('sync:complete', resolve))
      engine.setUploadsEnabled(true)
      await completed

      expect(api.createWorkout).toHaveBeenCalledWith({ title: 'Offline' }, 'failed-create-key')
      expect(api.updateWorkout).toHaveBeenCalledWith(
        'server-workout',
        { title: 'Edited', baseVersion: 0 },
        'dependent-update-key'
      )
      expect(db.jobs).toEqual([])
    } finally {
      engine.destroy()
    }
  })

  it.each([
    [
      'a malformed create payload',
      () => {
        const blocker = makeJob({
          id: 'malformed-create',
          endpoint: 'createWorkout',
          payload: {},
          localTable: 'workouts',
          localId: 'local-workout',
        })
        blocker.payload = '{not json'
        return {
          api: createApi(),
          blocker,
          dependents: [
            makeJob({
              id: 'dependent-update',
              endpoint: 'updateWorkout',
              payload: ['local-workout', { title: 'Keep local' }],
            }),
          ],
          tables: { workouts: ['local-workout'] },
        }
      },
    ],
    [
      'an unknown endpoint',
      () => ({
        api: createApi(),
        blocker: makeJob({
          id: 'unknown-endpoint',
          endpoint: 'removedApiMethod',
          payload: { workoutId: 'referenced-workout' },
          localTable: 'workouts',
          localId: 'local-workout',
        }),
        dependents: [
          makeJob({
            id: 'dependent-update',
            endpoint: 'updateWorkout',
            payload: ['local-workout', { title: 'Keep local' }],
          }),
          makeJob({
            id: 'delete-referenced-workout',
            endpoint: 'deleteWorkout',
            payload: ['referenced-workout'],
          }),
        ],
        tables: { workouts: ['local-workout'] },
      }),
    ],
    [
      'a recognized update missing its payload ID',
      () => ({
        api: createApi({
          updateWorkout: jest.fn().mockRejectedValue(permanentError('missing workout id')),
        }),
        blocker: makeJob({
          id: 'partial-update',
          endpoint: 'updateWorkout',
          payload: [],
          localTable: 'workouts',
          localId: 'local-workout',
        }),
        dependents: [
          makeJob({
            id: 'delete-workout',
            endpoint: 'deleteWorkout',
            payload: ['local-workout'],
          }),
        ],
        tables: { workouts: ['local-workout'] },
      }),
    ],
    [
      'a partial workout record payload',
      () => ({
        api: createApi({
          recordWorkout: jest.fn().mockRejectedValue(permanentError('missing workout id')),
        }),
        blocker: makeJob({
          id: 'partial-record',
          endpoint: 'recordWorkout',
          payload: { notes: 'Keep local' },
          localTable: 'workout_records',
          localId: 'local-record',
        }),
        dependents: [
          makeJob({
            id: 'delete-record',
            endpoint: 'deleteWorkoutRecord',
            payload: ['local-record'],
          }),
        ],
        tables: { workout_records: ['local-record'] },
      }),
    ],
  ])(
    'discarding %s releases unrelated work but preserves known dependencies',
    async (_name, scenario) => {
      const { api, blocker, dependents, tables } = scenario()
      const independent = makeJob({
        id: 'independent',
        endpoint: 'deleteRoutine',
        payload: { id: 'server-routine', baseVersion: 0, profileBaseVersion: 0 },
      })
      const db = new FakeDb({ jobs: [blocker, ...dependents, independent], tables })
      const engine = engineWith(api)
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
      try {
        await engine.init(db, { processOnInit: false })
        await engine.processQueue()

        expect(db.getJob(blocker.id)).toMatchObject({ status: 'dead_letter' })
        expect(db.getJob('independent')).toMatchObject({ status: 'pending' })

        await engine.discardJob(blocker.id)
        const visibleJobs = await engine.listJobs()
        expect(visibleJobs.find((job) => job.id === 'independent')).not.toHaveProperty(
          'blocked_reason'
        )
        for (const dependent of dependents) {
          expect(visibleJobs.find((job) => job.id === dependent.id)?.blocked_reason).toBeTruthy()
        }

        await engine.processQueue()

        expect(api.deleteRoutine).toHaveBeenCalledWith(
          { id: 'server-routine', baseVersion: 0, profileBaseVersion: 0 },
          'independent-key'
        )
        expect(db.getJob('independent')).toBeNull()
        for (const dependent of dependents) {
          expect(db.getJob(dependent.id)).toMatchObject({ status: 'pending' })
        }
        for (const [table, ids] of Object.entries(tables)) {
          for (const id of ids) expect(db.tables[table].has(id)).toBe(true)
        }
      } finally {
        engine.destroy()
        consoleError.mockRestore()
      }
    }
  )

  it('remaps recoverable failed payloads before they are retried', async () => {
    const failedCreate = makeJob({
      id: 'failed-create',
      endpoint: 'createWorkout',
      payload: { title: 'Offline' },
      status: 'dead_letter',
      localTable: 'workouts',
      localId: 'local-workout',
    })
    const failedUpdate = makeJob({
      id: 'failed-update',
      endpoint: 'updateWorkout',
      payload: ['local-workout', { title: 'Edited' }],
      status: 'dead_letter',
      retryCount: 2,
    })
    failedUpdate.error_message = '409: rejected'
    const discardedUpdate = makeJob({
      id: 'discarded-update',
      endpoint: 'updateWorkout',
      payload: ['local-workout', { title: 'Discarded edit' }],
      status: 'discarded',
    })
    const db = new FakeDb({
      tables: { workouts: ['local-workout'] },
      jobs: [failedCreate, failedUpdate, discardedUpdate],
    })
    const api = createApi({
      createWorkout: jest.fn(async () => ({ id: 'server-workout', version: 0 })),
    })
    const engine = engineWith(api)
    try {
      await engine.init(db, { processOnInit: false })
      engine.setUploadsEnabled(false)

      await engine.retryJob('failed-create')
      expect(db.getJob('failed-create')).toMatchObject({
        status: 'pending',
        idempotency_key: 'failed-create-key',
      })

      const parentCompleted = new Promise((resolve) => engine.on('sync:complete', resolve))
      engine.setUploadsEnabled(true)
      await parentCompleted

      expect(db.getJob('failed-create')).toBeNull()
      expect(db.getJob('failed-update')).toMatchObject({
        status: 'dead_letter',
        payload: JSON.stringify(['server-workout', { title: 'Edited', baseVersion: 0 }]),
        idempotency_key: 'failed-update-key',
        retry_count: 2,
        error_message: '409: rejected',
        sequence: 2,
      })
      expect(db.getJob('discarded-update')).toMatchObject({
        status: 'discarded',
        payload: JSON.stringify(['server-workout', { title: 'Discarded edit' }]),
        idempotency_key: 'discarded-update-key',
      })

      engine.setUploadsEnabled(false)
      await engine.retryJob('failed-update')
      expect(db.getJob('failed-update')).toMatchObject({
        status: 'pending',
        payload: JSON.stringify(['server-workout', { title: 'Edited', baseVersion: 0 }]),
        idempotency_key: 'failed-update-key',
      })

      const childCompleted = new Promise((resolve) => engine.on('sync:complete', resolve))
      engine.setUploadsEnabled(true)
      await childCompleted

      expect(api.updateWorkout).toHaveBeenCalledWith(
        'server-workout',
        { title: 'Edited', baseVersion: 0 },
        'failed-update-key'
      )
      expect(db.getJob('failed-update')).toBeNull()
    } finally {
      engine.destroy()
    }
  })

  it('finds independent work beyond fifty blocked rows without spinning', async () => {
    const blocked = Array.from({ length: 55 }, (_, index) =>
      makeJob({
        id: `blocked-${index}`,
        endpoint: 'updateWorkout',
        payload: ['local-workout', { index }],
      })
    )
    const db = new FakeDb({
      jobs: [
        makeJob({
          id: 'legacy-dead-letter',
          endpoint: 'createWorkout',
          payload: { title: 'Rejected' },
          status: 'dead_letter',
          localTable: 'workouts',
          localId: 'local-workout',
        }),
        ...blocked,
        makeJob({ id: 'after-blocked', endpoint: 'deleteWorkout', payload: ['server-workout'] }),
      ],
    })
    const api = createApi()
    const engine = engineWith(api)
    try {
      await engine.init(db, { processOnInit: false })
      await engine.processQueue()

      expect(api.deleteWorkout).toHaveBeenCalledTimes(1)
      expect(api.deleteWorkout).toHaveBeenCalledWith('server-workout', 'after-blocked-key')
      expect(api.updateWorkout).not.toHaveBeenCalled()
      expect(db.getJob('after-blocked')).toBeNull()
      expect(db.jobs).toHaveLength(56)
      expect((await engine.listJobs()).filter((job) => job.blocked_reason)).toHaveLength(55)
    } finally {
      engine.destroy()
    }
  })

  it('blocks deletion of a server workout still referenced by earlier failed work', async () => {
    const db = new FakeDb({
      jobs: [
        makeJob({
          id: 'failed-record',
          endpoint: 'recordWorkout',
          payload: { workoutId: 'server-workout' },
          status: 'dead_letter',
          localTable: 'workout_records',
          localId: 'local-record',
        }),
        makeJob({
          id: 'delete-referenced-workout',
          endpoint: 'deleteWorkout',
          payload: ['server-workout'],
        }),
      ],
    })
    const api = createApi()
    const engine = engineWith(api)
    try {
      await engine.init(db, { processOnInit: false })
      await engine.processQueue()

      expect(api.deleteWorkout).not.toHaveBeenCalled()
      expect(
        (await engine.listJobs()).find((job) => job.id === 'delete-referenced-workout')
          .blocked_reason
      ).toBeTruthy()
    } finally {
      engine.destroy()
    }
  })

  it('does not upload a stale pending snapshot after that row is discarded', async () => {
    const db = new FakeDb({
      jobs: [makeJob({ id: 'discard-race', endpoint: 'deleteWorkout', payload: ['workout'] })],
    })
    const api = createApi()
    const engine = engineWith(api)
    await engine.init(db, { processOnInit: false })

    const claimWaiting = deferred()
    const releaseClaim = deferred()
    const withLock = engine.withIdRemapLock.bind(engine)
    let lockCalls = 0
    jest.spyOn(engine, 'withIdRemapLock').mockImplementation(async (operation) => {
      lockCalls += 1
      if (lockCalls === 1) {
        claimWaiting.resolve()
        await releaseClaim.promise
      }
      return withLock(operation)
    })

    try {
      const drain = engine.processQueue()
      await claimWaiting.promise
      await engine.discardJob('discard-race')
      expect(db.getJob('discard-race').status).toBe('discarded')
      releaseClaim.resolve()
      await drain

      expect(api.deleteWorkout).not.toHaveBeenCalled()
      expect(db.getJob('discard-race').status).toBe('discarded')
    } finally {
      releaseClaim.resolve()
      engine.destroy()
    }
  })

  it('does not let a stale retry action mutate either profile after an owner switch', async () => {
    setActiveProfileOwner('account:A')
    const dbA = new FakeDb({
      jobs: [
        makeJob({
          id: 'retry-A',
          endpoint: 'deleteWorkout',
          payload: ['A-workout'],
          status: 'dead_letter',
        }),
      ],
    })
    const dbB = new FakeDb({
      jobs: [makeJob({ id: 'pending-B', endpoint: 'deleteWorkout', payload: ['B-workout'] })],
    })
    const engine = engineWith(createApi())
    await engine.init(dbA, { processOnInit: false })

    const rowRead = deferred()
    const releaseRead = deferred()
    const getFirst = dbA.getFirstAsync.bind(dbA)
    dbA.getFirstAsync = jest.fn(async (sql, ...params) => {
      const row = await getFirst(sql, ...params)
      if (sql === 'SELECT * FROM sync_queue WHERE id = ?') {
        rowRead.resolve()
        await releaseRead.promise
      }
      return row
    })

    try {
      const retry = engine.retryJob('retry-A')
      await rowRead.promise
      setActiveProfileOwner('account:B')
      const reinit = engine.init(dbB, { processOnInit: false })
      releaseRead.resolve()

      await expect(retry).rejects.toThrow('Sync profile changed')
      await reinit
      expect(dbA.getJob('retry-A').status).toBe('dead_letter')
      expect(dbB.getJob('pending-B').status).toBe('pending')
    } finally {
      releaseRead.resolve()
      engine.destroy()
    }
  })

  it('does not publish an ID remap after the profile changes during acknowledgement commit', async () => {
    setActiveProfileOwner('account:A')
    const dbA = new FakeDb({
      jobs: [
        makeJob({
          id: 'create-A',
          endpoint: 'createWorkout',
          payload: { title: 'A workout' },
          localTable: 'workouts',
          localId: 'shared-local-id',
        }),
      ],
      tables: { workouts: ['shared-local-id'] },
    })
    const dbB = new FakeDb()
    const api = createApi({
      createWorkout: jest.fn(async () => ({ id: 'server-workout-A', version: 0 })),
    })
    const engine = engineWith(api)
    const acknowledgementCommitted = deferred()
    const releaseAcknowledgement = deferred()
    const withTransaction = dbA.withTransactionAsync.bind(dbA)
    let transactionCount = 0
    dbA.withTransactionAsync = async (operation) => {
      const result = await withTransaction(operation)
      transactionCount += 1
      if (transactionCount === 2) {
        acknowledgementCommitted.resolve()
        await releaseAcknowledgement.promise
      }
      return result
    }
    const remapListener = jest.fn()
    const queueChangeListener = jest.fn()
    engine.onIdRemap(remapListener)
    engine.on('sync:change', queueChangeListener)

    try {
      await engine.init(dbA, { processOnInit: false })
      queueChangeListener.mockClear()
      const drain = engine.processQueue()
      await acknowledgementCommitted.promise
      setActiveProfileOwner('account:B')
      releaseAcknowledgement.resolve()
      await drain

      expect(remapListener).not.toHaveBeenCalled()
      expect(queueChangeListener).toHaveBeenCalledTimes(1)
      await engine.init(dbB, { processOnInit: false })
      expect(engine.resolveId('workouts', 'shared-local-id')).toBe('shared-local-id')
      expect(dbB.idRemaps.size).toBe(0)
    } finally {
      releaseAcknowledgement.resolve()
      engine.destroy()
    }
  })
})
