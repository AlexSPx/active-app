import type { RequestContract } from './requestCoverage'

type Span = { start: number; end: number; text: string }
type Observation = { kind: 'quantity' | 'negation' | 'modality' | 'uncertainty'; provenance: Span }
export type RequestParse =
  | { state: 'parsed'; request: RequestContract; observations: Observation[]; uncertainties: string[] }
  | { state: 'abstained'; request: RequestContract | null; reason: string }

function span(text: string, start: number, end: number): Span {
  return { start, end, text: text.slice(start, end) }
}

/** Extracts literal clauses, not a complete semantic interpretation. Offsets are UTF-16. */
export function parseCoachRequest(originalText: string): RequestParse {
  if (!originalText.trim()) return { state: 'abstained', request: null, reason: 'The request is empty.' }
  const whole = span(originalText, 0, originalText.length)
  const fallback: RequestContract = {
    originalText,
    parts: [{ id: 'original_request', description: originalText, provenance: whole }],
    constraints: [],
    completeness: 'unreviewed',
  }
  // shortcut: language recognition is deliberately narrow; expand only with independent evaluation.
  if (!/\b(?:i|me|my|we|our|please|can|could|would|want|need|make|create|show|give|find|tell|plan|workout|training|exercise|session|routine|sets|reps)\b/i.test(originalText)) {
    return { state: 'abstained', request: fallback, reason: 'English request intent was not recognized; the original text is retained.' }
  }

  const clauses: Span[] = []
  const boundaries = /[;!?\n]+|\.(?=\s|$)/g
  let start = 0
  for (const match of originalText.matchAll(boundaries)) {
    const end = match.index + match[0].length
    if (originalText.slice(start, end).trim()) clauses.push(span(originalText, start, end))
    start = end
  }
  if (originalText.slice(start).trim()) clauses.push(span(originalText, start, originalText.length))
  const parts = clauses.map((provenance, index) => ({ id: `part_${index + 1}`, description: provenance.text.trim(), provenance }))
  const constraints = clauses.filter(({ text }) => /\b(?:no|not|never|without|avoid|exclude|don't|dont|do not|must|only|at least|at most|maximum|minimum|limit|under|over|less than|more than|instead of|except|prefer|cannot|can't|shouldn't)\b/i.test(text))
    .map(provenance => ({ description: provenance.text.trim(), provenance }))
  const observations: Observation[] = []
  const patterns: [Observation['kind'], RegExp][] = [
    ['quantity', /\b(?:\d+(?:[.,]\d+)?(?:\s*(?:-|–|to)\s*\d+(?:[.,]\d+)?)?|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\b(?:\s*(?:sets?|reps?|repetitions?|minutes?|mins?|seconds?|secs?|hours?|days?|weeks?|months?|times?|kg|lbs?|pounds?|percent|%))?/gi],
    ['negation', /\b(?:no|not|never|without|avoid|exclude|don't|dont|do not|cannot|can't|shouldn't)\b/gi],
    ['modality', /\b(?:could|would|should|must|may|might|please|want|need|prefer|can)\b/gi],
    ['uncertainty', /\b(?:maybe|perhaps|unsure|not sure|either|or|roughly|about|around|if possible)\b/gi],
  ]
  for (const [kind, pattern] of patterns) {
    for (const match of originalText.matchAll(pattern)) observations.push({ kind, provenance: span(originalText, match.index, match.index + match[0].length) })
  }
  return {
    state: 'parsed',
    request: { originalText, parts, constraints, completeness: 'unreviewed' },
    observations,
    uncertainties: ['Clause boundaries, task intent, constraint scope, and associations require independent interpretation; extraction may be incomplete.'],
  }
}
