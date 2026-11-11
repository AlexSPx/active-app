import { requestSemanticsSchema, type RequestSemantics } from './requestSemantics'

// Development-only grammar: independent full sentences, exact command forms and optional
// single dose or prohibition. Unsupported text remains unknown, not a parsed task.
export function parseRequestV2(originalText: string): RequestSemantics {
  const result: RequestSemantics = { originalText, tasks: [], quantities: [], constraints: [], uncertainties: [], relations: [] }
  const makeSpan = (start: number, end: number) => ({ start, end, text: originalText.slice(start, end) })
  const sentence = /[^\n]+?(?:[!?]+(?=\s|$)|\.(?=\s|$)|(?=\n)|$)/g
  for (const match of originalText.matchAll(sentence)) {
    const raw = match[0]
    const leading = raw.length - raw.trimStart().length
    const content = raw.trim().replace(/[.!?]+$/, '').trimEnd()
    if (!content) {
      const punctuation = raw.trim()
      if (punctuation) { const at = match.index + leading; result.uncertainties.push({ kind: 'unrecognized', taskId: null, provenance: makeSpan(at, at + punctuation.length) }) }
      continue
    }
    const start = match.index + leading
    const provenance = makeSpan(start, start + content.length)
    // Quotes, nested clauses, and conjunctions outside this grammar abstain as a whole.
    const parsed = /^(create|make|show|explain|find) (?:a |an |the )?(workout|routine|history|explanation|catalog)(?: (with (\d+(?:\.\d+)?) (sets?|reps?|seconds?|minutes?|hours?|days?|weeks?|kg|lbs?|percent)|without ([a-z]+(?: (?:or|and) [a-z]+)*)))?$/i.exec(content)
    const verb = parsed?.[1]?.toLowerCase()
    const noun = parsed?.[2]?.toLowerCase()
    const kind = noun === 'workout' || noun === 'routine' || noun === 'history' || noun === 'explanation' || noun === 'catalog' ? noun : null
    const allowed = kind !== null && ((verb === 'create' || verb === 'make') ? kind === 'workout' || kind === 'routine' : verb === 'show' ? kind === 'history' || kind === 'catalog' : verb === 'explain' ? kind === 'explanation' : verb === 'find' && kind === 'catalog')
    if (!parsed || !kind || !allowed) {
      result.uncertainties.push({ kind: /\beither\b.*\bor\b/i.test(content) ? 'ambiguity' : 'unrecognized', taskId: null, provenance })
      continue
    }
    const taskId = `task_${result.tasks.length + 1}`
    result.tasks.push({ id: taskId, kind, role: 'requested', parentId: null, provenance })
    const suffix = parsed[3]
    if (!suffix) continue
    const suffixStart = start + content.length - suffix.length
    if (parsed[4] && parsed[5]) {
      const units: Record<string, RequestSemantics['quantities'][number]['unit']> = { set: 'set', sets: 'set', rep: 'rep', reps: 'rep', second: 'second', seconds: 'second', minute: 'minute', minutes: 'minute', hour: 'hour', hours: 'hour', day: 'day', days: 'day', week: 'week', weeks: 'week', kg: 'kg', lb: 'lb', lbs: 'lb', percent: 'percent' }
      const unit = units[parsed[5].toLowerCase()]
      const numberStart = suffixStart + suffix.indexOf(parsed[4])
      const amount = Number(parsed[4])
      if (unit && Number.isFinite(amount)) result.quantities.push({ id: `quantity_${result.quantities.length + 1}`, taskId, value: amount, unit, role: kind === 'workout' || kind === 'routine' ? 'prescribed' : 'unknown', provenance: makeSpan(numberStart, suffixStart + suffix.length) })
      else result.uncertainties.push({ kind: 'unrecognized', taskId, provenance: makeSpan(suffixStart, suffixStart + suffix.length) })
      if (kind !== 'workout' && kind !== 'routine') result.uncertainties.push({ kind: 'unknown_role', taskId, provenance: makeSpan(suffixStart, suffixStart + suffix.length) })
    } else if (parsed[6]) {
      const alternativesStart = suffixStart + 'without '.length
      const alternatives = [...parsed[6].matchAll(/[a-z]+/gi)].filter(m => !/^(or|and)$/i.test(m[0])).map(m => makeSpan(alternativesStart + m.index, alternativesStart + m.index + m[0].length))
      if (!alternatives.length || /^(?:or|and)$/i.test(alternatives[0].text) || /^(?:or|and)$/i.test(parsed[6]) || alternatives.length !== parsed[6].split(/ (?:or|and) /i).length) {
        result.uncertainties.push({ kind: 'unrecognized', taskId, provenance: makeSpan(suffixStart, suffixStart + suffix.length) })
        continue
      }
      result.constraints.push({ id: `constraint_${result.constraints.length + 1}`, taskId, kind: 'prohibition', scope: 'task', provenance: makeSpan(suffixStart, suffixStart + suffix.length), alternatives })
    }
  }
  // Punctuation and whitespace alone contain no task; callers must not treat an empty result as success.
  return requestSemanticsSchema.parse(result)
}
