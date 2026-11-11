import { z } from 'zod'
import { parseWorkoutSchedule, workoutSessionFocuses } from './workoutSchedule'
import type { CoachWorkout, CoachResponse } from './contracts'
import { defaultSelection, planWorkout, renderWorkout, selectionSchema, validateSelection, workoutRequestText, type WorkoutTrace } from './workoutPlanner'
import type { CoachToolExecutor, CoachTurnResult } from './engine'
import type { CoachRuntimeSession } from './runtime/types'
import { coachToolResults } from './tools/contracts'
import { fallbackHistoryQuery, historyMeasureHint, historyQuerySchema, normalizeHistoryName, resolveHistoryExercise } from './historyQuery'

export function applyWorkoutFollowUp(message: string, prior: ({ kind: 'user'; text: string } | { kind: 'response'; response: { kind: string }; request?: string })[]): string {
  const last = prior.at(-1)
  if (last?.kind !== 'response' || last.response.kind !== 'clarification') return message
  const request = [...prior].reverse().find((item): item is { kind: 'user'; text: string } => item.kind === 'user')
  if (!request) return message
  const original = last.request ?? request.text
  const marker = '\nUser-supplied context: '
  const index = original.lastIndexOf(marker)
  return index < 0
    ? `${original}\nFollow-up answer: ${message}`
    : `${original.slice(0, index)}\nFollow-up answer: ${message}${original.slice(index)}`
}

const intentSchema = z.strictObject({ intent: z.enum(['create_workout', 'coach_qa', 'history_question']) })
const answerSchema = z.strictObject({ text: z.string().trim().min(1).max(800) })

function requestedHistoryExercise(request: string): string | null {
  const patterns = [
    /\b(?:best|heaviest|highest|maximum|max|latest|last|most recent)\s+(?:recorded\s+|logged\s+)?(?!recorded\b|logged\b)(.+?)\s+(?:load|weight|lift|sets?|reps|repetitions)\b/i,
    /\b(?:best|heaviest|highest|maximum|max|latest|last|most recent)\s+(?:recorded\s+|logged\s+)?(?:load|weight|lift|sets?)\s+(?:for|of)\s+(?:the\s+)?([^?.!,]+?)(?:[?.!,]|\s+in\s+(?:the|my)\s+|$)/i,
    /\bhow many\s+(.+?)\s+sessions?\b/i,
    /\b(?:done|performed)\s+(.+?)(?:[?.!,]|$)/i,
    /\b(?:best|heaviest|highest|maximum|max)\s+(.+?)(?:[?.!,]|$)/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(request)
    if (match) return match[1].trim()
  }
  return null
}

// An unfiltered read requires the entire request to be an understood global query.
function isUnqualifiedGlobalBest(request: string): boolean {
  const remainder = request.replace(/\b(?:(?:across|among|for)\s+)?(?:all|any)\s+(?:of\s+)?(?:my\s+)?exercises\b/i, '').replace(/[^a-z0-9]+/gi, ' ').trim().replace(/\s+/g, ' ')
  return /^(?:(?:what|which) is|show|tell me) (?:my |the )?(?:(?:recorded|logged) )?(?:best|heaviest|highest|maximum|max|personal record|pr)(?: (?:recorded|logged))?(?: (?:load|weight|lift))?$/i.test(remainder)
}

function isUnqualifiedHistoryRequest(request: string): boolean {
  const words = request.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
  return words.every(word => /^(?:what|was|is|are|how|many|show|me|tell|review|my|the|in|of|for|have|i|did|done|performed|ever|any|a|training|history|workout|workouts|session|sessions|records|recorded|logged|completed|total|volume|tonnage|reps|repetitions|sets|set|load|weight|lift|best|heaviest|highest|maximum|max|personal|record|pr|latest|last|most|recent|recently|past|days|day|weeks|week|months|month|years|year|\d+)$/.test(word))
}

type ValidatedHistoryScope = { kind: 'named'; exercise: string } | { kind: 'global' } | { kind: 'general' } | { kind: 'ambiguous' }

