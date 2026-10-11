jest.mock('../../lib/sync', () => ({
  syncEngine: {
    enqueue: jest.fn(async () => undefined),
    scheduleQueueProcessing: jest.fn(),
    withIdRemapLock: jest.fn((operation) => operation()),
    resolveId: jest.fn((_table, id) => id),
  },
}))

const { syncEngine } = require('../../lib/sync')
const { RoutineRepository } = require('../../lib/repositories/RoutineRepository')
const { FakeDb } = require('../helpers/syncTestUtils')

describe('RoutineRepository', () => {
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
    repo = new RoutineRepository(db)
  })

  it('creates a local routine row and enqueues createRoutine', async () => {
    const payload = {
      name: 'Week A',
      description: 'Base block',
      routineType: 'SEQUENTIAL',
      startDate: '2026-04-24',
      active: true,
      pattern: [
        { dayIndex: 0, dayType: 'WORKOUT', workoutId: 'workout_1' },
        { dayIndex: 1, dayType: 'REST', workoutId: null },
      ],
    }

    const created = await repo.create(payload)

    expect(created.id).toMatch(/^local_/)
    expect(created.name).toBe('Week A')
    expect(created.pattern).toEqual(payload.pattern)

    const rows = db.getTableRows('routines')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: created.id,
      name: 'Week A',
      description: 'Base block',
      routine_type: 'SEQUENTIAL',
      start_date: '2026-04-24',
      is_active: 1,
      is_synced: 0,
    })

    expect(syncEngine.enqueue).toHaveBeenCalledWith(
      {
        apiMethod: 'createRoutine',
        payload,
        localTable: 'routines',
        localId: created.id,
      },
      db,
      { processAfterInsert: false }
    )
    expect(syncEngine.scheduleQueueProcessing).toHaveBeenCalledTimes(1)
  })

  it('resolves workout IDs when an open routine form saves after sync remaps them', async () => {
    syncEngine.resolveId.mockImplementation((_table, id) =>
      id === 'local_workout_open_form' ? 'server_workout_open_form' : id
    )
    const pattern = [{ dayIndex: 1, dayType: 'WORKOUT', workoutId: 'local_workout_open_form' }]

    const created = await repo.create({ name: 'Routine', pattern })
    await repo.update(created.id, { pattern })

    expect(JSON.parse(db.tables.routines.get(created.id).pattern)[0].workoutId).toBe(
      'server_workout_open_form'
    )
    expect(syncEngine.enqueue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiMethod: 'updateRoutine',
        payload: [
          created.id,
          { pattern: [{ ...pattern[0], workoutId: 'server_workout_open_form' }] },
        ],
      }),
      db,
      { processAfterInsert: false }
    )
    expect(syncEngine.scheduleQueueProcessing).toHaveBeenCalledTimes(2)
  })

  it('updates the local routine row and enqueues updateRoutine', async () => {
    db.tables.routines.set('routine_1', {
      id: 'routine_1',
      name: 'Old Routine',
      description: 'Old Description',
      user_id: null,
      routine_type: 'SEQUENTIAL',
      pattern: JSON.stringify([{ dayIndex: 0, dayType: 'REST', workoutId: null }]),
      start_date: '2026-04-24',
      created_at: '2026-04-24T10:00:00.000Z',
      updated_at: '2026-04-24T10:00:00.000Z',
      is_active: 0,
      is_synced: 1,
      synced_at: '2026-04-24T10:00:00.000Z',
    })

    const updatePayload = {
      name: 'Updated Routine',
      description: 'Updated Description',
      active: true,
      pattern: [{ dayIndex: 0, dayType: 'WORKOUT', workoutId: 'workout_2' }],
    }

    const updated = await repo.update('routine_1', updatePayload)

    expect(updated).toMatchObject({
      id: 'routine_1',
      name: 'Updated Routine',
      description: 'Updated Description',
      pattern: [{ dayIndex: 0, dayType: 'WORKOUT', workoutId: 'workout_2' }],
    })

    const row = db.tables.routines.get('routine_1')
    expect(row).toMatchObject({
      name: 'Updated Routine',
      description: 'Updated Description',
      is_active: 1,
      is_synced: 0,
    })
    expect(row.updated_at).not.toBe('2026-04-24T10:00:00.000Z')

    expect(syncEngine.enqueue).toHaveBeenCalledWith(
      {
        apiMethod: 'updateRoutine',
        payload: ['routine_1', updatePayload],
      },
      db,
      { processAfterInsert: false }
    )
    expect(syncEngine.scheduleQueueProcessing).toHaveBeenCalledTimes(1)
  })

  it('updates and deletes a routine whose local ID was remapped while the form was open', async () => {
    const created = await repo.create({ name: 'Routine', pattern: [] })
    const serverId = 'server_routine_open_form'
    const row = db.tables.routines.get(created.id)
    db.tables.routines.delete(created.id)
    db.tables.routines.set(serverId, { ...row, id: serverId })
    syncEngine.resolveId.mockImplementation((table, id) =>
      table === 'routines' && id === created.id ? serverId : id
    )

    await expect(repo.update(created.id, { name: 'Updated routine' })).resolves.toMatchObject({
      id: serverId,
      name: 'Updated routine',
    })
    expect(syncEngine.enqueue).toHaveBeenLastCalledWith(
      { apiMethod: 'updateRoutine', payload: [serverId, { name: 'Updated routine' }] },
      db,
      { processAfterInsert: false }
    )

    await repo.delete(created.id)

    expect(db.tables.routines.get(serverId).is_deleted).toBe(1)
    await expect(repo.getById(serverId)).resolves.toBeNull()
    expect(syncEngine.enqueue).toHaveBeenLastCalledWith(
      { apiMethod: 'deleteRoutine', payload: [serverId] },
      db,
      { processAfterInsert: false }
    )
  })

  it('deactivates other routines when activating one', async () => {
    db.tables.routines.set('routine_a', {
      id: 'routine_a',
      name: 'Routine A',
      description: null,
      user_id: null,
      routine_type: 'SEQUENTIAL',
      pattern: '[]',
      start_date: '2026-04-24',
      created_at: '2026-04-24T10:00:00.000Z',
      updated_at: '2026-04-24T10:00:00.000Z',
      is_active: 1,
      is_synced: 1,
      synced_at: null,
    })
    db.tables.routines.set('routine_b', {
      id: 'routine_b',
      name: 'Routine B',
      description: null,
      user_id: null,
      routine_type: 'SEQUENTIAL',
      pattern: '[]',
      start_date: '2026-04-25',
      created_at: '2026-04-25T10:00:00.000Z',
      updated_at: '2026-04-25T10:00:00.000Z',
      is_active: 0,
      is_synced: 1,
      synced_at: null,
    })

    await repo.update('routine_b', { active: true })

    expect(db.tables.routines.get('routine_a').is_active).toBe(0)
    expect(db.tables.routines.get('routine_b').is_active).toBe(1)
    expect(syncEngine.scheduleQueueProcessing).toHaveBeenCalledTimes(1)
  })

  it('deletes local routine rows and enqueues deleteRoutine', async () => {
    db.tables.routines.set('routine_delete', {
      id: 'routine_delete',
      name: 'Delete Me',
      description: null,
      user_id: null,
      routine_type: 'SEQUENTIAL',
      pattern: '[]',
      start_date: '2026-04-24',
      created_at: '2026-04-24T10:00:00.000Z',
      updated_at: '2026-04-24T10:00:00.000Z',
      is_active: 0,
      is_synced: 0,
      synced_at: null,
    })

    await repo.delete('routine_delete')

    expect(db.tables.routines.get('routine_delete').is_deleted).toBe(1)
    await expect(repo.getAll()).resolves.toEqual([])
    await expect(repo.getById('routine_delete')).resolves.toBeNull()
    expect(syncEngine.enqueue).toHaveBeenCalledWith(
      {
        apiMethod: 'deleteRoutine',
        payload: ['routine_delete'],
      },
      db,
      { processAfterInsert: false }
    )
    expect(syncEngine.scheduleQueueProcessing).toHaveBeenCalledTimes(1)
  })
})
