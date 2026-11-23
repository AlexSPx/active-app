import { z } from 'zod'
import type { SQLiteDatabase } from 'expo-sqlite'
import { coachResponseSchema } from './contracts'
import { syncEngine } from '../../lib/sync'
import { coachHistoryMetricSchema } from './historyMetrics'

export function formatCoachMetric(value: unknown): { id: string; text: string } | null {
  const parsed = coachHistoryMetricSchema.safeParse(value)
  if (!parsed.success) return null
  const metric = parsed.data
  if (Array.isArray(metric.value)) return { id: metric.id, text: `${metric.value.map(set => `${set.exerciseName ?? 'Exercise'}: ${set.weightKg} kg, ${set.repetitions} reps`).join('; ')}${metric.missingDataCount ? ` (${metric.missingDataCount} missing or invalid)` : ''}.${metric.definition ? ` ${metric.definition}` : ''}` }
  return { id: metric.id, text: `${metric.kind.replaceAll('_', ' ')}: ${typeof metric.value === 'number' ? metric.value : JSON.stringify(metric.value)}${metric.missingDataCount ? ` (${metric.missingDataCount} missing)` : ''}.${metric.definition ? ` ${metric.definition}` : ''} Records: ${metric.evidenceIds.join(', ') || 'none'}.` }
}

const detailsSchema = z.object({
  metrics: z.array(z.tuple([z.string(), z.string()])),
  names: z.array(z.tuple([z.string(), z.string()])),
  evidence: z.array(z.tuple([z.string(), z.string()])),
})
const itemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), text: z.string() }),
  z.object({
    kind: z.literal('response'),
    response: coachResponseSchema,
    reviewId: z.string(),
    request: z.string().optional(),
    saved: z.boolean().optional(),
    details: detailsSchema,
  }),
])
export type ConversationItem =
  | { kind: 'user'; text: string }
  | {
      kind: 'response'
      response: z.infer<typeof coachResponseSchema>
      reviewId: string
      request?: string
      saved?: boolean
      details: {
        metrics: Map<string, string>
        names: Map<string, string>
        evidence: Map<string, string>
      }
    }
export type ConversationSummary = {
  id: string
  updated_at: string
  title: string
  preview: string
  searchText: string
  artifact: 'workout' | 'plan' | null
  isEdit: boolean
  saved: boolean
}

function responseText(response: Extract<ConversationItem, { kind: 'response' }>['response']) {
  switch (response.kind) {
    case 'answer':
      return response.blocks
        .flatMap((block) => (block.kind === 'text' ? [block.text] : []))
        .join(' ')
    case 'clarification':
      return response.question
    case 'cannot_fulfill':
      return response.reason
    case 'workout_draft':
      return response.workout.title
    case 'routine_draft':
      return response.routine.title
    case 'library_edit':
      return [response.edit.target.title, ...response.edit.summary].join(' ')
  }
}

