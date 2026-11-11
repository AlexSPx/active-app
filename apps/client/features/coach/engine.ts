import { z } from 'zod'
import { createDevelopmentEvidenceRegistry, type RegistryError } from './developmentEvidenceRegistry'
import { createDevelopmentEvidenceAdapter, handleDraftJsonSchema } from './developmentEvidenceAdapter'
import { validateCoachResponse } from './validation'
import {
  coachToolArguments,
  coachToolCallSchema,
  coachToolResults,
  type CoachToolCall,
  type CoachToolName,
  type CoachToolResults,
} from './tools/contracts'
import type { CoachRuntimeSession, CoachGenerationMeasurement } from './runtime/types'
import { coachTaskDraftJsonSchema, coachTaskDraftSchema, isProductionResponseShape, renderTaskDraft } from './taskDrafts'
import { coachResponseSchema, type CoachResponse } from './contracts'
import { assessRequestCoverage, requestContractSchema, unparsedRequest, type RequestContract, type RequestCoverage } from './requestCoverage'

export type CoachRepairIssue = {
  code: 'unknown_metric' | 'unsupported_repair' | 'repair_scope_changed' | RegistryError | 'invalid_output' | 'semantic_review_failed'
  path: (string | number)[]
  allowedValues: string[]
  dependencies: string[]
}

export type CoachTurnAudit = {
  generations: number
  reads: number
  revalidations: number
  repairs: number
  retries: number
  outputTokens: null
  reservedOutputTokens: number
  elapsedMs: number
  cancelled: boolean
  coverage: RequestCoverage
  issues: CoachRepairIssue[]
  measurements: CoachGenerationMeasurement[]
}

export function createCoachEvidence() {
  return {
    record: new Set<string>(),
    workout: new Set<string>(),
    knowledge: new Set<string>(),
    metric: new Set<string>(),
    candidates: new Set<string>(),
    safetyContext: '',
    safetyRoute: '' as '' | 'restricted' | 'emergency',
  }
}

// Executors are read-only and must discard results after the supplied signal is aborted.
export type CoachToolExecutor = (
  call: CoachToolCall,
  signal?: AbortSignal
) => Promise<CoachToolResults[CoachToolName]>
export type CoachTurnResult =
  | { kind: 'response' | 'unreviewed'; response: CoachResponse; repaired: boolean; toolCalls: number; metrics?: Record<string, unknown>[]; semanticStatus?: 'supported' | 'unreviewed' | 'not_applicable' }
  | {
      kind: 'failure'
      code: 'cancelled' | 'stale_profile' | 'budget_exceeded' | 'invalid_output' | 'runtime_error'
      message: string
      issue?: CoachRepairIssue
    }

function metricPath(content: unknown, index: number): (string | number)[] | null {
  const production = coachResponseSchema.safeParse(content)
  if (production.success && production.data.kind === 'answer' && production.data.blocks[index]?.kind === 'metric')
    return ['blocks', index, 'metricId']
  const draft = coachTaskDraftSchema.safeParse(content)
  if (draft.success && draft.data.task === 'coaching' && draft.data.blocks[index]?.kind === 'metric')
    return ['blocks', index, 'metricHandle']
  if (draft.success && draft.data.task === 'history' && draft.data.summary === undefined && draft.data.metrics?.[index] !== undefined)
    return ['metrics', index]
  return null
}

function sameOutsidePaths(original: unknown, repaired: unknown, paths: (string | number)[][]): boolean {
  const compare = (a: unknown, b: unknown, path: (string | number)[]): boolean => {
    if (paths.some((allowed) => allowed.length === path.length && allowed.every((part, i) => part === path[i])))
      return typeof a === 'string' && typeof b === 'string'
    if (a === b) return true
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length || keys.some((key) => !Object.hasOwn(b, key))) return false
    return keys.every((key) => compare(Reflect.get(a, key), Reflect.get(b, key), [...path, Array.isArray(a) ? Number(key) : key]))
  }
  return compare(original, repaired, [])
}

