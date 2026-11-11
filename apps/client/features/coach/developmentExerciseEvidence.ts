import type { CoachToolExecutor } from './engine'

export type ExerciseFallback = { kind: 'clarification'; question: string } | { kind: 'cannot_fulfill'; reason: string }
export type ExerciseEvidence = Readonly<{
  mode: 'workout' | 'lookup' | 'clarify'
  decisions: readonly Readonly<{ id: string; decision: 'eligible' }>[]
  prescription: Readonly<{ sets: number | null; repetitions: number | null; load: 'unspecified' | null; delivery?: Readonly<{ kind: 'workout'; restSeconds: 90 } | { kind: 'sequential' } | { kind: 'weekly' } | { kind: 'mixed_blocked' }> | null }>
  fallback: ExerciseFallback
  provenance: Readonly<{ request: string; fixture: string | null; premises: unknown; sourcePins: Readonly<Record<string, string>>; policy: string }>
}>

type Context = { readonly mode: ExerciseEvidence['mode']; readonly fallback: ExerciseFallback }
const contexts = new WeakMap<Context, { evidence: ExerciseEvidence; execute: CoachToolExecutor; claimed: boolean }>()

// This is an explicit trusted development-provider boundary, not authentication of its input.
export function createTrustedDevelopmentExerciseContext(evidence: ExerciseEvidence, execute: CoachToolExecutor): Context {
  const copy: ExerciseEvidence = JSON.parse(JSON.stringify(evidence))
  const context = Object.freeze({ mode: copy.mode, fallback: Object.freeze({ ...copy.fallback }) })
  contexts.set(context, { evidence: copy, execute, claimed: false })
  return context
}

export function claimDevelopmentExerciseEvidence(context: Context, execute: CoachToolExecutor, message: string): ExerciseEvidence | null {
  const record = contexts.get(context)
  if (!record || record.claimed || record.execute !== execute || record.evidence.provenance.request !== message) return null
  record.claimed = true
  return record.evidence
}
