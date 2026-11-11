import type { SQLiteDatabase } from 'expo-sqlite'
import { adaptCoachDraft } from './draftAdapter'
import { validateWorkoutReview } from './workoutPlanner'
import { coachResponseSchema, type CoachResponse } from './contracts'
import { CoachDraftRepository } from '../../lib/repositories/CoachDraftRepository'
import { isCurrentProfile, type ProfileScope } from '../../lib/profileScope'
import { syncEngine } from '../../lib/sync'
import { launchFacade } from '../launch/launchFacade'

type Draft = Extract<CoachResponse, { kind: 'workout_draft' | 'routine_draft' }>
const pendingKey = '__coach_pending_review__'

type Pending = { revision: string; reviewId: string; draft: Draft; request?: string }
export function newReviewId() {
  return `coach_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`
}
export function reviewOwnerIsCurrent(scope: ProfileScope, transitioning: boolean) {
  return !transitioning && isCurrentProfile(scope)
}

export async function loadPendingReview(db: SQLiteDatabase): Promise<Pending | null> {
  const row = await db.getFirstAsync<{ draft_json: string }>(
    'SELECT draft_json FROM coach_draft_saves WHERE revision = ?',
    pendingKey
  )
  if (!row) return null
  try {
    const value: unknown = JSON.parse(row.draft_json)
    if (
      !value ||
      typeof value !== 'object' ||
      !('revision' in value) ||
      typeof value.revision !== 'string' ||
      !('reviewId' in value) ||
      typeof value.reviewId !== 'string' ||
      !('draft' in value)
    )
      return null
    const draft = coachResponseSchema.parse(value.draft)
    if (draft.kind !== 'workout_draft' && draft.kind !== 'routine_draft') return null
    return { revision: value.revision, reviewId: value.reviewId, draft, ...('request' in value && typeof value.request === 'string' ? { request: value.request } : {}) }
  } catch {
    return null
  }
}

export function createReviewSaver(db: SQLiteDatabase, scope: ProfileScope, current: () => boolean) {
  let saving = false
  return async (draft: Draft, reviewId: string, request?: string) => {
    if (saving) throw new Error('A save is already in progress.')
    saving = true
    const assertOwner = () => {
      if (!current()) throw new Error('Profile changed while saving the draft.')
    }
    try {
      assertOwner()
      if (!coachResponseSchema.safeParse(draft).success)
        throw new Error('Check that titles and set values are valid and greater than zero.')
      if (!request?.trim()) throw new Error('The original request is required to save this review.')
      const errors = validateWorkoutReview(request, draft)
      if (errors.length) throw new Error(errors.join(' '))
      const parsed = adaptCoachDraft(draft, launchFacade.api.backendMode()).draft
      const previous = await loadPendingReview(db)
      assertOwner()
      const revision = JSON.stringify([reviewId, parsed, request])
      const pending =
        previous?.revision === revision ? previous : { revision, reviewId, draft: parsed, request }
      await syncEngine.withIdRemapLock(async () => {
        await db.withTransactionAsync(async () => {
          assertOwner()
          await db.runAsync(
            'INSERT OR REPLACE INTO coach_draft_saves (revision, draft_json, result_json) VALUES (?, ?, ?)',
            pendingKey,
            JSON.stringify(pending),
            '{}'
          )
          assertOwner()
        })
      })
      assertOwner()
      const result = await new CoachDraftRepository(db).save({
        revision,
        request,
        draft: parsed,
        scope,
        isAllowed: current,
      })
      assertOwner()
      return result
    } finally {
      saving = false
    }
  }
}
