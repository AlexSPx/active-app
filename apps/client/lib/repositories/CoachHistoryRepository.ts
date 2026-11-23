import type { SQLiteDatabase } from 'expo-sqlite'
import { z } from 'zod'

const exerciseRecordsSchema = z.array(
  z.object({
    exerciseId: z.string().trim().max(200).optional().nullable(),
    exerciseName: z.string().trim().min(1).max(500),
    reps: z.array(z.number()).default([]),
    weight: z.array(z.number()).default([]),
    durationSeconds: z.array(z.number()).optional().nullable(),
  })
)

type HistoryExercise = {
  exerciseId: string | null
  name: string
  repetitions: number[]
  weightsKg: number[]
  durationSeconds: number[] | null
}

type HistoryRecord = {
  id: string
  timestamp: number
  exercises: HistoryExercise[]
}

type HistoryInterval = { start: string; end: string }

type HistoryNameSuggestion = (exercise: Pick<HistoryExercise, 'name' | 'exerciseId'>) => boolean

export type HistoryExerciseFilter =
  | { kind: 'ambiguous'; suggest?: HistoryNameSuggestion }
  | {
      kind: 'catalog' | 'custom'
      suggest?: HistoryNameSuggestion
      match: (exercise: Pick<HistoryExercise, 'name' | 'exerciseId'>) => 'match' | 'conflict' | null
    }

type HistoryReadResult =
  | { kind: 'success'; records: HistoryRecord[]; limitations: string[] }
  | { kind: 'ambiguous' | 'unidentified'; limitations: string[]; suggestions?: string[] }

type RecordRow = {
  id: string | null
  start_time: string | null
  created_at: string | null
  exercise_records: string | null
}

function absoluteTimestamp(value: string | null) {
  return value && /(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? Date.parse(value) : NaN
}

export class CoachHistoryRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async readHistory({
    interval,
    exercise,
  }: {
    interval: HistoryInterval
    exercise: HistoryExerciseFilter | null
  }): Promise<HistoryReadResult> {
    const start = absoluteTimestamp(interval.start)
    const end = absoluteTimestamp(interval.end)
    if (!(start < end) || end - start > 366 * 86400000) {
      throw new Error('Invalid history interval.')
    }
    const rows = await this.db.getAllAsync<RecordRow>(
      'SELECT id, start_time, created_at, exercise_records FROM workout_records WHERE is_deleted = 0 ORDER BY id'
    )
    const records: HistoryRecord[] = []
    const matchingIds = new Set<string>()
    const suggestedNames = new Set<string>()
    let unresolvedIdentity = false
    let unidentifiedEntries = 0
    let omitted = 0
    for (const row of rows) {
      const createdAt = absoluteTimestamp(row.created_at)
      const timestamp = row.start_time ? absoluteTimestamp(row.start_time) : createdAt
      if (!Number.isFinite(createdAt) || !Number.isFinite(timestamp)) {
        omitted++
        continue
      }
      if (timestamp < start || timestamp >= end) continue
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      let raw: unknown
      try {
        raw = JSON.parse(row.exercise_records ?? '')
      } catch {
        omitted++
        continue
      }
      const parsed = exerciseRecordsSchema.safeParse(raw)
      if (!parsed.success || !id || id.length > 200) {
        omitted++
        continue
      }
      const exercises = parsed.data.map((entry) => ({
        exerciseId: entry.exerciseId || null,
        name: entry.exerciseName,
        repetitions: entry.reps,
        weightsKg: entry.weight,
        durationSeconds: entry.durationSeconds ?? null,
      }))
      if (exercise) {
        for (const entry of exercises) {
          if (entry.exerciseId && entry.name.length <= 120 && suggestedNames.size < 5 && exercise.suggest?.(entry)) suggestedNames.add(entry.name)
          if (exercise.kind === 'ambiguous') continue
          if (!entry.exerciseId) unidentifiedEntries++
          const match = exercise.match(entry)
          if (!match) continue
          if (match === 'match' && entry.exerciseId) matchingIds.add(entry.exerciseId)
          else unresolvedIdentity = true
        }
      }
      records.push({ id, timestamp, exercises })
    }

    const limitations = [
      'Local history may be incomplete; server history and older records may be absent.',
    ]
    if (omitted) {
      limitations.push(
        `${omitted} local record(s) had unreadable data or ambiguous timestamps and were omitted.`
      )
    }
    if (unidentifiedEntries) {
      limitations.push(
        `${unidentifiedEntries} exercise entry/entries had no identity and may match the exercise filter; filtered metrics may be incomplete.`
      )
    }
    if (!exercise) return { kind: 'success', records, limitations }
    const suggestions = suggestedNames.size ? { suggestions: [...suggestedNames] } : {}
    if (exercise.kind === 'ambiguous') return { kind: 'unidentified', limitations, ...suggestions }
    if (unresolvedIdentity || matchingIds.size > 1) {
      return { kind: 'ambiguous', limitations, ...suggestions }
    }
    const [exerciseId] = matchingIds
    if (!exerciseId) {
      return exercise.kind === 'custom'
        ? { kind: 'unidentified', limitations, ...suggestions }
        : { kind: 'success', records: [], limitations }
    }
    const matchingRecords = records.flatMap((record) => {
      const exercises = record.exercises.filter((entry) => entry.exerciseId === exerciseId)
      return exercises.length ? [{ ...record, exercises }] : []
    })
    return { kind: 'success', records: matchingRecords, limitations }
  }
}
