import type { CoachResponse } from './contracts'
import {
  createDevelopmentEvidenceRegistry,
  type EvidenceResult,
  type RegistryError,
} from './developmentEvidenceRegistry'
import { coachToolCallSchema, coachToolResults } from './tools/contracts'
import { validateCoachResponse } from './validation'
import { z } from 'zod'

const historyQuestion = 'What period should I review?'
const missingIntervalQuestion =
  'What start date and end date should I use for the history summary? The start is included and the end is excluded.'
const historyInability = 'I cannot calculate the requested history from the available data.'

export const handleDraftSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('answer'),
    blocks: z
      .array(
        z.discriminatedUnion('kind', [
          z.strictObject({
            kind: z.literal('text'),
            text: z.string().trim().min(1),
            evidenceHandles: z.array(z.string().trim().min(1)),
          }),
          z.strictObject({ kind: z.literal('metric'), metricHandle: z.string().trim().min(1) }),
        ])
      )
      .min(1),
    limitations: z.array(z.string().trim().min(1)),
  }),
  z.strictObject({ kind: z.literal('exercise_workout'), exerciseHandle: z.string().trim().min(1), sets: z.number().int().positive(), repetitions: z.number().int().positive() }),
  z.strictObject({ kind: z.literal('exercise_lookup'), exerciseHandle: z.string().trim().min(1) }),
  z.strictObject({ kind: z.literal('exercise_fallback') }),
  z.strictObject({ kind: z.literal('clarification'), question: z.string().trim().min(1) }),
  z.strictObject({ kind: z.literal('cannot_fulfill'), reason: z.string().trim().min(1) }),
])

export function handleDraftJsonSchema(handles: {
  knowledge: string[]
  metric: string[]
  personalHistory?: boolean
  missingHistoryInterval?: boolean
}) {
  const blockSchemas = [
    ...(handles.knowledge.length
      ? [
          {
            type: 'object',
            properties: {
              kind: { const: 'text' },
              text: { type: 'string', minLength: 1 },
              evidenceHandles: {
                type: 'array',
                minItems: 1,
                items: { type: 'string', enum: handles.knowledge },
              },
            },
            required: ['kind', 'text', 'evidenceHandles'],
            additionalProperties: false,
          },
        ]
      : []),
    ...(handles.metric.length
      ? [
          {
            type: 'object',
            properties: {
              kind: { const: 'metric' },
              metricHandle: { type: 'string', enum: handles.metric },
            },
            required: ['kind', 'metricHandle'],
            additionalProperties: false,
          },
        ]
      : []),
  ]
  return {
    oneOf: [
      ...(blockSchemas.length && !handles.missingHistoryInterval
        ? [
            {
              type: 'object',
              properties: {
                kind: { const: 'answer' },
                blocks: { type: 'array', minItems: 1, items: { oneOf: blockSchemas } },
                limitations: {
                  type: 'array',
                  ...(handles.personalHistory ? { maxItems: 0 } : {}),
                  items: {
                    type: 'string',
                    minLength: 1,
                  },
                },
              },
              required: ['kind', 'blocks', 'limitations'],
              additionalProperties: false,
            },
          ]
        : []),
      ...(['clarification', 'cannot_fulfill'] as const)
        .filter((kind) => !handles.missingHistoryInterval || kind === 'clarification')
        .map((kind) => ({
          type: 'object',
          properties: {
            kind: { const: kind },
            [kind === 'clarification' ? 'question' : 'reason']: {
              type: 'string',
              minLength: 1,
              ...(handles.personalHistory
                ? {
                    const:
                      kind === 'clarification'
                        ? handles.missingHistoryInterval
                          ? missingIntervalQuestion
                          : historyQuestion
                        : historyInability,
                  }
                : {}),
            },
          },
          required: ['kind', kind === 'clarification' ? 'question' : 'reason'],
          additionalProperties: false,
        })),
    ],
  }
}

type Registry = ReturnType<typeof createDevelopmentEvidenceRegistry>
type Failure = {
  ok: false
  code: RegistryError | 'invalid_output' | 'semantic_review_failed'
  path: string
}

export type RepairFeedback = {
  code: 'unknown_handle' | 'wrong_kind' | 'invalid_value'
  path: string
  allowedValues: (string | number)[]
  dependencies: string[]
}

