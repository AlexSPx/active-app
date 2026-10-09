jest.mock('../../services/apiService', () => ({
  apiService: {},
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../../services/posthog', () => ({
  posthog: { capture: jest.fn() },
}))

const { createApi, makeJob, runQueue, FakeDb } = require('../helpers/syncTestUtils')

describe('SyncEngine queue remapping', () => {
  it.each(['sync:start', 'sync:complete', 'sync:idle', 'sync:error'])(
    'keeps queue processing and other subscribers intact when a %s listener throws',
    async (event) => {
      const { SyncEngine } = require('../../lib/sync/SyncEngine')
      const api = createApi()
      const engine = new SyncEngine({
        api,
        getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
        addAppStateListener: () => ({ remove() {} }),
      })
      const db = new FakeDb({
        jobs:
          event === 'sync:idle'
            ? []
            : [makeJob({ id: 'delete-job', endpoint: 'deleteWorkout', payload: ['workout_1'] })],
      })
      const listenerError = new Error('Subscriber failed')
      const databaseError = new Error('Database failed')
      const nextListener = jest.fn()
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
      try {
        await engine.init(db, { processOnInit: false })
        engine.on(event, () => {
          throw listenerError
        })
        engine.on(event, nextListener)
        if (event === 'sync:error') {
          jest.spyOn(db, 'getAllAsync').mockRejectedValueOnce(databaseError)
          await expect(engine.processQueue()).rejects.toBe(databaseError)
        } else {
          await engine.processQueue()
          expect(db.jobs).toHaveLength(0)
          expect(api.deleteWorkout).toHaveBeenCalledTimes(event === 'sync:idle' ? 0 : 1)
        }
        expect(nextListener).toHaveBeenCalledTimes(1)
        expect(consoleError).toHaveBeenCalledWith(
          `[SyncEngine] ${event} listener failed:`,
          listenerError
        )
      } finally {
        engine.destroy()
        consoleError.mockRestore()
      }
    }
  )

  it('persists local jobs while uploads are disabled and drains them after validation', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const api = createApi()
    const engine = new SyncEngine({
      api,
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })
    const db = new FakeDb()
    engine.setUploadsEnabled(false)

    const initialization = engine.init(db, { processOnInit: false })
    await engine.enqueue({ apiMethod: 'createWorkout', payload: { title: 'Offline' } })
    await initialization

    expect(db.jobs).toHaveLength(1)
    expect(api.createWorkout).not.toHaveBeenCalled()

    const drained = new Promise((resolve) => engine.on('sync:complete', resolve))
    engine.setUploadsEnabled(true)
    await drained

    expect(db.jobs).toHaveLength(0)
    expect(api.createWorkout).toHaveBeenCalledTimes(1)
    engine.destroy()
  })

  it('serializes record saves behind an in-flight ID remap', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const engine = new SyncEngine({
      api: createApi(),
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })
    const order = []
    let releaseRemap
    const remapGate = new Promise((resolve) => {
      releaseRemap = resolve
    })

    const remap = engine.withIdRemapLock(async () => {
      order.push('remap-start')
      await remapGate
      order.push('remap-end')
    })
    await Promise.resolve()
    const save = engine.withIdRemapLock(async () => order.push('record-save'))
    await Promise.resolve()

    expect(order).toEqual(['remap-start'])
    releaseRemap()
    await Promise.all([remap, save])
    expect(order).toEqual(['remap-start', 'remap-end', 'record-save'])
  })

  it('keeps web queue writes outside a mutation transaction held under the remap lock', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const api = createApi({ deleteWorkout: jest.fn(async () => undefined) })
    const engine = new SyncEngine({
      api,
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })
    const db = new FakeDb({
      jobs: [makeJob({ id: 'queued-delete', endpoint: 'deleteWorkout', payload: ['workout_1'] })],
    })
    await engine.init(db, { processOnInit: false })

    let transactionStarted
    const transactionOpen = new Promise((resolve) => {
      transactionStarted = resolve
    })
    let releaseTransaction
    const transactionGate = new Promise((resolve) => {
      releaseTransaction = resolve
    })
    let queueLockRequestedResolve
    const queueLockRequested = new Promise((resolve) => {
      queueLockRequestedResolve = resolve
    })
    let queueWriteAttemptedResolve
    const queueWriteAttempted = new Promise((resolve) => {
      queueWriteAttemptedResolve = resolve
    })

    let lockCalls = 0
    const withIdRemapLock = engine.withIdRemapLock.bind(engine)
    jest.spyOn(engine, 'withIdRemapLock').mockImplementation((operation) => {
      lockCalls += 1
      if (lockCalls === 2) queueLockRequestedResolve()
      return withIdRemapLock(operation)
    })

    const runAsync = db.runAsync.bind(db)
    db.runAsync = async (sql, ...params) => {
      if (sql === 'UPDATE sync_queue SET status = ? WHERE id = ?') {
        db.recordTransactionEvent('queue-status-write', { status: params[0] })
        if (params[0] === 'processing') queueWriteAttemptedResolve()
      }
      return runAsync(sql, ...params)
    }

    const mutation = engine.withIdRemapLock(() =>
      db.withTransactionAsync(async () => {
        transactionStarted()
        await transactionGate
      })
    )
    await transactionOpen

    const processing = engine.processQueue()
    const stateWhileLocked = await Promise.race([
      queueLockRequested.then(() => 'waiting-for-lock'),
      queueWriteAttempted.then(() => 'queue-write'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 1000)),
    ])
    const statusWhileLocked = db.getJob('queued-delete').status
    const apiCallsWhileLocked = api.deleteWorkout.mock.calls.length
    const eventsWhileLocked = db.transactionEvents.map(({ type }) => type)

    releaseTransaction()
    await Promise.all([mutation, processing])

    expect(stateWhileLocked).toBe('waiting-for-lock')
    expect(statusWhileLocked).toBe('pending')
    expect(apiCallsWhileLocked).toBe(0)
    expect(eventsWhileLocked).toEqual(['begin'])
    expect(api.deleteWorkout).toHaveBeenCalledWith('workout_1')
    expect(db.transactionEvents.map(({ type }) => type)).toEqual([
      'begin',
      'commit',
      'queue-status-write',
    ])
    expect(db.transactionEvents[2]).toMatchObject({
      inTransaction: false,
      status: 'processing',
    })
    expect(db.getJob('queued-delete')).toBeNull()
    engine.destroy()
  })

  it('updates an active session when its workout receives a server id', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const {
      useRunningWorkoutStore,
      remapRunningWorkoutId,
    } = require('../../features/workout-session/stores/runningWorkoutStore')
    const { queryClient } = require('../../lib/queryClient')
    const { queryKeys } = require('../../lib/queryKeys')
    const ownerKeys = queryKeys.forOwner('local:device')
    const { replaceQueuedIdReferences } = require('../../lib/sync/queuePayloadRemap')
    const oldId = 'local_workout_active'

    useRunningWorkoutStore.setState({
      runningWorkout: {
        id: oldId,
        name: 'Workout',
        startTime: '2026-09-26T10:00:00.000Z',
        exercises: [],
        currentExerciseIndex: 0,
        completedExercises: 0,
      },
    })
    queryClient.setQueryData(ownerKeys.workouts.list(), [
      { id: oldId, workoutTemplate: { id: oldId, exercises: [] } },
    ])

    const engine = new SyncEngine({
      api: createApi({ createWorkout: jest.fn(async () => ({ id: 'server_workout_active' })) }),
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })
    engine.onIdRemap((tableName, from, to) => {
      if (tableName !== 'workouts') return

      remapRunningWorkoutId(from, to)
      queryClient.setQueriesData(
        { queryKey: ownerKeys.workouts.all },
        (data) => replaceQueuedIdReferences(data, from, to).value
      )
    })
    const db = new FakeDb({
      tables: { workouts: [oldId], routines: ['routine_active'] },
      jobs: [
        makeJob({
          id: 'job-create-active-workout',
          endpoint: 'createWorkout',
          payload: { title: 'Workout', template: { exercises: [] } },
          localTable: 'workouts',
          localId: oldId,
        }),
      ],
    })
    db.tables.workouts.get(oldId).workout_template = JSON.stringify({ id: oldId, exercises: [] })
    db.tables.routines.get('routine_active').pattern = JSON.stringify([
      { dayIndex: 1, dayType: 'WORKOUT', workoutId: oldId },
    ])

    await engine.init(db, { processOnInit: false })
    await engine.processQueue()

    expect(engine.resolveId('workouts', oldId)).toBe('server_workout_active')
    expect(useRunningWorkoutStore.getState().runningWorkout.id).toBe('server_workout_active')
    expect(queryClient.getQueryData(ownerKeys.workouts.list())[0]).toMatchObject({
      id: 'server_workout_active',
      workoutTemplate: { id: 'server_workout_active' },
    })
    expect(JSON.parse(db.tables.workouts.get('server_workout_active').workout_template)).toEqual({
      id: 'server_workout_active',
      exercises: [],
    })
    expect(JSON.parse(db.tables.routines.get('routine_active').pattern)[0].workoutId).toBe(
      'server_workout_active'
    )
    engine.destroy()
    useRunningWorkoutStore.setState({ runningWorkout: null })
    queryClient.removeQueries({ queryKey: ownerKeys.workouts.all })
  })

  it('rewrites queued workout updates after an offline workout create', async () => {
    const api = createApi({
      createWorkout: jest.fn(async () => ({ id: 'server_workout_1' })),
    })

    await runQueue({
      api,
      tables: { workouts: ['local_workout_1'] },
      jobs: [
        makeJob({
          id: 'job-create-workout',
          endpoint: 'createWorkout',
          payload: { title: 'Leg Day', template: { exercises: [] } },
          localTable: 'workouts',
          localId: 'local_workout_1',
        }),
        makeJob({
          id: 'job-update-workout',
          endpoint: 'updateWorkout',
          payload: ['local_workout_1', { title: 'Heavy Leg Day' }],
        }),
      ],
    })

    expect(api.createWorkout.mock.invocationCallOrder[0]).toBeLessThan(
      api.updateWorkout.mock.invocationCallOrder[0]
    )
    expect(api.updateWorkout).toHaveBeenCalledWith('server_workout_1', {
      title: 'Heavy Leg Day',
    })
  })

  it('restores workout ID aliases from SQLite after a process restart', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const db = new FakeDb({
      tables: { workouts: ['local_workout_restart'] },
      jobs: [
        makeJob({
          id: 'job-create-workout-restart',
          endpoint: 'createWorkout',
          payload: { title: 'Restart', template: { exercises: [] } },
          localTable: 'workouts',
          localId: 'local_workout_restart',
        }),
      ],
    })
    const deps = {
      api: createApi({ createWorkout: jest.fn(async () => ({ id: 'server_workout_restart' })) }),
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    }
    const firstProcess = new SyncEngine(deps)
    await firstProcess.init(db, { processOnInit: false })
    await firstProcess.processQueue()

    const nextProcess = new SyncEngine(deps)
    const replayedRemaps = []
    nextProcess.onIdRemap((table, oldId, newId) => replayedRemaps.push([table, oldId, newId]))
    await nextProcess.init(db, { processOnInit: false })

    expect(nextProcess.resolveId('workouts', 'local_workout_restart')).toBe(
      'server_workout_restart'
    )
    expect(replayedRemaps).toContainEqual([
      'workouts',
      'local_workout_restart',
      'server_workout_restart',
    ])
    firstProcess.destroy()
    nextProcess.destroy()
  })

  it('remaps existing history references before foreign key checks resume', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const oldId = 'local_workout_with_history'
    const db = new FakeDb({
      enforceForeignKeys: true,
      tables: { workouts: [oldId] },
      jobs: [
        makeJob({
          id: 'job-create-workout-with-history',
          endpoint: 'createWorkout',
          payload: { title: 'History', template: { exercises: [] } },
          localTable: 'workouts',
          localId: oldId,
        }),
      ],
    })
    db.tables.workout_records.set('record_existing', {
      id: 'record_existing',
      workout_id: oldId,
      workout_title: 'History',
    })
    const engine = new SyncEngine({
      api: createApi({
        createWorkout: jest.fn(async () => ({ id: 'server_workout_with_history' })),
      }),
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })

    await engine.init(db, { processOnInit: false })
    await engine.processQueue()

    expect(db.tables.workout_records.get('record_existing').workout_id).toBe(
      'server_workout_with_history'
    )
    await expect(
      db.runAsync(
        'INSERT INTO workout_records (id, workout_id, workout_title, notes, created_at, start_time, exercise_records, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'record_stale',
        oldId,
        'History',
        null,
        '2026-09-27T10:00:00Z',
        null,
        '[]',
        0
      )
    ).rejects.toThrow('FOREIGN KEY constraint failed')
    engine.destroy()
  })

  it('merges a local workout when hydration already inserted its server row', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const oldId = 'local_workout_hydration_race'
    const serverId = 'server_workout_hydration_race'
    const db = new FakeDb({
      enforceForeignKeys: true,
      tables: { workouts: [oldId, serverId] },
      jobs: [
        makeJob({
          id: 'job-create-workout-hydration-race',
          endpoint: 'createWorkout',
          payload: { title: 'Raced import', template: { exercises: [] } },
          localTable: 'workouts',
          localId: oldId,
        }),
      ],
    })
    db.tables.workout_records.set('record_hydration_race', {
      id: 'record_hydration_race',
      workout_id: oldId,
      workout_title: 'Raced import',
    })
    const engine = new SyncEngine({
      api: createApi({ createWorkout: jest.fn(async () => ({ id: serverId })) }),
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })

    await engine.init(db, { processOnInit: false })
    await engine.processQueue()

    expect(db.tables.workouts.has(oldId)).toBe(false)
    expect(db.tables.workouts.has(serverId)).toBe(true)
    expect(db.tables.workout_records.get('record_hydration_race').workout_id).toBe(serverId)
    engine.destroy()
  })

  it('rewrites queued workout records after an offline workout create', async () => {
    const api = createApi({
      createWorkout: jest.fn(async () => ({ id: 'server_workout_2' })),
    })

    await runQueue({
      api,
      tables: { workouts: ['local_workout_2'] },
      jobs: [
        makeJob({
          id: 'job-create-workout',
          endpoint: 'createWorkout',
          payload: { title: 'Push', template: { exercises: [] } },
          localTable: 'workouts',
          localId: 'local_workout_2',
        }),
        makeJob({
          id: 'job-record-workout',
          endpoint: 'recordWorkout',
          payload: {
            workoutId: 'local_workout_2',
            exerciseRecords: [],
            startTime: '2026-04-24T10:00:00',
          },
          localTable: 'workout_records',
          localId: 'local_record_2',
        }),
      ],
    })

    expect(api.recordWorkout).toHaveBeenCalledWith({
      workoutId: 'server_workout_2',
      exerciseRecords: [],
      startTime: '2026-04-24T10:00:00',
    })
  })

  it('rewrites queued workout-record deletes after an offline record sync', async () => {
    const api = createApi({
      recordWorkout: jest.fn(async () => ({ workoutRecord: { id: 'server_record_3' } })),
    })

    await runQueue({
      api,
      tables: { workout_records: ['local_record_3'] },
      jobs: [
        makeJob({
          id: 'job-record-workout',
          endpoint: 'recordWorkout',
          payload: {
            workoutId: 'server_workout_3',
            exerciseRecords: [],
            startTime: '2026-04-24T11:00:00',
          },
          localTable: 'workout_records',
          localId: 'local_record_3',
        }),
        makeJob({
          id: 'job-delete-record',
          endpoint: 'deleteWorkoutRecord',
          payload: ['local_record_3'],
        }),
      ],
    })

    expect(api.deleteWorkoutRecord).toHaveBeenCalledWith('server_record_3')
  })

  it('rewrites queued routine updates after an offline routine create', async () => {
    const api = createApi({
      createRoutine: jest.fn(async () => ({ id: 'server_routine_1' })),
    })

    await runQueue({
      api,
      tables: { routines: ['local_routine_1'] },
      jobs: [
        makeJob({
          id: 'job-create-routine',
          endpoint: 'createRoutine',
          payload: {
            name: 'Week A',
            pattern: [{ dayIndex: 0, dayType: 'REST', workoutId: null }],
          },
          localTable: 'routines',
          localId: 'local_routine_1',
        }),
        makeJob({
          id: 'job-update-routine',
          endpoint: 'updateRoutine',
          payload: [
            'local_routine_1',
            {
              name: 'Week A Updated',
            },
          ],
        }),
      ],
    })

    expect(api.updateRoutine).toHaveBeenCalledWith('server_routine_1', {
      name: 'Week A Updated',
    })
  })

  it('rewrites nested workout ids inside queued routine payloads', async () => {
    const api = createApi({
      createWorkout: jest.fn(async () => ({ id: 'server_workout_nested' })),
    })

    await runQueue({
      api,
      tables: { workouts: ['local_workout_nested'] },
      jobs: [
        makeJob({
          id: 'job-create-workout',
          endpoint: 'createWorkout',
          payload: { title: 'Pull', template: { exercises: [] } },
          localTable: 'workouts',
          localId: 'local_workout_nested',
        }),
        makeJob({
          id: 'job-update-routine',
          endpoint: 'updateRoutine',
          payload: [
            'server_routine_nested',
            {
              pattern: [
                {
                  dayIndex: 1,
                  dayType: 'WORKOUT',
                  workoutId: 'local_workout_nested',
                },
              ],
            },
          ],
        }),
      ],
    })

    expect(api.updateRoutine).toHaveBeenCalledWith('server_routine_nested', {
      pattern: [
        {
          dayIndex: 1,
          dayType: 'WORKOUT',
          workoutId: 'server_workout_nested',
        },
      ],
    })
  })
})

