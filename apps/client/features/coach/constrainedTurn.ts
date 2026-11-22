import { z } from 'zod'
import { parseWorkoutSchedule, workoutSessionFocuses } from './workoutSchedule'
import type { CoachWorkout, CoachResponse } from './contracts'
import { defaultSelection, planWorkout, renderWorkout, selectionSchema, validateSelection, workoutRequestText } from './workoutPlanner'
import type { CoachRuntimeSession } from './runtime/types'
import { calculateHistoryMetrics, type CoachHistoryMetric } from './historyMetrics'
import { fallbackHistoryQuery, historyExerciseFilter, historyMeasureHint, historyQuerySchema, normalizeHistoryName } from './historyQuery'
import { exerciseCatalog } from '../../lib/exercises/catalog'
import type { CoachHistoryRepository } from '../../lib/repositories/CoachHistoryRepository'

export function applyWorkoutFollowUp(message: string, prior: ({ kind: 'user'; text: string } | { kind: 'response'; response: { kind: string; question?: string }; request?: string })[]): string {
  const last = prior.at(-1)
  if (last?.kind !== 'response' || /\b(?:new (?:workout|routine|task)|start (?:over|again)|reset)\b/i.test(message)) return message
  if (/\b(?:build|create|design|generate|give|plan)\b[^.!?]*\b(?:workout|routine|training plan)\b/i.test(message)) return message
  if (/^(?:what|why|how|when|where|who)\b/i.test(message.trim()) && !/\bequipment\b/i.test(message)) return message
  const draft = last.response.kind === 'workout_draft' || last.response.kind === 'routine_draft'
  if (last.response.kind !== 'clarification' && !draft) return message
  const request = [...prior].reverse().find((item): item is { kind: 'user'; text: string } => item.kind === 'user')
  if (!request) return message
  let original = (last.request ?? request.text).replace(/\nUnsupported workout revision: [^\n]*/g, '')
  const question = /Which single change should I make/i.test(last.response.question ?? '')
    ? [...prior].reverse().flatMap(item => item.kind === 'response' && item.response.kind === 'clarification' && /(?:[“"].+?[”"]|clarify the exercise counts)/i.test(item.response.question ?? '') ? [item.response.question] : [])[0] ?? last.response.question ?? ''
    : last.response.question ?? ''
  if (/specific calendar dates are not supported/i.test(question) && /^(?:the\s+)?(?:past\s+|last\s+)?\d+\s+(?:days?|weeks?)[.!]?$/i.test(message.trim())) {
    return original.replace(/\b(?:in|during|for)\s+(?:(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+\d{4})?|\d{4}-\d{1,2}(?:-\d{1,2})?)/i, `in the past ${message.trim().replace(/^(?:the\s+)?(?:past\s+|last\s+)?/i, '').replace(/[.!]$/, '')}`)
  }
  if (last.response.kind === 'clarification' && /\b(?:exercise|movement)\b/i.test(question) && /[“"].+?[”"]/.test(question)) {
    const quoted = /[“"]([^”"]+)[”"]/.exec(question)?.[1]
    const replacement = /^(?:please\s+)?(?:replace|swap)\s+(.+?)\s+(?:with|for)\s+(.+?)[.!?]?$/i.exec(message.trim())
    const name = replacement ? (quoted && replacement[1].toLowerCase() === quoted.toLowerCase() ? replacement[2] : '') : message.trim().replace(/[.!?]$/, '')
    const matches = exerciseCatalog.filter(exercise => exercise.setupReviewStatus === 'reviewed' && exercise.name.toLowerCase() === name.toLowerCase())
    const contextAt = original.lastIndexOf('\nUser-supplied context: ')
    const main = contextAt < 0 ? original : original.slice(0, contextAt)
    if (quoted && quoted.length <= 80 && !/\b(?:sets?|reps?|rest|minutes?)\b|\d/i.test(quoted) && matches.length === 1 && main.indexOf(quoted) >= 0 && main.indexOf(quoted) === main.lastIndexOf(quoted)) {
      return main.replace(quoted, matches[0].name) + (contextAt < 0 ? '' : original.slice(contextAt))
    }
    return `${original}\nUnsupported workout revision: ${message}`
  }
  if (last.response.kind === 'clarification' && /clarify the exercise counts/i.test(question)) {
    const correction = /^(?:(?:please\s+)?(?:make|change|set)\s+(?:it\s+)?|(?:create|build)\s+)(?:to\s+)?(exactly\s+\d+\s+(?:(?:chest|back|legs?|arms?|shoulders?|core)\s+)?(?:exercises?|movements?))(?:,?\s+full gym)?[.!]?$/i.exec(message.trim())
    if (correction) {
      const marker = '\nUser-supplied context: '
      const index = original.lastIndexOf(marker)
      const main = index < 0 ? original : original.slice(0, index)
      const context = index < 0 ? '' : original.slice(index)
      const counts = /\b(?:(?:exactly|at least|at most)\s+)?\d+\s+(?:(?:chest|back|legs?|arms?|shoulders?|core)\s+)?(?:exercises?|movements?)\b/gi
      let first = true
      const revised = main.replace(counts, () => { if (first) { first = false; return correction[1] } return '' }).replace(/\s+and\s+(?=,|[.!?]|$)/gi, '').replace(/\s+,/g, ',')
      if (!first) return revised + context
    }
  }
  const edit = /^(?:please\s+)?(?:(?:make|change|set|use)(?:\s+it|\s+them|\s+the)?(?:\s+to)?\s+)?(\d+)\s+(sets?|reps?|repetitions?|exercises?|movements?|minutes?|mins?)(?:\s+instead)?[.!]?$/i.exec(message.trim())
  const rest = /^(?:please\s+)?(?:make|change|set|use)\s+(?:the\s+)?rest\s+(?:to\s+)?(\d+)\s*(seconds?|secs?|minutes?|mins?)(?:\s+instead)?[.!]?$/i.exec(message.trim())
  if (edit || rest) {
    const marker = '\nUser-supplied context: '
    const index = original.lastIndexOf(marker)
    let main = index < 0 ? original : original.slice(0, index)
    const context = index < 0 ? '' : original.slice(index)
    if (edit) {
      const value = edit[1], unit = edit[2].toLowerCase()
      if (unit.startsWith('set')) {
        main = main.replace(/\b\d+\s*[x×]\s*(\d+(?:\s*(?:-|–|—|to)\s*\d+)?)/gi, `${value} sets of $1`).replace(/\b\d+\s+sets?\b/gi, `${value} sets`)
        if (!/\b\d+\s+sets?\b/i.test(main)) main += `, ${value} sets`
      } else if (/^(?:rep|repetition)/.test(unit)) {
        main = main.replace(/\b(\d+)\s*[x×]\s*\d+(?:\s*(?:-|–|—|to)\s*\d+)?/gi, `$1 sets of ${value}`).replace(/(\b\d+\s+sets?\s+of\s+)\d+(?:\s*(?:-|–|—|to)\s*\d+)?/gi, `$1${value}`).replace(/\b\d+(?:\s*(?:-|–|—|to)\s*\d+)?\s*(?:reps?|repetitions?)\b/gi, `${value} reps`)
        if (!new RegExp(`\\b${value}\\s*(?:reps?|repetitions?)\\b|\\bsets?\\s+of\\s+${value}\\b`, 'i').test(main)) main += `, ${value} reps`
      } else if (/^(?:exercise|movement)/.test(unit)) {
        main = main.replace(/\b\d+\s+(?:(?:chest|back|legs?|arms?|shoulders?|core)\s+)?(?:exercises?|movements?)\b/gi, match => match.replace(/^\d+/, value))
        if (!/\b\d+\s+(?:(?:chest|back|legs?|arms?|shoulders?|core)\s+)?(?:exercises?|movements?)\b/i.test(main)) main += `, ${value} exercises`
      } else {
        // shortcut: duration edits with rest or multiple durations need clarification; extend with structured constraints.
        if (/\b(?:rest|seconds?|secs?)\b/i.test(main) || (main.match(/\b\d+\s*(?:minutes?|mins?|hours?|hrs?)\b/gi) ?? []).length > 1) return `${original}\nUnsupported workout revision: ${message}`
        main = main.replace(/\b\d+\s*(?:minutes?|mins?|hours?|hrs?)\b/gi, `${value} minutes`)
        if (!/\b\d+\s*minutes?\b/i.test(main)) main += `, ${value} minutes`
      }
    } else if (rest) {
      main = main.replace(/\b\d+\s*(?:seconds?|secs?|minutes?|mins?)\s+(?:of\s+)?rest\b|\brest\s+(?:for\s+)?\d+\s*(?:seconds?|secs?|minutes?|mins?)\b/gi, `rest ${rest[1]} ${rest[2]}`)
      if (!/\brest\s+\d+\s*(?:seconds?|secs?|minutes?|mins?)\b/i.test(main)) main += `, rest ${rest[1]} ${rest[2]}`
    }
    return main + context
  }
  if (/\b(?:instead|change|replace|switch|modify|edit|make it|use only|shorter|longer|less|more)\b/i.test(message)) return `${original}\nUnsupported workout revision: ${message}`
  if (draft) return message
  const marker = '\nUser-supplied context: '
  const index = original.lastIndexOf(marker)
  return index < 0
    ? `${original}\nFollow-up answer: ${message}`
    : `${original.slice(0, index)}\nFollow-up answer: ${message}${original.slice(index)}`
}

