jest.mock('../../lib/sync', () => ({
  syncEngine: {
    enqueue: jest.fn(async () => undefined),
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
    db = new FakeDb()
    repo = new WorkoutRepository(db)
  })

  it('creates a local workout row and enqueues createWorkout', async () => {
    const payload = {
      title: 'Upper Body',
      notes: 'Heavy day',
      template: {
        exercises: [
          {
            exerciseId: 'barbell_bench_press',
            reps: [5, 5, 5],
            weight: [100, 100, 100],
          },
        ],
      },
    }

    const created = await repo.create(payload)

    expect(created.title).toBe('Upper Body')
    expect(created.id).toMatch(/^local_/)
    expect(created.workoutTemplate.exercises[0].exerciseId).toBe('barbell_bench_press')

    const rows = db.getTableRows('workouts')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: created.id,
      title: 'Upper Body',
      notes: 'Heavy day',
      is_synced: 0,
    })

    expect(syncEngine.enqueue).toHaveBeenCalledWith({
      apiMethod: 'createWorkout',
      payload,
      localTable: 'workouts',
      localId: created.id,
    })
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
    }

    await repo.update('workout_1', updatePayload)

    const updated = db.tables.workouts.get('workout_1')
    expect(updated).toMatchObject({
      title: 'Updated Title',
      notes: 'Updated Notes',
      is_synced: 0,
    })
    expect(updated.updated_at).not.toBe('2026-04-24T10:00:00.000Z')

    expect(syncEngine.enqueue).toHaveBeenCalledWith({
      apiMethod: 'updateWorkout',
      payload: ['workout_1', updatePayload],
    })
  })

  it('records a workout locally and enqueues recordWorkout', async () => {
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

    expect(syncEngine.enqueue).toHaveBeenCalledWith({
      apiMethod: 'recordWorkout',
      payload: recordRequest,
      localTable: 'workout_records',
      localId: result.workoutRecord.id,
    })
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

    expect(db.tables.workouts.has('workout_delete')).toBe(false)
    expect(db.tables.workout_records.has('record_delete')).toBe(false)
    expect(syncEngine.enqueue).toHaveBeenNthCalledWith(1, {
      apiMethod: 'deleteWorkout',
      payload: ['workout_delete'],
    })
    expect(syncEngine.enqueue).toHaveBeenNthCalledWith(2, {
      apiMethod: 'deleteWorkoutRecord',
      payload: ['record_delete'],
    })
  })
})
