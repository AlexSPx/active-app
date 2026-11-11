import { coachToolCallSchema, coachToolResults, type CoachToolCall } from './tools/contracts'
import type { CoachToolExecutor } from './engine'
import { claimDevelopmentExerciseEvidence } from './developmentExerciseEvidence'

export type EvidenceKind = 'record' | 'workout' | 'knowledge' | 'exercise' | 'metric'
export type RegistryError =
  | 'cancelled'
  | 'stale_profile'
  | 'budget_exceeded'
  | 'invalid_read'
  | 'handle_collision'
  | 'unknown_handle'
  | 'wrong_kind'
  | 'stale_evidence'
  | 'changed_evidence'
export type EvidenceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: RegistryError; path: string }
type Result<T> = EvidenceResult<T>
type Entry = {
  kind: EvidenceKind
  id: string
  call: CoachToolCall
  profile: string
  timestamp: number
  snapshot: string
  permittedFields: string[]
}

const permittedFields: Record<EvidenceKind, string[]> = {
  record: [
    'startedAt',
    'createdAt',
    'exercises.name',
    'exercises.repetitions',
    'exercises.weightsKg',
    'exercises.durationSeconds',
  ],
  workout: [
    'title',
    'notes',
    'exercises.repetitions',
    'exercises.weightsKg',
    'exercises.durationSeconds',
    'exercises.notes',
  ],
  knowledge: ['claim', 'applicability', 'limitations', 'reviewStatus'],
  exercise: [
    'name',
    'equipment',
    'equipmentCompatibility',
    'muscles',
    'movementPatterns',
    'metadataReviewStatus',
    'instructions',
    'limitations',
  ],
  metric: [
    'kind',
    'value.number',
    'value.weightKg',
    'value.repetitions',
    'missingDataCount',
    'definition',
  ],
}

