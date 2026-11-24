import { z } from 'zod'
import { parseWorkoutSchedule, weekdayLabels, workoutSessionFocuses, workoutSessionRequests, workoutVariation } from './workoutSchedule'
import type { CoachWorkout, CoachResponse } from './contracts'
import { defaultSelection, planWorkout, renderWorkout, selectionSchema, sessionsMeetVariation, validateSelection, variedCatalogSelections, workoutRequestText } from './workoutPlanner'
import type { CoachRuntimeSession } from './runtime/types'
import { calculateHistoryMetrics, type CoachHistoryMetric } from './historyMetrics'
import { historyExerciseFilter, historyExerciseSuggestions, normalizeHistoryName, parseHistoryRequest } from './historyQuery'
import { exerciseCatalog } from '../../lib/exercises/catalog'
import type { CoachHistoryRepository } from '../../lib/repositories/CoachHistoryRepository'
import { runLibraryTurn } from './libraryTurn'

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
    return original.replace(/\b(?:in|during|for)\s+(?:(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+\d{4})?|\d{4}(?:-\d{1,2}(?:-\d{1,2})?)?)\b/i, `in the past ${message.trim().replace(/^(?:the\s+)?(?:past\s+|last\s+)?/i, '').replace(/[.!]$/, '')}`)
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
  if (/Do you have one dumbbell or two dumbbells/i.test(question)) {
    if (/^(?:(?:i (?:only )?have)\s+)?(?:one|1)[.!]?$/i.test(message.trim())) message = 'one dumbbell'
    if (/^(?:(?:i (?:only )?have)\s+)?(?:two|2|a pair)[.!]?$/i.test(message.trim())) message = 'two dumbbells'
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
      main = main.replace(/\b\d+\s*(?:seconds?|secs?|minutes?|mins?)\s+(?:of\s+)?rest\b|\b\d+\s*(?:seconds?|secs?|minutes?|mins?)\s+off\b|\brest\s+(?:for\s+)?\d+\s*(?:seconds?|secs?|minutes?|mins?)\b/gi, `rest ${rest[1]} ${rest[2]}`)
      if (!/\brest\s+\d+\s*(?:seconds?|secs?|minutes?|mins?)\b/i.test(main)) main += `, rest ${rest[1]} ${rest[2]}`
    }
    return main + context
  }
  if (draft && /^(?:please\s+)?(?:replace|swap|substitute)\b/i.test(message.trim()))
    return `${original}\nUnsupported workout revision: Exercise swap: ${message}`
  if (/\b(?:instead|change|replace|swap|substitute|switch|modify|edit|make it|use only|shorter|longer|less|more)\b/i.test(message)) return `${original}\nUnsupported workout revision: ${message}`
  if (draft) return message
  const marker = '\nUser-supplied context: '
  const index = original.lastIndexOf(marker)
  return index < 0
    ? `${original}\nFollow-up answer: ${message}`
    : `${original.slice(0, index)}\nFollow-up answer: ${message}${original.slice(index)}`
}

const intentSchema = z.strictObject({ intent: z.enum(['create_workout', 'coach_qa', 'history_question']) })
const adviceSchema = z.strictObject({ text: z.string().trim().min(1) })

export type CoachTurnResult =
  | { kind: 'response'; response: CoachResponse; repaired: boolean; metrics?: CoachHistoryMetric[] }
  | { kind: 'failure'; code: 'cancelled' | 'stale_profile' | 'runtime_error'; message: string }

