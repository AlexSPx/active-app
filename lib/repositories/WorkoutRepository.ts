/**
 * WorkoutRepository - Centralized data access for workouts & workout records.
 *
 * All reads come from local SQLite.
 * All writes go to local SQLite first, then to the sync queue.
 */
import { BaseRepository } from './BaseRepository'
import type {
  ApiWorkout,
  ApiWorkoutTemplate,
  CreateWorkoutRequest,
  UpdateWorkoutRequest,
  WorkoutRecord,
  WorkoutRecordExercise,
  WorkoutRecordRequest,
  WorkoutRecordResponse,
} from '../../types/api'

// ---------------------------------------------------------------------------
// Internal SQLite row shapes
// ---------------------------------------------------------------------------

interface WorkoutRow {
  id: string
  title: string
  notes: string | null
  created_at: string
  updated_at: string | null
  workout_template: string | null
  is_synced: number
  synced_at: string | null
}

interface WorkoutRecordRow {
  id: string
  workout_id: string
  workout_title: string
  notes: string | null
  created_at: string
  start_time: string | null
  exercise_records: string | null
  is_synced: number
  synced_at: string | null
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class WorkoutRepository extends BaseRepository {
  // -------------------------------------------------------------------------
  // Workouts — Reads
  // -------------------------------------------------------------------------

  async getAll(): Promise<ApiWorkout[]> {
    const rows = await this.queryAll<WorkoutRow>('SELECT * FROM workouts ORDER BY created_at DESC')
    return rows.map(this.rowToWorkout)
  }

  async getById(id: string): Promise<ApiWorkout | null> {
    const row = await this.queryFirst<WorkoutRow>('SELECT * FROM workouts WHERE id = ?', id)
    return row ? this.rowToWorkout(row) : null
  }

  // -------------------------------------------------------------------------
  // Workouts — Writes
  // -------------------------------------------------------------------------

  async create(workout: CreateWorkoutRequest): Promise<ApiWorkout> {
    const localId = this.generateLocalId()
    const now = new Date().toISOString()

    const templatePayload: ApiWorkoutTemplate = {
      id: localId,
      exercises: (workout.template?.exercises || []).map((ex) => ({
        exerciseId: ex.exerciseId,
        exerciseTitle: ex.exerciseId.replace(/_/g, ' '),
        reps: ex.reps || [],
        weight: ex.weight || [],
        durationSeconds: ex.durationSeconds || null,
        category: 'STRENGTH' as const, // Default; server will resolve canonical value
        primaryMuscles: [],
        secondaryMuscles: [],
      })),
      createdAt: now,
      updatedAt: now,
    }

    await this.run(
      `INSERT INTO workouts (id, title, notes, created_at, updated_at, workout_template, is_synced)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      localId,
      workout.title || '',
      workout.notes || null,
      now,
      now,
      JSON.stringify(templatePayload),
      0
    )

    await this.enqueueSync({
      apiMethod: 'createWorkout',
      payload: workout,
      localTable: 'workouts',
      localId,
    })

    return this.rowToWorkout({
      id: localId,
      title: workout.title || '',
      notes: workout.notes || null,
      created_at: now,
      updated_at: now,
      workout_template: JSON.stringify(templatePayload),
      is_synced: 0,
      synced_at: null,
    })
  }

  async update(workoutId: string, payload: UpdateWorkoutRequest): Promise<void> {
    const sets: string[] = []
    const vals: any[] = []

    if (payload.title) {
      sets.push('title = ?')
      vals.push(payload.title)
    }
    if (payload.notes !== undefined) {
      sets.push('notes = ?')
      vals.push(payload.notes || null)
    }
    if (payload.template) {
      sets.push('workout_template = ?')
      vals.push(JSON.stringify(payload.template))
    }

    sets.push('is_synced = ?')
    vals.push(0)
    sets.push('updated_at = ?')
    vals.push(new Date().toISOString())
    vals.push(workoutId) // for WHERE clause

    if (sets.length > 2) {
      // More than just is_synced + updated_at
      await this.run(`UPDATE workouts SET ${sets.join(', ')} WHERE id = ?`, ...vals)
    }

    await this.enqueueSync({
      apiMethod: 'updateWorkout',
      payload: [workoutId, payload],
    })
  }

  async delete(id: string): Promise<void> {
    await this.run('DELETE FROM workouts WHERE id = ?', id)

    await this.enqueueSync({
      apiMethod: 'deleteWorkout',
      payload: [id],
    })
  }

  // -------------------------------------------------------------------------
  // Workout Records — Reads
  // -------------------------------------------------------------------------

  async getAllRecords(): Promise<WorkoutRecord[]> {
    const rows = await this.queryAll<WorkoutRecordRow>(
      'SELECT * FROM workout_records ORDER BY created_at DESC'
    )
    return rows.map(this.rowToRecord)
  }

  // -------------------------------------------------------------------------
  // Workout Records — Writes
  // -------------------------------------------------------------------------

  /**
   * Record a completed workout. Saves locally first, then queues for server sync.
   * Returns a WorkoutRecordResponse-shaped object for the UI (congrats screen, etc).
   */
  async recordWorkout(
    request: WorkoutRecordRequest,
    workoutTitle: string
  ): Promise<WorkoutRecordResponse> {
    const localId = this.generateLocalId()
    const now = new Date().toISOString()

    // Build the exercise records array for local storage
    const exerciseRecords: WorkoutRecordExercise[] = request.exerciseRecords.map((er) => ({
      exerciseName: er.exerciseId,
      reps: er.reps,
      weight: er.weight,
      durationSeconds: er.durationSeconds || null,
      notes: er.notes || null,
    }))

    await this.run(
      `INSERT INTO workout_records (id, workout_id, workout_title, notes, created_at, start_time, exercise_records, is_synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      localId,
      request.workoutId,
      workoutTitle,
      request.notes || null,
      now,
      request.startTime || null,
      JSON.stringify(exerciseRecords),
      0
    )

    await this.enqueueSync({
      apiMethod: 'recordWorkout',
      payload: request,
      localTable: 'workout_records',
      localId,
    })

    // Return a local-shaped response for the UI
    const localRecord: WorkoutRecord = {
      id: localId,
      workoutId: request.workoutId,
      workoutTitle,
      notes: request.notes || null,
      createdAt: now,
      startTime: request.startTime,
      exerciseRecords,
    }

    return {
      workoutRecord: localRecord,
      streakUpdate: {
        status: 'CONTINUED',
        currentStreak: 0,
        longestStreak: 0,
        nextWorkoutId: null,
        nextWorkoutDeadline: null,
        streakFreezeCount: 0,
      },
    }
  }

  async deleteRecord(id: string): Promise<void> {
    await this.run('DELETE FROM workout_records WHERE id = ?', id)

    await this.enqueueSync({
      apiMethod: 'deleteWorkoutRecord',
      payload: [id],
    })
  }

  // -------------------------------------------------------------------------
  // Server Hydration
  // -------------------------------------------------------------------------

  /**
   * UPSERT server data into local SQLite.
   * Called after successful sync or on initial app load when online.
   */
  async hydrateWorkouts(serverWorkouts: ApiWorkout[]): Promise<void> {
    for (const w of serverWorkouts) {
      await this.run(
        `INSERT INTO workouts (id, title, notes, created_at, updated_at, workout_template, is_synced, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           notes = excluded.notes,
           updated_at = excluded.updated_at,
           workout_template = excluded.workout_template,
           is_synced = 1,
           synced_at = excluded.synced_at`,
        w.id,
        w.title,
        w.notes || null,
        w.createdAt,
        w.updatedAt,
        JSON.stringify(w.workoutTemplate),
        new Date().toISOString()
      )
    }
  }

  async hydrateRecords(serverRecords: WorkoutRecord[]): Promise<void> {
    for (const r of serverRecords) {
      await this.run(
        `INSERT INTO workout_records (id, workout_id, workout_title, notes, created_at, start_time, exercise_records, is_synced, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET
           workout_title = excluded.workout_title,
           notes = excluded.notes,
           exercise_records = excluded.exercise_records,
           is_synced = 1,
           synced_at = excluded.synced_at`,
        r.id,
        r.workoutId,
        r.workoutTitle,
        r.notes || null,
        r.createdAt,
        r.startTime || null,
        JSON.stringify(r.exerciseRecords),
        new Date().toISOString()
      )
    }
  }

  // -------------------------------------------------------------------------
  // Row Mappers
  // -------------------------------------------------------------------------

  private rowToWorkout = (row: WorkoutRow): ApiWorkout => {
    let template: ApiWorkoutTemplate
    try {
      template = JSON.parse(row.workout_template || '{}')
    } catch {
      template = { id: row.id, exercises: [], createdAt: row.created_at, updatedAt: row.created_at }
    }

    template = {
      ...template,
      exercises: (template.exercises || []).map((exercise) => ({
        ...exercise,
        exerciseTitle: exercise.exerciseTitle?.trim() || exercise.exerciseId.replace(/_/g, ' '),
      })),
    }

    return {
      id: row.id,
      title: row.title,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
      workoutTemplate: template,
    }
  }

  private rowToRecord = (row: WorkoutRecordRow): WorkoutRecord => {
    let exerciseRecords: WorkoutRecordExercise[] = []
    try {
      exerciseRecords = JSON.parse(row.exercise_records || '[]')
    } catch {
      exerciseRecords = []
    }

    return {
      id: row.id,
      workoutId: row.workout_id,
      workoutTitle: row.workout_title,
      notes: row.notes,
      createdAt: row.created_at,
      startTime: row.start_time || undefined,
      exerciseRecords,
    }
  }
}
