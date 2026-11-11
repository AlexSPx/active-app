import { z } from 'zod'
import { exerciseCatalog } from '../../lib/exercises/catalog'
import metadata from '../../lib/data/coach/exercise-planning-metadata.json'

export const historyQuerySchema = z.strictObject({
  type: z.enum(['sessions', 'repetitions', 'volume', 'best', 'latest', 'presence']),
  exercise: z.string().trim().min(1).max(120).nullable(),
  days: z.number().int().min(1).max(36500).nullable(),
})
export type HistoryQuery = z.infer<typeof historyQuerySchema>
export const normalizeHistoryName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ').replace(/\bpull ?ups?\b/g, 'pull up').replace(/\bsplit squats\b/g, 'split squat')
const normalize = normalizeHistoryName

export function resolveHistoryExercise(name: string) {
  const target = normalize(name)
  const matches = exerciseCatalog.filter(e => normalize(e.name) === target || metadata.some(a => a.sourceKey === e.sourceKey && a.aliases.some(alias => normalize(alias) === target)))
  return matches.length === 1 ? { kind: 'match' as const, exercise: matches[0] } : { kind: matches.length ? 'ambiguous' as const : 'unknown' as const }
}

export function historyMeasureHint(message: string): HistoryQuery['type'] | null {
  const text = message.replace(/\b(?:last|past)\s+\d+\s+\w+/gi, '')
  if (/\b(?:best|heaviest|highest|maximum|max|personal record|pr)\b/i.test(text)) return 'best'
  if (/\b(?:latest|last|most recent|recently)\b/i.test(text)) return 'latest'
  if (/\b(?:how many|count|number of)\b/i.test(text)) return /\b(?:reps|repetitions)\b/i.test(text) ? 'repetitions' : 'sessions'
  if (/\b(?:volume|tonnage)\b/i.test(text)) return 'volume'
  if (/\b(?:reps|repetitions)\b/i.test(text)) return 'repetitions'
  if (/\b(?:ever|have i|did i|any)\b/i.test(text)) return 'presence'
  return null
}

export function fallbackHistoryQuery(message: string): HistoryQuery {
  const relative = /\b(?:last|past)\s+(\d+)\s+(days?|weeks?|months?|years?)\b/i.exec(message)
  const multiplier = relative && (/week/i.test(relative[2]) ? 7 : /month/i.test(relative[2]) ? 30 : /year/i.test(relative[2]) ? 365 : 1)
  const days = relative && multiplier ? Math.min(36500, Math.max(1, Number(relative[1]) * multiplier)) : null
  const type = historyMeasureHint(message) ?? 'sessions'
  const normalized = ` ${normalize(message)} `
  const candidates = exerciseCatalog.flatMap(e => [e.name, ...(metadata.find(a => a.sourceKey === e.sourceKey)?.aliases ?? [])]).filter(name => normalized.includes(` ${normalize(name)} `)).sort((a, b) => normalize(b).length - normalize(a).length)
  return { type, exercise: candidates[0] ?? (/\bpull[ -]?ups?\b/i.exec(message)?.[0] ?? /\bsplit[ -]?squats?\b/i.exec(message)?.[0] ?? null), days }
}
