jest.mock('../../services/apiService', () => ({ apiService: {} }))
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}))
jest.mock('../../lib/sync/api', () => ({
  syncApi: {
    getUser: jest.fn(async () => ({ activeRoutineId: null })),
    getWorkouts: jest.fn(async () => []),
    getWorkoutRecords: jest.fn(async () => []),
    getRoutines: jest.fn(async () => []),
  },
}))
jest.mock('../../lib/repositories/WorkoutRepository', () => ({
  WorkoutRepository: jest.fn().mockImplementation((db) => ({
    hydrateWorkouts: jest.fn(async () => db.hydrationWrites.push('workouts')),
    hydrateRecords: jest.fn(async () => db.hydrationWrites.push('records')),
  })),
}))
jest.mock('../../lib/repositories/RoutineRepository', () => ({
  RoutineRepository: jest.fn().mockImplementation((db) => ({
    hydrateFromServer: jest.fn(async () => db.hydrationWrites.push('routines')),
  })),
}))

const { FakeDb, createApi, makeJob } = require('../helpers/syncTestUtils')
const { getProfileScope, setActiveProfileOwner } = require('../../lib/profileScope')

describe('profile-scoped sync fencing', () => {
  afterEach(() => setActiveProfileOwner('local:device'))

  it('keeps a delayed A upload pending and leaves B untouched after a profile switch', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    setActiveProfileOwner('account:A')

    let started
    const apiStarted = new Promise((resolve) => {
      started = resolve
    })
    let finishUpload
    const delayedUpload = new Promise((resolve) => {
      finishUpload = resolve
    })
    const api = createApi({
      createWorkout: jest.fn(() => {
        started()
        return delayedUpload
      }),
    })
    const engine = new SyncEngine({
      api,
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })
    const dbA = new FakeDb({
      jobs: [
        makeJob({
          id: 'job-A',
          endpoint: 'createWorkout',
          payload: { title: 'A workout' },
          localTable: 'workouts',
          localId: 'local-A',
        }),
      ],
      tables: { workouts: ['local-A'] },
    })
    const dbB = new FakeDb({
      jobs: [makeJob({ id: 'job-B', endpoint: 'deleteWorkout', payload: ['B-workout'] })],
      tables: { workouts: ['B-workout'] },
    })

    await engine.init(dbA, { processOnInit: false })
    const drain = engine.processQueue()
    await apiStarted

    setActiveProfileOwner('account:B')
    const reinit = engine.init(dbB, { processOnInit: false })
    engine.setUploadsEnabled(false)
    finishUpload({ id: 'server-A' })
    await Promise.all([drain, reinit])

    expect(dbA.getJob('job-A').status).toBe('processing')
    expect(dbA.tables.workouts.has('local-A')).toBe(true)
    expect(dbA.tables.workouts.has('server-A')).toBe(false)
    expect(dbB.getJob('job-B').status).toBe('pending')
    expect(dbB.tables.workouts.has('B-workout')).toBe(true)
    expect(engine.resolveId('workouts', 'local-A')).toBe('local-A')
    expect(api.createWorkout).toHaveBeenCalledTimes(1)
    engine.destroy()
  })

  it('pauseAndDrain waits for the active upload and leaves later jobs queued', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    setActiveProfileOwner('account:A')

    let started
    const apiStarted = new Promise((resolve) => {
      started = resolve
    })
    let finishUpload
    const delayedUpload = new Promise((resolve) => {
      finishUpload = resolve
    })
    const api = createApi({
      createWorkout: jest.fn(() => {
        started()
        return delayedUpload
      }),
    })
    const engine = new SyncEngine({
      api,
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })
    const db = new FakeDb({
      jobs: [
        makeJob({ id: 'job-active', endpoint: 'createWorkout', payload: { title: 'A' } }),
        makeJob({ id: 'job-later', endpoint: 'deleteWorkout', payload: ['later'] }),
      ],
    })

    await engine.init(db, { processOnInit: false })
    const drain = engine.processQueue()
    await apiStarted
    let pauseResolved = false
    const pause = engine.pauseAndDrain().then(() => {
      pauseResolved = true
    })
    await Promise.resolve()

    expect(pauseResolved).toBe(false)
    expect(api.deleteWorkout).not.toHaveBeenCalled()
    finishUpload({})
    await Promise.all([drain, pause])

    expect(db.getJob('job-active')).toBeNull()
    expect(db.getJob('job-later').status).toBe('pending')
    expect(api.deleteWorkout).not.toHaveBeenCalled()
    engine.destroy()
  })

  it('keeps an uncertain upload pending when credentials change during its request', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    setActiveProfileOwner('account:A')
    const api = createApi({
      createWorkout: jest.fn(async () => {
        throw Object.assign(new Error('Authentication changed'), {
          code: 'AUTH_SESSION_CHANGED',
        })
      }),
    })
    const engine = new SyncEngine({
      api,
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener: () => ({ remove() {} }),
    })
    const db = new FakeDb({
      jobs: [
        makeJob({
          id: 'uncertain-job',
          endpoint: 'createWorkout',
          payload: { title: 'A workout' },
        }),
      ],
    })

    await engine.init(db, { processOnInit: false })
    await engine.processQueue()

    expect(db.getJob('uncertain-job')).toMatchObject({
      status: 'failed',
      retry_count: 1,
      next_attempt_at: 0,
    })
    engine.destroy()
  })

  it('ignores an initialization that finishes after provider cleanup and remount', async () => {
    const { SyncEngine } = require('../../lib/sync/SyncEngine')
    setActiveProfileOwner('account:A')
    let started
    const pragmaStarted = new Promise((resolve) => {
      started = resolve
    })
    let finishPragma
    const delayedPragma = new Promise((resolve) => {
      finishPragma = resolve
    })
    const dbA = new FakeDb()
    dbA.execAsync = jest.fn(() => {
      started()
      return delayedPragma
    })
    const dbB = new FakeDb()
    const staleRemapRead = jest.spyOn(dbA, 'getAllAsync')
    const addAppStateListener = jest.fn(() => ({ remove: jest.fn() }))
    const engine = new SyncEngine({
      api: createApi(),
      getNetworkState: async () => ({ isConnected: true, isInternetReachable: true }),
      addAppStateListener,
    })

    const staleInit = engine.init(dbA, { processOnInit: false })
    await pragmaStarted
    engine.destroy()
    await engine.init(dbB, { processOnInit: false })
    finishPragma()
    await staleInit

    expect(addAppStateListener).toHaveBeenCalledTimes(1)
    expect(staleRemapRead).not.toHaveBeenCalled()
    engine.destroy()
  })

  it('enqueues a late repository write into its originating database only', async () => {
    const { syncEngine } = require('../../lib/sync/SyncEngine')
    const { BaseRepository } = require('../../lib/repositories/BaseRepository')
    setActiveProfileOwner('account:A')
    syncEngine.setUploadsEnabled(false)

    const dbA = new FakeDb()
    const dbB = new FakeDb()
    await syncEngine.init(dbA, { processOnInit: false })
    setActiveProfileOwner('account:B')
    await syncEngine.init(dbB, { processOnInit: false })

    class TestRepository extends BaseRepository {
      enqueue(config) {
        return this.enqueueSync(config)
      }
    }
    await new TestRepository(dbA).enqueue({
      apiMethod: 'deleteWorkout',
      payload: ['A-workout'],
    })

    expect(dbA.jobs).toHaveLength(1)
    expect(dbA.jobs[0]).toMatchObject({ endpoint: 'deleteWorkout', status: 'pending' })
    expect(dbB.jobs).toHaveLength(0)
    syncEngine.destroy()
  })

  it('discards a hydration response after its profile becomes stale', async () => {
    const { hydrateFromServer } = require('../../lib/sync/hydrate')
    const { syncApi } = require('../../lib/sync/api')
    setActiveProfileOwner('account:A')

    let started
    const responseStarted = new Promise((resolve) => {
      started = resolve
    })
    let finishResponse
    const delayedResponse = new Promise((resolve) => {
      finishResponse = resolve
    })
    syncApi.getUser.mockResolvedValue({ activeRoutineId: null })
    syncApi.getWorkouts.mockResolvedValue([])
    syncApi.getWorkoutRecords.mockResolvedValue([])
    syncApi.getRoutines.mockImplementation(() => {
      started()
      return delayedResponse
    })
    const dbA = { hydrationWrites: [], execAsync: jest.fn(async () => {}) }
    const dbB = { hydrationWrites: [], execAsync: jest.fn(async () => {}) }

    const hydration = hydrateFromServer(dbA)
    await responseStarted
    setActiveProfileOwner('account:B')
    finishResponse([])

    await expect(hydration).rejects.toThrow('Profile changed during hydration')
    expect(dbA.hydrationWrites).toEqual([])
    expect(dbA.execAsync).not.toHaveBeenCalled()
    expect(dbB.hydrationWrites).toEqual([])
    expect(getProfileScope().ownerId).toBe('account:B')
  })

  it('preserves a local mutation created while the server snapshot is in flight', async () => {
    const { hydrateFromServer } = require('../../lib/sync/hydrate')
    const { syncApi } = require('../../lib/sync/api')
    const { syncEngine } = require('../../lib/sync/SyncEngine')
    const { BaseRepository } = require('../../lib/repositories/BaseRepository')
    setActiveProfileOwner('account:A')

    let started
    const responseStarted = new Promise((resolve) => {
      started = resolve
    })
    let finishResponse
    const delayedResponse = new Promise((resolve) => {
      finishResponse = resolve
    })
    syncApi.getUser.mockResolvedValue({ activeRoutineId: null })
    syncApi.getWorkouts.mockResolvedValue([])
    syncApi.getWorkoutRecords.mockResolvedValue([])
    syncApi.getRoutines.mockImplementation(() => {
      started()
      return delayedResponse
    })

    const db = new FakeDb()
    db.hydrationWrites = []
    const execAsync = jest.spyOn(db, 'execAsync')
    await syncEngine.init(db, { processOnInit: false })
    syncEngine.setUploadsEnabled(false)

    class LocalWorkoutRepository extends BaseRepository {
      save(title = 'Saved offline') {
        return this.commitMutation(async (tx) => {
          const id = 'local_during_hydration'
          const now = new Date().toISOString()
          await tx.runAsync(
            'INSERT INTO workouts (id, title, notes, created_at, updated_at, workout_template, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?)',
            id,
            title,
            null,
            now,
            now,
            JSON.stringify({ id, exercises: [] }),
            0
          )
          return {
            value: id,
            job: {
              apiMethod: 'createWorkout',
              payload: { title, template: { exercises: [] } },
              localTable: 'workouts',
              localId: id,
            },
          }
        })
      }
    }

    try {
      const hydration = hydrateFromServer(db)
      await responseStarted

      const localId = await new LocalWorkoutRepository(db).save()
      finishResponse([])
      await expect(hydration).resolves.toBe(false)

      expect(db.tables.workouts.get(localId)).toMatchObject({
        id: localId,
        title: 'Saved offline',
        is_synced: 0,
      })
      expect(db.jobs).toHaveLength(1)
      expect(db.jobs[0]).toMatchObject({
        endpoint: 'createWorkout',
        local_id: localId,
        status: 'pending',
      })
      expect(db.hydrationWrites).toEqual([])
      expect(execAsync).not.toHaveBeenCalledWith('PRAGMA foreign_keys = OFF;')

      let secondStarted
      const secondResponseStarted = new Promise((resolve) => {
        secondStarted = resolve
      })
      let finishSecondResponse
      const secondDelayedResponse = new Promise((resolve) => {
        finishSecondResponse = resolve
      })
      syncApi.getRoutines.mockImplementation(() => {
        secondStarted()
        return secondDelayedResponse
      })
      const secondHydration = hydrateFromServer(db)
      await secondResponseStarted
      await new LocalWorkoutRepository(db).save('Quickly synced edit')
      // Simulate the upload acknowledgement removing the new queue row before the old GET returns.
      db.jobs.length = 0
      finishSecondResponse([])
      await expect(secondHydration).resolves.toBe(false)

      expect(db.tables.workouts.get(localId)).toMatchObject({
        id: localId,
        title: 'Quickly synced edit',
        is_synced: 0,
      })
      expect(db.jobs).toHaveLength(0)
      expect(db.hydrationWrites).toEqual([])
      expect(execAsync).not.toHaveBeenCalledWith('PRAGMA foreign_keys = OFF;')
    } finally {
      syncEngine.destroy()
    }
  })
})
