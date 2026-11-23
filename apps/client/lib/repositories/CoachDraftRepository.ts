import type { SQLiteDatabase } from 'expo-sqlite'
import { adaptCoachDraft } from '../../features/coach/draftAdapter'
import { launchFacade } from '../../features/launch/launchFacade'
import { isCurrentProfile, type ProfileScope } from '../profileScope'
import { syncEngine } from '../sync'
import { validateWorkoutReview } from '../../features/coach/workoutPlanner'
import type { RoutinePatternItem } from '../../types/routine'

export type CoachDraftSaveResult = { workoutIds: string[]; routineId: string | null }

function localId() {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`
}

export class CoachDraftRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async save(input: {
    revision: string
    draft: unknown
    request: string
    scope: ProfileScope
    isAllowed?: () => boolean
  }): Promise<CoachDraftSaveResult> {
    if (!input.revision.trim()) throw new Error('A draft revision is required.')
    if (!input.request?.trim()) throw new Error('The original request is required to save this review.')
    const adapted = adaptCoachDraft(input.draft, launchFacade.api.backendMode())
    const errors = validateWorkoutReview(input.request, adapted.draft)
    if (errors.length) throw new Error(errors.join(' '))
    const draftJson = JSON.stringify(adapted.draft)
    const assertScope = () => {
      if (!isCurrentProfile(input.scope) || input.isAllowed?.() === false)
        throw new Error('Profile changed while saving the draft.')
    }
    assertScope()
    return syncEngine.withIdRemapLock(async () => {
      assertScope()
      let result: CoachDraftSaveResult | undefined
      await this.db.withTransactionAsync(async () => {
        assertScope()
        const existing = await this.db.getFirstAsync<{ draft_json: string; result_json: string }>(
          'SELECT draft_json, result_json FROM coach_draft_saves WHERE revision = ?',
          input.revision
        )
        assertScope()
        if (existing) {
          if (existing.draft_json !== draftJson)
            throw new Error('This draft revision was already saved with different content.')
          result = JSON.parse(existing.result_json)
          return
        }
        const ids = new Map(adapted.workouts.map((workout) => [workout.ref, localId()]))
        const now = new Date().toISOString()
        for (const workout of adapted.workouts) {
          const id = ids.get(workout.ref)
          if (!id) throw new Error('Missing workout reference.')
          await this.db.runAsync(
            `INSERT INTO workouts (id, title, notes, created_at, updated_at, workout_template, is_synced)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            id,
            workout.title,
            null,
            now,
            now,
            JSON.stringify({ id, exercises: workout.exercises, ...(workout.coachSchedule ? { coachSchedule: workout.coachSchedule } : {}), createdAt: now, updatedAt: now }),
            0
          )
          assertScope()
        }
        let routineId: string | null = null
        if (adapted.draft.kind === 'routine_draft') {
          const routine = adapted.draft.routine
          const entries =
            routine.type === 'SEQUENTIAL'
              ? routine.days.map((day) => (day.kind === 'rest' ? null : day.workoutRef))
              : routine.workoutRefs
          const pattern: RoutinePatternItem[] = entries.map((ref, index) => ({
            dayIndex: index + 1,
            dayType: ref === null ? 'REST' : 'WORKOUT',
            workoutId: ref === null ? null : (ids.get(ref) ?? null),
          }))
          if (pattern.some((day) => day.dayType === 'WORKOUT' && !day.workoutId))
            throw new Error('Missing routine workout reference.')
          routineId = localId()
          await this.db.runAsync(
            `INSERT INTO routines (id, name, description, routine_type, pattern, start_date, created_at, updated_at, is_active, is_synced)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
            routineId,
            routine.title,
            null,
            routine.type,
            JSON.stringify(pattern),
            now,
            now,
            now
          )
          assertScope()
        }
        result = { workoutIds: adapted.workouts.map((workout) => ids.get(workout.ref)!), routineId }
        await this.db.runAsync(
          'INSERT INTO coach_draft_saves (revision, draft_json, result_json) VALUES (?, ?, ?)',
          input.revision,
          draftJson,
          JSON.stringify(result)
        )
        assertScope()
      })
      if (!result) throw new Error('Draft save did not complete.')
      return result
    })
  }
}
