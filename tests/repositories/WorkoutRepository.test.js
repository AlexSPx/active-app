jest.mock('../../lib/sync', () => ({
  syncEngine: {
    enqueue: jest.fn(async () => undefined),
    scheduleQueueProcessing: jest.fn(),
    withIdRemapLock: jest.fn((operation) => operation()),
    resolveId: jest.fn((_table, id) => id),
  },
}))

const { syncEngine } = require('../../lib/sync')
const { WorkoutRepository } = require('../../lib/repositories/WorkoutRepository')
const { FakeDb } = require('../helpers/syncTestUtils')

describe('WorkoutRepository', () => {
  let db
  let repo

  beforeEach(() => {
    jest.clearAllMocks()
    syncEngine.resolveId.mockImplementation((_table, id) => id)
    db = new FakeDb()
    syncEngine.enqueue.mockImplementation(async (_job, transaction, options) => {
      db.recordTransactionEvent('enqueue', {
        transactionMatches: transaction === db,
        options,
      })
    })
    syncEngine.scheduleQueueProcessing.mockImplementation(() =>
      db.recordTransactionEvent('schedule')
    )
    repo = new WorkoutRepository(db)
  })

  it('creates a local workout row and enqueues createWorkout', async () => {
    const payload = {
      title: 'Upper Body',
      notes: 'Heavy day',
      template: {
        exercises: [
          {
            exerciseId: 'exercise_1',
            reps: [5, 5, 5],
            weight: [100, 100, 100],
          },
        ],
      },
    }
    const selectedExercises = [
      {
        id: 'exercise_1',
        name: 'Barbell Bench Press',
        category: 'POWERLIFTING',
        primaryMuscles: ['chest'],
        secondaryMuscles: ['triceps', 'shoulders'],
      },
    ]

    const created = await repo.create(payload, selectedExercises)

    expect(created.title).toBe('Upper Body')
    expect(created.id).toMatch(/^local_/)
    expect(created.workoutTemplate.exercises[0]).toMatchObject({
      exerciseId: 'exercise_1',
      exerciseTitle: 'Barbell Bench Press',
      category: 'POWERLIFTING',
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps', 'shoulders'],
    })
    await expect(repo.getById(created.id)).resolves.toMatchObject({
      workoutTemplate: {
        exercises: [
          {
            exerciseTitle: 'Barbell Bench Press',
            category: 'POWERLIFTING',
            primaryMuscles: ['chest'],
            secondaryMuscles: ['triceps', 'shoulders'],
          },
        ],
      },
    })

    const rows = db.getTableRows('workouts')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: created.id,
      title: 'Upper Body',
      notes: 'Heavy day',
      is_synced: 0,
    })

    expect(syncEngine.enqueue).toHaveBeenCalledWith(
      {
        apiMethod: 'createWorkout',
        payload,
        localTable: 'workouts',
        localId: created.id,
      },
      db,
      { processAfterInsert: false }
    )
    expect(syncEngine.scheduleQueueProcessing).toHaveBeenCalledTimes(1)
    expect(db.transactionEvents.map(({ type }) => type)).toEqual([
      'begin',
      'enqueue',
      'commit',
      'schedule',
    ])
    expect(db.transactionEvents[1]).toMatchObject({
      inTransaction: true,
      transactionMatches: true,
      options: { processAfterInsert: false },
    })
    expect(db.transactionEvents[3].inTransaction).toBe(false)
  })

  it('updates the local workout row and enqueues updateWorkout', async () => {
    db.tables.workouts.set('workout_1', {
      id: 'workout_1',
      title: 'Old Title',
      notes: 'Old Notes',
      created_at: '2026-04-24T10:00:00.000Z',
      updated_at: '2026-04-24T10:00:00.000Z',
      workout_template: JSON.stringify({
        id: 'workout_1',
        exercises: [],
        createdAt: '2026-04-24T10:00:00.000Z',
        updatedAt: '2026-04-24T10:00:00.000Z',
      }),
      is_synced: 1,
      synced_at: '2026-04-24T10:00:00.000Z',
    })

    const updatePayload = {
      title: 'Updated Title',
      notes: 'Updated Notes',
      template: {
        exercises: [
          {
            exerciseId: 'exercise_2',
            reps: [8],
            weight: [30],
          },
        ],
      },
    }
    const selectedExercises = [
      {
        id: 'exercise_2',
        name: 'Bench Dips',
        category: 'STRENGTH',
        primaryMuscles: ['triceps'],
        secondaryMuscles: ['chest', 'shoulders'],
      },
    ]

    await repo.update('workout_1', updatePayload, selectedExercises)

    const updated = db.tables.workouts.get('workout_1')
    expect(updated).toMatchObject({
      title: 'Updated Title',
      notes: 'Updated Notes',
      is_synced: 0,
    })
    expect(updated.updated_at).not.toBe('2026-04-24T10:00:00.000Z')
    await expect(repo.getById('workout_1')).resolves.toMatchObject({
      workoutTemplate: {
        exercises: [
          {
            exerciseId: 'exercise_2',
            exerciseTitle: 'Bench Dips',
            category: 'STRENGTH',
            primaryMuscles: ['triceps'],
            secondaryMuscles: ['chest', 'shoulders'],
          },
        ],
      },
    })

    expect(syncEngine.enqueue).toHaveBeenCalledWith(
      {
        apiMethod: 'updateWorkout',
        payload: ['workout_1', updatePayload],
      },
      db,
      { processAfterInsert: false }
    )
    expect(syncEngine.scheduleQueueProcessing).toHaveBeenCalledTimes(1)
  })

  it('resolves remapped IDs for workout updates and deletes', async () => {
    db.tables.workouts.set('server_workout_4', {
      id: 'server_workout_4',
      title: 'Before update',
      notes: null,
      created_at: '2026-04-24T10:00:00.000Z',
      updated_at: '2026-04-24T10:00:00.000Z',
      workout_template: '{}',
      is_synced: 1,
      synced_at: null,
    })
    syncEngine.resolveId
      .mockReturnValueOnce('server_workout_4')
      .mockReturnValueOnce('server_workout_4')
    const payload = { title: 'After update' }

    await repo.update('local_workout_4', payload, [])
    expect(db.tables.workouts.get('server_workout_4').title).toBe('After update')
    await repo.delete('local_workout_4')

    expect(db.tables.workouts.get('server_workout_4').is_deleted).toBe(1)
    await expect(repo.getById('server_workout_4')).resolves.toBeNull()
    expect(syncEngine.withIdRemapLock).toHaveBeenCalledTimes(2)
    expect(syncEngine.enqueue).toHaveBeenNthCalledWith(
      1,
      {
        apiMethod: 'updateWorkout',
        payload: ['server_workout_4', payload],
      },
      db,
      { processAfterInsert: false }
    )
    expect(syncEngine.enqueue).toHaveBeenNthCalledWith(
      2,
      {
        apiMethod: 'deleteWorkout',
        payload: ['server_workout_4'],
      },
      db,
      { processAfterInsert: false }
    )
    expect(syncEngine.scheduleQueueProcessing).toHaveBeenCalledTimes(2)
  })

  it('records a workout locally and enqueues recordWorkout', async () => {
    db.tables.workouts.set('workout_2', { id: 'workout_2', is_deleted: 0 })
    const recordRequest = {
      workoutId: 'workout_2',
      notes: 'Felt strong',
      startTime: '2026-04-24T12:00:00',
      exerciseRecords: [
        {
          exerciseId: 'barbell_row',
          reps: [8, 8, 8],
          weight: [80, 80, 80],
        },
      ],
    }

    const result = await repo.recordWorkout(recordRequest, 'Pull Day')

    expect(result.workoutRecord.id).toMatch(/^local_/)
    expect(result.workoutRecord.workoutId).toBe('workout_2')
    expect(result.workoutRecord.exerciseRecords).toEqual([
      {
        exerciseName: 'barbell_row',
        reps: [8, 8, 8],
        weight: [80, 80, 80],
        durationSeconds: null,
        notes: null,
      },
    ])

    const rows = db.getTableRows('workout_records')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: result.workoutRecord.id,
      workout_id: 'workout_2',
      workout_title: 'Pull Day',
      notes: 'Felt strong',
      is_synced: 0,
    })

    expect(syncEngine.enqueue).toHaveBeenCalledWith(
      {
        apiMethod: 'recordWorkout',
        payload: recordRequest,
        localTable: 'workout_records',
        localId: result.workoutRecord.id,
      },
      db,
      { processAfterInsert: false }
    )
    expect(syncEngine.scheduleQueueProcessing).toHaveBeenCalledTimes(1)
  })

  it('rolls back the local workout and queue if queue insertion fails', async () => {
    db.tables.workouts.set('workout_2', { id: 'workout_2', is_deleted: 0 })
    const existingJob = {
      id: 'existing_job',
      endpoint: 'createRoutine',
      payload: '{}',
      status: 'pending',
    }
    db.jobs.push(existingJob)
    const recordRequest = {
      workoutId: 'workout_2',
      exerciseRecords: [],
    }
    syncEngine.enqueue.mockImplementationOnce(async (_job, transaction, options) => {
      db.recordTransactionEvent('enqueue', {
        transactionMatches: transaction === db,
        options,
      })
      db.jobs.push({ id: 'partial_job', endpoint: 'recordWorkout', status: 'pending' })
      throw new Error('queue unavailable')
    })

    await expect(repo.recordWorkout(recordRequest, 'Pull Day')).rejects.toThrow('queue unavailable')
    expect(db.getTableRows('workout_records')).toHaveLength(0)
    expect(db.jobs).toEqual([existingJob])
    expect(syncEngine.scheduleQueueProcessing).not.toHaveBeenCalled()
    expect(db.transactionEvents.map(({ type }) => type)).toEqual(['begin', 'enqueue', 'rollback'])
    expect(db.transactionEvents[1]).toMatchObject({
      inTransaction: true,
      transactionMatches: true,
      options: { processAfterInsert: false },
    })
  })

  it('keeps foreign key checks enabled on the shared mutation connection', async () => {
    db.enforceForeignKeys = true
    db.foreignKeysEnabled = true
    const withTransaction = jest.spyOn(db, 'withTransactionAsync')
    const withExclusiveTransaction = jest.spyOn(db, 'withExclusiveTransactionAsync')
    db.tables.workouts.set('workout_with_record', { id: 'workout_with_record' })
    db.tables.workout_records.set('record_with_history', {
      id: 'record_with_history',
      workout_id: 'workout_with_record',
    })

    await expect(
      repo.recordWorkout({ workoutId: 'missing_workout', exerciseRecords: [] }, 'Missing')
    ).rejects.toThrow('Cannot record a deleted workout')
    await repo.delete('workout_with_record')

    expect(withTransaction).toHaveBeenCalledTimes(2)
    expect(withExclusiveTransaction).not.toHaveBeenCalled()
    expect(db.tables.workout_records.has('record_with_history')).toBe(true)
    expect(db.tables.workout_records.size).toBe(1)
    expect(db.tables.workouts.has('workout_with_record')).toBe(true)
    expect(db.tables.workouts.get('workout_with_record').is_deleted).toBe(1)
    expect(syncEngine.enqueue).toHaveBeenCalledTimes(1)
    expect(db.transactionEvents.map(({ type, mode }) => [type, mode])).toEqual([
      ['begin', 'shared'],
      ['rollback', 'shared'],
      ['begin', 'shared'],
      ['enqueue', undefined],
      ['commit', 'shared'],
      ['schedule', undefined],
    ])
  })

  it('uses the remapped workout ID for the saved record and its queue job', async () => {
    db.tables.workouts.set('server_workout_2', { id: 'server_workout_2', is_deleted: 0 })
    syncEngine.resolveId.mockReturnValueOnce('server_workout_2')
    const request = { workoutId: 'local_workout_2', exerciseRecords: [] }

    const result = await repo.recordWorkout(request, 'Pull Day')

    expect(result.workoutRecord.workoutId).toBe('server_workout_2')
    expect(db.getTableRows('workout_records')[0].workout_id).toBe('server_workout_2')
    expect(syncEngine.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        apiMethod: 'recordWorkout',
        payload: { ...request, workoutId: 'server_workout_2' },
      }),
      db,
      { processAfterInsert: false }
    )
    expect(syncEngine.scheduleQueueProcessing).toHaveBeenCalledTimes(1)
  })

  it('deletes local workout rows and enqueues delete operations', async () => {
    db.tables.workouts.set('workout_delete', {
      id: 'workout_delete',
      title: 'Delete Me',
      notes: null,
      created_at: '2026-04-24T10:00:00.000Z',
      updated_at: '2026-04-24T10:00:00.000Z',
      workout_template: '{}',
      is_synced: 0,
      synced_at: null,
    })
    db.tables.workout_records.set('record_delete', {
      id: 'record_delete',
      workout_id: 'workout_delete',
      workout_title: 'Delete Me',
      notes: null,
      created_at: '2026-04-24T10:00:00.000Z',
      start_time: null,
      exercise_records: '[]',
      is_synced: 0,
      synced_at: null,
    })

    await repo.delete('workout_delete')
    await repo.deleteRecord('record_delete')

    expect(db.tables.workouts.get('workout_delete').is_deleted).toBe(1)
    expect(db.tables.workout_records.get('record_delete').is_deleted).toBe(1)
    await expect(repo.getById('workout_delete')).resolves.toBeNull()
    await expect(repo.getAll()).resolves.toEqual([])
    await expect(repo.getAllRecords()).resolves.toEqual([])
    expect(syncEngine.enqueue).toHaveBeenNthCalledWith(
      1,
      {
        apiMethod: 'deleteWorkout',
        payload: ['workout_delete'],
      },
      db,
      { processAfterInsert: false }
    )
    expect(syncEngine.enqueue).toHaveBeenNthCalledWith(
      2,
      {
        apiMethod: 'deleteWorkoutRecord',
        payload: ['record_delete'],
      },
      db,
      { processAfterInsert: false }
    )
    expect(syncEngine.scheduleQueueProcessing).toHaveBeenCalledTimes(2)
  })

  it('deletes a workout record whose local ID was remapped while its screen was open', async () => {
    const localId = 'local_record_open_screen'
    const serverId = 'server_record_open_screen'
    db.tables.workout_records.set(serverId, { id: serverId, workout_id: 'workout_1' })
    syncEngine.resolveId.mockImplementation((table, id) =>
      table === 'workout_records' && id === localId ? serverId : id
    )

    await repo.deleteRecord(localId)

    expect(db.tables.workout_records.get(serverId).is_deleted).toBe(1)
    expect(syncEngine.enqueue).toHaveBeenCalledWith(
      { apiMethod: 'deleteWorkoutRecord', payload: [serverId] },
      db,
      { processAfterInsert: false }
    )
  })

  it('keeps an offline deleted workout hidden through hydration and a repository restart', async () => {
    const created = await repo.create({ title: 'Pull Day', template: { exercises: [] } }, [])
    await repo.delete(created.id)
    const serverCopy = {
      id: created.id,
      title: 'Stale Pull Day',
      notes: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      workoutTemplate: {
        id: created.id,
        exercises: [],
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    }

    await repo.hydrateWorkouts([serverCopy])
    const restarted = new WorkoutRepository(db)
    await expect(restarted.getAll()).resolves.toEqual([])
    await expect(restarted.getById(created.id)).resolves.toBeNull()
    expect(db.tables.workouts.get(created.id)).toMatchObject({ title: 'Pull Day', is_deleted: 1 })
  })

  it('keeps a saved exercise snapshot when the workout is deleted', async () => {
    const created = await repo.create(
      {
        title: 'Pull Day',
        template: { exercises: [{ exerciseId: 'row', reps: [8], weight: [80] }] },
      },
      [
        {
          id: 'row',
          name: 'Barbell Row',
          category: 'STRENGTH',
          primaryMuscles: ['back'],
          secondaryMuscles: [],
        },
      ]
    )
    const saved = await repo.recordWorkout(
      { workoutId: created.id, exerciseRecords: [{ exerciseId: 'row', reps: [8], weight: [80] }] },
      'Pull Day'
    )
    await repo.delete(created.id)

    const history = await repo.getAllRecords()
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      id: saved.workoutRecord.id,
      workoutTitle: 'Pull Day',
      exerciseRecords: [{ exerciseName: 'Barbell Row', reps: [8], weight: [80] }],
    })
    expect(db.tables.workout_records.get(saved.workoutRecord.id).workout_id).toBe(created.id)
  })

  it('rolls back a delete tombstone if its queue insert fails', async () => {
    const created = await repo.create({ title: 'Keep Me', template: { exercises: [] } }, [])
    syncEngine.enqueue.mockRejectedValueOnce(new Error('queue unavailable'))
    await expect(repo.delete(created.id)).rejects.toThrow('queue unavailable')
    await expect(repo.getById(created.id)).resolves.toMatchObject({ title: 'Keep Me' })
    expect(db.tables.workouts.get(created.id).is_deleted).toBeFalsy()
  })

  it('rejects saving a new record for a deleted workout', async () => {
    const created = await repo.create({ title: 'Deleted', template: { exercises: [] } }, [])
    await repo.delete(created.id)
    await expect(
      repo.recordWorkout({ workoutId: created.id, exerciseRecords: [] }, 'Deleted')
    ).rejects.toThrow('Cannot record a deleted workout')
    expect(db.getTableRows('workout_records')).toEqual([])
  })
})