function validateHistoryScope(request: string, exercise: string | null, type: string): ValidatedHistoryScope {
  const all = /\b(?:all|any|across (?:all|my))\s+(?:of\s+)?(?:my\s+)?exercises\b/i.test(request)
  if (all) return !exercise && isUnqualifiedGlobalBest(request) ? { kind: 'global' } : { kind: 'ambiguous' }
  const named = requestedHistoryExercise(request)
  if (named && exercise && normalizeHistoryName(named) === normalizeHistoryName(exercise)) {
    const normalized = normalizeHistoryName(request)
    const name = normalizeHistoryName(named)
    const template = normalized.replace(name, ' EXERCISE ' ).replace(/\s+/g, ' ').trim()
    // shortcut: only complete supported question shapes are understood; extend with a structured scope contract.
    if (/^(?:what is|what was|what were|show|tell me) (?:my |the )?(?:best|heaviest|highest|maximum|max|latest|last|most recent) (?:recorded |logged )?(?:EXERCISE (?:load|weight(?: and reps)?|lift|sets|reps|repetitions)|(?:load|weight|lift|sets) (?:for|of) (?:the )?EXERCISE)(?: in (?:the sessions shown|my (?:logged|recorded) history))?(?: i am reviewing the supplied log before training on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday) around \d+ \d+)?$/i.test(template)) return { kind: 'named', exercise: named }
    if (/^(?:how many EXERCISE sessions have i logged|have i ever done EXERCISE)$/i.test(template)) return { kind: 'named', exercise: named }
  }
  if (!named && !exercise && type !== 'best' && isUnqualifiedHistoryRequest(request)) return { kind: 'general' }
  return { kind: 'ambiguous' }
}

