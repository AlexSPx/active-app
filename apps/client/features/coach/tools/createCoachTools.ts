import type { SQLiteDatabase } from 'expo-sqlite'
import { isCurrentProfile, type ProfileScope } from '../../../lib/profileScope'
import { CoachReadRepository } from '../../../lib/repositories/CoachReadRepository'
import type { CoachToolExecutor } from '../engine'
import { readCatalog } from './catalog'

export function createCoachTools(
  database: SQLiteDatabase,
  scope: ProfileScope,
  signal: AbortSignal
): CoachToolExecutor {
  const repository = new CoachReadRepository(database)
  return async (call, turnSignal) => {
    const unavailable = () =>
      signal.aborted || turnSignal?.aborted
        ? {
            kind: 'error' as const,
            code: 'cancelled' as const,
            message: 'The request was cancelled.',
          }
        : !isCurrentProfile(scope)
          ? {
              kind: 'error' as const,
              code: 'stale_profile' as const,
              message: 'The active profile changed.',
            }
          : null
    const before = unavailable()
    if (before) return before
    const result =
      call.name === 'readExercises'
        ? readCatalog(call.arguments)
        : call.name === 'readWorkouts'
          ? await repository.readWorkouts(call.arguments)
          : call.name === 'readWorkout'
            ? await repository.readWorkout(call.arguments)
            : call.name === 'readRecords'
              ? await repository.readRecords(call.arguments)
              : call.name === 'readTrainingSummary'
                ? await repository.readTrainingSummary(call.arguments)
                : call.name === 'readCoachKnowledge'
                  ? { kind: 'success' as const, data: { cards: [], sources: [] } }
                  : {
                      kind: 'error' as const,
                      code: 'unavailable' as const,
                      message: 'This local coach tool is not available yet.',
                    }
    return unavailable() ?? result
  }
}