/** The caller owns the session and resets it whenever its profile changes. */
export async function runCoachTurn(input: {
  message: string
  session: CoachRuntimeSession
  execute: CoachToolExecutor
  signal: AbortSignal
  isCurrentProfile: () => boolean
  countContextTokens: () => number
  maxOutputTokens: number
  maxContextTokens?: number
  safetyContext?: string
  evidence?: ReturnType<typeof createCoachEvidence>
  initialToolCalls?: CoachToolCall[]
  requestContract?: RequestContract
  onAudit?: (audit: CoachTurnAudit) => void
  development?: {
    profile: string
    currentProfile: () => string
    newHandle: () => string
    now: () => number
    maxAgeMs: number
    reviewText: (text: string, cards: unknown[]) => Promise<boolean | 'unreviewed'>
    missingHistoryInterval?: boolean
    personalHistoryRequest?: boolean
    exerciseContext?: Parameters<typeof createDevelopmentEvidenceAdapter>[0]['exerciseContext']
    reviewPart?: Parameters<typeof assessRequestCoverage>[0]['reviewPart']
  }
}): Promise<CoachTurnResult> {
  const started = Date.now()
  const audit = { generations: 0, reads: 0, revalidations: 0, repairs: 0, retries: 0, reservedOutputTokens: 0, issues: [] as CoachRepairIssue[], measurements: [] as CoachGenerationMeasurement[] }
  let result = await runCoachTurnInternal(input, started, audit)
  const checkedRequest = requestContractSchema.safeParse(input.requestContract)
  const request = checkedRequest.success && checkedRequest.data.originalText === input.message
    ? checkedRequest.data : unparsedRequest(input.message)
  if (result.kind !== 'failure' && result.response.kind === 'clarification' && !input.development?.missingHistoryInterval && (input.development?.exerciseContext?.fallback.kind !== 'clarification' || result.response.question !== input.development.exerciseContext.fallback.question) && input.development) result = { ...result, response: { version: 1, kind: 'cannot_fulfill', reason: 'I cannot establish the information needed to answer this request.' } }
  if (input.onAudit) {
    const response = result.kind !== 'failure' ? result.response : undefined
    const question = response?.kind === 'clarification' ? response.question : ''
    const clarification = input.development?.missingHistoryInterval && question.startsWith('What start date and end date') ? 'history_interval' : input.development?.exerciseContext?.fallback.kind === 'clarification' && question === input.development.exerciseContext.fallback.question ? (question.includes('sets and repetitions') ? 'exercise_prescription' : question.includes('quantities of') ? 'exercise_equipment' : question.includes('setup and surface') ? 'exercise_setup' : undefined) : undefined
    const assess = () => assessRequestCoverage({ request, ...(result.kind !== 'failure' ? { response: result.response, metrics: result.metrics, clarification: request.parts.length === 1 ? clarification : undefined, reviewPart: input.development?.reviewPart } : { failure: result.message }) })
    let abort: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let coverage: RequestCoverage
    try {
      coverage = await Promise.race([assess(), new Promise<never>((_, reject) => { abort = () => reject(new Error('cancelled')); input.signal.addEventListener('abort', abort, { once: true }); if (input.signal.aborted) abort(); timer = setTimeout(() => reject(new Error('deadline')), Math.max(0, 120000 - (Date.now() - started))) })])
      if (!input.isCurrentProfile()) {
        result = { kind: 'failure', code: 'stale_profile', message: 'The active profile changed.' }
        coverage = await assessRequestCoverage({ request, failure: result.message })
      }
    } catch (error) {
      result = { kind: 'failure', code: input.signal.aborted ? 'cancelled' : error instanceof Error && error.message === 'deadline' ? 'budget_exceeded' : 'runtime_error', message: 'Coverage review did not complete.' }
      coverage = await assessRequestCoverage({ request, failure: result.message })
    } finally { if (abort) input.signal.removeEventListener('abort', abort); if (timer) clearTimeout(timer) }
    try {
      input.onAudit({ ...audit, outputTokens: null, elapsedMs: Date.now() - started, cancelled: result.kind === 'failure' && result.code === 'cancelled', coverage })
    } catch { /* Diagnostics must not alter delivery. */ }
  }
  // Diagnostics are caller code and may cancel the turn or change its profile.
  if (input.signal.aborted) return { kind: 'failure', code: 'cancelled', message: 'Generation cancelled.' }
  if (!input.isCurrentProfile() || (input.development && input.development.currentProfile() !== input.development.profile)) return { kind: 'failure', code: 'stale_profile', message: 'The active profile changed.' }
  return result
}

