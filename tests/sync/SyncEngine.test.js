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
  it('retries a lost response with the same frozen route, body, and operation key', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const api = createApi({
      updateWorkout: jest
        .fn()
        .mockRejectedValueOnce(new Error('response lost'))
        .mockResolvedValue({ id: 'local-workout', version: 1 }),
    })
    const db = new FakeDb({
      jobs: [
        makeJob({
          id: 'lost-response',
          endpoint: 'updateWorkout',
          payload: ['local-workout', { title: 'Frozen title' }],
        }),
      ],
    })
    const engine = new SyncEngine({
      api,
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })

    await engine.init(db, { processOnInit: false })
    await engine.processQueue()
    expect(db.getJob('lost-response').request_payload).toBe(
      JSON.stringify(['local-workout', { title: 'Frozen title' }])
    )

    db.getJob('lost-response').payload = JSON.stringify([
      'server-workout',
      { title: 'Changed title' },
    ])
    db.getJob('lost-response').next_attempt_at = 0
    await engine.init(db, { processOnInit: false })
    await engine.processQueue()

    expect(api.updateWorkout.mock.calls).toEqual([
      ['local-workout', { title: 'Frozen title' }, 'lost-response-key'],
      ['local-workout', { title: 'Frozen title' }, 'lost-response-key'],
    ])
    expect(db.getJob('lost-response')).toBeNull()
    engine.destroy()
  })

  it('remaps only unattempted jobs and keeps a frozen request discardable after 409', async () => {
    const conflict = Object.assign(new Error('request changed'), {
      status: 409,
      code: 'STALE_VERSION',
    })
    const api = createApi({
      createWorkout: jest.fn(async () => ({ id: 'server-workout', version: 0 })),
      updateWorkout: jest.fn(async () => {
        throw conflict
      }),
    })
    const frozenArgs = ['local-workout', { title: 'Already attempted' }]
    const { db, engine } = await runQueue({
      api,
      tables: { workouts: ['local-workout'] },
      jobs: [
        makeJob({
          id: 'create-workout',
          endpoint: 'createWorkout',
          payload: { title: 'Offline' },
          localTable: 'workouts',
          localId: 'local-workout',
        }),
        makeJob({
          id: 'attempted-update',
          endpoint: 'updateWorkout',
          payload: frozenArgs,
          requestPayload: frozenArgs,
        }),
      ],
    })

    expect(api.updateWorkout).toHaveBeenCalledWith(
      'local-workout',
      { title: 'Already attempted' },
      'attempted-update-key'
    )
    expect(db.getJob('attempted-update')).toMatchObject({
      status: 'dead_letter',
      error_code: 'STALE_VERSION',
      payload: JSON.stringify(frozenArgs),
      request_payload: JSON.stringify(frozenArgs),
    })
    await engine.discardJob('attempted-update')
    expect(db.getJob('attempted-update').status).toBe('discarded')
    engine.destroy()
  })

  it('rolls back the canonical row, alias, and acknowledgement on a local write error', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const db = new FakeDb({
      tables: { workout_records: ['local-record'] },
      jobs: [
        makeJob({
          id: 'atomic-record',
          endpoint: 'recordWorkout',
          payload: { workoutId: 'server-workout', exerciseRecords: [] },
          localTable: 'workout_records',
          localId: 'local-record',
        }),
      ],
    })
    Object.assign(db.tables.workout_records.get('local-record'), {
      workout_title: 'Local title',
      exercise_records: '[]',
    })
    const runAsync = db.runAsync.bind(db)
    db.runAsync = async (sql, ...params) => {
      if (sql === 'DELETE FROM sync_queue WHERE id = ?') throw new Error('ack failed')
      return runAsync(sql, ...params)
    }
    const api = createApi({
      recordWorkout: jest.fn(async () => ({
        workoutRecord: {
          id: 'server-record',
          workoutId: 'server-workout',
          workoutTitle: 'Server title',
          notes: null,
          createdAt: '2026-10-11T10:00:00Z',
          exerciseRecords: [{ exerciseName: 'Row', achievedOneRmValue: 120 }],
        },
        streakUpdate: { currentStreak: 2 },
      })),
    })
    const engine = new SyncEngine({
      api,
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })
    const remaps = []
    const queueChanges = jest.fn()
    engine.onIdRemap((...args) => remaps.push(args))
    engine.on('sync:change', queueChanges)

    await engine.init(db, { processOnInit: false })
    queueChanges.mockClear()
    await expect(engine.processQueue()).rejects.toThrow('ack failed')

    expect(db.tables.workout_records.has('local-record')).toBe(true)
    expect(db.tables.workout_records.has('server-record')).toBe(false)
    expect(db.tables.workout_records.get('local-record')).toMatchObject({
      workout_title: 'Local title',
      exercise_records: '[]',
    })
    expect(db.idRemaps.size).toBe(0)
    expect(db.getJob('atomic-record')).toMatchObject({
      status: 'processing',
      request_payload: JSON.stringify({ workoutId: 'server-workout', exerciseRecords: [] }),
    })
    expect(remaps).toEqual([])
    expect(queueChanges).toHaveBeenCalledTimes(1)

    db.runAsync = runAsync
    await engine.init(db, { processOnInit: false })
    await engine.processQueue()

    expect(api.recordWorkout.mock.calls).toEqual([
      [{ workoutId: 'server-workout', exerciseRecords: [] }, 'atomic-record-key'],
      [{ workoutId: 'server-workout', exerciseRecords: [] }, 'atomic-record-key'],
    ])
    expect(db.getJob('atomic-record')).toBeNull()
    expect(db.tables.workout_records.has('local-record')).toBe(false)
    expect(db.tables.workout_records.get('server-record')).toMatchObject({
      workout_title: 'Server title',
      is_synced: 1,
    })
    expect(db.idRemaps.get('workout_records:local-record')).toMatchObject({
      new_id: 'server-record',
    })
    expect(remaps).toEqual([['workout_records', 'local-record', 'server-record']])
    engine.destroy()
  })

  it('notifies queue subscribers after a successful acknowledgement', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const db = new FakeDb({
      jobs: [makeJob({ id: 'acknowledged', endpoint: 'deleteWorkout', payload: ['workout'] })],
    })
    const engine = new SyncEngine({
      api: createApi(),
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })
    const snapshots = []

    await engine.init(db, { processOnInit: false })
    engine.on('sync:change', () => snapshots.push(engine.listJobs()))
    await engine.processQueue()

    expect(await Promise.all(snapshots)).toEqual([
      [expect.objectContaining({ id: 'acknowledged', status: 'processing' })],
      [],
    ])
    engine.destroy()
  })

  it('commits canonical server record data and preserves a hydrated tombstone', async () => {
    const api = createApi({
      recordWorkout: jest.fn(async () => ({
        workoutRecord: {
          id: 'server-record',
          workoutId: 'server-workout',
          workoutTitle: 'Server title',
          notes: 'Authoritative',
          createdAt: '2026-10-11T10:00:00Z',
          startTime: '2026-10-11T09:00:00',
          exerciseRecords: [{ exerciseName: 'Row', achievedOneRmValue: 120 }],
        },
        streakUpdate: { currentStreak: 2 },
      })),
    })
    const { db, engine } = await runQueue({
      api,
      tables: { workout_records: ['local-record', 'server-record'] },
      configureDb: (db) => {
        db.tables.workout_records.get('local-record').is_deleted = 1
      },
      jobs: [
        makeJob({
          id: 'record-job',
          endpoint: 'recordWorkout',
          payload: { workoutId: 'server-workout', exerciseRecords: [] },
          localTable: 'workout_records',
          localId: 'local-record',
        }),
      ],
    })

    expect(db.tables.workout_records.has('local-record')).toBe(false)
    expect(db.tables.workout_records.get('server-record')).toMatchObject({
      workout_id: 'server-workout',
      workout_title: 'Server title',
      notes: 'Authoritative',
      is_deleted: 1,
    })
    expect(JSON.parse(db.tables.workout_records.get('server-record').exercise_records)).toEqual([
      { exerciseName: 'Row', achievedOneRmValue: 120 },
    ])
    expect(db.idRemaps.get('workout_records:local-record')).toMatchObject({
      new_id: 'server-record',
    })
    expect(db.getJob('record-job')).toBeNull()
    engine.destroy()
  })

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

  it('waits for a mutation transaction before freezing and sending queued work', async () => {
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
    let lockCalls = 0
    const withIdRemapLock = engine.withIdRemapLock.bind(engine)
    jest.spyOn(engine, 'withIdRemapLock').mockImplementation((operation) => {
      lockCalls += 1
      if (lockCalls === 2) queueLockRequestedResolve()
      return withIdRemapLock(operation)
    })

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
    expect(api.deleteWorkout).toHaveBeenCalledWith('workout_1', 'queued-delete-key')
    expect(db.transactionEvents.map(({ type }) => type)).toEqual([
      'begin',
      'commit',
      'begin',
      'commit',
      'begin',
      'commit',
    ])
    expect(db.transactionEvents[2]).toMatchObject({
      type: 'begin',
      inTransaction: false,
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
      api: createApi({
        createWorkout: jest.fn(async () => ({ id: 'server_workout_active', version: 0 })),
      }),
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
      createWorkout: jest.fn(async () => ({ id: 'server_workout_1', version: 0 })),
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
    expect(api.updateWorkout).toHaveBeenCalledWith(
      'server_workout_1',
      { title: 'Heavy Leg Day', baseVersion: 0 },
      'job-update-workout-key'
    )
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
      api: createApi({
        createWorkout: jest.fn(async () => ({ id: 'server_workout_restart', version: 0 })),
      }),
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
        createWorkout: jest.fn(async () => ({
          id: 'server_workout_with_history',
          version: 0,
        })),
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
      api: createApi({ createWorkout: jest.fn(async () => ({ id: serverId, version: 0 })) }),
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
      createWorkout: jest.fn(async () => ({ id: 'server_workout_2', version: 0 })),
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

    expect(api.recordWorkout).toHaveBeenCalledWith(
      {
        workoutId: 'server_workout_2',
        exerciseRecords: [],
        startTime: '2026-04-24T10:00:00',
      },
      'job-record-workout-key'
    )
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

    expect(api.deleteWorkoutRecord).toHaveBeenCalledWith('server_record_3', 'job-delete-record-key')
  })

  it('rewrites queued routine updates after an offline routine create', async () => {
    const api = createApi({
      createRoutine: jest.fn(async () => ({ id: 'server_routine_1', version: 0 })),
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

    expect(api.updateRoutine).toHaveBeenCalledWith(
      'server_routine_1',
      { name: 'Week A Updated', baseVersion: 0 },
      'job-update-routine-key'
    )
  })

  it('rewrites nested workout ids inside queued routine payloads', async () => {
    const api = createApi({
      createWorkout: jest.fn(async () => ({ id: 'server_workout_nested', version: 0 })),
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

    expect(api.updateRoutine).toHaveBeenCalledWith(
      'server_routine_nested',
      {
        pattern: [
          {
            dayIndex: 1,
            dayType: 'WORKOUT',
            workoutId: 'server_workout_nested',
          },
        ],
      },
      'job-update-routine-key'
    )
  })

  it('replays create, record, routine and delete in order while keeping history', async () => {
    const local = 'local_workout_causal'
    const api = createApi({
      createWorkout: jest.fn(async () => ({ id: 'server_workout_causal', version: 0 })),
      recordWorkout: jest.fn(async () => ({ workoutRecord: { id: 'server_record_causal' } })),
      createRoutine: jest.fn(async () => ({ id: 'server_routine_causal', version: 0 })),
    })
    const { db, engine } = await runQueue({
      api,
      tables: {
        workouts: [local],
        workout_records: ['local_record_causal'],
        routines: ['local_routine_causal'],
      },
      configureDb: (db) => {
        db.foreignKeysEnabled = true
        db.tables.workouts.get(local).is_deleted = 1
        Object.assign(db.tables.workout_records.get('local_record_causal'), {
          workout_id: local,
          workout_title: 'Pull Day',
          exercise_records: '[{"exerciseName":"Barbell Row","reps":[8]}]',
        })
      },
      jobs: [
        makeJob({
          id: 'create',
          endpoint: 'createWorkout',
          payload: { title: 'Pull Day', template: { exercises: [] } },
          localTable: 'workouts',
          localId: local,
          sequence: 1,
        }),
        makeJob({
          id: 'record',
          endpoint: 'recordWorkout',
          payload: { workoutId: local, exerciseRecords: [] },
          localTable: 'workout_records',
          localId: 'local_record_causal',
          sequence: 2,
        }),
        makeJob({
          id: 'routine',
          endpoint: 'createRoutine',
          payload: {
            name: 'Weekly',
            pattern: [{ dayIndex: 1, dayType: 'WORKOUT', workoutId: local }],
          },
          localTable: 'routines',
          localId: 'local_routine_causal',
          sequence: 3,
        }),
        makeJob({ id: 'delete', endpoint: 'deleteWorkout', payload: [local], sequence: 4 }),
      ],
    })
    engine.destroy()
    expect(api.createWorkout.mock.invocationCallOrder[0]).toBeLessThan(
      api.recordWorkout.mock.invocationCallOrder[0]
    )
    expect(api.recordWorkout.mock.invocationCallOrder[0]).toBeLessThan(
      api.createRoutine.mock.invocationCallOrder[0]
    )
    expect(api.createRoutine.mock.invocationCallOrder[0]).toBeLessThan(
      api.deleteWorkout.mock.invocationCallOrder[0]
    )
    expect(api.recordWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ workoutId: 'server_workout_causal' }),
      'record-key'
    )
    expect(api.createRoutine).toHaveBeenCalledWith(
      expect.objectContaining({
        pattern: [expect.objectContaining({ workoutId: 'server_workout_causal' })],
      }),
      'routine-key'
    )
    expect(api.deleteWorkout).toHaveBeenCalledWith(
      { id: 'server_workout_causal', baseVersion: 0 },
      'delete-key'
    )
    expect(db.jobs).toEqual([])
    expect(db.tables.workouts.has('server_workout_causal')).toBe(false)
    expect(db.tables.workout_records.get('server_record_causal')).toMatchObject({
      workout_id: null,
      workout_title: 'Pull Day',
      exercise_records: '[{"exerciseName":"Barbell Row","reps":[8]}]',
    })
  })

  it('acknowledges a replayed delete after a lost response returns 404', async () => {
    const missing = Object.assign(new Error('already deleted'), { status: 404 })
    const api = createApi({
      deleteWorkout: jest.fn(async () => {
        throw missing
      }),
    })
    const { db, engine } = await runQueue({
      api,
      tables: { workouts: ['gone'] },
      configureDb: (db) => {
        db.tables.workouts.get('gone').is_deleted = 1
      },
      jobs: [makeJob({ id: 'delete-gone', endpoint: 'deleteWorkout', payload: ['gone'] })],
    })
    engine.destroy()
    expect(api.deleteWorkout).toHaveBeenCalledWith('gone', 'delete-gone-key')
    expect(db.jobs).toEqual([])
    expect(db.tables.workouts.has('gone')).toBe(false)
  })
})

describe('SyncEngine version acknowledgements', () => {
  it('stops rebasing at an attempted immediate successor', async () => {
    const api = createApi({
      updateWorkout: jest.fn(async () => ({ id: 'workout-1', version: 6 })),
    })
    const attempted = ['workout-1', { title: 'Attempted', baseVersion: 5 }]
    const { db, engine } = await runQueue({
      api,
      tables: { workouts: ['workout-1'] },
      jobs: [
        makeJob({
          id: 'first',
          endpoint: 'updateWorkout',
          payload: ['workout-1', { title: 'First', baseVersion: 5 }],
          sequence: 1,
        }),
        makeJob({
          id: 'attempted',
          endpoint: 'updateWorkout',
          payload: attempted,
          requestPayload: attempted,
          status: 'dead_letter',
          sequence: 2,
        }),
        makeJob({
          id: 'third',
          endpoint: 'updateWorkout',
          payload: ['workout-1', { title: 'Third', baseVersion: 5 }],
          sequence: 3,
        }),
      ],
    })

    expect(db.getJob('attempted').request_payload).toBe(JSON.stringify(attempted))
    expect(JSON.parse(db.getJob('third').payload)).toEqual([
      'workout-1',
      { title: 'Third', baseVersion: 5 },
    ])
    expect(db.tables.workouts.get('workout-1').server_version).toBe(6)
    engine.destroy()
  })

  it('keeps a remapped create from skipping an attempted local-id successor', async () => {
    const attempted = ['local-workout', { title: 'Attempted' }]
    const { db, engine } = await runQueue({
      api: createApi({
        createWorkout: jest.fn(async () => ({ id: 'server-workout', version: 0 })),
      }),
      tables: { workouts: ['local-workout'] },
      jobs: [
        makeJob({
          id: 'create',
          endpoint: 'createWorkout',
          payload: { title: 'Created' },
          localTable: 'workouts',
          localId: 'local-workout',
          sequence: 1,
        }),
        makeJob({
          id: 'attempted',
          endpoint: 'updateWorkout',
          payload: attempted,
          requestPayload: attempted,
          status: 'dead_letter',
          sequence: 2,
        }),
        makeJob({
          id: 'third',
          endpoint: 'updateWorkout',
          payload: ['local-workout', { title: 'Third' }],
          sequence: 3,
        }),
      ],
    })

    expect(db.getJob('attempted').request_payload).toBe(JSON.stringify(attempted))
    expect(JSON.parse(db.getJob('third').payload)).toEqual(['server-workout', { title: 'Third' }])
    engine.destroy()
  })

  it('advances the shared profile base across different routine ids', async () => {
    const api = createApi({
      updateRoutine: jest.fn(async (id) => {
        if (id === 'routine-a') return { id, version: 4, profileVersion: 11 }
        throw new Error('offline after first acknowledgement')
      }),
    })
    const { db, engine } = await runQueue({
      api,
      tables: { routines: ['routine-a', 'routine-b'] },
      jobs: [
        makeJob({
          id: 'activate-a',
          endpoint: 'updateRoutine',
          payload: ['routine-a', { active: true, baseVersion: 3, profileBaseVersion: 10 }],
          sequence: 1,
        }),
        makeJob({
          id: 'activate-b',
          endpoint: 'updateRoutine',
          payload: ['routine-b', { active: true, baseVersion: 7, profileBaseVersion: 10 }],
          sequence: 2,
        }),
      ],
    })

    expect(api.updateRoutine.mock.calls[1]).toEqual([
      'routine-b',
      { active: true, baseVersion: 7, profileBaseVersion: 11 },
      'activate-b-key',
    ])
    expect(db.tables.routines.get('routine-a').server_version).toBe(4)
    expect(db.getJob('activate-b')).toMatchObject({ status: 'failed' })
    engine.destroy()
  })

  it('carries an inactive delete profile base to the next activation', async () => {
    const api = createApi({
      updateRoutine: jest.fn(async (id) => ({
        id,
        version: id === 'routine-a' ? 4 : 6,
        ...(id === 'routine-a' ? { profileVersion: 11 } : {}),
      })),
      deleteRoutine: jest.fn(async () => ({ deletedRoutineId: 'routine-b' })),
    })
    const { engine } = await runQueue({
      api,
      tables: { routines: ['routine-a', 'routine-b', 'routine-c'] },
      configureDb: (db) => {
        db.tables.routines.get('routine-b').is_deleted = 1
      },
      jobs: [
        makeJob({
          id: 'activate-a',
          endpoint: 'updateRoutine',
          payload: ['routine-a', { active: true, baseVersion: 3, profileBaseVersion: 10 }],
          sequence: 1,
        }),
        makeJob({
          id: 'delete-inactive-b',
          endpoint: 'deleteRoutine',
          payload: { id: 'routine-b', baseVersion: 4, profileBaseVersion: 10 },
          sequence: 2,
        }),
        makeJob({
          id: 'activate-c',
          endpoint: 'updateRoutine',
          payload: ['routine-c', { active: true, baseVersion: 5, profileBaseVersion: 10 }],
          sequence: 3,
        }),
      ],
    })

    expect(api.updateRoutine).toHaveBeenLastCalledWith(
      'routine-c',
      { active: true, baseVersion: 5, profileBaseVersion: 11 },
      'activate-c-key'
    )
    engine.destroy()
  })

  it('keeps the inactive delete base when a remote profile mutation happens during deletion', async () => {
    let remoteProfileVersion = 11
    const staleVersion = Object.assign(new Error('Profile changed'), {
      status: 409,
      code: 'STALE_VERSION',
    })
    const api = createApi({
      updateRoutine: jest.fn(async (id, request) => {
        if (id === 'routine-a') return { id, version: 4, profileVersion: 11 }
        if (request.profileBaseVersion !== remoteProfileVersion) throw staleVersion
        return { id, version: 6, profileVersion: 13 }
      }),
      deleteRoutine: jest.fn(async () => {
        remoteProfileVersion = 12
        return { deletedRoutineId: 'routine-b' }
      }),
    })
    const { db, engine } = await runQueue({
      api,
      tables: { routines: ['routine-a', 'routine-b', 'routine-c'] },
      configureDb: (database) => {
        database.tables.routines.get('routine-b').is_deleted = 1
      },
      jobs: [
        makeJob({
          id: 'activate-a',
          endpoint: 'updateRoutine',
          payload: ['routine-a', { active: true, baseVersion: 3, profileBaseVersion: 10 }],
          sequence: 1,
        }),
        makeJob({
          id: 'delete-inactive-b',
          endpoint: 'deleteRoutine',
          payload: { id: 'routine-b', baseVersion: 4, profileBaseVersion: 10 },
          sequence: 2,
        }),
        makeJob({
          id: 'activate-c',
          endpoint: 'updateRoutine',
          payload: ['routine-c', { active: true, baseVersion: 5, profileBaseVersion: 10 }],
          sequence: 3,
        }),
      ],
    })

    expect(api.updateRoutine.mock.calls[1]).toEqual([
      'routine-c',
      { active: true, baseVersion: 5, profileBaseVersion: 11 },
      'activate-c-key',
    ])
    expect(db.getJob('activate-c')).toMatchObject({
      status: 'dead_letter',
      error_code: 'STALE_VERSION',
      request_payload: JSON.stringify([
        'routine-c',
        { active: true, baseVersion: 5, profileBaseVersion: 11 },
      ]),
    })
    expect(db.tables.routines.has('routine-c')).toBe(true)
    engine.destroy()
  })

  it('keeps a legacy routine delete as an unresolved profile barrier', async () => {
    const activationC = ['routine-c', { active: true, baseVersion: 5, profileBaseVersion: 10 }]
    const api = createApi({
      updateRoutine: jest
        .fn()
        .mockResolvedValueOnce({ id: 'routine-a', version: 4, profileVersion: 11 })
        .mockRejectedValueOnce(new Error('offline after legacy acknowledgement')),
      deleteRoutine: jest.fn(async () => undefined),
    })
    const { db, engine } = await runQueue({
      api,
      tables: { routines: ['routine-a', 'routine-b', 'routine-c'] },
      configureDb: (database) => {
        database.tables.routines.get('routine-b').is_deleted = 1
      },
      jobs: [
        makeJob({
          id: 'activate-a',
          endpoint: 'updateRoutine',
          payload: ['routine-a', { active: true, baseVersion: 3, profileBaseVersion: 10 }],
          sequence: 1,
        }),
        makeJob({
          id: 'delete-legacy-b',
          endpoint: 'deleteRoutine',
          payload: ['routine-b'],
          sequence: 2,
        }),
        makeJob({
          id: 'activate-c',
          endpoint: 'updateRoutine',
          payload: activationC,
          sequence: 3,
        }),
      ],
    })

    expect(api.deleteRoutine).toHaveBeenCalledWith('routine-b', 'delete-legacy-b-key')
    expect(db.getJob('delete-legacy-b')).toMatchObject({
      status: 'dead_letter',
      error_code: 'STALE_VERSION',
      payload: JSON.stringify(['routine-b']),
      request_payload: JSON.stringify(['routine-b']),
    })
    expect(db.tables.routines.has('routine-b')).toBe(true)
    expect(api.updateRoutine.mock.calls[1]).toEqual(['routine-c', activationC[1], 'activate-c-key'])
    expect(db.getJob('activate-c')).toMatchObject({
      payload: JSON.stringify(activationC),
      request_payload: JSON.stringify(activationC),
    })
    engine.destroy()
  })

  it('rebases a routine successor from a workout delete acknowledgement', async () => {
    const api = createApi({
      deleteWorkout: jest.fn(async () => ({
        deletedWorkoutId: 'workout-1',
        routineVersions: [{ id: 'routine-1', version: 8 }],
      })),
      updateRoutine: jest.fn(async () => {
        throw new Error('offline after delete acknowledgement')
      }),
    })
    const { db, engine } = await runQueue({
      api,
      tables: { workouts: ['workout-1'], routines: ['routine-1'] },
      configureDb: (database) => {
        database.tables.workouts.get('workout-1').is_deleted = 1
      },
      jobs: [
        makeJob({
          id: 'delete-workout',
          endpoint: 'deleteWorkout',
          payload: { id: 'workout-1', baseVersion: 3 },
          sequence: 1,
        }),
        makeJob({
          id: 'edit-routine',
          endpoint: 'updateRoutine',
          payload: ['routine-1', { name: 'After delete', baseVersion: 7 }],
          sequence: 2,
        }),
      ],
    })

    expect(api.updateRoutine).toHaveBeenCalledWith(
      'routine-1',
      { name: 'After delete', baseVersion: 8 },
      'edit-routine-key'
    )
    expect(db.tables.routines.get('routine-1').server_version).toBe(8)
    expect(db.tables.workouts.has('workout-1')).toBe(false)
    engine.destroy()
  })

  it('persists a create remap and its successor base across restart', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const db = new FakeDb({
      tables: { workouts: ['local-workout'] },
      jobs: [
        makeJob({
          id: 'create-workout',
          endpoint: 'createWorkout',
          payload: { title: 'Offline' },
          localTable: 'workouts',
          localId: 'local-workout',
          sequence: 1,
        }),
        makeJob({
          id: 'edit-workout',
          endpoint: 'updateWorkout',
          payload: ['local-workout', { title: 'Edited' }],
          sequence: 2,
          nextAttemptAt: Date.now() + 60_000,
        }),
      ],
    })
    const firstApi = createApi({
      createWorkout: jest.fn(async () => ({ id: 'server-workout', version: 0 })),
    })
    const first = new SyncEngine({
      api: firstApi,
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })
    await first.init(db, { processOnInit: false })
    await first.processQueue()
    first.destroy()

    expect(JSON.parse(db.getJob('edit-workout').payload)).toEqual([
      'server-workout',
      { title: 'Edited', baseVersion: 0 },
    ])
    db.getJob('edit-workout').next_attempt_at = 0
    const secondApi = createApi()
    const second = new SyncEngine({
      api: secondApi,
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })
    await second.init(db, { processOnInit: false })
    await second.processQueue()

    expect(secondApi.updateWorkout).toHaveBeenCalledWith(
      'server-workout',
      { title: 'Edited', baseVersion: 0 },
      'edit-workout-key'
    )
    expect(db.tables.workouts.get('server-workout').server_version).toBe(1)
    second.destroy()
  })

  it('retains a historic missing-version replay when current freshness cannot be proven', async () => {
    const api = createApi({
      updateWorkout: jest.fn(async () => ({ id: 'workout-1' })),
      getWorkouts: jest.fn(async () => [{ id: 'workout-1', version: 4 }]),
    })
    const { db, engine } = await runQueue({
      api,
      tables: { workouts: ['workout-1'] },
      configureDb: (database) => {
        Object.assign(database.tables.workouts.get('workout-1'), {
          title: 'Recoverable local draft',
          server_version: 0,
        })
      },
      jobs: [
        makeJob({
          id: 'historic-replay',
          endpoint: 'updateWorkout',
          payload: ['workout-1', { title: 'Recoverable local draft', baseVersion: 0 }],
          sequence: 1,
        }),
        makeJob({
          id: 'later-draft',
          endpoint: 'updateWorkout',
          payload: ['workout-1', { title: 'Later draft', baseVersion: 0 }],
          sequence: 2,
        }),
      ],
    })

    expect(db.getJob('historic-replay')).toMatchObject({
      status: 'dead_letter',
      error_code: 'STALE_VERSION',
      request_payload: JSON.stringify([
        'workout-1',
        { title: 'Recoverable local draft', baseVersion: 0 },
      ]),
    })
    expect(JSON.parse(db.getJob('later-draft').payload)[1].baseVersion).toBe(0)
    expect(db.tables.workouts.get('workout-1')).toMatchObject({
      title: 'Recoverable local draft',
      server_version: 0,
    })
    engine.destroy()
  })

  it('retains a historic workout delete when affected routine versions are unknown', async () => {
    const api = createApi({
      deleteWorkout: jest.fn(async () => undefined),
      getRoutines: jest.fn(async () => [{ id: 'routine-1', version: 2 }]),
      updateRoutine: jest.fn(async () => {
        throw Object.assign(new Error('Routine changed'), {
          status: 409,
          code: 'STALE_VERSION',
        })
      }),
    })
    const { db, engine } = await runQueue({
      api,
      tables: { workouts: ['workout-1'], routines: ['routine-1'] },
      configureDb: (database) => {
        database.tables.workouts.get('workout-1').is_deleted = 1
        database.tables.routines.get('routine-1').server_version = 1
      },
      jobs: [
        makeJob({
          id: 'historic-delete',
          endpoint: 'deleteWorkout',
          payload: ['workout-1'],
          sequence: 1,
        }),
        makeJob({
          id: 'routine-draft',
          endpoint: 'updateRoutine',
          payload: ['routine-1', { name: 'Draft', baseVersion: 1 }],
          sequence: 2,
        }),
      ],
    })

    expect(db.getJob('historic-delete')).toMatchObject({
      status: 'dead_letter',
      error_code: 'STALE_VERSION',
      request_payload: JSON.stringify(['workout-1']),
    })
    expect(db.getJob('routine-draft')).toMatchObject({
      status: 'dead_letter',
      error_code: 'STALE_VERSION',
      payload: JSON.stringify(['routine-1', { name: 'Draft', baseVersion: 1 }]),
    })
    expect(db.tables.workouts.get('workout-1').is_deleted).toBe(1)
    engine.destroy()
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
    expect(api.deleteWorkout).toHaveBeenCalledWith(
      'server_workout_continues',
      'job-delete-workout-continues-key'
    )
    expect(db.getJob('job-update-routine-dead-letter')).toMatchObject({
      status: 'dead_letter',
      retry_count: 1,
      error_message: '409: duplicate name',
    })
    expect(db.getJob('job-delete-workout-continues')).toBeNull()
  })

  it('dead-letters malformed queue payloads and conservatively blocks later jobs', async () => {
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
    expect(api.deleteWorkout).not.toHaveBeenCalled()
    expect(db.getJob('job-malformed-payload')).toMatchObject({
      status: 'dead_letter',
      error_message: expect.stringContaining('Invalid queued payload'),
    })
    expect(db.getJob('job-after-malformed-payload')).toMatchObject({ status: 'pending' })
    expect(
      (await engine.listJobs()).find((job) => job.id === 'job-after-malformed-payload')
        .blocked_reason
    ).toBeTruthy()
    engine.destroy()
  })

  it('retries transient failures beyond five attempts with a delayed retry', async () => {
    jest.useFakeTimers()
    jest.spyOn(Math, 'random').mockReturnValue(0)
    let failuresRemaining = 7
    const api = createApi({
      updateWorkout: jest.fn(async () => {
        if (failuresRemaining-- > 0) throw new Error('network timeout')
        return { id: 'server_workout_retry', version: 1 }
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

  it('respects the persisted retry deadline when network connectivity is restored', async () => {
    jest.useFakeTimers()
    const networkRemove = jest.fn()
    let networkListener
    let networkState = { isConnected: true, isInternetReachable: true }
    let failuresRemaining = 1
    const api = createApi({
      updateWorkout: jest.fn(async () => {
        if (failuresRemaining-- > 0) throw new Error('temporary backend error')
        return { id: 'server_workout_retry', version: 1 }
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
      await engine.processQueue()
      expect(api.updateWorkout).toHaveBeenCalledTimes(1)
      await jest.advanceTimersByTimeAsync(Math.ceil(db.jobs[0].next_attempt_at - Date.now()))
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
          sequence: db.nextSequence++,
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