export async function runConstrainedCoachTurn(input: {
  message: string
  session: CoachRuntimeSession
  readHistory: CoachHistoryRepository['readHistory']
  readLibrary?: Parameters<typeof runLibraryTurn>[0]['readLibrary']
  previewLibraryEdit?: Parameters<typeof runLibraryTurn>[0]['previewLibraryEdit']
  libraryMessage?: string
  signal: AbortSignal
  isCurrentProfile: () => boolean
  maxOutputTokens: number
  priorUserMessages?: string[]
  now?: () => Date
}): Promise<CoachTurnResult> {
  const { message, session, readHistory, signal } = input
  const clarification = (question: string): CoachTurnResult => ({ kind: 'response', response: { version: 1, kind: 'clarification', question }, repaired: false })
  const cannotFulfill = (reason: string): CoachTurnResult => ({ kind: 'response', response: { version: 1, kind: 'cannot_fulfill', reason }, repaired: false })
  const alive = () => !signal.aborted && input.isCurrentProfile()
  try {
    if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
    // This bounded safety route is not a substitute for clinical review.
    const emergency = /\b(?:chest\s+(?:pains?|pressure|tightness|discomfort|aches?|hurts?|is\s+(?:tight|heavy|hurting))|(?:pains?|aches?|pressure|tightness)\s+in\s+(?:my\s+|the\s+)?chest|faint(?:ed|ing)?|passed out|short(?:ness)? of breath|breathless|can(?:not|'t) breathe|(?:difficulty|trouble|struggling|hard time) (?:to |with )?breath(?:e|ing)|breathing (?:is )?(?:difficult|hard)|severe bleeding|stroke|heart attack)\b/i
    const restricted = /\b(pregnan\w*|postpartum|breastfeed\w*|child\w*|teen\w*|adolescen\w*|elderly|senior\w*|older adult\w*|injur\w*|rehab\w*|disab\w*|surgery|surgical|disease|diabet\w*|cardiac|heart|dizz\w*|symptom\w*|pain|hurts?|aches?|discomfort|soreness|cancer)\b/i
    const libraryMessage = input.libraryMessage ?? message
    const currentMessages = libraryMessage === message ? [message] : [message, libraryMessage]
    const history = [...(input.priorUserMessages ?? []), ...currentMessages]
    const acute = history.some(text => emergency.test(text) && !/^(?:i have |there is )?no (?:chest pain|chest pressure|chest tightness|difficulty breathing|shortness of breath)[.!]?$/i.test(text.trim()) && !/\b(?:resolved|gone away|went away)\b.*\b(?:years? ago|months? ago)\b|\b(?:years? ago|months? ago)\b.*\b(?:resolved|gone away|went away)\b/i.test(text))
    if (acute) return { kind: 'response', repaired: false, response: { version: 1, kind: 'cannot_fulfill', reason: 'Stop exercising. If these symptoms are current or have just occurred, call your local emergency number now; do not drive yourself. Seek urgent medical help. I cannot determine from this conversation whether it is safe to train.' } }
    if (history.some(text => emergency.test(text))) return clarification('Are these symptoms current or recent, or explicitly absent or resolved? I cannot determine whether training is safe; consult a qualified health professional before exercising.')
    if (currentMessages.some(text => /\bno\s+(?:pain|injuries|injury|symptoms)\b/i.test(text))) return clarification('You mentioned no pain or injuries. I cannot determine whether training is safe; consult a qualified health professional if you have concerns.')
    if (currentMessages.some(text => restricted.test(text))) return { kind: 'response', repaired: false, response: { version: 1, kind: 'cannot_fulfill', reason: 'Stop any activity that causes symptoms or pain. I cannot recommend exercise for this situation; consult a qualified health professional who knows your circumstances.' } }
    if (input.readLibrary) {
      const response = await runLibraryTurn({
        message: workoutRequestText(libraryMessage),
        readLibrary: input.readLibrary,
        previewLibraryEdit: input.previewLibraryEdit,
        alive,
      })
      if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
      if (response) return { kind: 'response', response, repaired: false }
    }
    const unsupportedRevision = /\nUnsupported workout revision: ([^\n]*)/.exec(message)
    if (unsupportedRevision) {
      if (unsupportedRevision[1].startsWith('Exercise swap: '))
        return clarification('For exercise swaps, start a new workout request and list the exercises you want. You can still change the sets, reps, exercise count, or rest for this draft.')
      return clarification('Which single change should I make? You can specify a number of sets, reps, exercises, or rest. For equipment or other changes, please start a new workout request with all your requirements.')
    }
    const request = workoutRequestText(message)
    const schedule = parseWorkoutSchedule(request)
    const explicitWorkout = schedule.kind === 'weekdays' || /\b(?:build|create|make|design|generate|give|suggest|write|plan)\b[^.!?]{0,100}\b(?:workouts?|routines?|exercise plans?|training plans?)\b/i.test(request)
    const explicitRecordedBest = /\b(?:best|heaviest|highest|maximum|max|personal record|pr)\b/i.test(request)
      && /\b(?:load|weight|lift|personal record|pr)\b/i.test(request)
      && (/\b(?:recorded|logged|history|(?:sessions?|records?|log) (?:shown|supplied|provided)|i (?:have|did)|i've)\b/i.test(request) || /\bmy\s+heaviest\b/i.test(request))
      && /\b(?:what|which|how much|show|tell)\b/i.test(request)
      && (!/\bbest\s+weight\s+for\b/i.test(request) || /\b(?:recorded|logged)\s+history\b|\b(?:recorded|logged)\s+best\b/i.test(request))
    const explicitLoadAdvice = /\bbest\s+weight\s+for\b/i.test(request) && !explicitRecordedBest
    const explicitRecommendation = /\b(?:should i|recommend(?:ed|ation)?|what weight (?:should|would|could))\b/i.test(request)
    const fromHistory = /\b(?:history|(?:logged|recorded) (?:training|sessions?|workouts?)|(?:my|the) (?:training|workout) log)\b/i.test(request)
    if (!explicitWorkout && !explicitRecordedBest && explicitRecommendation && fromHistory)
      return cannotFulfill('I can summarize your recorded training, but recommendations based on your history are currently unavailable. Ask for a recorded measure such as recent sessions, sets, or volume.')
    if (!explicitWorkout && /\b(?:progressing|improv(?:ed|ing)|progress|trend)\b/i.test(request) && (fromHistory || /\b(?:have i|has my|over the (?:past|last)|am i)\b/i.test(request)))
      return cannotFulfill('I can show your latest sets or best recorded load for a named exercise over a recent period. I cannot assess a training trend yet.')
    if (!explicitWorkout && explicitRecordedBest && explicitRecommendation)
      return clarification('Would you like your recorded result or a weight recommendation?')
    if (!explicitWorkout && !explicitRecommendation && /\b(?:how many|count(?: of)?|number of)\s+(?:(?:my|total|logged|recorded)\s+)*sets?\b/i.test(request))
      return cannotFulfill('I can show sets from your latest matching workout, but I cannot count all sets over a period yet.')
    const { scope, measure, days } = parseHistoryRequest(request)
    const understoodHistory = !explicitLoadAdvice && !explicitRecommendation && measure !== null && scope.kind !== 'ambiguous'
    let intent: z.infer<typeof intentSchema> | undefined = understoodHistory && !explicitWorkout ? { intent: 'history_question' } : undefined
    if (!intent) {
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
        if (explicitWorkout) intent = { intent: 'create_workout' }
        else return { kind: 'failure', code: 'runtime_error', message: 'The coach could not classify this request. Please try again.' }
      }
    }
    if (explicitWorkout) intent = { intent: 'create_workout' }
    else if (explicitLoadAdvice) intent = { intent: 'coach_qa' }
    else if (intent.intent === 'coach_qa' && explicitRecordedBest) intent = { intent: 'history_question' }
    if (intent.intent === 'history_question') {
      if (/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{4}-\d{1,2}(?:-\d{1,2})?|(?:in|during|for)\s+\d{4})\b/i.test(request) || (scope.kind !== 'ambiguous' && /\b(?:past|last) (?:day|week|month|year)\b/i.test(request))) return clarification('Which recent period in days or weeks should I check? Specific calendar dates are not supported yet.')
      if (scope.kind === 'ambiguous') {
        if (measure) return clarification('What recorded measure and scope should I check? Ask for all workout sessions or name a specific exercise and a recent period.')
        return cannotFulfill('I can look up recorded workout sessions and exercise sets, loads, repetitions, and volume. Ask about one of those measures in your training history.')
      }
      const type = measure ?? 'sessions'
      const end = input.now?.() ?? new Date()
      const answer = (
        blocks: Extract<CoachResponse, { kind: 'answer' }>['blocks'],
        limitations: string[],
        metric?: CoachHistoryMetric
      ): CoachTurnResult => ({
        kind: 'response',
        response: { version: 1, kind: 'answer', blocks, limitations },
        ...(metric && { metrics: [metric] }),
        repaired: false,
      })
      const textAnswer = (text: string, limitations: string[]) =>
        answer([{ kind: 'text', text, evidence: [] }], limitations)
      const interval = {
        start: new Date(end.getTime() - Math.min(days ?? 365, 365) * 86400000).toISOString(),
        end: end.toISOString(),
      }
      const scopeLimit = days === null || days > 365
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
          const name = scope.kind === 'named' ? scope.exercise : ''
          const suggestions = [...new Set([...(result.suggestions ?? []), ...historyExerciseSuggestions(name)])]
            .filter(candidate => normalizeHistoryName(candidate) !== normalizeHistoryName(name)).slice(0, 5)
          const problem = result.kind === 'ambiguous'
            ? `I found history for “${name}”, but its exercise identity is unresolved or ambiguous.`
            : `I could not reliably identify “${name}” in the reviewed history.`
          const choices = suggestions.length ? ` Ask again using a specific exercise name, such as ${suggestions.join(', ')}.` : ''
          return textAnswer(problem + choices, limitations)
        }

        const { records } = result
        const [firstRecord] = records
        if (!firstRecord) {
          return textAnswer(
            scope.kind === 'named' || type === 'latest' || type === 'presence'
              ? 'I found no matching records in the reviewed period.'
              : 'I found no matching recorded data in the reviewed period.',
            limitations
          )
        }
        if (type === 'latest' || type === 'presence') {
          let record = firstRecord
          for (const item of records) {
            if (item.timestamp > record.timestamp) record = item
          }
          const date = new Date(record.timestamp).toISOString().slice(0, 10)
          const text = type === 'presence'
            ? 'I found a matching training record.'
            : `The latest matching record is dated ${date}.`
          const block = { kind: 'text' as const, text, evidence: [{ kind: 'record' as const, id: record.id }] }
          if (type === 'presence' || !/\b(?:sets?|load|weight|reps|repetitions)\b/i.test(message)) {
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
        } satisfies Record<typeof type, Pick<CoachHistoryMetric, 'kind' | 'value' | 'missingDataCount'>>
        const measure = measures[type]
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
    if (intent.intent === 'coach_qa') {
      await session.appendUserMessage([
        'Answer the latest fitness question directly in two or three plain-text sentences. Use relevant conversation context and name the exercise when one is specified.',
        'If an exercise question about rest is ambiguous, assume it means between sets and say so. Use about 1–2 minutes for lighter strength sets and 2–3 minutes or more for heavy lifts as starting points. Rest longer if needed to maintain form and effort.',
        'For a warmup question about a specific lift, include easy practice sets of that lift before the working sets.',
        'Do not provide medical advice, suggest training through symptoms, or invent personal data or citations.',
        `Question: ${JSON.stringify(libraryMessage)}`,
      ].join('\n'))
      const generated = await session.generate({
        finalResponseSchema: z.toJSONSchema(adviceSchema),
        maxOutputTokens: Math.min(input.maxOutputTokens, 256),
        signal,
      })
      if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
      if (generated.kind === 'failure') return { kind: 'failure', code: 'runtime_error', message: generated.message }
      const parsed = adviceSchema.safeParse(generated.kind === 'final' ? generated.content : undefined)
      if (!parsed.success) return cannotFulfill('I could not generate a coaching answer. Try asking again.')
      return {
        kind: 'response',
        response: { version: 1, kind: 'answer', blocks: [{ kind: 'text', text: parsed.data.text, evidence: [] }], limitations: [] },
        repaired: false,
      }
    }
    const userRequest = request
    if (schedule.kind === 'clarification') return clarification(schedule.question)
    const sessionCount = schedule.kind === 'single' ? 1 : schedule.sessions
    const focuses = workoutSessionFocuses(schedule)
    const variation = sessionCount > 1 ? workoutVariation(userRequest) : null
    const plannedSessions = workoutSessionRequests(message, schedule).map((request, index) => planWorkout(request, focuses[index]))
    for (const planned of plannedSessions) {
      if (planned.kind === 'clarification') {
        return clarification(planned.question)
      }
      if (planned.kind === 'infeasible') {
        return { kind: 'response', response: { version: 1, kind: 'cannot_fulfill', reason: planned.reason }, repaired: false }
      }
    }
    const plans = plannedSessions.flatMap(result => result.kind === 'plan' ? [result.plan] : [])
    const titles = focuses.map((focus, index) => {
      const day = schedule.kind === 'weekdays' ? weekdayLabels[schedule.days[index].index] : `Day ${index + 1}`
      const label = focus === 'upper' ? 'Upper body' : focus ? focus[0].toUpperCase() + focus.slice(1) : ''
      return label ? `${day} — ${label}` : day
    })
    const errors: string[] = []
    let selected: string[][] | undefined
    const workoutSelections = z.strictObject({ sessions: z.strictObject(Object.fromEntries(
      plans.map((plan, index) => [`day_${index + 1}`, selectionSchema(plan)])
    )) })
    const schema = z.toJSONSchema(workoutSelections)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await session.appendUserMessage(`Original request: ${userRequest}\nPlan ${sessionCount} training session(s). Exercise counts, sets, repetitions, and duration apply to each session. Choose one distinct exercise name for each slot, in order, for each session. Prefer complementary movements and angles; multiple exercises from the same movement family are allowed. Never repeat the same exercise within a session. ${variation === 'disjoint' ? 'Never repeat exercises across sessions. ' : variation ? 'Choose a different set of exercises for each session. ' : ''}Return a sessions object with the listed day keys, starting at day_1. Each day contains a selections object keyed slot_1, slot_2, etc., with one allowed exercise name per slot. Respect each day's focus and choices. Session slots: ${JSON.stringify(plans.map((plan, index) => ({ day: `day_${index + 1}`, title: titles[index], slots: plan.slots.map(slot => slot.map(exercise => exercise.name)) })))}. ${errors.length ? `Validation errors: ${errors.join('; ')}` : ''}`)
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
        if (names.length === sessionCount) {
          if (sessionsMeetVariation(names, variation)) { selected = names; break }
          errors.push('The sessions must follow the requested exercise variation.')
        }
      } catch (error) {
        if (!alive()) return { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
        const timedOut = error instanceof Error && /timeout|timed out|deadline/i.test(error.message)
        errors.push(timedOut ? 'Model selection timed out' : 'Model selection failed')
        break
      }
    }
    const backup = selected ? null : variation ? variedCatalogSelections(plans, variation) : plans.map(defaultSelection)
    if (!selected && !backup)
      return clarification('I could not find enough compatible exercises for the requested variation. Can exercises repeat, or can you use more equipment?')
    const renderedSessions = plans.map((plan, index) => renderWorkout(plan, selected?.[index] ?? backup?.[index] ?? defaultSelection(plan)))
    const workouts: CoachWorkout[] = renderedSessions.map((rendered, index) => ({ ...rendered.workout, ref: `workout-${index + 1}`, title: `${titles[index]}${plans[index].partial ? ' — partial workout' : ''}` }))
    const fallbackAssumption = selected ? [] : [
      schedule.kind === 'weekly' && schedule.split === 'ppl'
        ? 'Model selection was unavailable; each training day uses its own focus-specific catalog template.'
        : schedule.kind === 'weekly' && !variation
          ? 'Model selection was unavailable; each training day repeats the catalog template.'
          : schedule.kind === 'single'
            ? 'Model selection was unavailable; this draft uses a validated catalog template.'
            : 'Model selection was unavailable; this draft uses validated catalog choices.',
    ]
    if (schedule.kind === 'single') return {
      kind: 'response',
      response: { ...renderedSessions[0], assumptions: [...renderedSessions[0].assumptions, ...fallbackAssumption] },
      repaired: errors.length > 0,
    }
    const title = `${sessionCount}-day workout routine`
    const workloadAssumptions = [...new Set(renderedSessions.flatMap(rendered => rendered.assumptions))]
    const response: CoachResponse = {
      version: 1,
      kind: 'routine_draft',
      workouts,
      routine: schedule.kind === 'weekdays'
        ? {
            type: 'SEQUENTIAL', title, startsOnMonday: true,
            days: weekdayLabels.map((_, index) => {
              const workout = workouts[schedule.days.findIndex(day => day.index === index)]
              return workout ? { kind: 'workout', workoutRef: workout.ref } : { kind: 'rest' }
            }),
          }
        : { type: 'WEEKLY_COMPLETION', title, workoutRefs: workouts.map(workout => workout.ref) },
      assumptions: [
        ...workloadAssumptions,
        schedule.kind === 'weekdays'
          ? 'The seven-day schedule starts on Monday. Unspecified days are rest days.'
          : `Planned ${sessionCount} training sessions per week; choose your training and rest days. Exercise counts and durations apply to each session.`,
        ...(schedule.kind === 'weekly' && schedule.split === 'ppl'
          ? ['Push/Pull/Legs split: chest, shoulders and triceps; back and biceps; then legs. Each day has its own eligible exercise choices.']
          : schedule.kind === 'weekly' && !variation ? ['Sessions use the same requested muscle targets; exercises may repeat across days.'] : []),
        ...fallbackAssumption,
      ],
    }
    return { kind: 'response', response, repaired: errors.length > 0 }
  } catch {
    return alive() ? { kind: 'failure', code: 'runtime_error', message: 'The coach could not complete this request.' } : { kind: 'failure', code: signal.aborted ? 'cancelled' : 'stale_profile', message: 'The coach request was interrupted.' }
  }
}