// The reviewer is a separate gate: registry membership does not establish entailment.
export function createDevelopmentEvidenceAdapter(input: {
  registry: Registry
  reviewText: (text: string, cards: unknown[]) => Promise<boolean | 'unreviewed'>
  personalHistoryRequest?: boolean
  missingHistoryInterval?: boolean
  exerciseContext?: Parameters<Registry['claimExercise']>[0]
  exerciseMessage?: string
}) {
  const exerciseEvidence = input.exerciseContext ? input.registry.claimExercise(input.exerciseContext, input.exerciseMessage ?? '') : null
  const eligible = (id: string) => exerciseEvidence?.decisions.some((decision) => decision.id === id && decision.decision === 'eligible') === true
  const read = async (raw: unknown, trustedScope = false): Promise<EvidenceResult<unknown>> => {
    const parsed = coachToolCallSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, code: 'invalid_read', path: 'read' }
    let call = parsed.data
    if ('cursor' in call.arguments || 'exclusions' in call.arguments)
      return { ok: false, code: 'invalid_read', path: 'read.arguments' }
    if (call.name === 'readWorkout') {
      const resolved = input.registry.resolve(call.arguments.id, 'workout', 'read.arguments.id')
      if (!resolved.ok) return resolved
      call = { ...call, arguments: { id: resolved.value.id } }
    } else if (call.name === 'readExercises' && call.arguments.ids) {
      const ids: string[] = []
      for (const [index, handle] of call.arguments.ids.entries()) {
        const resolved = input.registry.resolve(handle, 'exercise', `read.arguments.ids.${index}`)
        if (!resolved.ok) return resolved
        ids.push(resolved.value.id)
      }
      call = { ...call, arguments: { ...call.arguments, ids } }
    } else if (
      !trustedScope &&
      (call.name === 'readRecords' || call.name === 'readTrainingSummary')
    ) {
      let workoutId = call.arguments.workoutId
      let exerciseId = call.arguments.exerciseId
      if (workoutId) {
        const resolved = input.registry.resolve(workoutId, 'workout', 'read.arguments.workoutId')
        if (!resolved.ok) return resolved
        workoutId = resolved.value.id
      }
      if (exerciseId) {
        const resolved = input.registry.resolve(exerciseId, 'exercise', 'read.arguments.exerciseId')
        if (!resolved.ok) return resolved
        exerciseId = resolved.value.id
      }
      call = coachToolCallSchema.parse({
        ...call,
        arguments: {
          ...call.arguments,
          ...(workoutId ? { workoutId } : {}),
          ...(exerciseId ? { exerciseId } : {}),
        },
      })
    }
    const readResult = await input.registry.read(call)
    if (!readResult.ok) return readResult
    const handles = readResult.value.handles
    switch (call.name) {
      case 'readExercises': {
        const result = coachToolResults.readExercises.parse(readResult.value.result)
        if (result.kind !== 'success') return { ok: false, code: 'invalid_read', path: 'read' }
        return {
          ok: true,
          value: {
            items: result.data.items.map(({ id, sourceKey, ...item }, i) => ({
              handle: handles[i],
              ...item,
            })),
            hasMore: result.data.nextCursor !== null,
          },
        }
      }
      case 'readWorkouts': {
        const result = coachToolResults.readWorkouts.parse(readResult.value.result)
        if (result.kind !== 'success') return { ok: false, code: 'invalid_read', path: 'read' }
        return {
          ok: true,
          value: {
            items: result.data.items.map(({ title }, i) => ({ handle: handles[i], title })),
            hasMore: result.data.nextCursor !== null,
          },
        }
      }
      case 'readWorkout': {
        const result = coachToolResults.readWorkout.parse(readResult.value.result)
        if (result.kind !== 'success') return { ok: false, code: 'invalid_read', path: 'read' }
        return {
          ok: true,
          value: {
            handle: handles[0],
            title: result.data.title,
            notes: result.data.notes,
            exercises: result.data.exercises.map(
              ({ repetitions, weightsKg, durationSeconds, notes }) => ({
                repetitions,
                weightsKg,
                durationSeconds,
                notes,
              })
            ),
          },
        }
      }
      case 'readRecords': {
        const result = coachToolResults.readRecords.parse(readResult.value.result)
        if (result.kind !== 'success') return { ok: false, code: 'invalid_read', path: 'read' }
        return {
          ok: true,
          value: {
            items: result.data.items.map(({ startedAt, createdAt, exercises }, i) => ({
              handle: handles[i],
              startedAt,
              createdAt,
              exercises: exercises.map(({ name, repetitions, weightsKg, durationSeconds }) => ({
                name,
                repetitions,
                weightsKg,
                durationSeconds,
              })),
            })),
            coverage: result.data.coverage,
            hasMore: result.data.nextCursor !== null,
          },
        }
      }
      case 'readTrainingSummary': {
        const result = coachToolResults.readTrainingSummary.parse(readResult.value.result)
        if (result.kind !== 'success') return { ok: false, code: 'invalid_read', path: 'read' }
        return {
          ok: true,
          value: {
            metrics: result.data.metrics.map(
              ({ kind, value, missingDataCount, definition }, i) => ({
                handle: handles[i],
                kind,
                value: Array.isArray(value)
                  ? value.map(({ weightKg, repetitions }) => ({ weightKg, repetitions }))
                  : value,
                missingDataCount,
                definition,
              })
            ),
            coverage: result.data.coverage,
          },
        }
      }
      case 'readCoachKnowledge': {
        const result = coachToolResults.readCoachKnowledge.parse(readResult.value.result)
        if (result.kind !== 'success') return { ok: false, code: 'invalid_read', path: 'read' }
        return {
          ok: true,
          value: {
            cards: result.data.cards.map(
              ({ claim, applicability, limitations, reviewStatus }, i) => ({
                handle: handles[i],
                claim,
                applicability,
                limitations,
                reviewStatus,
              })
            ),
            routing: result.data.routing,
          },
        }
      }
    }
  }

  const deliver = async (
    draft: unknown
  ): Promise<
    | {
        ok: true
        response: CoachResponse
        metrics: Record<string, unknown>[]
        semanticStatus: 'supported' | 'unreviewed' | 'not_applicable'
      }
    | Failure
  > => {
    input.registry.seal()
    const parsed = handleDraftSchema.safeParse(draft)
    if (!parsed.success)
      return {
        ok: false,
        code: 'invalid_output',
        path: parsed.error.issues[0]?.path.join('.') || 'response',
      }
    let intermediate = parsed.data
    if (intermediate.kind === 'exercise_workout' || intermediate.kind === 'exercise_lookup' || intermediate.kind === 'exercise_fallback') {
      const context = input.exerciseContext
      if (!context || !exerciseEvidence || !input.registry.hasExerciseRead()) return { ok: false, code: 'invalid_output', path: 'kind' }
      let response: CoachResponse
      if (intermediate.kind === 'exercise_fallback') {
        response = { version: 1, ...context.fallback }
      } else {
        const entry = input.registry.resolve(intermediate.exerciseHandle, 'exercise', 'exerciseHandle')
        if (!entry.ok) return entry
        const snapshot = coachToolResults.readExercises.safeParse(JSON.parse(entry.value.snapshot))
        if (!snapshot.success || snapshot.data.kind !== 'success') return { ok: false, code: 'invalid_read', path: 'exerciseHandle' }
        const item = snapshot.data.data.items.find((candidate) => candidate.id === entry.value.id)
        if (!item) return { ok: false, code: 'invalid_read', path: 'exerciseHandle' }
        if (intermediate.kind === 'exercise_workout') {
          if (exerciseEvidence.prescription.delivery?.kind === 'mixed_blocked') return deliver({ kind: 'exercise_fallback' })
          if (context.mode !== 'workout' || item.equipmentCompatibility !== 'compatible' || !eligible(item.id))
            return { ok: false, code: 'invalid_output', path: 'exerciseHandle' }
          if (intermediate.sets !== exerciseEvidence.prescription.sets) return { ok: false, code: 'invalid_output', path: 'sets' }
          if (intermediate.repetitions !== exerciseEvidence.prescription.repetitions) return { ok: false, code: 'invalid_output', path: 'repetitions' }
          if (exerciseEvidence.prescription.load !== 'unspecified') return { ok: false, code: 'invalid_output', path: 'load' }
          const repetitions = intermediate.repetitions
          const delivery = exerciseEvidence.prescription.delivery
          const exercise = { catalogId: item.id, sets: Array.from({ length: intermediate.sets }, () => ({ kind: 'strength' as const, repetitions, load: { kind: 'user_selected' as const } })), ...(delivery?.kind === 'workout' ? { guidance: { restSeconds: delivery.restSeconds } } : {}) }
          if (delivery?.kind === 'sequential' || delivery?.kind === 'weekly') {
            const workouts = ['A', 'B'].map((label) => ({ ref: `workout-${label}`, title: `Workout ${label}`, exercises: [exercise] }))
            response = { version: 1, kind: 'routine_draft', workouts, routine: delivery.kind === 'sequential'
              ? { type: 'SEQUENTIAL', title: 'Routine', days: [{ kind: 'workout', workoutRef: 'workout-B' }, { kind: 'rest' }, { kind: 'workout', workoutRef: 'workout-A' }] }
              : { type: 'WEEKLY_COMPLETION', title: 'Routine', workoutRefs: ['workout-A', 'workout-B'] }, assumptions: [] }
          } else response = { version: 1, kind: 'workout_draft', workout: { ref: 'workout-1', title: item.name, exercises: [exercise] }, assumptions: [] }
        } else {
          if (context.mode !== 'lookup' || !eligible(item.id)) return { ok: false, code: 'invalid_output', path: 'exerciseHandle' }
          response = { version: 1, kind: 'answer', blocks: [{ kind: 'text', text: `${item.name}. Catalog equipment: ${item.equipment.join(', ') || 'unspecified'}. Compatibility: ${item.equipmentCompatibility}. ${item.instructions?.join(' ') || 'Setup details are unavailable.'}`, evidence: [] }], limitations: item.limitations ?? [] }
        }
      }
      const validated = validateCoachResponse(response)
      if (!validated.success) return { ok: false, code: 'invalid_output', path: 'response' }
      const current = await input.registry.revalidate()
      if (!current.ok) return current
      return { ok: true, response: validated.response, metrics: [], semanticStatus: 'unreviewed' }
    }
    if (input.exerciseContext) return { ok: false, code: 'invalid_output', path: 'kind' }
    if (input.personalHistoryRequest) {
      if (
        intermediate.kind === 'clarification' &&
        intermediate.question !== historyQuestion &&
        !(input.missingHistoryInterval && intermediate.question === missingIntervalQuestion)
      )
        return { ok: false, code: 'invalid_output', path: 'question' }
      if (intermediate.kind === 'cannot_fulfill' && intermediate.reason !== historyInability)
        return { ok: false, code: 'invalid_output', path: 'reason' }
      if (
        intermediate.kind === 'answer' &&
        intermediate.blocks.some((block) => block.kind !== 'metric')
      )
        return { ok: false, code: 'invalid_output', path: 'blocks' }
    }
    // A known missing scope needs a question, even if a provider selects bounded inability.
    // With an interval present, unavailable computations retain their justified inability.
    if (input.personalHistoryRequest && input.missingHistoryInterval)
      intermediate = { kind: 'clarification', question: missingIntervalQuestion }
    const response: CoachResponse =
      intermediate.kind === 'answer'
        ? {
            version: 1,
            kind: 'answer',
            limitations: intermediate.limitations,
            blocks: intermediate.blocks.map((block) =>
              block.kind === 'metric'
                ? { kind: 'metric' as const, metricId: block.metricHandle }
                : {
                    kind: 'text' as const,
                    text: block.text,
                    evidence: block.evidenceHandles.map((id) => ({
                      kind: 'knowledge' as const,
                      id,
                    })),
                  }
            ),
          }
        : { version: 1, ...intermediate }
    const reviews: { text: string; cards: unknown[]; path: string }[] = []
    const metrics: Record<string, unknown>[] = []
    const renderedCoverage = new Set<string>()
    if (response.kind === 'answer') {
      for (const [i, block] of response.blocks.entries()) {
        if (block.kind === 'metric') {
          const entry = input.registry.resolve(block.metricId, 'metric', `blocks.${i}.metricHandle`)
          if (!entry.ok) return entry
          const snapshot = coachToolResults.readTrainingSummary.safeParse(
            JSON.parse(entry.value.snapshot)
          )
          if (!snapshot.success || snapshot.data.kind !== 'success')
            return { ok: false, code: 'invalid_read', path: `blocks.${i}.metricHandle` }
          const metric = snapshot.data.data.metrics.find((item) => item.id === entry.value.id)
          if (!metric || (metric.kind === 'best_recorded_sets' || metric.kind === 'latest_recorded_sets') !== Array.isArray(metric.value))
            return { ok: false, code: 'invalid_read', path: `blocks.${i}.metricHandle` }
          const units = {
            completed_sessions: 'sessions',
            exercise_exposures: 'exercise entries',
            recorded_repetitions: 'repetitions',
            timed_duration_seconds: 'seconds',
            external_load_volume_kg: 'kg·repetitions',
            best_recorded_sets: 'recorded sets',
            latest_recorded_sets: 'recorded sets',
          }
          const coverage = snapshot.data.data.coverage
          const scope =
            entry.value.call.name === 'readTrainingSummary' ? entry.value.call.arguments : null
          for (const limitation of coverage.limitations) renderedCoverage.add(limitation)
          const limitations =
            metric.kind === 'latest_recorded_sets'
              ? ['Some sets may be missing or have invalid load or repetitions; see the missing data count.']
              : metric.kind === 'external_load_volume_kg' || metric.kind === 'best_recorded_sets'
              ? [
                  'Zero or missing loads are excluded; external-load volume is not total training load.',
                ]
              : []
          if (metric.value === 0)
            limitations.push(
              'A zero value for this interval does not prove that no history ever existed.'
            )
          const valueText = Array.isArray(metric.value)
            ? metric.value
                .map((set) => `${set.weightKg} kg × ${set.repetitions} repetitions`)
                .join('; ') || 'none'
            : String(metric.value)
          const filters = [
            scope?.workoutId && `Workout: ${scope.workoutId}.`,
            scope?.exerciseId && `Exercise: ${scope.exerciseId}.`,
          ]
            .filter(Boolean)
            .join(' ')
          const text = `${metric.kind.replaceAll('_', ' ')}: ${valueText} ${units[metric.kind]}. Metric ID: ${metric.id}. Evidence IDs: ${metric.evidenceIds.join(', ') || 'none'}. Interval: [${coverage.queriedInterval.start}, ${coverage.queriedInterval.end}) (start inclusive, end exclusive). ${filters} Missing data count: ${metric.missingDataCount}. ${coverage.localHistoryComplete ? 'Local history complete for the queried interval.' : 'Local history may be incomplete.'} ${[metric.definition, ...coverage.limitations, ...limitations].filter(Boolean).join(' ')}`
          metrics.push({
            metricId: metric.id,
            kind: metric.kind,
            value: metric.value,
            unit: units[metric.kind],
            missingDataCount: metric.missingDataCount,
            evidenceIds: metric.evidenceIds,
            definition: metric.definition ?? null,
            coverage,
            scope,
            limitations,
            text,
          })
          block.metricId = entry.value.id
        } else {
          const cards: unknown[] = []
          for (const [j, ref] of block.evidence.entries()) {
            const path = `blocks.${i}.evidenceHandles.${j}`
            const entry = input.registry.resolve(ref.id, 'knowledge', path)
            if (!entry.ok) return entry
            const snapshot = coachToolResults.readCoachKnowledge.safeParse(
              JSON.parse(entry.value.snapshot)
            )
            if (!snapshot.success || snapshot.data.kind !== 'success')
              return { ok: false, code: 'invalid_read', path }
            const card = snapshot.data.data.cards.find((item) => item.id === entry.value.id)
            if (!card) return { ok: false, code: 'invalid_read', path }
            cards.push(card)
            block.evidence[j] = { kind: 'knowledge', id: entry.value.id }
          }
          reviews.push({ text: block.text, cards, path: `blocks.${i}.text` })
        }
      }
      if (input.personalHistoryRequest) {
        response.limitations = response.limitations.filter(
          (limitation) => !renderedCoverage.has(limitation)
        )
        if (response.limitations.length)
          return { ok: false, code: 'invalid_output', path: 'limitations' }
      }
    }
    const validated = validateCoachResponse(response, {
      personalHistoryRequest: input.personalHistoryRequest,
    })
    if (!validated.success) return { ok: false, code: 'invalid_output', path: 'response' }
    let semanticStatus: 'supported' | 'unreviewed' | 'not_applicable' = reviews.length
      ? 'supported'
      : 'not_applicable'
    for (const review of reviews) {
      try {
        const verdict = await input.reviewText(review.text, review.cards)
        if (verdict !== true && verdict !== 'unreviewed')
          return { ok: false, code: 'semantic_review_failed', path: review.path }
        if (verdict === 'unreviewed') semanticStatus = 'unreviewed'
      } catch {
        return { ok: false, code: 'semantic_review_failed', path: review.path }
      }
    }
    const current = await input.registry.revalidate()
    if (!current.ok) return current
    return { ok: true, response: validated.response, metrics, semanticStatus }
  }
  return {
    read: (raw: unknown) => read(raw),
    readScoped: (raw: unknown) => read(raw, true),
    deliver,
    usage: input.registry.usage,
    fallbackForRejectedExercise: async (draft: unknown, failure: Failure) => {
      if (!exerciseEvidence || exerciseEvidence.mode === 'lookup' || failure.path !== 'exerciseHandle' || !['invalid_output', 'unknown_handle', 'wrong_kind'].includes(failure.code)) return null
      const parsed = handleDraftSchema.safeParse(draft)
      if (!parsed.success || parsed.data.kind !== 'exercise_workout') return null
      const hasEligible = input.registry.handles('exercise').some((handle) => {
        const entry = input.registry.resolve(handle, 'exercise', 'exerciseHandle')
        if (!entry.ok || !eligible(entry.value.id)) return false
        const snapshot = coachToolResults.readExercises.safeParse(JSON.parse(entry.value.snapshot))
        return snapshot.success && snapshot.data.kind === 'success' && snapshot.data.data.items.some((item) => item.id === entry.value.id && item.equipmentCompatibility === 'compatible')
      })
      return hasEligible ? null : deliver({ kind: 'exercise_fallback' })
    },
    repairFeedback: (failure: Failure): RepairFeedback | null => {
      const { path, code } = failure
      if (code !== 'unknown_handle' && code !== 'wrong_kind' && code !== 'invalid_output') return null
      const mappedCode = code === 'invalid_output' ? 'invalid_value' : code
      if (/^blocks\.\d+\.metricHandle$/.test(path))
        return { code: mappedCode, path, allowedValues: input.registry.handles('metric'), dependencies: ['metric scope', 'response validation', 'evidence revalidation'] }
      if (/^blocks\.\d+\.evidenceHandles\.\d+$/.test(path))
        return { code: mappedCode, path, allowedValues: input.registry.handles('knowledge'), dependencies: ['cited text semantic review', 'response validation', 'evidence revalidation'] }
      if (path === 'exerciseHandle' && input.exerciseContext) {
        const context = input.exerciseContext
        const allowedValues = input.registry.handles('exercise').filter((handle) => {
          const entry = input.registry.resolve(handle, 'exercise', path)
          if (!entry.ok || !eligible(entry.value.id)) return false
          const snapshot = coachToolResults.readExercises.safeParse(JSON.parse(entry.value.snapshot))
          return snapshot.success && snapshot.data.kind === 'success' && snapshot.data.data.items.some((item) => item.id === entry.value.id && (context.mode !== 'workout' || item.equipmentCompatibility === 'compatible'))
        })
        return { code: mappedCode, path, allowedValues, dependencies: ['exercise eligibility', 'equipment compatibility', 'prescription', 'response validation', 'evidence revalidation'] }
      }
      if ((path === 'sets' || path === 'repetitions') && input.exerciseContext?.mode === 'workout') {
        const value = exerciseEvidence?.prescription[path]
        if (value != null) return { code: mappedCode, path, allowedValues: [value], dependencies: ['exercise eligibility', 'equipment compatibility', 'prescription', 'response validation', 'evidence revalidation'] }
      }
      return null
    },
  }
}