// This development primitive owns the reads; model output cannot register evidence.
export function createDevelopmentEvidenceRegistry(input: {
  execute: CoachToolExecutor
  profile: string
  currentProfile: () => string
  signal: AbortSignal
  newHandle: () => string
  now: () => number
  maxAgeMs: number
}) {
  const entries = new Map<string, Entry>()
  const reads: { call: CoachToolCall; snapshot: string; timestamp: number }[] = []
  let calls = 0
  let revalidations = 0
  let sealed = false
  const fail = (code: RegistryError, path: string): Result<never> => ({ ok: false, code, path })
  const check = (path: string): Result<never> | null => {
    if (input.signal.aborted) return fail('cancelled', path)
    if (input.currentProfile() !== input.profile) return fail('stale_profile', path)
    if (
      !input.profile ||
      !Number.isFinite(input.maxAgeMs) ||
      input.maxAgeMs < 0 ||
      !Number.isFinite(input.now())
    )
      return fail('stale_evidence', path)
    return null
  }
  const read = async (raw: unknown): Promise<Result<{ result: unknown; handles: string[] }>> => {
    const before = check('read')
    if (before) return before
    if (sealed) return fail('invalid_read', 'read')
    const parsed = coachToolCallSchema.safeParse(raw)
    if (!parsed.success) return fail('invalid_read', 'read')
    if (calls >= 6) return fail('budget_exceeded', 'read')
    calls++
    const call = parsed.data
    const result = await input.execute(coachToolCallSchema.parse(call), input.signal)
    const after = check('read')
    if (after) return after
    if (sealed) return fail('invalid_read', 'read')
    const checked = coachToolResults[call.name].safeParse(result)
    if (!checked.success || result.kind !== 'success') return fail('invalid_read', 'read')
    if (call.name === 'readTrainingSummary' && 'metrics' in result.data) {
      const { metrics, coverage } = result.data
      if (
        Date.parse(coverage.queriedInterval.start) !== Date.parse(call.arguments.interval.start) ||
        Date.parse(coverage.queriedInterval.end) !== Date.parse(call.arguments.interval.end) ||
        metrics.some((metric) => !call.arguments.metrics.some((kind) => kind === metric.kind)) ||
        new Set(metrics.map((metric) => metric.kind)).size !== metrics.length
      )
        return fail('invalid_read', 'read')
    }
    const snapshot = JSON.stringify(checked.data)
    const timestamp = input.now()
    const items: { kind: EvidenceKind; id: string }[] = []
    if (call.name === 'readExercises' && 'items' in result.data)
      items.push(...result.data.items.map((item) => ({ kind: 'exercise' as const, id: item.id })))
    if (call.name === 'readWorkouts' && 'items' in result.data)
      items.push(...result.data.items.map((item) => ({ kind: 'workout' as const, id: item.id })))
    if (call.name === 'readWorkout' && 'id' in result.data)
      items.push({ kind: 'workout', id: result.data.id })
    if (call.name === 'readRecords' && 'items' in result.data)
      items.push(...result.data.items.map((item) => ({ kind: 'record' as const, id: item.id })))
    if (call.name === 'readTrainingSummary' && 'metrics' in result.data)
      items.push(...result.data.metrics.map((item) => ({ kind: 'metric' as const, id: item.id })))
    if (call.name === 'readCoachKnowledge' && 'cards' in result.data)
      items.push(...result.data.cards.map((item) => ({ kind: 'knowledge' as const, id: item.id })))
    if (new Set(items.map((item) => JSON.stringify([item.kind, item.id]))).size !== items.length)
      return fail('invalid_read', 'read')
    const handles = items.map(() => input.newHandle())
    if (
      handles.some((handle) => !handle || entries.has(handle)) ||
      new Set(handles).size !== handles.length
    )
      return fail('handle_collision', 'read')
    items.forEach((item, index) =>
      entries.set(handles[index], {
        ...item,
        call,
        profile: input.profile,
        timestamp,
        snapshot,
        permittedFields: call.name === 'readWorkouts' ? ['title'] : [...permittedFields[item.kind]],
      })
    )
    reads.push({ call, snapshot, timestamp })
    return { ok: true, value: { result: checked.data, handles } }
  }
  const resolve = (handle: string, kind: EvidenceKind | null, path: string): Result<Entry> => {
    const problem = check(path)
    if (problem) return problem
    const entry = entries.get(handle)
    if (!entry) return fail('unknown_handle', path)
    if (kind && entry.kind !== kind) return fail('wrong_kind', path)
    if (input.now() < entry.timestamp || input.now() - entry.timestamp > input.maxAgeMs)
      return fail('stale_evidence', path)
    return {
      ok: true,
      value: {
        ...entry,
        call: coachToolCallSchema.parse(entry.call),
        permittedFields: [...entry.permittedFields],
      },
    }
  }
  const revalidate = async (): Promise<Result<true>> => {
    const initial = check('evidence')
    if (initial) return initial
    for (const prior of reads) {
      const problem = check('evidence')
      if (problem) return problem
      if (input.now() < prior.timestamp || input.now() - prior.timestamp > input.maxAgeMs)
        return fail('stale_evidence', 'evidence')
      if (calls >= 6) return fail('budget_exceeded', 'evidence')
      calls++
      revalidations++
      const current = await input.execute(coachToolCallSchema.parse(prior.call), input.signal)
      const after = check('evidence')
      if (after) return after
      if (input.now() < prior.timestamp || input.now() - prior.timestamp > input.maxAgeMs)
        return fail('stale_evidence', 'evidence')
      const parsed = coachToolResults[prior.call.name].safeParse(current)
      const comparable = (value: unknown) => {
        if (prior.call.name !== 'readTrainingSummary') return value
        const summary = coachToolResults.readTrainingSummary.safeParse(value)
        if (!summary.success || summary.data.kind !== 'success') return value
        return {
          ...summary.data,
          data: {
            ...summary.data.data,
            metrics: summary.data.data.metrics.map(({ id, ...metric }) => metric),
          },
        }
      }
      if (
        !parsed.success ||
        JSON.stringify(comparable(parsed.data)) !==
          JSON.stringify(comparable(JSON.parse(prior.snapshot)))
      )
        return fail('changed_evidence', 'evidence')
    }
    if (
      reads.some(
        (prior) => input.now() < prior.timestamp || input.now() - prior.timestamp > input.maxAgeMs
      )
    )
      return fail('stale_evidence', 'evidence')
    return { ok: true, value: true }
  }
  return {
    read,
    hasExerciseRead: () => reads.some((read) => read.call.name === 'readExercises'),
    resolve,
    claimExercise: (context: Parameters<typeof claimDevelopmentExerciseEvidence>[0], message: string) => claimDevelopmentExerciseEvidence(context, input.execute, message),
    revalidate,
    handles: (kind: EvidenceKind) => [...entries].filter(([, entry]) => entry.kind === kind).map(([handle]) => handle),
    usage: () => ({ reads: calls, revalidations, limit: 6 }),
    seal: () => {
      sealed = true
    },
  }
}
