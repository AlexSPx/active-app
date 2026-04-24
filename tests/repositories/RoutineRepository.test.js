jest.mock('../../lib/sync', () => ({
  syncEngine: {
    enqueue: jest.fn(async () => undefined),
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
    db = new FakeDb()
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

    expect(syncEngine.enqueue).toHaveBeenCalledWith({
      apiMethod: 'createRoutine',
      payload,
      localTable: 'routines',
      localId: created.id,
    })
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

    expect(syncEngine.enqueue).toHaveBeenCalledWith({
      apiMethod: 'updateRoutine',
      payload: ['routine_1', updatePayload],
    })
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

    expect(db.tables.routines.has('routine_delete')).toBe(false)
    expect(syncEngine.enqueue).toHaveBeenCalledWith({
      apiMethod: 'deleteRoutine',
      payload: ['routine_delete'],
    })
  })
})