async function runCoachTurnInternal(input: Parameters<typeof runCoachTurn>[0], started: number, audit: {
  generations: number; reads: number; revalidations: number; repairs: number; retries: number; reservedOutputTokens: number; issues: CoachRepairIssue[]; measurements: CoachGenerationMeasurement[]
}): Promise<CoachTurnResult> {
  const failure = (
    code: Extract<CoachTurnResult, { kind: 'failure' }>['code'],
    message: string,
    issue?: CoachRepairIssue
  ): CoachTurnResult => ({ kind: 'failure', code, message, ...(issue ? { issue } : {}) })
  const check = (): CoachTurnResult | null => {
    if (Date.now() - started > 120000)
      return failure('budget_exceeded', 'The turn exceeded its time budget.')
    if (input.signal.aborted) return failure('cancelled', 'Generation cancelled.')
    if (!input.isCurrentProfile()) return failure('stale_profile', 'The active profile changed.')
    if (input.countContextTokens() > (input.maxContextTokens ?? 8192))
      return failure('budget_exceeded', 'The conversation exceeded its context budget.')
    return null
  }
  const initial = check()
  if (initial) return initial
  const declarations = Object.entries(coachToolArguments).map(([name, schema]) => ({
    name: z
      .enum([
        'readExercises',
        'readWorkouts',
        'readWorkout',
        'readRecords',
        'readTrainingSummary',
        'readCoachKnowledge',
      ])
      .parse(name),
    description: `Read local ${name.slice(4)} data.`,
    inputSchema: z.toJSONSchema(schema),
  }))
  const evidence = input.evidence ?? createCoachEvidence()
  // Previous tool results cannot prove current applicability, freshness, or equipment.
  evidence.record.clear()
  evidence.workout.clear()
  evidence.knowledge.clear()
  evidence.metric.clear()
  evidence.candidates.clear()
  evidence.safetyContext = (
    evidence.safetyContext +
    ' ' +
    (input.safetyContext ?? '') +
    ' ' +
    input.message
  ).slice(-20000)
  const safety = evidence.safetyContext
  const emergency =
    /\b(chest (pains?|pressure|tightness|discomfort|aches?|hurts?)|(?:pains?|aches?)\s+in\s+(?:my\s+|the\s+)?chest|faint(?:ed|ing)?|passed out|short(?:ness)? of breath|breathless|can(?:not|'t) breathe|difficulty breathing|severe bleeding|stroke|heart attack)\b/i
  const restricted =
    /\b(pregnan\w*|postpartum|breastfeed\w*|child\w*|teen\w*|adolescen\w*|elderly|senior\w*|older adult\w*|injur\w*|rehab\w*|disab\w*|surgery|surgical|disease|diabet\w*|cardiac|heart|dizz\w*|symptom\w*|pain|cancer)\b/i
  if (emergency.test(safety)) evidence.safetyRoute = 'emergency'
  else if (restricted.test(safety) && !evidence.safetyRoute) evidence.safetyRoute = 'restricted'
  if (evidence.safetyRoute) {
    return {
      kind: 'response',
      repaired: false,
      toolCalls: 0,
      response: {
        version: 1,
        kind: 'cannot_fulfill',
        reason:
          evidence.safetyRoute === 'emergency'
            ? 'Stop exercising. If these symptoms are current or have just occurred, call your local emergency number now; do not drive yourself. Seek urgent medical help.'
            : 'I cannot provide an exercise recommendation for this situation. Consult a qualified health professional who knows your circumstances.',
      },
    }
  }
  // shortcut: only explicit individual applicability is distinguished; ambiguous wording stays conservative.
  const historyRequestText = /\b(?:card|population|group)\b/i.test(input.message) &&
    !/\b(?:history|workouts?|sessions?|records?|trained|exercised|lifted|ran|performed|progress|completed|logged|how many|last|previous|ago)\b/i.test(input.message)
    ? input.message.replace(/\bappl(?:y|ies) to me (?:individually|personally)\b/gi, 'applies individually')
    : input.message
  const personalHistoryRequest = input.development?.personalHistoryRequest ?? (
    /\b(?:my|mine|i|me)\b/i.test(historyRequestText) &&
    /\b(?:history|workouts?|sessions?|records?|training|trained|exercised|lifted|ran|performed|progress|completed|logged|how many|last|previous|ago)\b/i.test(
      historyRequestText
    ))
  const turnAbort = new AbortController()
  const registry = input.development && createDevelopmentEvidenceRegistry({
    execute: input.execute, ...input.development, signal: turnAbort.signal,
  })
  const adapter = registry && input.development && createDevelopmentEvidenceAdapter({
    registry, reviewText: input.development.reviewText, personalHistoryRequest,
    missingHistoryInterval: input.development.missingHistoryInterval, exerciseContext: input.development.exerciseContext, exerciseMessage: input.message,
  })
  const syncUsage = () => {
    if (registry) {
      const usage = registry.usage()
      audit.reads = usage.reads
      audit.revalidations = usage.revalidations
    }
  }
  const candidates = evidence.candidates
  const catalogCompatibility = new Map<string, string>()
  const seen = new Set<string>()
  const evidenceCalls: { call: CoachToolCall; result: CoachToolResults[CoachToolName] }[] = []
  let calls = 0
  let revalidations = 0
  let repaired = false
  let repairOriginal: unknown
  let repairPaths: (string | number)[][] = []
  let repairFeedback: CoachRepairIssue[] = []
  let generationBudget = Math.min(4096, Math.max(0, input.maxOutputTokens) * 4)
  const deadline = async <T>(operation: () => Promise<T>): Promise<T> => {
    const remaining = 120000 - (Date.now() - started)
    if (remaining <= 0) throw new Error('deadline')
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    try {
      const value = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('deadline')), remaining)
          onAbort = () => reject(new Error('cancelled'))
          input.signal.addEventListener('abort', onAbort, { once: true })
          if (input.signal.aborted) onAbort()
        }),
      ])
      if (Date.now() - started >= 120000) throw new Error('deadline')
      return value
    } finally {
      if (timer) clearTimeout(timer)
      if (onAbort) input.signal.removeEventListener('abort', onAbort)
    }
  }
  try {
    await deadline(() => input.session.appendUserMessage(input.message))
    let initialCalls = input.initialToolCalls?.length ? input.initialToolCalls : undefined
    while (true) {
      const before = check()
      if (before) return before
      const allocation = Math.min(input.maxOutputTokens, generationBudget)
      if (!initialCalls && allocation <= 0)
        return failure('budget_exceeded', 'The turn exceeded its generation budget.')
      if (!initialCalls) {
        generationBudget -= allocation
        audit.generations++
        audit.reservedOutputTokens += allocation
      }
      // Task-scoped generation with handle enums from the IDs returned this turn.
      const exerciseHandles = registry?.handles('exercise') ?? []
      const finalResponseSchema = registry && input.development?.exerciseContext
        ? { oneOf: [
            ...(input.development.exerciseContext.mode === 'workout' && exerciseHandles.length ? [{ type: 'object', properties: { kind: { const: 'exercise_workout' }, exerciseHandle: { type: 'string', enum: exerciseHandles }, sets: { type: 'integer' }, repetitions: { type: 'integer' } }, required: ['kind', 'exerciseHandle', 'sets', 'repetitions'], additionalProperties: false }] : []),
            ...(input.development.exerciseContext.mode === 'lookup' && exerciseHandles.length ? [{ type: 'object', properties: { kind: { const: 'exercise_lookup' }, exerciseHandle: { type: 'string', enum: exerciseHandles } }, required: ['kind', 'exerciseHandle'], additionalProperties: false }] : []),
            { type: 'object', properties: { kind: { const: 'exercise_fallback' } }, required: ['kind'], additionalProperties: false },
          ] }
        : registry && input.development
        ? handleDraftJsonSchema({ knowledge: registry.handles('knowledge'), metric: registry.handles('metric'), personalHistory: personalHistoryRequest, missingHistoryInterval: input.development.missingHistoryInterval })
        : coachTaskDraftJsonSchema({ metrics: [...evidence.metric], knowledge: [...evidence.knowledge] })
      const generated = initialCalls ? { kind: 'tool_calls' as const, calls: initialCalls } : await deadline(() =>
        input.session.generate({
          tools: declarations,
          finalResponseSchema,
          maxOutputTokens: allocation,
          signal: turnAbort.signal,
          onMeasurement: (measurement) => audit.measurements.push(measurement),
        })
      )
      initialCalls = undefined
      const after = check()
      if (after) return after
      if (generated.kind === 'failure')
        return failure(
          generated.code === 'cancelled'
            ? 'cancelled'
            : generated.code === 'invalid_output' || generated.code === 'truncated'
              ? 'invalid_output'
              : 'runtime_error',
          generated.message
        )
      if (generated.kind === 'continue') continue
      if (generated.kind === 'tool_calls') {
        if (!generated.calls.length)
          return failure('invalid_output', 'The model returned no tool calls.')
        for (const raw of generated.calls) {
          const parsed = coachToolCallSchema.safeParse(raw)
          if (!parsed.success)
            return failure('invalid_output', 'The model returned an invalid tool call.')
          const call = parsed.data
          const signature = JSON.stringify([call.name, call.arguments])
          if (calls >= 6 || seen.has(signature))
            return failure('budget_exceeded', 'Tool call budget or repeated-call limit reached.')
          seen.add(signature)
          if (adapter) {
            const read = await deadline(() => adapter.read(call))
            syncUsage()
            if (!read.ok) {
              const issue: CoachRepairIssue = { code: read.code, path: read.path.split('.'), allowedValues: [], dependencies: ['permitted read'] }
              audit.issues.push(issue)
              return failure(read.code === 'cancelled' || read.code === 'stale_profile' || read.code === 'budget_exceeded' ? read.code : 'invalid_output', 'Development evidence read failed.', issue)
            }
            calls++
            // The injected development protocol intentionally supplies handle-shaped data.
            const result = { kind: 'success', data: read.value } as unknown as CoachToolResults[CoachToolName]
            await deadline(() => input.session.appendToolResult({ callId: call.id, name: call.name, result }))
            continue
          }
          calls++
          audit.reads++
          const result = await deadline(() => input.execute(call, turnAbort.signal))
          const fresh = check()
          if (fresh) return fresh
          const checked = coachToolResults[call.name].safeParse(result)
          if (!checked.success)
            return failure('runtime_error', 'A tool returned an invalid result.')
          if (result.kind === 'success') {
            if (call.name === 'readExercises' && 'items' in result.data)
              for (const item of result.data.items)
                if ('equipmentCompatibility' in item) catalogCompatibility.set(item.id, item.equipmentCompatibility)
            if (call.name !== 'readExercises') evidenceCalls.push({ call, result })
            // No current catalog result establishes quantities, setup and individual suitability.
            if (call.name === 'readWorkouts' && 'items' in result.data)
              for (const item of result.data.items) evidence.workout.add(item.id)
            if (call.name === 'readWorkout' && 'id' in result.data)
              evidence.workout.add(result.data.id)
            if (call.name === 'readRecords' && 'items' in result.data)
              for (const item of result.data.items) evidence.record.add(item.id)
            if (call.name === 'readTrainingSummary' && 'metrics' in result.data)
              for (const metric of result.data.metrics) evidence.metric.add(metric.id)
            if (call.name === 'readCoachKnowledge' && 'cards' in result.data)
              for (const card of result.data.cards) evidence.knowledge.add(card.id)
          }
          await deadline(() =>
            input.session.appendToolResult({ callId: call.id, name: call.name, result })
          )
          const appended = check()
          if (appended) return appended
        }
        continue
      }
      if (repaired && !sameOutsidePaths(repairOriginal, generated.kind === 'final' ? generated.content : undefined, repairPaths)) {
        const issue: CoachRepairIssue = { code: 'repair_scope_changed', path: [], allowedValues: [], dependencies: ['unchanged unrelated fields', 'response validation', 'evidence revalidation'] }
        audit.issues.push(issue)
        return failure('invalid_output', 'The repair changed unrelated fields.', issue)
      }
      if (repaired && repairFeedback.some((issue) => {
        let value: unknown = generated.kind === 'final' ? generated.content : undefined
        for (const part of issue.path) value = value && typeof value === 'object' ? Reflect.get(value, part) : undefined
        return typeof value !== 'string' || !issue.allowedValues.includes(value)
      })) {
        const issue: CoachRepairIssue = { code: 'unsupported_repair', path: [], allowedValues: [], dependencies: ['allowed values', 'response validation', 'evidence revalidation'] }
        audit.issues.push(issue)
        return failure('invalid_output', 'The repair did not use an allowed value.', issue)
      }
      if (adapter && registry) {
        const delivered = await deadline(() => adapter.deliver(generated.content))
        syncUsage()
        const fresh = check()
        if (fresh) return fresh
        if (delivered.ok)
          return { kind: delivered.semanticStatus === 'unreviewed' ? 'unreviewed' : 'response', semanticStatus: delivered.semanticStatus, response: delivered.response, metrics: delivered.metrics, repaired, toolCalls: registry.usage().reads - registry.usage().revalidations }
        const failed = delivered.ok ? { ok: false as const, code: 'semantic_review_failed' as const, path: 'response' } : delivered
        const fallback = await deadline(() => adapter.fallbackForRejectedExercise(generated.content, failed))
        syncUsage()
        const afterFallback = check()
        if (afterFallback) return afterFallback
        if (fallback?.ok) return { kind: fallback.semanticStatus === 'unreviewed' ? 'unreviewed' : 'response', semanticStatus: fallback.semanticStatus, response: fallback.response, metrics: fallback.metrics, repaired, toolCalls: registry.usage().reads - registry.usage().revalidations }
        if (fallback && !fallback.ok) {
          const code = fallback.code === 'cancelled' || fallback.code === 'stale_profile' || fallback.code === 'budget_exceeded' ? fallback.code : 'invalid_output'
          return failure(code, `Development evidence validation failed: ${fallback.code}.`, { code: fallback.code, path: fallback.path.split('.'), allowedValues: [], dependencies: ['response validation', 'evidence revalidation'] })
        }
        const repair = adapter.repairFeedback(failed)
        const path = repair?.path.split('.').map((part) => /^\d+$/.test(part) ? Number(part) : part) ?? []
        const issue: CoachRepairIssue = { code: failed.code, path: failed.path.split('.').map((part) => /^\d+$/.test(part) ? Number(part) : part), allowedValues: repair?.allowedValues.filter((value): value is string => typeof value === 'string') ?? [], dependencies: repair?.dependencies ?? ['response validation', 'evidence revalidation'] }
        audit.issues.push(issue)
        if (!repaired && repair && repair.allowedValues.length && repair.allowedValues.every((value) => typeof value === 'string')) {
          repaired = true
          audit.repairs++
          repairOriginal = JSON.parse(JSON.stringify(generated.content))
          repairPaths = [path]
          repairFeedback = [issue]
          await deadline(() => input.session.appendUserMessage(`Correct the final response. Validation errors: ${JSON.stringify([issue])}. Change only the listed paths; keep every other field unchanged.`))
          continue
        }
        const code = failed.code === 'cancelled' || failed.code === 'stale_profile' || failed.code === 'budget_exceeded' ? failed.code : 'invalid_output'
        return failure(code, `Development evidence validation failed: ${failed.code}.`, issue)
      }
      const issues: string[] = []
      const feedback: CoachRepairIssue[] = []
      let candidate: CoachResponse | undefined
      if (isProductionResponseShape(generated.content))
        // Full-contract content from callers that enforced the production schema themselves,
        // such as frozen captured-output replays.
        candidate = generated.content as CoachResponse
      else {
        const draft = coachTaskDraftSchema.safeParse(generated.content)
        if (draft.success) {
          const rendered = renderTaskDraft(draft.data)
          if (rendered.success) candidate = rendered.response
          else issues.push(...rendered.issues)
        } else
          issues.push(
            ...draft.error.issues.map(
              (issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`
            )
          )
      }
      // Only a uniquely identified knowledge card can determine a citation kind without inference.
      const structurallyValid = coachResponseSchema.safeParse(candidate)
      if (structurallyValid.success && structurallyValid.data.kind === 'answer') {
        for (const block of structurallyValid.data.blocks) {
          if (block.kind !== 'text') continue
          block.evidence = block.evidence.map((ref) =>
            ref.kind !== 'knowledge' && evidence.knowledge.has(ref.id) &&
            !evidence.record.has(ref.id) && !evidence.workout.has(ref.id) && !evidence.metric.has(ref.id)
              ? { ...ref, kind: 'knowledge' as const }
              : ref
          )
        }
        candidate = structurallyValid.data
      }
      const parsed = candidate ? validateCoachResponse(candidate, { personalHistoryRequest }) : null
      if (parsed && !parsed.success) issues.push(...parsed.issues)
      if (parsed?.success) {
        const response = parsed.response
        if (response.kind === 'answer')
          for (const [index, block] of response.blocks.entries()) {
            if (block.kind === 'metric' && !evidence.metric.has(block.metricId))
              {
                issues.push(`Unknown metric: ${block.metricId}`)
                const path = metricPath(generated.kind === 'final' ? generated.content : undefined, index)
                if (path && evidence.metric.size) feedback.push({ code: 'unknown_metric', path, allowedValues: [...evidence.metric], dependencies: ['metric scope', 'response validation', 'evidence revalidation'] })
              }
            if (block.kind === 'text')
              for (const ref of block.evidence)
                if (!evidence[ref.kind].has(ref.id)) {
                  if (evidence.knowledge.has(ref.id)) issues.push(`Evidence ${ref.id} is a retrieved knowledge card; use kind knowledge.`)
                  else if (evidence.metric.has(ref.id)) issues.push(`Evidence ${ref.id} is a returned metric; use a metric block with metricId, not text evidence.`)
                  else if (catalogCompatibility.has(ref.id)) issues.push(`Evidence ${ref.id} is a catalog exercise, not a ${ref.kind} reference; text evidence supports knowledge cards only.`)
                  else issues.push(`Unknown ${ref.kind}: ${ref.id}; use only IDs returned in this turn with the correct kind.`)
                }
          }
        const workouts =
          response.kind === 'workout_draft'
            ? [response.workout]
            : response.kind === 'routine_draft'
              ? response.workouts
              : []
        for (const workout of workouts)
          for (const exercise of workout.exercises)
            if (!candidates.has(exercise.catalogId))
              issues.push(catalogCompatibility.has(exercise.catalogId)
                ? `Exercise not retrieved as compatible: ${exercise.catalogId}; returned compatibility is ${catalogCompatibility.get(exercise.catalogId)}. Equipment quantity, setup and individual suitability are not established; do not present this draft as compatible.`
                : `Exercise not retrieved as compatible: ${exercise.catalogId}; it was not returned in this turn, so equipment, setup and compatibility are not established; do not present this draft as compatible.`)
        if (!issues.length) {
          for (const prior of evidenceCalls) {
            if (calls >= 6)
              return failure('budget_exceeded', 'Evidence revalidation exceeded the tool budget.')
            calls++
            revalidations++
            audit.reads++
            audit.revalidations++
            const current = await deadline(() => input.execute(prior.call, turnAbort.signal))
            const fresh = check()
            if (fresh) return fresh
            const comparable = (value: CoachToolResults[CoachToolName]) =>
              prior.call.name === 'readTrainingSummary' &&
              value.kind === 'success' &&
              'metrics' in value.data
                ? {
                    ...value,
                    data: {
                      ...value.data,
                      metrics: value.data.metrics.map(({ id: _id, ...metric }) => metric),
                    },
                  }
                : value
            if (JSON.stringify(comparable(current)) !== JSON.stringify(comparable(prior.result)))
              return failure(
                'invalid_output',
                'The evidence changed during this turn. Please try again.'
              )
          }
          return { kind: 'response', response, repaired, toolCalls: calls - revalidations }
        }
      }
      if (repaired || !issues.length || feedback.length !== issues.length) {
        const issue: CoachRepairIssue = { code: 'unsupported_repair', path: [], allowedValues: [], dependencies: ['response validation', 'evidence revalidation'] }
        audit.issues.push(issue)
        return failure('invalid_output', issues.join('; ').slice(0, 500) || 'Unsupported final response repair.', issue)
      }
      repaired = true
      audit.repairs++
      audit.issues.push(...feedback)
      repairOriginal = generated.kind === 'final' ? JSON.parse(JSON.stringify(generated.content)) : undefined
      repairPaths = feedback.map((item) => item.path)
      repairFeedback = feedback
      await deadline(() =>
        input.session.appendUserMessage(
          `Correct the final response. Validation errors: ${JSON.stringify(feedback)}. Change only the listed paths; keep every other field unchanged.`
        )
      )
    }
  } catch (error) {
    if (error instanceof Error && (error.message === 'deadline' || error.message === 'cancelled')) {
      turnAbort.abort()
      void input.session.cancel().catch(() => {})
      void input.session.dispose?.().catch(() => {})
      return error.message === 'deadline'
        ? failure('budget_exceeded', 'The turn exceeded its time budget.')
        : failure('cancelled', 'Generation cancelled.')
    }
    return check() ?? failure('runtime_error', 'The coach could not complete this request.')
  } finally {
    // A read is charged when invoked, even if cancellation interrupts its await.
    syncUsage()
  }
}