const intentSchema = z.strictObject({ intent: z.enum(['create_workout', 'coach_qa', 'history_question']) })

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
  return words.every(word => /^(?:what|was|is|are|how|many|show|me|tell|review|my|the|in|of|for|have|i|did|done|performed|ever|any|a|training|history|workout|workouts|session|sessions|records|recorded|logged|log|completed|total|volume|tonnage|reps|repetitions|sets|set|load|weight|lift|best|heaviest|highest|maximum|max|personal|record|pr|latest|last|most|recent|recently|past|days|day|weeks|week|months|month|years|year|\d+)$/.test(word))
}

type ValidatedHistoryScope = { kind: 'named'; exercise: string } | { kind: 'global' } | { kind: 'general' } | { kind: 'ambiguous' }

function validateHistoryScope(request: string, exercise: string | null, type: string): ValidatedHistoryScope {
  const all = /\b(?:all|any|across (?:all|my))\s+(?:of\s+)?(?:my\s+)?exercises\b/i.test(request)
  if (all) return !exercise && isUnqualifiedGlobalBest(request) ? { kind: 'global' } : { kind: 'ambiguous' }
  const named = requestedHistoryExercise(request)
  if (named && exercise && normalizeHistoryName(named) === normalizeHistoryName(exercise)) {
    const normalized = normalizeHistoryName(request)
    const name = normalizeHistoryName(named)
    const template = normalized.replace(name, ' EXERCISE ' ).replace(/\s+in\s+the\s+(?:past|last)\s+\d+\s+(?:days?|weeks?)$/, '').replace(/\s+/g, ' ').trim()
    // shortcut: only complete supported question shapes are understood; extend with a structured scope contract.
    if (/^(?:what is|what was|what were|show|tell me) (?:my |the )?(?:best|heaviest|highest|maximum|max|latest|last|most recent) (?:recorded |logged )?(?:EXERCISE (?:load|weight(?: and reps)?|lift|sets|reps|repetitions)|(?:load|weight|lift|sets) (?:for|of) (?:the )?EXERCISE)(?: in (?:the sessions shown|my (?:logged|recorded) history))?(?: i am reviewing the supplied log before training on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday) around \d+ \d+)?$/i.test(template)) return { kind: 'named', exercise: named }
    if (/^(?:how many EXERCISE sessions have i logged|have i ever done EXERCISE)$/i.test(template)) return { kind: 'named', exercise: named }
  }
  if (!named && !exercise && type !== 'best' && isUnqualifiedHistoryRequest(request)) return { kind: 'general' }
  return { kind: 'ambiguous' }
}