describe('SyncEngine failure handling', () => {
  it('marks retryable failures as failed and stops processing later jobs', async () => {
    const transientError = new Error('network timeout')
    const api = createApi({
      updateWorkout: jest.fn(async () => {
        throw transientError
      }),
    })

    const { db, engine } = await runQueue({
      api,
      jobs: [
        makeJob({
          id: 'job-update-workout-retry',
          endpoint: 'updateWorkout',
          payload: ['server_workout_retry', { title: 'Retry Me' }],
        }),
        makeJob({
          id: 'job-delete-workout-skipped',
          endpoint: 'deleteWorkout',
          payload: ['server_workout_skipped'],
        }),
      ],
    })

    expect(api.updateWorkout).toHaveBeenCalledTimes(1)
    expect(api.deleteWorkout).not.toHaveBeenCalled()
    expect(db.getJob('job-update-workout-retry')).toMatchObject({
      status: 'failed',
      retry_count: 1,
      error_message: 'network timeout',
    })
    expect(db.getJob('job-delete-workout-skipped')).toMatchObject({
      status: 'pending',
    })
    engine.destroy()
  })

  it('dead-letters permanent 4xx failures and continues processing', async () => {
    const permanentError = new Error('duplicate name')
    permanentError.status = 409

    const api = createApi({
      updateRoutine: jest.fn(async () => {
        throw permanentError
      }),
    })

    const { db } = await runQueue({
      api,
      jobs: [
        makeJob({
          id: 'job-update-routine-dead-letter',
          endpoint: 'updateRoutine',
          payload: ['server_routine_dead', { name: 'Duplicate' }],
        }),
        makeJob({
          id: 'job-delete-workout-continues',
          endpoint: 'deleteWorkout',
          payload: ['server_workout_continues'],
        }),
      ],
    })

    expect(api.updateRoutine).toHaveBeenCalledTimes(1)
    expect(api.deleteWorkout).toHaveBeenCalledWith('server_workout_continues')
    expect(db.getJob('job-update-routine-dead-letter')).toMatchObject({
      status: 'dead_letter',
      retry_count: 1,
      error_message: '409: duplicate name',
    })
    expect(db.getJob('job-delete-workout-continues')).toBeNull()
  })

  it('dead-letters malformed queue payloads and continues to later jobs', async () => {
    const api = createApi()
    const malformedJob = makeJob({
      id: 'job-malformed-payload',
      endpoint: 'updateWorkout',
      payload: ['server_workout', { title: 'Broken' }],
    })
    malformedJob.payload = '{not json'

    const { db, engine } = await runQueue({
      api,
      jobs: [
        malformedJob,
        makeJob({
          id: 'job-after-malformed-payload',
          endpoint: 'deleteWorkout',
          payload: ['server_workout'],
        }),
      ],
    })

    expect(api.updateWorkout).not.toHaveBeenCalled()
    expect(api.deleteWorkout).toHaveBeenCalledWith('server_workout')
    expect(db.getJob('job-malformed-payload')).toMatchObject({
      status: 'dead_letter',
      error_message: expect.stringContaining('Invalid queued payload'),
    })
    expect(db.getJob('job-after-malformed-payload')).toBeNull()
    engine.destroy()
  })

  it('retries transient failures beyond five attempts with a delayed retry', async () => {
    jest.useFakeTimers()
    jest.spyOn(Math, 'random').mockReturnValue(0)
    let failuresRemaining = 7
    const api = createApi({
      updateWorkout: jest.fn(async () => {
        if (failuresRemaining-- > 0) throw new Error('network timeout')
      }),
    })
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const db = new FakeDb({
      jobs: [
        makeJob({
          id: 'job-update-workout-many-retries',
          endpoint: 'updateWorkout',
          payload: ['server_workout_retry', { title: 'Retry Me' }],
        }),
      ],
    })
    const engine = new SyncEngine({
      api,
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
      addNetworkStateListener: () => ({ remove() {} }),
    })

    try {
      await engine.init(db, { processOnInit: false })
      await engine.processQueue()

      expect(api.updateWorkout).toHaveBeenCalledTimes(1)
      expect(db.getJob('job-update-workout-many-retries')).toMatchObject({
        status: 'failed',
        retry_count: 1,
      })
      expect(jest.getTimerCount()).toBe(1)

      await jest.advanceTimersByTimeAsync(1999)
      expect(api.updateWorkout).toHaveBeenCalledTimes(1)
      await jest.advanceTimersByTimeAsync(1)
      expect(api.updateWorkout).toHaveBeenCalledTimes(2)
      expect(db.getJob('job-update-workout-many-retries')).toMatchObject({
        id: 'job-update-workout-many-retries',
        payload: JSON.stringify(['server_workout_retry', { title: 'Retry Me' }]),
        idempotency_key: 'job-update-workout-many-retries-key',
        status: 'failed',
        retry_count: 2,
      })

      while (api.updateWorkout.mock.calls.length < 8) {
        const previousAttempts = api.updateWorkout.mock.calls.length
        await jest.runOnlyPendingTimersAsync()
        expect(api.updateWorkout).toHaveBeenCalledTimes(previousAttempts + 1)
        if (api.updateWorkout.mock.calls.length === 6) {
          expect(db.getJob('job-update-workout-many-retries')).toMatchObject({
            id: 'job-update-workout-many-retries',
            idempotency_key: 'job-update-workout-many-retries-key',
            status: 'failed',
            retry_count: 6,
          })
        }
      }

      expect(db.getJob('job-update-workout-many-retries')).toBeNull()
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      engine.destroy()
      jest.useRealTimers()
      jest.restoreAllMocks()
    }
  })

  it('drains a failed job when network connectivity is restored', async () => {
    jest.useFakeTimers()
    const networkRemove = jest.fn()
    let networkListener
    let networkState = { isConnected: true, isInternetReachable: true }
    let failuresRemaining = 1
    const api = createApi({
      updateWorkout: jest.fn(async () => {
        if (failuresRemaining-- > 0) throw new Error('temporary backend error')
      }),
    })
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const db = new FakeDb({
      jobs: [
        makeJob({
          id: 'job-update-workout-network-restore',
          endpoint: 'updateWorkout',
          payload: ['server_workout_retry', { title: 'Retry Me' }],
        }),
      ],
    })
    const engine = new SyncEngine({
      api,
      getNetworkState: async () => networkState,
      addAppStateListener: () => ({ remove() {} }),
      addNetworkStateListener: (handler) => {
        networkListener = handler
        return { remove: networkRemove }
      },
    })

    try {
      await engine.init(db, { processOnInit: false })
      await engine.processQueue()
      expect(api.updateWorkout).toHaveBeenCalledTimes(1)
      expect(jest.getTimerCount()).toBe(1)

      const retryDrained = new Promise((resolve) => engine.on('sync:complete', resolve))
      networkState = { isConnected: true, isInternetReachable: false }
      networkListener(networkState)
      expect(api.updateWorkout).toHaveBeenCalledTimes(1)
      networkState = { isConnected: true, isInternetReachable: true }
      networkListener(networkState)
      await retryDrained

      expect(api.updateWorkout).toHaveBeenCalledTimes(2)
      expect(db.getJob('job-update-workout-network-restore')).toBeNull()
      expect(jest.getTimerCount()).toBe(0)
      engine.destroy()
      expect(networkRemove).toHaveBeenCalledTimes(1)
    } finally {
      engine.destroy()
      jest.useRealTimers()
    }
  })

  it('probes the API when connectivity is unknown', async () => {
    const api = createApi()
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const db = new FakeDb({
      jobs: [
        makeJob({
          id: 'job-update-workout-unknown-network',
          endpoint: 'updateWorkout',
          payload: ['server_workout_unknown', { title: 'Probe' }],
        }),
      ],
    })
    const engine = new SyncEngine({
      api,
      getNetworkState: async () => ({ isConnected: null, isInternetReachable: undefined }),
      addAppStateListener: () => ({ remove() {} }),
      addNetworkStateListener: () => ({ remove() {} }),
    })

    try {
      await engine.init(db, { processOnInit: false })
      await engine.processQueue()

      expect(api.updateWorkout).toHaveBeenCalledTimes(1)
      expect(db.getJob('job-update-workout-unknown-network')).toBeNull()
    } finally {
      engine.destroy()
    }
  })

  it('clears retry timers and connectivity listeners on reinit and destroy', async () => {
    jest.useFakeTimers()
    const networkRemove = jest.fn()
    const appStateRemove = jest.fn()
    let networkListener
    const api = createApi({
      updateWorkout: jest.fn(async () => {
        throw new Error('network timeout')
      }),
    })
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const db = new FakeDb({
      jobs: [
        makeJob({
          id: 'job-update-workout-destroy',
          endpoint: 'updateWorkout',
          payload: ['server_workout_retry', { title: 'Retry Me' }],
        }),
      ],
    })
    const engine = new SyncEngine({
      api,
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove: appStateRemove }),
      addNetworkStateListener: (handler) => {
        networkListener = handler
        return { remove: networkRemove }
      },
    })

    try {
      await engine.init(db, { processOnInit: false })
      await engine.processQueue()
      expect(jest.getTimerCount()).toBe(1)

      const staleNetworkListener = networkListener
      await engine.init(db, { processOnInit: false })
      expect(jest.getTimerCount()).toBe(0)
      expect(networkRemove).toHaveBeenCalledTimes(1)
      expect(appStateRemove).toHaveBeenCalledTimes(1)
      staleNetworkListener({ isConnected: true, isInternetReachable: true })
      await Promise.resolve()
      expect(api.updateWorkout).toHaveBeenCalledTimes(1)

      engine.destroy()
      expect(jest.getTimerCount()).toBe(0)
      expect(networkRemove).toHaveBeenCalledTimes(2)
      expect(appStateRemove).toHaveBeenCalledTimes(2)
      networkListener({ isConnected: true, isInternetReachable: true })
      await Promise.resolve()
      expect(api.updateWorkout).toHaveBeenCalledTimes(1)
    } finally {
      engine.destroy()
      jest.useRealTimers()
    }
  })

  it('keeps no retry timer for an empty queue or a disabled upload queue', async () => {
    jest.useFakeTimers()
    const api = createApi({
      updateWorkout: jest.fn(async () => {
        throw new Error('network timeout')
      }),
    })
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const db = new FakeDb()
    const engine = new SyncEngine({
      api,
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
      addNetworkStateListener: () => ({ remove() {} }),
    })

    try {
      await engine.init(db, { processOnInit: false })
      await engine.processQueue()
      expect(jest.getTimerCount()).toBe(0)

      db.jobs.push(
        makeJob({
          id: 'job-disabled-retry',
          endpoint: 'updateWorkout',
          payload: ['server_workout', { title: 'Retry Me' }],
        })
      )
      await engine.processQueue()
      expect(jest.getTimerCount()).toBe(1)

      engine.setUploadsEnabled(false)
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      engine.destroy()
      jest.useRealTimers()
    }
  })
})
