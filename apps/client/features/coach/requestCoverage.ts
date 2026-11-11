import { z } from 'zod'
import type { CoachResponse } from './contracts'

const provenance = z.strictObject({ start: z.number().int().nonnegative(), end: z.number().int().positive(), text: z.string().min(1) })
const sourced = z.strictObject({ description: z.string().trim().min(1), provenance })
export const requestContractSchema = z.strictObject({
  originalText: z.string().min(1),
  parts: z.array(z.strictObject({ id: z.string().trim().min(1), ...sourced.shape })).min(1),
  constraints: z.array(sourced),
  // A parser cannot certify its own completeness. This requires independent review.
  completeness: z.enum(['independently_reviewed', 'unreviewed']),
}).superRefine((request, ctx) => {
  const ids = new Set<string>()
  for (const [index, part] of request.parts.entries()) {
    if (ids.has(part.id)) ctx.addIssue({ code: 'custom', path: ['parts', index, 'id'], message: 'Duplicate part ID' })
    ids.add(part.id)
  }
  for (const [group, entries] of [['parts', request.parts], ['constraints', request.constraints]] as const) {
    for (const [index, entry] of entries.entries()) {
      const { start, end, text } = entry.provenance
      if (end <= start || end > request.originalText.length || request.originalText.slice(start, end) !== text)
        ctx.addIssue({ code: 'custom', path: [group, index, 'provenance'], message: 'Provenance must match the original text exactly' })
    }
  }
})
export type RequestContract = z.infer<typeof requestContractSchema>
export type PartCoverage = {
  partId: string
  outcome: 'fulfilled' | 'partial' | 'blocked' | 'needs_clarification'
  reason: string
  evidence: string[]
  rubric?: string
}
export type RequestCoverage = {
  request: RequestContract
  parserEvaluation: 'not_evaluated'
  parts: PartCoverage[]
  completeness: 'independently_reviewed' | 'unreviewed'
  responseValid: boolean
}

export function unparsedRequest(originalText: string): RequestContract {
  return { originalText, parts: [{ id: 'original_request', description: 'The complete original request', provenance: { start: 0, end: originalText.length, text: originalText } }], constraints: [], completeness: 'unreviewed' }
}

// The reviewer must assess the whole part and its constraints against the validated response;
// evidence membership and a model-produced parse are not semantic judgments.
export async function assessRequestCoverage(input: {
  request: RequestContract
  response?: CoachResponse
  failure?: string
  metrics?: Record<string, unknown>[]
  clarification?: 'history_interval' | 'exercise_prescription' | 'exercise_equipment' | 'exercise_setup'
  reviewPart?: (input: { request: RequestContract; part: RequestContract['parts'][number]; response: CoachResponse; metrics: Record<string, unknown>[] }) => Promise<{ outcome: 'fulfilled' | 'partial' | 'blocked'; reason: string; evidence: string[]; rubric: string } | 'unreviewed'>
}): Promise<RequestCoverage> {
  const parts: PartCoverage[] = []
  for (const part of input.request.parts) {
    let result: PartCoverage = { partId: part.id, outcome: 'blocked', reason: input.failure ?? 'Semantic fulfillment has not been independently reviewed.', evidence: [] }
    if (input.response?.kind === 'clarification' && input.clarification) {
      result = { partId: part.id, outcome: 'needs_clarification', reason: `A material ${input.clarification} is missing.`, evidence: [] }
    } else if (input.response && input.reviewPart && input.request.completeness === 'independently_reviewed') {
      try {
        const metrics = input.metrics ?? []
        const review = await input.reviewPart({ request: input.request, part, response: input.response, metrics })
        const checked = z.strictObject({ outcome: z.enum(['fulfilled', 'partial', 'blocked']), reason: z.string().trim().min(1), evidence: z.array(z.string().trim().min(1)), rubric: z.string().trim().min(1) }).safeParse(review)
        const evidenceExists = (path: string) => {
          let value: unknown = { response: input.response, metrics }
          for (const segment of path.split('.')) {
            if (!value || typeof value !== 'object' || !Object.hasOwn(value, segment)) return false
            value = Reflect.get(value, segment)
          }
          return value !== undefined && value !== null
        }
        if (checked.success && checked.data.evidence.every(evidenceExists) && (checked.data.outcome === 'blocked' || (checked.data.evidence.length > 0 && input.response.kind !== 'cannot_fulfill' && input.response.kind !== 'clarification')))
          result = { partId: part.id, ...checked.data }
      } catch {
        result.reason = 'Semantic review failed.'
      }
    }
    parts.push(result)
  }
  return { request: input.request, parserEvaluation: 'not_evaluated', parts, completeness: input.request.completeness, responseValid: !!input.response }
}