export class CoachConversationRepository {
  constructor(private readonly db: SQLiteDatabase) {}
  async list(): Promise<ConversationSummary[]> {
    const rows = await this.db.getAllAsync<{ id: string; updated_at: string; items_json: string }>(
      'SELECT id, updated_at, items_json FROM coach_conversations ORDER BY updated_at DESC'
    )
    return rows.map((row) => {
      const items = this.parse(row.items_json)
      const latest = [...items].reverse().find((item) => item.kind === 'response')
      const artifact = [...items]
        .reverse()
        .find(
          (item) =>
            item.kind === 'response' &&
            (item.response.kind === 'workout_draft' ||
              item.response.kind === 'routine_draft' ||
              item.response.kind === 'library_edit')
        )
      const last = items.at(-1)
      const preview = latest ? responseText(latest.response) : last?.kind === 'user' ? last.text : ''
      return {
        id: row.id,
        updated_at: row.updated_at,
        title: items.find((item) => item.kind === 'user')?.text.slice(0, 80) ?? 'Conversation',
        preview,
        searchText: items
          .map((item) => (item.kind === 'user' ? item.text : responseText(item.response)))
          .join(' '),
        artifact:
          artifact?.kind === 'response'
            ? artifact.response.kind === 'routine_draft' ||
              (artifact.response.kind === 'library_edit' && artifact.response.edit.target.kind === 'routine')
              ? 'plan'
              : 'workout'
            : null,
        isEdit: artifact?.kind === 'response' && artifact.response.kind === 'library_edit',
        saved: artifact?.kind === 'response' && !!artifact.saved,
      }
    })
  }
  async load(id: string): Promise<ConversationItem[] | null> {
    const row = await this.db.getFirstAsync<{ items_json: string }>(
      'SELECT items_json FROM coach_conversations WHERE id = ?',
      id
    )
    return row ? this.parse(row.items_json) : null
  }
  async loadDraft(id: string): Promise<string> {
    const row = await this.db.getFirstAsync<{ items_json: string }>(
      'SELECT items_json FROM coach_conversations WHERE id = ?',
      id
    )
    if (!row) return ''
    const value: unknown = JSON.parse(row.items_json)
    return value && typeof value === 'object' && 'draft' in value && typeof value.draft === 'string'
      ? value.draft
      : ''
  }
  async loadScrollOffset(id: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ items_json: string }>(
      'SELECT items_json FROM coach_conversations WHERE id = ?',
      id
    )
    if (!row) return 0
    const value: unknown = JSON.parse(row.items_json)
    return value &&
      typeof value === 'object' &&
      'scrollOffset' in value &&
      typeof value.scrollOffset === 'number' &&
      Number.isFinite(value.scrollOffset) &&
      value.scrollOffset >= 0
      ? value.scrollOffset
      : 0
  }
  async save(id: string, items: ConversationItem[], draft = '', scrollOffset = 0) {
    const serialized = items.map((item) =>
      item.kind === 'user'
        ? item
        : {
            ...item,
            details: {
              metrics: [...item.details.metrics],
              names: [...item.details.names],
              evidence: [...item.details.evidence],
            },
          }
    )
    await this.db.runAsync(
      'INSERT INTO coach_conversations (id, updated_at, items_json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, items_json = excluded.items_json',
      id,
      new Date().toISOString(),
      JSON.stringify({ items: serialized, draft, scrollOffset })
    )
  }
  async delete(id: string) {
    await syncEngine.withIdRemapLock(async () => {
      await this.db.withTransactionAsync(async () => {
        const items = await this.load(id)
        const reviewIds = new Set(
          items?.flatMap((item) => (item.kind === 'response' ? [item.reviewId] : [])) ?? []
        )
        const rows = await this.db.getAllAsync<{ revision: string; draft_json: string }>(
          'SELECT revision, draft_json FROM coach_draft_saves'
        )
        for (const row of rows) {
          let value: unknown
          try {
            value = JSON.parse(
              row.revision === '__coach_pending_review__' ? row.draft_json : row.revision
            )
          } catch {
            continue
          }
          const reviewId = Array.isArray(value)
            ? value[0]
            : value && typeof value === 'object' && 'reviewId' in value
              ? value.reviewId
              : null
          if (typeof reviewId === 'string' && reviewIds.has(reviewId))
            await this.db.runAsync('DELETE FROM coach_draft_saves WHERE revision = ?', row.revision)
        }
        await this.db.runAsync('DELETE FROM coach_conversations WHERE id = ?', id)
      })
    })
  }
  private parse(json: string): ConversationItem[] {
    const value: unknown = JSON.parse(json)
    const items = z
      .array(itemSchema)
      .parse(value && typeof value === 'object' && 'items' in value ? value.items : value)
    return items.map((item) =>
      item.kind === 'user'
        ? item
        : {
            ...item,
            details: {
              metrics: new Map(item.details.metrics),
              names: new Map(item.details.names),
              evidence: new Map(item.details.evidence),
            },
          }
    )
  }
}
