/**
 * RoutineRepository - Centralized data access for routines.
 *
 * All reads come from local SQLite.
 * All writes go to local SQLite first, then to the sync queue.
 */
import { BaseRepository } from './BaseRepository'
import { syncEngine } from '../sync'
import type {
  Routine,
  CreateRoutineRequest,
  UpdateRoutineRequest,
  RoutinePatternItem,
} from '../../types/routine'

// ---------------------------------------------------------------------------
// Internal SQLite row shape
// ---------------------------------------------------------------------------

interface RoutineRow {
  id: string
  name: string
  description: string | null
  user_id: string | null
  routine_type: string
  pattern: string | null
  start_date: string | null
  created_at: string | null
  updated_at: string | null
  is_active: number
  is_synced: number
  synced_at: string | null
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class RoutineRepository extends BaseRepository {
  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async getAll(): Promise<Routine[]> {
    const rows = await this.queryAll<RoutineRow>(
      'SELECT * FROM routines WHERE is_deleted = 0 ORDER BY created_at DESC'
    )
    return rows.map(this.rowToRoutine)
  }

  async getById(id: string): Promise<Routine | null> {
    const row = await this.queryFirst<RoutineRow>(
      'SELECT * FROM routines WHERE id = ? AND is_deleted = 0',
      id
    )
    return row ? this.rowToRoutine(row) : null
  }

  async getActive(): Promise<Routine | null> {
    const row = await this.queryFirst<RoutineRow>(
      'SELECT * FROM routines WHERE is_active = 1 AND is_deleted = 0 LIMIT 1'
    )
    return row ? this.rowToRoutine(row) : null
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  async create(payload: CreateRoutineRequest): Promise<Routine> {
    return this.commitMutation(async (tx) => {
      const resolvedPayload = {
        ...payload,
        pattern: this.resolvePatternWorkoutIds(payload.pattern),
      }
      const localId = this.generateLocalId()
      const now = new Date().toISOString()

      await tx.runAsync(
        `INSERT INTO routines (id, name, description, routine_type, pattern, start_date, created_at, updated_at, is_active, is_synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        localId,
        resolvedPayload.name,
        resolvedPayload.description || null,
        resolvedPayload.routineType || 'SEQUENTIAL',
        JSON.stringify(resolvedPayload.pattern),
        resolvedPayload.startDate || now,
        now,
        now,
        resolvedPayload.active ? 1 : 0,
        0
      )

      return {
        value: this.rowToRoutine({
          id: localId,
          name: resolvedPayload.name,
          description: resolvedPayload.description || null,
          user_id: null,
          routine_type: resolvedPayload.routineType || 'SEQUENTIAL',
          pattern: JSON.stringify(resolvedPayload.pattern),
          start_date: resolvedPayload.startDate || now,
          created_at: now,
          updated_at: now,
          is_active: resolvedPayload.active ? 1 : 0,
          is_synced: 0,
          synced_at: null,
        }),
        job: {
          apiMethod: 'createRoutine',
          payload: resolvedPayload,
          localTable: 'routines',
          localId,
        },
      }
    })
  }

  async update(routineId: string, payload: UpdateRoutineRequest): Promise<Routine | null> {
    return this.commitMutation(async (tx) => {
      const resolvedRoutineId = syncEngine.resolveId('routines', routineId)
      const resolvedPayload = payload.pattern
        ? {
            ...payload,
            pattern: this.resolvePatternWorkoutIds(payload.pattern),
          }
        : payload
      const sets: string[] = []
      const vals: any[] = []

      if (resolvedPayload.name !== undefined) {
        sets.push('name = ?')
        vals.push(resolvedPayload.name)
      }
      if (resolvedPayload.description !== undefined) {
        sets.push('description = ?')
        vals.push(resolvedPayload.description)
      }
      if (resolvedPayload.routineType !== undefined) {
        sets.push('routine_type = ?')
        vals.push(resolvedPayload.routineType)
      }
      if (resolvedPayload.pattern !== undefined) {
        sets.push('pattern = ?')
        vals.push(JSON.stringify(resolvedPayload.pattern))
      }
      if (resolvedPayload.startDate !== undefined) {
        sets.push('start_date = ?')
        vals.push(resolvedPayload.startDate)
      }
      if (resolvedPayload.active !== undefined) {
        // If activating this routine, first deactivate all others
        if (resolvedPayload.active) {
          await tx.runAsync('UPDATE routines SET is_active = 0')
        }
        sets.push('is_active = ?')
        vals.push(resolvedPayload.active ? 1 : 0)
      }

      sets.push('is_synced = ?')
      vals.push(0)
      sets.push('updated_at = ?')
      vals.push(new Date().toISOString())
      vals.push(resolvedRoutineId)

      await tx.runAsync(`UPDATE routines SET ${sets.join(', ')} WHERE id = ?`, ...vals)

      const row = await tx.getFirstAsync<RoutineRow>(
        'SELECT * FROM routines WHERE id = ?',
        resolvedRoutineId
      )
      return {
        value: row ? this.rowToRoutine(row) : null,
        job: {
          apiMethod: 'updateRoutine',
          payload: [resolvedRoutineId, resolvedPayload],
        },
      }
    })
  }

  async delete(routineId: string): Promise<void> {
    return this.commitMutation(async (tx) => {
      const resolvedRoutineId = syncEngine.resolveId('routines', routineId)
      await tx.runAsync(
        'UPDATE routines SET is_deleted = 1, is_active = 0 WHERE id = ?',
        resolvedRoutineId
      )

      return {
        value: undefined,
        job: {
          apiMethod: 'deleteRoutine',
          payload: [resolvedRoutineId],
        },
      }
    })
  }

  // -------------------------------------------------------------------------
  // Server Hydration
  // -------------------------------------------------------------------------

  async hydrateFromServer(
    serverRoutines: Routine[],
    activeRoutineId?: string | null
  ): Promise<void> {
    for (const r of serverRoutines) {
      const isActive = activeRoutineId ? (r.id === activeRoutineId ? 1 : 0) : 0

      await this.run(
        `INSERT INTO routines (id, name, description, user_id, routine_type, pattern, start_date, created_at, updated_at, is_active, is_synced, synced_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ? WHERE NOT EXISTS
           (SELECT 1 FROM routines WHERE id = ? AND is_deleted = 1)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           user_id = excluded.user_id,
           routine_type = excluded.routine_type,
           pattern = excluded.pattern,
           start_date = excluded.start_date,
           updated_at = excluded.updated_at,
           is_active = excluded.is_active,
           is_synced = 1,
           synced_at = excluded.synced_at WHERE routines.is_deleted = 0`,
        r.id,
        r.name,
        r.description || null,
        r.userId || null,
        r.routineType || 'SEQUENTIAL',
        JSON.stringify(r.pattern),
        r.startDate,
        r.createdAt,
        r.updatedAt,
        isActive,
        new Date().toISOString(),
        r.id
      )
    }
  }

  // -------------------------------------------------------------------------
  // Row Mapper
  // -------------------------------------------------------------------------

  private resolvePatternWorkoutIds(pattern: RoutinePatternItem[]): RoutinePatternItem[] {
    return pattern.map((item) => ({
      ...item,
      workoutId: item.workoutId ? syncEngine.resolveId('workouts', item.workoutId) : null,
    }))
  }

  private rowToRoutine = (row: RoutineRow): Routine => {
    let pattern: RoutinePatternItem[] = []
    try {
      pattern = JSON.parse(row.pattern || '[]')
    } catch {
      pattern = []
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      userId: row.user_id || '',
      routineType: (row.routine_type as Routine['routineType']) || 'SEQUENTIAL',
      pattern,
      startDate: row.start_date || '',
      createdAt: row.created_at || '',
      updatedAt: row.updated_at || '',
    }
  }
}