export type CoachTurnResult =
  | { kind: 'response'; response: CoachResponse; repaired: boolean; metrics?: CoachHistoryMetric[] }
  | { kind: 'failure'; code: 'cancelled' | 'stale_profile' | 'runtime_error'; message: string }

export async function runConstrainedCoachTurn(input: {
  message: string
  session: CoachRuntimeSession
  readHistory: CoachHistoryRepository['readHistory']
  signal: AbortSignal
  isCurrentProfile: () => boolean
  maxOutputTokens: number
  priorUserMessages?: string[]
}): Promise<CoachTurnResult> {
  const { message, session, readHistory, signal } = input
  const clarification = (question: string): CoachTurnResult => ({ kind: 'response', response: { version: 1, kind: 'clarification', question }, repaired: false })
  const alive = () => !signal.aborted && input.isCurrentProfile()
  const generate = async (prompt: string, schema: object) => {
    await session.appendUserMessage(prompt)
    const result = await session.generate({ finalResponseSchema: schema, maxOutputTokens: input.maxOutputTokens, signal })
    return result.kind === 'final' ? result.content : undefined
  }
  try {
    if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
    // This bounded safety route is not a substitute for clinical review.
    const emergency = /\b(?:chest\s+(?:pains?|pressure|tightness|discomfort|aches?|hurts?|is\s+(?:tight|heavy|hurting))|(?:pains?|aches?|pressure|tightness)\s+in\s+(?:my\s+|the\s+)?chest|faint(?:ed|ing)?|passed out|short(?:ness)? of breath|breathless|can(?:not|'t) breathe|(?:difficulty|trouble|struggling|hard time) (?:to |with )?breath(?:e|ing)|breathing (?:is )?(?:difficult|hard)|severe bleeding|stroke|heart attack)\b/i
    const restricted = /\b(pregnan\w*|postpartum|breastfeed\w*|child\w*|teen\w*|adolescen\w*|elderly|senior\w*|older adult\w*|injur\w*|rehab\w*|disab\w*|surgery|surgical|disease|diabet\w*|cardiac|heart|dizz\w*|symptom\w*|pain|hurts?|aches?|discomfort|soreness|cancer)\b/i
    const history = [...(input.priorUserMessages ?? []), message]
    const acute = history.some(text => emergency.test(text) && !/^(?:i have |there is )?no (?:chest pain|chest pressure|chest tightness|difficulty breathing|shortness of breath)[.!]?$/i.test(text.trim()) && !/\b(?:resolved|gone away|went away)\b.*\b(?:years? ago|months? ago)\b|\b(?:years? ago|months? ago)\b.*\b(?:resolved|gone away|went away)\b/i.test(text))
    if (acute) return { kind: 'response', repaired: false, response: { version: 1, kind: 'cannot_fulfill', reason: 'Stop exercising. If these symptoms are current or have just occurred, call your local emergency number now; do not drive yourself. Seek urgent medical help. I cannot determine from this conversation whether it is safe to train.' } }
    if (history.some(text => emergency.test(text))) return clarification('Are these symptoms current or recent, or explicitly absent or resolved? I cannot determine whether training is safe; consult a qualified health professional before exercising.')
    if (/\bno\s+(?:pain|injuries|injury|symptoms)\b/i.test(message)) return clarification('You mentioned no pain or injuries. I cannot determine whether training is safe; consult a qualified health professional if you have concerns.')
    if (restricted.test(message)) return { kind: 'response', repaired: false, response: { version: 1, kind: 'cannot_fulfill', reason: 'Stop any activity that causes symptoms or pain. I cannot recommend exercise for this situation; consult a qualified health professional who knows your circumstances.' } }
    if (message.includes('\nUnsupported workout revision: ')) return clarification('Which single change should I make? You can specify a number of sets, reps, exercises, or rest. For equipment or other changes, please start a new workout request with all your requirements.')
    const explicitWorkout = /\b(?:build|create|make|design|generate|give|suggest|write|plan)\b[^.!?]{0,100}\b(?:workouts?|routines?|exercise plans?|training plans?)\b/i.test(workoutRequestText(message))
    let intent: z.infer<typeof intentSchema> | undefined
    for (let attempt = 1; attempt <= 2; attempt++) {
      await session.appendUserMessage(attempt === 1
        ? `Classify the user request into exactly one category: create_workout means they want a workout or exercise plan made for them; history_question means they ask about their past logged training; coach_qa means general advice or explanation. Use create_workout when they ask you to build, suggest, or design a session, even if they also ask for advice. Return the intent field only. Request: ${message}`
        : 'The classification was invalid. Return exactly one allowed intent.')
      const result = await session.generate({ finalResponseSchema: z.toJSONSchema(intentSchema), maxOutputTokens: input.maxOutputTokens, signal })
      if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
      const parsed = result.kind === 'final' ? intentSchema.safeParse(result.content) : undefined
      if (parsed?.success) { intent = parsed.data; break }
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
    if (intent.intent === 'history_question') {
      const end = new Date()
      if (/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{4}-\d{1,2}(?:-\d{1,2})?)\b/i.test(request)) return clarification('Which recent period in days or weeks should I check? Specific calendar dates are not supported yet.')
      const requested = fallbackHistoryQuery(message)
      const hint = historyMeasureHint(message)
      const constrainedSchema = hint ? historyQuerySchema.extend({ type: z.literal(hint) }) : historyQuerySchema
      let query = requested
      let repaired = false
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const parsed = constrainedSchema.safeParse(await generate(`Extract the history query from: ${message}. Use type sessions, repetitions, volume, best, latest, or presence. Exercise is the requested exercise name or null; days is the requested period in days or null for available history. Do not invent an exercise or period.${attempt ? ' The previous query missed the requested measure or exercise; include both.' : ''}`, z.toJSONSchema(constrainedSchema)))
          if (!alive()) break
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
      const answer = (
        blocks: Extract<CoachResponse, { kind: 'answer' }>['blocks'],
        limitations: string[],
        metric?: CoachHistoryMetric
      ): CoachTurnResult => ({
        kind: 'response',
        response: { version: 1, kind: 'answer', blocks, limitations },
        ...(metric && { metrics: [metric] }),
        repaired,
      })
      const textAnswer = (text: string, limitations: string[]) =>
        answer([{ kind: 'text', text, evidence: [] }], limitations)
      const interval = {
        start: new Date(end.getTime() - Math.min(query.days ?? 365, 365) * 86400000).toISOString(),
        end: end.toISOString(),
      }
      const scopeLimit = query.days === null || query.days > 365
        ? ['Reviewed the most recent year; older history was not queried.']
        : []
      try {
        const result = await readHistory({
          interval,
          exercise: scope.kind === 'named' ? historyExerciseFilter(scope.exercise) : null,
        })
        if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
        const limitations = [...result.limitations, ...scopeLimit]
        if (result.kind !== 'success') {
          const name = scope.kind === 'named' ? scope.exercise : query.exercise
          return textAnswer(
            result.kind === 'ambiguous'
              ? `I found history for “${name}”, but its exercise identity is unresolved or ambiguous.`
              : `I could not reliably identify “${name}” in the reviewed history.`,
            limitations
          )
        }

        const { records } = result
        const [firstRecord] = records
        if (!firstRecord) {
          return textAnswer(
            scope.kind === 'named' || query.type === 'latest' || query.type === 'presence'
              ? 'I found no matching records in the reviewed period.'
              : 'I found no matching recorded data in the reviewed period.',
            limitations
          )
        }
        if (query.type === 'latest' || query.type === 'presence') {
          let record = firstRecord
          for (const item of records) {
            if (item.timestamp > record.timestamp) record = item
          }
          const date = new Date(record.timestamp).toISOString().slice(0, 10)
          const text = query.type === 'presence'
            ? 'I found a matching training record.'
            : `The latest matching record is dated ${date}.`
          const block = { kind: 'text' as const, text, evidence: [{ kind: 'record' as const, id: record.id }] }
          if (query.type === 'presence' || !/\b(?:sets?|load|weight|reps|repetitions)\b/i.test(message)) {
            return answer([block], limitations)
          }
          const recordId = record.id
          const sets = record.exercises.flatMap(exercise =>
            exercise.repetitions.flatMap((repetitions, i) => {
              const weightKg = exercise.weightsKg[i]
              return Number.isInteger(repetitions) && repetitions > 0 && Number.isFinite(weightKg) && weightKg >= 0
                ? [{ exerciseId: exercise.exerciseId, exerciseName: exercise.name, repetitions, weightKg, recordId }]
                : []
            })
          )
          if (!sets.length) {
            return answer([block], [...limitations, 'The requested load and repetitions are not both available for this record.'])
          }
          const totalSets = record.exercises.reduce((total, exercise) =>
            total + Math.max(exercise.repetitions.length, exercise.weightsKg.length), 0
          )
          const metric: CoachHistoryMetric = {
            id: `latest-sets:${recordId}`,
            kind: 'latest_recorded_sets',
            value: sets,
            evidenceIds: [recordId],
            missingDataCount: totalSets - sets.length,
            definition: 'Recorded sets in the latest matching record; load in kilograms.',
          }
          if (metric.missingDataCount) limitations.push('Some sets have missing or invalid load or repetitions.')
          return answer([block, { kind: 'metric', metricId: metric.id }], limitations, metric)
        }

        const calculated = calculateHistoryMetrics(records)
        const missingLoadData = calculated.invalidRepetitions + calculated.invalidLoads + calculated.missingWeights
        const measures = {
          best: { kind: 'best_recorded_sets', value: calculated.bestSets, missingDataCount: missingLoadData },
          volume: { kind: 'external_load_volume_kg', value: calculated.externalLoadVolumeKg, missingDataCount: missingLoadData },
          repetitions: { kind: 'recorded_repetitions', value: calculated.repetitions, missingDataCount: calculated.invalidRepetitions },
          sessions: { kind: 'completed_sessions', value: calculated.completedSessions, missingDataCount: 0 },
        } satisfies Record<typeof query.type, Pick<CoachHistoryMetric, 'kind' | 'value' | 'missingDataCount'>>
        const measure = measures[query.type]
        if (Array.isArray(measure.value) && !measure.value.length) {
          return textAnswer('I found no matching recorded data in the reviewed period.', limitations)
        }
        if (typeof measure.value === 'number' && !Number.isFinite(measure.value)) {
          return textAnswer('I could not read your training history.', ['History summary failed.'])
        }
        const metric: CoachHistoryMetric = {
          ...measure,
          id: measure.kind,
          evidenceIds: records.map(record => record.id),
        }
        return answer([{ kind: 'metric', metricId: metric.id }], limitations, metric)
      } catch {
        if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
        return textAnswer('I could not read your training history.', ['History read failed.'])
      }
    }
    const userRequest = workoutRequestText(message)
    if (intent.intent === 'coach_qa') return { kind: 'response', response: { version: 1, kind: 'answer', blocks: [{ kind: 'text', text: 'I cannot answer that advice question: generated coaching advice is currently unavailable. I can help build a workout from your available equipment and preferences, or review your recorded training history. For individual exercise advice, consult a qualified professional.', evidence: [] }], limitations: ['Specific coaching advice is unavailable until its sources and safety have been reviewed.'] }, repaired: false }
    const schedule = parseWorkoutSchedule(userRequest)
    if (schedule.kind === 'clarification') return clarification(schedule.question)
    const sessionCount = schedule.kind === 'weekly' ? schedule.sessions : 1
    const focuses = workoutSessionFocuses(schedule)
    const plannedSessions = focuses.map(focus => planWorkout(message, focus))
    for (const planned of plannedSessions) {
      if (planned.kind === 'clarification') {
        return clarification(planned.question)
      }
      if (planned.kind === 'infeasible') {
        return { kind: 'response', response: { version: 1, kind: 'cannot_fulfill', reason: planned.reason }, repaired: false }
      }
    }
    const plans = plannedSessions.flatMap(result => result.kind === 'plan' ? [result.plan] : [])
    const titles = focuses.map((focus, index) => `Day ${index + 1}${focus ? ` — ${focus[0].toUpperCase()}${focus.slice(1)}` : ''}`)
    const errors: string[] = []
    let selected: string[][] | undefined
    const workoutSelections = z.strictObject({ sessions: z.strictObject(Object.fromEntries(
      plans.map((plan, index) => [`day_${index + 1}`, selectionSchema(plan)])
    )) })
    const schema = z.toJSONSchema(workoutSelections)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await session.appendUserMessage(`Original request: ${userRequest}\nPlan ${sessionCount} training session(s). Exercise counts, sets, repetitions, and duration apply to each session. Choose one distinct exercise name for each slot, in order, for each session. Prefer complementary movements and angles; multiple exercises from the same movement family are allowed. Never repeat the same exercise within a session. Return a sessions object with the listed day keys, starting at day_1. Each day contains a selections object keyed slot_1, slot_2, etc., with one allowed exercise name per slot. Respect each day's focus and choices. Session slots: ${JSON.stringify(plans.map((plan, index) => ({ day: `day_${index + 1}`, title: titles[index], slots: plan.slots.map(slot => slot.map(exercise => exercise.name)) })))}. ${errors.length ? `Validation errors: ${errors.join('; ')}` : ''}`)
        const generated = await session.generate({ finalResponseSchema: schema, maxOutputTokens: input.maxOutputTokens, signal })
        if (generated.kind === 'failure') throw new Error(generated.message)
        const raw = generated.kind === 'final' ? generated.content : undefined
        if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
        const parsed = workoutSelections.safeParse(raw)
        if (!parsed.success) { errors.push(`Expected ${sessionCount} workout sessions`); continue }
        const checked = plans.map((plan, index) => {
          const { selections } = parsed.data.sessions[`day_${index + 1}`]
          return validateSelection(plan, { selections: plan.slots.map((_, slotIndex) => selections[`slot_${slotIndex + 1}`]) })
        })
        errors.push(...checked.flatMap(result => result.errors))
        const names = checked.flatMap(result => result.names ? [result.names] : [])
        if (names.length === sessionCount) { selected = names; break }
      } catch (error) {
        if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
        const timedOut = error instanceof Error && /timeout|timed out|deadline/i.test(error.message)
        errors.push(timedOut ? 'Model selection timed out' : 'Model selection failed')
        break
      }
    }
    const renderedSessions = plans.map((plan, index) => renderWorkout(plan, selected?.[index] ?? defaultSelection(plan)))
    const workouts: CoachWorkout[] = renderedSessions.map((rendered, index) => ({ ...rendered.workout, ref: `workout-${index + 1}`, title: `${titles[index]}${plans[index].partial ? ' — partial workout' : ''}` }))
    const response: CoachResponse = schedule.kind === 'weekly'
      ? { version: 1, kind: 'routine_draft', workouts, routine: { type: 'WEEKLY_COMPLETION', title: `${sessionCount}-day workout routine`, workoutRefs: workouts.map(workout => workout.ref) }, assumptions: [...new Set(renderedSessions.flatMap(rendered => rendered.assumptions)), `Planned ${sessionCount} training sessions per week; choose your training and rest days. Exercise counts and durations apply to each session.`, schedule.split === 'ppl' ? 'Push/Pull/Legs split: chest, shoulders and triceps; back and biceps; then legs. Each day has its own eligible exercise choices.' : 'Sessions use the same requested muscle targets; exercises may repeat across days.', ...(selected ? [] : [schedule.split === 'ppl' ? 'Model selection was unavailable; each training day uses its own focus-specific catalog template.' : 'Model selection was unavailable; each training day repeats the catalog template.'])] }
      : { ...renderedSessions[0], assumptions: [...renderedSessions[0].assumptions, ...(selected ? [] : ['Model selection was unavailable; this draft uses a validated catalog template.'])] }
    return { kind: 'response', response, repaired: errors.length > 0 }
  } catch {
    return alive() ? { kind: 'failure', code: 'runtime_error', message: 'The coach could not complete this request.' } : { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
  }
}
