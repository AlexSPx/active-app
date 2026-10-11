/**
 * WorkoutRepository - Centralized data access for workouts & workout records.
 *
 * All reads come from local SQLite.
 * All writes go to local SQLite first, then to the sync queue.
 */
import { BaseRepository } from './BaseRepository'
import { syncEngine } from '../sync'
import type {
  ApiExercise,
  ApiWorkout,
  ApiWorkoutTemplate,
  CreateWorkoutRequest,
  TemplateExercise,
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
  workout_id: string | null
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
    const rows = await this.queryAll<WorkoutRow>(
      'SELECT * FROM workouts WHERE is_deleted = 0 ORDER BY created_at DESC'
    )
    return rows.map(this.rowToWorkout)
  }

  async getById(id: string): Promise<ApiWorkout | null> {
    const row = await this.queryFirst<WorkoutRow>(
      'SELECT * FROM workouts WHERE id = ? AND is_deleted = 0',
      id
    )
    return row ? this.rowToWorkout(row) : null
  }

  // -------------------------------------------------------------------------
  // Workouts — Writes
  // -------------------------------------------------------------------------

  async create(
    workout: CreateWorkoutRequest,
    selectedExercises: ApiExercise[]
  ): Promise<ApiWorkout> {
    const localId = this.generateLocalId()
    const now = new Date().toISOString()

    const templatePayload: ApiWorkoutTemplate = {
      id: localId,
      exercises: this.withExerciseMetadata(workout.template.exercises, selectedExercises),
      createdAt: now,
      updatedAt: now,
    }

    return this.commitMutation(async (tx) => {
      await tx.runAsync(
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

      return {
        value: this.rowToWorkout({
          id: localId,
          title: workout.title || '',
          notes: workout.notes || null,
          created_at: now,
          updated_at: now,
          workout_template: JSON.stringify(templatePayload),
          is_synced: 0,
          synced_at: null,
        }),
        job: {
          apiMethod: 'createWorkout',
          payload: workout,
          localTable: 'workouts',
          localId,
        },
      }
    })
  }

  async update(
    workoutId: string,
    payload: UpdateWorkoutRequest,
    selectedExercises: ApiExercise[]
  ): Promise<void> {
    return this.commitMutation(async (tx) => {
      const resolvedWorkoutId = syncEngine.resolveId('workouts', workoutId)
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
        const row = await tx.getFirstAsync<WorkoutRow>(
          'SELECT * FROM workouts WHERE id = ?',
          resolvedWorkoutId
        )
        const current = row ? this.rowToWorkout(row) : null
        const now = new Date().toISOString()
        sets.push('workout_template = ?')
        vals.push(
          JSON.stringify({
            id: current?.workoutTemplate.id || resolvedWorkoutId,
            exercises: this.withExerciseMetadata(payload.template.exercises, selectedExercises),
            createdAt: current?.workoutTemplate.createdAt || now,
            updatedAt: now,
          })
        )
      }

      sets.push('is_synced = ?')
      vals.push(0)
      sets.push('updated_at = ?')
      vals.push(new Date().toISOString())
      vals.push(resolvedWorkoutId) // for WHERE clause

      if (sets.length > 2) {
        // More than just is_synced + updated_at
        await tx.runAsync(`UPDATE workouts SET ${sets.join(', ')} WHERE id = ?`, ...vals)
      }

      return {
        value: undefined,
        job: {
          apiMethod: 'updateWorkout',
          payload: [resolvedWorkoutId, payload],
        },
      }
    })
  }

  async delete(id: string): Promise<void> {
    return this.commitMutation(async (tx) => {
      const resolvedId = syncEngine.resolveId('workouts', id)
      await tx.runAsync('UPDATE workouts SET is_deleted = 1 WHERE id = ?', resolvedId)
      const routines = await tx.getAllAsync<{ id: string; pattern: string | null }>(
        'SELECT id, pattern FROM routines WHERE is_deleted = 0'
      )
      for (const routine of routines) {
        if (!routine.pattern) continue
        let pattern: { workoutId: string | null }[]
        try {
          pattern = JSON.parse(routine.pattern)
        } catch {
          continue
        }
        if (!pattern.some((day) => day.workoutId === resolvedId)) continue
        await tx.runAsync(
          'UPDATE routines SET pattern = ? WHERE id = ?',
          JSON.stringify(
            pattern.map((day) => (day.workoutId === resolvedId ? { ...day, workoutId: null } : day))
          ),
          routine.id
        )
      }

      return {
        value: undefined,
        job: {
          apiMethod: 'deleteWorkout',
          payload: [resolvedId],
        },
      }
    })
  }

  // -------------------------------------------------------------------------
  // Workout Records — Reads
  // -------------------------------------------------------------------------

  async getAllRecords(): Promise<WorkoutRecord[]> {
    const rows = await this.queryAll<WorkoutRecordRow>(
      'SELECT * FROM workout_records WHERE is_deleted = 0 ORDER BY created_at DESC'
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
    return this.commitMutation(async (tx) => {
      const recordRequest = {
        ...request,
        workoutId: syncEngine.resolveId('workouts', request.workoutId),
      }
      const workout = await tx.getFirstAsync<{
        is_deleted: number
        workout_template: string | null
      }>('SELECT is_deleted, workout_template FROM workouts WHERE id = ?', recordRequest.workoutId)
      if (!workout || workout.is_deleted) throw new Error('Cannot record a deleted workout')
      let exercises: ApiWorkoutTemplate['exercises'] = []
      try {
        exercises = JSON.parse(workout.workout_template || '{}').exercises || []
      } catch {
        // Legacy records can have malformed templates; the exercise ID remains a useful label.
      }
      const localId = this.generateLocalId()
      const now = new Date().toISOString()

      // Build the exercise records array for local storage
      const exerciseRecords: WorkoutRecordExercise[] = recordRequest.exerciseRecords.map((er) => ({
        exerciseName:
          exercises.find((exercise) => exercise.exerciseId === er.exerciseId)?.exerciseTitle ||
          er.exerciseId,
        reps: er.reps,
        weight: er.weight,
        durationSeconds: er.durationSeconds || null,
        notes: er.notes || null,
      }))

      await tx.runAsync(
        `INSERT INTO workout_records (id, workout_id, workout_title, notes, created_at, start_time, exercise_records, is_synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        localId,
        recordRequest.workoutId,
        workoutTitle,
        request.notes || null,
        now,
        request.startTime || null,
        JSON.stringify(exerciseRecords),
        0
      )

      // Return a local-shaped response for the UI
      const localRecord: WorkoutRecord = {
        id: localId,
        workoutId: recordRequest.workoutId,
        workoutTitle,
        notes: request.notes || null,
        createdAt: now,
        startTime: request.startTime,
        exerciseRecords,
      }

      return {
        value: {
          workoutRecord: localRecord,
          streakUpdate: {
            status: 'CONTINUED',
            currentStreak: 0,
            longestStreak: 0,
            nextWorkoutId: null,
            nextWorkoutDeadline: null,
            streakFreezeCount: 0,
          },
        },
        job: {
          apiMethod: 'recordWorkout',
          payload: recordRequest,
          localTable: 'workout_records',
          localId,
        },
      }
    })
  }

  async deleteRecord(id: string): Promise<void> {
    return this.commitMutation(async (tx) => {
      const resolvedId = syncEngine.resolveId('workout_records', id)
      await tx.runAsync('UPDATE workout_records SET is_deleted = 1 WHERE id = ?', resolvedId)

      return {
        value: undefined,
        job: {
          apiMethod: 'deleteWorkoutRecord',
          payload: [resolvedId],
        },
      }
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
         SELECT ?, ?, ?, ?, ?, ?, 1, ? WHERE NOT EXISTS
           (SELECT 1 FROM workouts WHERE id = ? AND is_deleted = 1)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           notes = excluded.notes,
           updated_at = excluded.updated_at,
           workout_template = excluded.workout_template,
           is_synced = 1,
           synced_at = excluded.synced_at WHERE workouts.is_deleted = 0`,
        w.id,
        w.title,
        w.notes || null,
        w.createdAt,
        w.updatedAt,
        JSON.stringify(w.workoutTemplate),
        new Date().toISOString(),
        w.id
      )
    }
  }

  async hydrateRecords(serverRecords: WorkoutRecord[]): Promise<void> {
    for (const r of serverRecords) {
      await this.run(
        `INSERT INTO workout_records (id, workout_id, workout_title, notes, created_at, start_time, exercise_records, is_synced, synced_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, 1, ? WHERE NOT EXISTS
           (SELECT 1 FROM workout_records WHERE id = ? AND is_deleted = 1)
         ON CONFLICT(id) DO UPDATE SET
           workout_id = excluded.workout_id,
           workout_title = excluded.workout_title,
           notes = excluded.notes,
           exercise_records = excluded.exercise_records,
           is_synced = 1,
           synced_at = excluded.synced_at WHERE workout_records.is_deleted = 0`,
        r.id,
        r.workoutId,
        r.workoutTitle,
        r.notes || null,
        r.createdAt,
        r.startTime || null,
        JSON.stringify(r.exerciseRecords),
        new Date().toISOString(),
        r.id
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

  private withExerciseMetadata(
    templateExercises: TemplateExercise[],
    selectedExercises: ApiExercise[]
  ): ApiWorkoutTemplate['exercises'] {
    const exercisesById = new Map(selectedExercises.map((exercise) => [exercise.id, exercise]))
    return templateExercises.map((exercise) => {
      const details = exercisesById.get(exercise.exerciseId)
      if (!details) throw new Error(`Missing selected exercise: ${exercise.exerciseId}`)

      return {
        exerciseId: exercise.exerciseId,
        exerciseTitle: details.name,
        reps: exercise.reps || [],
        weight: exercise.weight || [],
        durationSeconds: exercise.durationSeconds || null,
        category: details.category,
        primaryMuscles: details.primaryMuscles,
        secondaryMuscles: details.secondaryMuscles,
      }
    })
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
