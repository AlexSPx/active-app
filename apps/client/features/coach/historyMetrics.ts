export interface CompletedExercise {
  exerciseId: string | null
  repetitions: number[]
  weightsKg: number[]
  durationSeconds: number[] | null
}
export interface CompletedRecord {
  id: string
  exercises: CompletedExercise[]
}

/** Zero weights cannot distinguish bodyweight from legacy missing data and are excluded. */
export function calculateHistoryMetrics(records: CompletedRecord[]) {
  let repetitions = 0
  let durationSeconds = 0
  let volumeKg = 0
  let missingWeights = 0
  let malformedSets = 0
  let missingIdentities = 0
  let invalidRepetitions = 0
  let invalidDurations = 0
  let invalidLoads = 0
  const exposures = new Map<string, number>()
  const bestSets: {
    exerciseId: string | null
    weightKg: number
    repetitions: number
    recordId: string
  }[] = []
  for (const record of records) {
    for (const exercise of record.exercises) {
      if (exercise.exerciseId)
        exposures.set(exercise.exerciseId, (exposures.get(exercise.exerciseId) ?? 0) + 1)
      else missingIdentities++
      for (const duration of exercise.durationSeconds ?? []) {
        if (Number.isFinite(duration) && duration > 0) durationSeconds += duration
        else {
          malformedSets++
          invalidDurations++
        }
      }
      const length = Math.max(exercise.repetitions.length, exercise.weightsKg.length)
      for (let index = 0; index < length; index++) {
        const reps = exercise.repetitions[index]
        const weight = exercise.weightsKg[index]
        if (!Number.isInteger(reps) || reps <= 0) {
          malformedSets++
          invalidRepetitions++
          continue
        }
        repetitions += reps
        if (weight === undefined || weight === 0) {
          missingWeights++
          continue
        }
        if (!Number.isFinite(weight) || weight < 0) {
          malformedSets++
          invalidLoads++
          continue
        }
        volumeKg += reps * weight
        bestSets.push({
          exerciseId: exercise.exerciseId,
          weightKg: weight,
          repetitions: reps,
          recordId: record.id,
        })
      }
    }
  }
  bestSets.sort((a, b) => b.weightKg - a.weightKg || b.repetitions - a.repetitions)
  return {
    completedSessions: records.length,
    exerciseExposures: Object.fromEntries(exposures),
    repetitions,
    durationSeconds,
    externalLoadVolumeKg: volumeKg,
    missingWeights,
    malformedSets,
    missingIdentities,
    invalidRepetitions,
    invalidDurations,
    invalidLoads,
    bestSets,
  }
}
