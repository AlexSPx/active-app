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

  it('updates an active session when its workout receives a server id', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    const {
      useRunningWorkoutStore,
      remapRunningWorkoutId,
    } = require('../../features/workout-session/stores/runningWorkoutStore')
    const { queryClient } = require('../../lib/queryClient')
    const { queryKeys } = require('../../lib/queryKeys')
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
    queryClient.setQueryData(queryKeys.workouts.list(), [
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
        { queryKey: queryKeys.workouts.all },
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
    expect(queryClient.getQueryData(queryKeys.workouts.list())[0]).toMatchObject({
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
    queryClient.removeQueries({ queryKey: queryKeys.workouts.all })
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

    const { db } = await runQueue({
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
})
