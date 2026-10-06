import type { WorkoutRecord } from '../../../types/api'
import { parseServerUtcDate } from '../../../utils/date'

export function recordDurationSeconds(record: WorkoutRecord): number {
  const recordedDuration = record.exerciseRecords.reduce(
    (sum, exercise) => sum + (exercise.durationSeconds?.reduce((a, b) => a + (b || 0), 0) ?? 0),
    0
  )
  if (recordedDuration || !record.startTime) return recordedDuration

  // Legacy startTime values without a timezone were saved as local datetimes.
  // Keep the earlier positive elapsed time for legacy createdAt values too.
  const start = new Date(record.startTime).getTime()
  const diffs = [
    parseServerUtcDate(record.createdAt).getTime() - start,
    new Date(record.createdAt).getTime() - start,
  ]
  const positives = diffs.filter((diff) => diff >= 0)
  return Math.max(
    0,
    Math.floor((positives.length ? Math.min(...positives) : Math.max(...diffs)) / 1000)
  )
}