export async function runConstrainedCoachTurn(input: { message: string; session: CoachRuntimeSession; execute: CoachToolExecutor; signal: AbortSignal; isCurrentProfile: () => boolean; maxOutputTokens: number; onWorkoutTrace?: (trace: WorkoutTrace) => void; onIntentDiagnostic?: (diagnostic: { attempt: number; outcome: string }) => void }): Promise<CoachTurnResult> {
  const { message, session, execute, signal } = input
  const clarification = (question: string): CoachTurnResult => ({ kind: 'response', response: { version: 1, kind: 'clarification', question }, repaired: false, toolCalls: 0 })
  const alive = () => !signal.aborted && input.isCurrentProfile()
  const generate = async (prompt: string, schema: object) => {
    await session.appendUserMessage(prompt)
    const result = await session.generate({ tools: [], finalResponseSchema: schema, maxOutputTokens: input.maxOutputTokens, signal })
    return result.kind === 'final' ? result.content : undefined
  }
  try {
    const explicitWorkout = /\b(?:build|create|make|design|generate|give|suggest|write|plan)\b[^.!?]{0,100}\b(?:workouts?|routines?|exercise plans?|training plans?)\b/i.test(workoutRequestText(message))
    let intent: z.infer<typeof intentSchema> | undefined
    for (let attempt = 1; attempt <= 2; attempt++) {
      await session.appendUserMessage(attempt === 1
        ? `Classify the user request into exactly one category: create_workout means they want a workout or exercise plan made for them; history_question means they ask about their past logged training; coach_qa means general advice or explanation. Use create_workout when they ask you to build, suggest, or design a session, even if they also ask for advice. Return the intent field only. Request: ${message}`
        : 'The classification was invalid. Return exactly one allowed intent.')
      const result = await session.generate({ tools: [], finalResponseSchema: z.toJSONSchema(intentSchema), maxOutputTokens: input.maxOutputTokens, signal })
      if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
      const parsed = result.kind === 'final' ? intentSchema.safeParse(result.content) : undefined
      if (parsed?.success) { intent = parsed.data; break }
      const outcome = result.kind === 'failure' ? `failure:${result.code}` : result.kind === 'final' ? 'schema_mismatch' : result.kind
      try { input.onIntentDiagnostic?.({ attempt, outcome }) } catch {}
      if (result.kind === 'failure') {
        if (explicitWorkout) break
        return { kind: 'failure', code: 'runtime_error', message: 'The coach could not classify this request. Please try again.' }
      }
    }
    if (!intent) {
      // Only explicit creation requests can bypass a malformed classifier response.
      if (explicitWorkout) intent = { intent: 'create_workout' }
      else return { kind: 'failure', code: 'runtime_error', message: 'The coach could not classify this request. Please try again.' }
    }
    const request = workoutRequestText(message)
    const explicitRecordedBest = /\b(?:best|heaviest|highest|maximum|max|personal record|pr)\b/i.test(request)
      && /\b(?:load|weight|lift|personal record|pr)\b/i.test(request)
      && (/\b(?:recorded|logged|history|(?:sessions?|records?|log) (?:shown|supplied|provided)|i (?:have|did)|i've)\b/i.test(request) || /\bmy\s+heaviest\b/i.test(request))
      && /\b(?:what|which|how much|show|tell)\b/i.test(request)
      && (!/\bbest\s+weight\s+for\b/i.test(request) || /\b(?:recorded|logged)\s+history\b|\b(?:recorded|logged)\s+best\b/i.test(request))
    const explicitLoadAdvice = /\bbest\s+weight\s+for\b/i.test(request) && !explicitRecordedBest
    const explicitRecommendation = /\b(?:should i|recommend(?:ed|ation)?|what weight (?:should|would|could))\b/i.test(request)
    if (explicitWorkout) intent = { intent: 'create_workout' }
    else if (explicitRecordedBest && explicitRecommendation) return clarification('Would you like your recorded result or a weight recommendation?')
    else if (explicitLoadAdvice) intent = { intent: 'coach_qa' }
    else if (intent.intent === 'coach_qa' && explicitRecordedBest) intent = { intent: 'history_question' }
    const end = new Date()
    const start = new Date(end.getTime() - 90 * 86400000)
    const interval = { start: start.toISOString(), end: end.toISOString() }
    if (intent.intent === 'history_question') {
      let query = fallbackHistoryQuery(message)
      let repaired = false
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const hint = historyMeasureHint(message)
          const requested = fallbackHistoryQuery(message)
          const constrainedSchema = hint ? historyQuerySchema.extend({ type: z.literal(hint) }) : historyQuerySchema
          const parsed = constrainedSchema.safeParse(await generate(`Extract the history query from: ${message}. Use type sessions, repetitions, volume, best, latest, or presence. Exercise is the requested exercise name or null; days is the requested period in days or null for available history. Do not invent an exercise or period.${attempt ? ' The previous query missed the requested measure or exercise; include both.' : ''}`, z.toJSONSchema(constrainedSchema)))
          if (parsed.success) {
            if (requested.exercise && !parsed.data.exercise) { repaired = true; continue }
            const extracted = parsed.data.exercise === 'null' && normalizeHistoryName(requestedHistoryExercise(request) ?? '') !== 'null' ? null : parsed.data.exercise
            query = { ...parsed.data, days: requested.days, exercise: extracted && normalizeHistoryName(request).includes(normalizeHistoryName(extracted)) ? extracted : requested.exercise }
            repaired = attempt > 0
            break
          }
          repaired = true
        }
      } catch { repaired = true }
      if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
      const scope = validateHistoryScope(request, query.exercise, query.type)
      if (scope.kind === 'ambiguous') return clarification('Which exercise should I check?')
      query.exercise = scope.kind === 'named' ? scope.exercise : null
      const answer = (text: string, limitations: string[] = [], toolCalls = 0): CoachTurnResult => ({ kind: 'response', response: { version: 1, kind: 'answer', blocks: [{ kind: 'text', text, evidence: [] }], limitations }, repaired, toolCalls })
      const historyInterval = { start: new Date(end.getTime() - Math.min(query.days ?? 365, 365) * 86400000).toISOString(), end: end.toISOString() }
      const scopeLimit = query.days === null || query.days > 365 ? ['Reviewed the most recent year; older history was not queried.'] : []
      let exerciseId: string | undefined
      if (query.exercise) {
        const requestedName = normalizeHistoryName(query.exercise)
        const catalog = resolveHistoryExercise(query.exercise)
        let cursor: string | undefined
        const seen = new Set<string>()
        const identities = new Set<string>()
        let identityLimitations: string[] = []
        let unresolved = false
        let calls = 0
        try {
          do {
            const raw = await execute({ id: `history-identities-${calls}`, name: 'readRecords', arguments: { interval: historyInterval, limit: 50, ...(cursor ? { cursor } : {}) } }, signal)
            calls++
            const result = coachToolResults.readRecords.safeParse(raw)
            if (!result.success || result.data.kind !== 'success') return answer('I could not read your training history.', ['History read failed.'], calls)
            identityLimitations = [...new Set([...identityLimitations, ...result.data.data.coverage.limitations])]
            for (const record of result.data.data.items) for (const exercise of record.exercises) {
              const sameName = normalizeHistoryName(exercise.name) === requestedName
              const sameCatalog = catalog.kind === 'match' && exercise.exerciseId === catalog.exercise.id
              if (sameName || sameCatalog) {
                if (exercise.exerciseId) identities.add(exercise.exerciseId)
                else unresolved = true
              }
            }
            cursor = result.data.data.nextCursor ?? undefined
            if (cursor && seen.has(cursor)) break
            if (cursor) seen.add(cursor)
          } while (cursor && calls < 10)
          if (cursor) return answer('I could not reliably identify the exercise across all matching records.', [...identityLimitations, ...scopeLimit, 'Only part of the records was reviewed.'], calls)
          if (unresolved || identities.size > 1) return answer(`I found history for “${query.exercise}”, but its exercise identity is unresolved or ambiguous.`, [...identityLimitations, ...scopeLimit], calls)
          exerciseId = [...identities][0]
          if (!exerciseId) {
            if (catalog.kind === 'ambiguous' || catalog.kind === 'unknown') return answer(`I could not reliably identify “${query.exercise}” in the reviewed history.`, [...identityLimitations, ...scopeLimit], calls)
            return answer('I found no matching records in the reviewed period.', [...identityLimitations, ...scopeLimit], calls)
          }
        } catch { return answer('I could not read your training history.', ['History read failed.'], calls) }
      }
      try {
        if (query.type === 'latest' || query.type === 'presence') {
          let cursor: string | undefined
          const cursors = new Set<string>()
          let record: { id: string; startedAt: string | null; createdAt: string; exercises: { exerciseId: string | null; name: string; repetitions: number[]; weightsKg: number[]; durationSeconds: number[] | null }[] } | undefined
          let limitations: string[] = []
          let calls = 0
          do {
            const raw = await execute({ id: `history-records-${calls}`, name: 'readRecords', arguments: { interval: historyInterval, ...(exerciseId ? { exerciseId } : {}), limit: 50, ...(cursor ? { cursor } : {}) } }, signal)
            calls++
            if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
            const result = coachToolResults.readRecords.safeParse(raw)
            if (!result.success || result.data.kind !== 'success') return answer('I could not read your training history.', ['History read failed.'], calls)
            const data = result.data.data
            limitations = [...new Set([...limitations, ...data.coverage.limitations])]
            for (const item of data.items) if (!record || Date.parse(item.startedAt ?? item.createdAt) > Date.parse(record.startedAt ?? record.createdAt)) record = item
            cursor = data.nextCursor ?? undefined
            if (cursor && cursors.has(cursor)) break
            if (cursor) cursors.add(cursor)
          } while (cursor && calls < 10 && !(query.type === 'presence' && record))
          if (!record) return answer('I found no matching records in the reviewed period.', [...limitations, ...scopeLimit, ...(cursor ? ['Only part of the records was reviewed.'] : [])], calls)
          const evidence = [{ kind: 'record' as const, id: record.id }]
          const text = query.type === 'presence' ? 'I found a matching training record.' : cursor ? `A matching record is dated ${(record.startedAt ?? record.createdAt).slice(0, 10)}; I could not determine the latest from the reviewed pages.` : `The latest matching record is dated ${(record.startedAt ?? record.createdAt).slice(0, 10)}.`
          const wantsFields = query.type === 'latest' && /\b(?:sets?|load|weight|reps|repetitions)\b/i.test(message)
          if (wantsFields && !cursor) {
            const exercises = record.exercises.filter(e => !exerciseId || e.exerciseId === exerciseId)
            const sets = exercises.flatMap(e => e.repetitions.flatMap((repetitions, i) => Number.isInteger(repetitions) && repetitions > 0 && Number.isFinite(e.weightsKg[i]) && e.weightsKg[i] > 0 ? [{ exerciseId: e.exerciseId, repetitions, weightKg: e.weightsKg[i], recordId: record.id }] : []))
            if (!sets.length) return { kind: 'response', response: { version: 1, kind: 'answer', blocks: [{ kind: 'text', text, evidence }], limitations: [...limitations, ...scopeLimit, 'The requested load and repetitions are not both available for this record.'] }, repaired, toolCalls: calls }
            const metric = { id: `latest-sets:${record.id}`, kind: 'latest_recorded_sets' as const, value: sets, evidenceIds: [record.id], missingDataCount: exercises.reduce((n, e) => n + Math.max(e.repetitions.length, e.weightsKg.length), 0) - sets.length, definition: 'Recorded sets in the latest matching record; load in kilograms.' }
            return { kind: 'response', response: { version: 1, kind: 'answer', blocks: [{ kind: 'text', text, evidence }, { kind: 'metric', metricId: metric.id }], limitations: [...limitations, ...scopeLimit, ...(metric.missingDataCount ? ['Some sets have missing or invalid load or repetitions.'] : [])] }, metrics: [metric], repaired, toolCalls: calls }
          }
          return { kind: 'response', response: { version: 1, kind: 'answer', blocks: [{ kind: 'text', text, evidence }], limitations: [...limitations, ...scopeLimit, ...(cursor ? ['Only part of the records was reviewed.'] : [])] }, repaired, toolCalls: calls }
        }
        const metric = query.type === 'best' ? 'best_recorded_sets' : query.type === 'volume' ? 'external_load_volume_kg' : query.type === 'repetitions' ? 'recorded_repetitions' : 'completed_sessions'
        const raw = await execute({ id: 'summary', name: 'readTrainingSummary', arguments: { interval: historyInterval, ...(exerciseId ? { exerciseId } : {}), metrics: [metric] } }, signal)
        if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
        const result = coachToolResults.readTrainingSummary.safeParse(raw)
        if (!result.success || result.data.kind !== 'success' || !result.data.data.metrics.length) return answer('I could not read your training history.', ['History summary failed.'], 1)
        const metrics = result.data.data.metrics
        if (metrics.some(m => m.kind !== metric)) return answer('I could not read the requested history measure.', ['History summary returned an unexpected measure.'], 1)
        if (metrics.every(m => !m.evidenceIds.length || (Array.isArray(m.value) && !m.value.length))) return answer('I found no matching recorded data in the reviewed period.', [...result.data.data.coverage.limitations, ...scopeLimit], 1)
        return { kind: 'response', response: { version: 1, kind: 'answer', blocks: metrics.map(m => ({ kind: 'metric' as const, metricId: m.id })), limitations: [...result.data.data.coverage.limitations, ...scopeLimit] }, metrics, repaired, toolCalls: 1 }
      } catch {
        if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
        return answer('I could not read your training history.', ['History read failed.'], 1)
      }
    }
    const userRequest = workoutRequestText(message)
    if (intent.intent === 'create_workout' && /\b(?:injur(?:y|ies|ed)|pain|hurts?|aches?|discomfort|soreness|pregnan(?:t|cy)|rehab|medical)\b/i.test(userRequest) && !(/\b(?:legs?|lower body)\b/i.test(userRequest) && !/\b(?:currently|right now|today|active)\b.{0,30}\b(?:pain|hurts?|injur)/i.test(userRequest) && /\bwrist\b/i.test(userRequest) && (userRequest.match(/\b(?:injur(?:y|ies|ed)|pain|hurts?|aches?|discomfort|soreness|pregnan(?:t|cy)|rehab|medical)\b/gi) ?? []).length === 1 && !/\b(?:chest|back|arms?|shoulders?|full[- ]body|pregnan(?:t|cy)|rehab|medical)\b/i.test(userRequest))) return clarification('What movements are safe for your condition? A qualified health professional can help you identify suitable limits.')
    if (intent.intent === 'coach_qa') {
      const schema = z.toJSONSchema(answerSchema)
      for (let attempt = 0; attempt < 2; attempt++) {
        let raw: unknown
        try { raw = await generate(`Give general coaching advice, without claims about the user's personal history or numeric personal claims. Request: ${message}${attempt ? '\nThe previous answer was invalid. Return concise general advice without claims about personal logged training.' : ''}`, schema) } catch { if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }; break }
        const answer = answerSchema.safeParse(raw)
        if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
        if (answer.success && !/[?]/.test(answer.data.text) && !/\b(?:please (?:tell|provide|share|specify)|could you|can you clarify)\b/i.test(answer.data.text) && !/\b(?:your|you(?:'ve| have| did| were)?)\b.{0,60}\b(?:history|last|previous|logged|completed|recorded|lifted)\b/i.test(answer.data.text) && !/\b(?:your|you(?:'ve| have| did| were)?)\b.{0,60}\b(?:best|heaviest|maximum|max|record|pr)\b.{0,40}\b\d+(?:[.,]\d+)?\b|\b(?:your|you(?:'ve| have| did| were)?)\b.{0,60}\b(?:load|weight|lift|lifted|pressed|squatted|weighed)\b.{0,40}\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|lb|lbs|pounds?|kilograms?)\b/i.test(answer.data.text) && !/\byour\s+\d+(?:[.,]\d+)?\s*(?:kg|kgs|lb|lbs|pounds?|kilograms?)?\s+(?:best|record|pr|maximum|max)\b/i.test(answer.data.text)) return { kind: 'response', response: { version: 1, kind: 'answer', blocks: [{ kind: 'text', text: answer.data.text, evidence: [] }], limitations: [] }, repaired: attempt > 0, toolCalls: 0 }
      }
      return { kind: 'response', response: { version: 1, kind: 'answer', blocks: [{ kind: 'text', text: 'Start at a comfortable effort, use controlled movement, and stop if you experience pain. For symptoms or medical concerns, seek advice from a qualified health professional.', evidence: [] }], limitations: ['General guidance; the requested specific answer was unavailable.'] }, repaired: true, toolCalls: 0 }
    }
    const schedule = parseWorkoutSchedule(userRequest)
    if (schedule.kind === 'clarification') return clarification(schedule.question)
    const sessionCount = schedule.kind === 'weekly' ? schedule.sessions : 1
    const focuses = workoutSessionFocuses(schedule)
    const plannedSessions = focuses.map(focus => planWorkout(message, focus))
    for (const planned of plannedSessions) {
      if (planned.kind === 'clarification') {
        try { input.onWorkoutTrace?.({ ...planned.diagnostics, source: 'defaults', assumptions: [], validationErrors: [], timedOut: false }) } catch { /* Diagnostics cannot alter delivery. */ }
        return clarification(planned.question)
      }
      if (planned.kind === 'infeasible') {
        try { input.onWorkoutTrace?.({ ...planned.diagnostics, source: 'defaults', assumptions: [], validationErrors: [], timedOut: false }) } catch { /* Diagnostics cannot alter delivery. */ }
        return { kind: 'response', response: { version: 1, kind: 'cannot_fulfill', reason: planned.reason }, repaired: false, toolCalls: 0 }
      }
    }
    const plans = plannedSessions.flatMap(result => result.kind === 'plan' ? [result.plan] : [])
    const titles = focuses.map((focus, index) => `Day ${index + 1}${focus ? ` — ${focus[0].toUpperCase()}${focus.slice(1)}` : ''}`)
    const errors: string[] = []
    let timedOut = false
    let selected: string[][] | undefined
    const routineSelections = z.strictObject({ sessions: z.strictObject(Object.fromEntries(
      plans.map((plan, index) => [`day_${index + 1}`, z.strictObject({ selections: z.strictObject(Object.fromEntries(
        plan.slots.map((slot, slotIndex) => [`slot_${slotIndex + 1}`, z.enum(slot.map(exercise => exercise.name))])
      )) })])
    )) })
    const schema = sessionCount === 1 ? selectionSchema(plans[0]) : z.toJSONSchema(routineSelections)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await session.appendUserMessage(`Original request: ${userRequest}\nPlan ${sessionCount} training session(s). Exercise counts, sets, repetitions, and duration apply to each session. Choose one distinct exercise name for each slot, in order, for each session. Prefer complementary movements and angles; multiple exercises from the same movement family are allowed. Never repeat the same exercise within a session. ${sessionCount > 1 ? 'Return a sessions object keyed day_1, day_2, etc. Each day contains a selections object with one allowed exercise per slot. Respect each day’s distinct focus and choices.' : 'Return selections only.'} Session slots: ${JSON.stringify(plans.map((plan, index) => ({ day: `day_${index + 1}`, title: titles[index], slots: plan.slots.map(slot => slot.map(exercise => exercise.name)) })))}. ${errors.length ? `Validation errors: ${errors.join('; ')}` : ''}`)
        const generated = await session.generate({ tools: [], finalResponseSchema: schema, maxOutputTokens: input.maxOutputTokens, signal })
        if (generated.kind === 'failure') throw new Error(generated.message)
        const raw = generated.kind === 'final' ? generated.content : undefined
        if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
        const batch = routineSelections.safeParse(raw)
        const sessions = sessionCount === 1 ? [raw] : batch.success ? plans.map((plan, index) => ({ selections: plan.slots.map((_, slotIndex) => batch.data.sessions[`day_${index + 1}`].selections[`slot_${slotIndex + 1}`]) })) : []
        if (sessions.length !== sessionCount) { errors.push(`Expected ${sessionCount} workout sessions`); continue }
        const checked = sessions.map((session, index) => validateSelection(plans[index], session))
        errors.push(...checked.flatMap(result => result.errors))
        const names = checked.flatMap(result => result.names ? [result.names] : [])
        if (names.length === sessionCount) { selected = names; break }
      } catch (error) {
        if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
        timedOut = error instanceof Error && /timeout|timed out|deadline/i.test(error.message)
        errors.push(timedOut ? 'Model selection timed out' : 'Model selection failed')
        break
      }
    }
    const renderedSessions = plans.map((plan, index) => renderWorkout(plan, selected?.[index] ?? defaultSelection(plan)))
    const workouts: CoachWorkout[] = renderedSessions.map((rendered, index) => ({ ...rendered.workout, ref: `workout-${index + 1}`, title: `${titles[index]}${plans[index].partial ? ' — partial workout' : ''}` }))
    const source = selected ? 'model' : 'template'
    const response: CoachResponse = schedule.kind === 'weekly'
      ? { version: 1, kind: 'routine_draft', workouts, routine: { type: 'WEEKLY_COMPLETION', title: `${sessionCount}-day workout routine`, workoutRefs: workouts.map(workout => workout.ref) }, assumptions: [...new Set(renderedSessions.flatMap(rendered => rendered.assumptions)), `Planned ${sessionCount} training sessions per week; choose your training and rest days. Exercise counts and durations apply to each session.`, schedule.split === 'ppl' ? 'Push/Pull/Legs split: chest, shoulders and triceps; back and biceps; then legs. Each day has its own eligible exercise choices.' : 'Sessions use the same requested muscle targets; exercises may repeat across days.', ...(selected ? [] : [schedule.split === 'ppl' ? 'Model selection was unavailable; each training day uses its own focus-specific catalog template.' : 'Model selection was unavailable; each training day repeats the catalog template.'])] }
      : renderedSessions[0]
    plannedSessions.forEach((planned, index) => {
      try { input.onWorkoutTrace?.({ ...planned.diagnostics, source, assumptions: response.assumptions, validationErrors: errors, timedOut, session: { index: index + 1, title: titles[index], focus: focuses[index] ?? 'shared' } }) } catch { /* Diagnostics cannot alter delivery. */ }
    })
    return { kind: 'response', response, repaired: errors.length > 0, toolCalls: 0 }
  } catch {
    return alive() ? { kind: 'failure', code: 'runtime_error', message: 'The coach could not complete this request.' } : { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
  }
}
