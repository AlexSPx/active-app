import { z } from 'zod'
import type { RequestContract } from './requestCoverage'

// Development-only: offsets are JavaScript UTF-16 code-unit offsets, end exclusive.
const span = z.strictObject({ start: z.number().int().nonnegative(), end: z.number().int().positive(), text: z.string().min(1) })
const id = z.string().min(1)
const task = z.strictObject({
  id,
  kind: z.enum(['workout', 'routine', 'history', 'explanation', 'catalog', 'unknown']),
  role: z.enum(['requested', 'component', 'context', 'unknown']),
  parentId: id.nullable(),
  provenance: span,
})
const quantity = z.strictObject({
  id, taskId: id, value: z.number().finite().nonnegative(),
  unit: z.enum(['set', 'rep', 'second', 'minute', 'hour', 'day', 'week', 'kg', 'lb', 'percent']),
  role: z.enum(['prescribed', 'quoted', 'explanation', 'unknown']), provenance: span,
})
const constraint = z.strictObject({
  id, taskId: id, kind: z.enum(['prohibition', 'requirement', 'preference', 'unknown']),
  scope: z.enum(['task', 'unknown']), provenance: span,
  alternatives: z.array(span),
})
const uncertainty = z.strictObject({
  kind: z.enum(['ambiguity', 'unrecognized', 'unknown_scope', 'unknown_role']),
  taskId: id.nullable(), provenance: span,
})
export const requestSemanticsSchema = z.strictObject({
  originalText: z.string(),
  tasks: z.array(task), quantities: z.array(quantity), constraints: z.array(constraint),
  uncertainties: z.array(uncertainty),
  relations: z.array(z.strictObject({
    kind: z.enum(['explicit_order', 'chronology', 'unknown']),
    fromTaskId: id, toTaskId: id, provenance: span,
  })),
}).superRefine((value, ctx) => {
  const ids = new Set<string>()
  const taskIds = new Set(value.tasks.map(item => item.id))
  const checkId = (value: string, path: (string | number)[]) => {
    if (ids.has(value)) ctx.addIssue({ code: 'custom', path, message: 'Duplicate ID' })
    ids.add(value)
  }
  const checkSpan = (valueSpan: z.infer<typeof span>, path: (string | number)[]) => {
    if (valueSpan.end <= valueSpan.start || valueSpan.end > value.originalText.length || value.originalText.slice(valueSpan.start, valueSpan.end) !== valueSpan.text)
      ctx.addIssue({ code: 'custom', path, message: 'Provenance must match original UTF-16 text' })
  }
  const checkTask = (taskId: string, path: (string | number)[]) => {
    if (!taskIds.has(taskId)) ctx.addIssue({ code: 'custom', path, message: 'Unknown task ID' })
  }
  value.tasks.forEach((item, i) => {
    checkId(item.id, ['tasks', i, 'id']); checkSpan(item.provenance, ['tasks', i, 'provenance'])
    if (item.parentId !== null) {
      checkTask(item.parentId, ['tasks', i, 'parentId'])
      const seen = new Set([item.id])
      let parent: string | null = item.parentId
      while (parent !== null) {
        if (seen.has(parent)) { ctx.addIssue({ code: 'custom', path: ['tasks', i, 'parentId'], message: 'Task hierarchy cycle' }); break }
        seen.add(parent)
        parent = value.tasks.find(entry => entry.id === parent)?.parentId ?? null
      }
    }
  })
  value.quantities.forEach((item, i) => { checkId(item.id, ['quantities', i, 'id']); checkTask(item.taskId, ['quantities', i, 'taskId']); checkSpan(item.provenance, ['quantities', i, 'provenance']) })
  value.constraints.forEach((item, i) => {
    checkId(item.id, ['constraints', i, 'id']); checkTask(item.taskId, ['constraints', i, 'taskId']); checkSpan(item.provenance, ['constraints', i, 'provenance'])
    item.alternatives.forEach((alternative, j) => {
      checkSpan(alternative, ['constraints', i, 'alternatives', j])
      if (alternative.start < item.provenance.start || alternative.end > item.provenance.end)
        ctx.addIssue({ code: 'custom', path: ['constraints', i, 'alternatives', j], message: 'Alternative must be within constraint' })
    })
  })
  value.uncertainties.forEach((item, i) => { if (item.taskId !== null) checkTask(item.taskId, ['uncertainties', i, 'taskId']); checkSpan(item.provenance, ['uncertainties', i, 'provenance']) })
  value.relations.forEach((item, i) => { checkTask(item.fromTaskId, ['relations', i, 'fromTaskId']); checkTask(item.toTaskId, ['relations', i, 'toTaskId']); checkSpan(item.provenance, ['relations', i, 'provenance']) })
})
export type RequestSemantics = z.infer<typeof requestSemanticsSchema>

/** Projects recognized task spans only when no segment or scope is unresolved. */
export function projectRequestSemantics(value: RequestSemantics): RequestContract | null {
  if (!requestSemanticsSchema.safeParse(value).success || !value.tasks.length || value.uncertainties.length || value.tasks.some(t => t.kind === 'unknown' || t.role !== 'requested' || t.parentId !== null) || value.constraints.some(c => c.kind === 'unknown' || c.scope === 'unknown') || value.quantities.some(q => q.role === 'unknown') || value.relations.length) return null
  const ordered = [...value.tasks].sort ( (a, b) => a.provenance.start - b.provenance.start )
  let cursor = 0
  for (const item of ordered) {
    if (item.provenance.start < cursor || !/^[\s.!?]*$/.test(value.originalText.slice(cursor, item.provenance.start))) return null
    cursor = item.provenance.end
  }
  if (!/^[\s.!?]*$/.test(value.originalText.slice(cursor))) return null
  return {
    originalText: value.originalText,
    parts: value.tasks.map(t => ({ id: t.id, description: t.provenance.text, provenance: t.provenance })),
    constraints: value.constraints.map(c => ({ description: c.provenance.text, provenance: c.provenance })),
    completeness: 'unreviewed',
  }
}
