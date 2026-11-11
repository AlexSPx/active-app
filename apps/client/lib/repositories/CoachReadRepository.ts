import { z } from 'zod'
import type { SQLiteDatabase } from 'expo-sqlite'
import type { CoachToolArguments, CoachToolResults } from '../../features/coach/tools/contracts'
import { calculateHistoryMetrics } from '../../features/coach/historyMetrics'

const templateSchema = z.object({
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().min(1),
        reps: z.array(z.number()).optional().nullable(),
        weight: z.array(z.number()).optional().nullable(),
        durationSeconds: z.array(z.number()).optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .default([]),
})
type WorkoutRow = {
  id: string
  title: string
  notes: string | null
  workout_template: string | null
}

const recordExerciseSchema = z.object({
  exerciseId: z.string().min(1).optional().nullable(),
  exerciseName: z.string().trim().min(1),
  reps: z.array(z.number()).default([]),
  weight: z.array(z.number()).default([]),
  durationSeconds: z.array(z.number()).optional().nullable(),
})
type RecordRow = {
  id: string
  workout_id: string | null
  start_time: string | null
  created_at: string
  exercise_records: string | null
}

export class CoachReadRepository {
  private metricSequence = 0

  constructor(private readonly db: SQLiteDatabase) {}

  async readWorkouts(
    args: CoachToolArguments['readWorkouts']
  ): Promise<CoachToolResults['readWorkouts']> {
    const rows = await this.db.getAllAsync<Pick<WorkoutRow, 'id' | 'title'>>(
      'SELECT id, title FROM workouts WHERE is_deleted = 0 ORDER BY id'
    )
    const query = args.query?.toLowerCase()
    const matches = rows.filter(
      (row) => row.title.trim() && (!query || row.title.toLowerCase().includes(query))
    )
    const start = args.cursor ? matches.findIndex((row) => row.id === args.cursor) + 1 : 0
    if (args.cursor && start === 0)
      return { kind: 'error', code: 'invalid_arguments', message: 'Unknown workout cursor.' }
    const items = matches.slice(start, start + args.limit)
    return {
      kind: 'success',
      data: {
        items,
        nextCursor: start + items.length < matches.length ? items[items.length - 1].id : null,
      },
    }
  }

