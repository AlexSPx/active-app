jest.mock('../../services/apiService', () => ({
  apiService: {},
}))

const { createApi, makeJob, runQueue } = require('../helpers/syncTestUtils')

describe('SyncEngine queue remapping', () => {
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
