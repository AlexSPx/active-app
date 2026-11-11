import { z } from 'zod'

const text = z.string().trim().min(1).max(500)
const id = z.string().regex(/^[a-z0-9-]+$/)
export const knowledgeSourceSchema = z.strictObject({
  id,
  title: text,
  url: z.url(),
  version: text,
  license: text,
  attribution: text,
  redistributionPermission: z.literal('user_authorized_original'),
  trainingPermission: z.literal('user_authorized_original'),
  permissionBasis: text,
  reviewStatus: z.literal('pending_review'),
  reviewer: z.null(),
})
export const knowledgeCardSchema = z.strictObject({
  id,
  title: text,
  claim: text,
  applicability: text,
  sourceIds: z.array(id).min(1),
  reviewStatus: z.literal('pending_review'),
  aliases: z.array(text).min(1),
})
export const knowledgePackSchema = z
  .strictObject({
    cards: z.array(knowledgeCardSchema).min(40).max(60),
    sources: z.array(knowledgeSourceSchema).min(1),
  })
  .superRefine(({ cards, sources }, ctx) => {
    const sourceIds = new Set(sources.map((s) => s.id))
    if (sourceIds.size !== sources.length || new Set(cards.map((c) => c.id)).size !== cards.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate card or source ID' })
    for (const card of cards)
      for (const sourceId of card.sourceIds) {
        if (!sourceIds.has(sourceId))
          ctx.addIssue({ code: 'custom', message: `Unknown source: ${sourceId}` })
      }
  })
