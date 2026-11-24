import { exerciseCatalog } from '../../lib/exercises/catalog'
import metadata from '../../lib/data/coach/exercise-planning-metadata.json'
import type { HistoryExerciseFilter } from '../../lib/repositories/CoachHistoryRepository'

type HistoryMeasure = 'sessions' | 'repetitions' | 'volume' | 'best' | 'latest' | 'presence'

export const normalizeHistoryName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ').replace(/\bpull ?ups?\b/g, 'pull up').replace(/\bsplit squats\b/g, 'split squat')
const normalize = normalizeHistoryName
const catalogIds = new Set(exerciseCatalog.map(exercise => exercise.id))

export function resolveHistoryExercise(name: string) {
  const target = normalize(name)
  const matches = exerciseCatalog.filter(e => normalize(e.name) === target || metadata.some(a => a.sourceKey === e.sourceKey && a.aliases.some(alias => normalize(alias) === target)))
  return matches.length === 1 ? { kind: 'match' as const, exercise: matches[0] } : { kind: matches.length ? 'ambiguous' as const : 'unknown' as const }
}

export function historyExerciseFilter(name: string): HistoryExerciseFilter {
  const resolved = resolveHistoryExercise(name)
  const target = normalize(name)
  const suggest = (entry: { name: string }) => {
    const label = normalize(entry.name)
    return target.length >= 3 && (label === target || label.startsWith(`${target} `))
  }
  if (resolved.kind === 'ambiguous') return { kind: 'ambiguous', suggest }
  const catalogId = resolved.kind === 'match' ? resolved.exercise.id : null
  const canonicalName = resolved.kind === 'match' ? normalize(resolved.exercise.name) : target
  return {
    kind: catalogId ? 'catalog' : 'custom',
    suggest,
    match: entry => {
      if (catalogId && entry.exerciseId === catalogId) return 'match'
      const label = normalize(entry.name)
      if (label !== target && label !== canonicalName) return null
      if (label !== target) return 'conflict'
      return entry.exerciseId && catalogIds.has(entry.exerciseId) ? 'conflict' : 'match'
    },
  }
}

export function historyExerciseSuggestions(name: string) {
  const target = normalize(name)
  if (target.length < 3) return []
  return exerciseCatalog.filter(exercise =>
    normalize(exercise.name).startsWith(`${target} `) ||
    metadata.some(entry => entry.sourceKey === exercise.sourceKey && entry.aliases.some(alias => normalize(alias) === target))
  ).map(exercise => exercise.name)
}

function historyMeasureHint(message: string): HistoryMeasure | null {
  const text = message.replace(/\b(?:last|past)\s+(?:(?:the|\d+)\s+)?(?:days?|weeks?|months?|years?)\b/gi, '')
  if (/\b(?:best|heaviest|highest|maximum|max|personal record|pr)\b/i.test(text)) return 'best'
  if (/\b(?:latest|last|most recent|recently)\b/i.test(text)) return 'latest'
  if (/\b(?:how many|count|number of)\b/i.test(text)) return /\b(?:reps|repetitions)\b/i.test(text) ? 'repetitions' : 'sessions'
  if (/\b(?:volume|tonnage|total lifted weight|total weight lifted)\b/i.test(text)) return 'volume'
  if (/\b(?:reps|repetitions)\b/i.test(text)) return 'repetitions'
  if (/\b(?:ever|have i|did i|any)\b/i.test(text)) return 'presence'
  return null
}

function normalizeHistoryRequest(request: string) {
  return request
    .replace(/\bhow many (?:workout|training) sessions?\b/gi, 'how many sessions')
    .replace(/\btotal (?:lifted weight|weight lifted)\b/gi, 'total volume')
}

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
  return words.every(word => /^(?:what|was|is|are|how|many|show|me|tell|review|my|the|in|over|during|of|for|have|i|did|done|performed|ever|any|a|training|history|workout|workouts|session|sessions|records|recorded|logged|log|completed|total|volume|tonnage|reps|repetitions|sets|set|load|weight|lift|best|heaviest|highest|maximum|max|personal|record|pr|latest|last|most|recent|recently|past|days|day|weeks|week|months|month|years|year|\d+)$/.test(word))
}

type ValidatedHistoryScope = { kind: 'named'; exercise: string } | { kind: 'global' } | { kind: 'general' } | { kind: 'ambiguous' }

function validateHistoryScope(request: string, exercise: string | null, type: HistoryMeasure): ValidatedHistoryScope {
  const all = /\b(?:all|any|across (?:all|my))\s+(?:of\s+)?(?:my\s+)?exercises\b/i.test(request)
  if (all) return isUnqualifiedGlobalBest(request) ? { kind: 'global' } : { kind: 'ambiguous' }
  if (exercise) {
    const normalized = normalizeHistoryName(request)
    const name = normalizeHistoryName(exercise)
    const template = normalized.replace(name, ' EXERCISE ' ).replace(/\s+(?:(?:in|over|during)\s+(?:the\s+)?)?(?:past|last)\s+\d+\s+(?:days?|weeks?|months?|years?)$/, '').replace(/\s+/g, ' ').trim()
    // shortcut: only complete supported question shapes are understood; extend with a structured scope contract.
    if (/^(?:what is|what was|what were|show|tell me) (?:my |the )?(?:best|heaviest|highest|maximum|max|latest|last|most recent) (?:recorded |logged )?(?:EXERCISE (?:load|weight(?: and reps)?|lift|sets|reps|repetitions)|(?:load|weight|lift|sets) (?:for|of) (?:the )?EXERCISE)(?: in (?:the sessions shown|my (?:logged|recorded) history))?(?: i am reviewing the supplied log before training on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday) around \d+ \d+)?$/i.test(template)) return { kind: 'named', exercise }
    if (/^(?:how many EXERCISE sessions (?:have i logged|did i log|have i completed|did i complete)|have i ever done EXERCISE)$/i.test(template)) return { kind: 'named', exercise }
  }
  if (!exercise && type !== 'best' && isUnqualifiedHistoryRequest(request)) return { kind: 'general' }
  return { kind: 'ambiguous' }
}

export function parseHistoryRequest(request: string) {
  const normalized = normalizeHistoryRequest(request)
  const named = requestedHistoryExercise(normalized)
  const measure = /^how many .+? sessions?\b/i.test(normalized) ? 'sessions' : historyMeasureHint(normalized)
  const relative = /\b(?:last|past)\s+(\d+)\s+(days?|weeks?|months?|years?)\b/i.exec(normalized)
  const multiplier = relative && (/week/i.test(relative[2]) ? 7 : /month/i.test(relative[2]) ? 30 : /year/i.test(relative[2]) ? 365 : 1)
  const days = relative && multiplier ? Math.min(36500, Math.max(1, Number(relative[1]) * multiplier)) : null
  return { measure, days, scope: validateHistoryScope(normalized, named, measure ?? 'sessions') }
}