  async readWorkout(
    args: CoachToolArguments['readWorkout']
  ): Promise<CoachToolResults['readWorkout']> {
    const row = await this.db.getFirstAsync<WorkoutRow>(
      'SELECT id, title, notes, workout_template FROM workouts WHERE id = ? AND is_deleted = 0',
      args.id
    )
    if (!row) return { kind: 'error', code: 'not_found', message: 'Workout not found.' }
    let raw: unknown
    try {
      raw = JSON.parse(row.workout_template ?? '')
    } catch {
      return { kind: 'error', code: 'unavailable', message: 'Workout template is unreadable.' }
    }
    const template = templateSchema.safeParse(raw)
    if (!template.success || !row.title.trim())
      return { kind: 'error', code: 'unavailable', message: 'Workout template is unreadable.' }
    return {
      kind: 'success',
      data: {
        id: row.id,
        title: row.title,
        notes: row.notes?.trim() || null,
        exercises: template.data.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          repetitions: exercise.reps ?? null,
          weightsKg: exercise.weight ?? null,
          durationSeconds: exercise.durationSeconds ?? null,
          notes: exercise.notes?.trim() || null,
        })),
      },
    }
  }
  private async records(
    args: CoachToolArguments['readRecords'] | CoachToolArguments['readTrainingSummary']
  ) {
    if (Date.parse(args.interval.end) - Date.parse(args.interval.start) > 366 * 86400000) {
      return {
        kind: 'error' as const,
        code: 'scope_exceeded' as const,
        message: 'The requested interval exceeds one year.',
      }
    }
    const rows = await this.db.getAllAsync<RecordRow>(
      'SELECT id, workout_id, start_time, created_at, exercise_records FROM workout_records WHERE is_deleted = 0 ORDER BY id'
    )
    const items: Array<{
      id: string
      workoutId: string | null
      startedAt: string | null
      createdAt: string
      exercises: Array<{
        exerciseId: string | null
        name: string
        repetitions: number[]
        weightsKg: number[]
        durationSeconds: number[] | null
      }>
    }> = []
    let omitted = 0
    let unknownFilteredEntries = 0
    for (const row of rows) {
      if (args.workoutId && row.workout_id !== args.workoutId) continue
      const absolute = (value: string | null) =>
        value && /(?:Z|[+-]\d\d:\d\d)$/i.test(value) && Number.isFinite(Date.parse(value))
          ? new Date(value).toISOString()
          : null
      const createdAt = absolute(row.created_at)
      const startedAt = absolute(row.start_time)
      const timestamp = startedAt ?? (!row.start_time ? createdAt : null)
      if (!createdAt || !timestamp) {
        omitted++
        continue
      }
      if (
        Date.parse(timestamp) < Date.parse(args.interval.start) ||
        Date.parse(timestamp) >= Date.parse(args.interval.end)
      )
        continue
      let raw: unknown
      try {
        raw = JSON.parse(row.exercise_records ?? '')
      } catch {
        omitted++
        continue
      }
      const parsed = z.array(recordExerciseSchema).safeParse(raw)
      if (!parsed.success) {
        omitted++
        continue
      }
      if (args.exerciseId)
        unknownFilteredEntries += parsed.data.filter((exercise) => !exercise.exerciseId).length
      const exercises = parsed.data
        .filter((exercise) => !args.exerciseId || exercise.exerciseId === args.exerciseId)
        .map((exercise) => ({
          exerciseId: exercise.exerciseId ?? null,
          name: exercise.exerciseName,
          repetitions: exercise.reps,
          weightsKg: exercise.weight,
          durationSeconds: exercise.durationSeconds ?? null,
        }))
      if (args.exerciseId && !exercises.length) continue
      items.push({ id: row.id, workoutId: row.workout_id, startedAt, createdAt, exercises })
    }
    const limitations = [
      'Local history may be incomplete; server history and older records may be absent.',
    ]
    if (omitted)
      limitations.push(
        `${omitted} local record(s) had unreadable data or ambiguous timestamps and were omitted.`
      )
    if (unknownFilteredEntries)
      limitations.push(
        `${unknownFilteredEntries} exercise entry/entries had no identity and may match the exercise filter; filtered metrics may be incomplete.`
      )
    return {
      kind: 'success' as const,
      items,
      unknownFilteredEntries,
      coverage: { queriedInterval: args.interval, localHistoryComplete: false, limitations },
    }
  }

  async readRecords(
    args: CoachToolArguments['readRecords']
  ): Promise<CoachToolResults['readRecords']> {
    const result = await this.records(args)
    if (result.kind === 'error') return result
    const start = args.cursor ? result.items.findIndex((item) => item.id === args.cursor) + 1 : 0
    if (args.cursor && start === 0)
      return { kind: 'error', code: 'invalid_arguments', message: 'Unknown record cursor.' }
    const items = result.items.slice(start, start + args.limit)
    return {
      kind: 'success',
      data: {
        items,
        nextCursor: start + items.length < result.items.length ? items[items.length - 1].id : null,
        coverage: result.coverage,
      },
    }
  }

  async readTrainingSummary(
    args: CoachToolArguments['readTrainingSummary']
  ): Promise<CoachToolResults['readTrainingSummary']> {
    const result = await this.records(args)
    if (result.kind === 'error') return result
    const calculated = calculateHistoryMetrics(result.items)
    const sequence = ++this.metricSequence
    const metrics = args.metrics.map((kind, index) => ({
      id: `metric:${sequence}:${index}:${kind}`,
      kind,
      value:
        kind === 'completed_sessions'
          ? calculated.completedSessions
          : kind === 'exercise_exposures'
            ? Object.values(calculated.exerciseExposures).reduce((sum, count) => sum + count, 0)
            : kind === 'recorded_repetitions'
              ? calculated.repetitions
              : kind === 'timed_duration_seconds'
                ? calculated.durationSeconds
                : kind === 'external_load_volume_kg'
                  ? calculated.externalLoadVolumeKg
                  : calculated.bestSets,
      evidenceIds: result.items.map((item) => item.id),
      ...(kind === 'exercise_exposures'
        ? { definition: 'Identified exercise entries, including repeated entries in one session.' }
        : {}),
      missingDataCount:
        kind === 'exercise_exposures'
          ? calculated.missingIdentities + result.unknownFilteredEntries
          : kind === 'recorded_repetitions'
            ? calculated.invalidRepetitions
            : kind === 'timed_duration_seconds'
              ? calculated.invalidDurations
              : kind === 'external_load_volume_kg' || kind === 'best_recorded_sets'
                ? calculated.invalidRepetitions +
                  calculated.invalidLoads +
                  calculated.missingWeights
                : 0,
    }))
    return { kind: 'success', data: { metrics, coverage: result.coverage } }
  }
}
