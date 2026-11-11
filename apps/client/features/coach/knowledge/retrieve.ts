import cards from './cards.json'
import sources from './sources.json'
import { knowledgePackSchema } from './contracts'
import {
  developmentLimitations,
  isDevelopmentReviewed,
  releasePolicy,
  type KnowledgePolicy,
} from './policy'
import type { CoachToolResults } from '../tools/contracts'

export const knowledgePack = knowledgePackSchema.parse({ cards, sources })
const ignored = new Set([
  'the',
  'and',
  'for',
  'how',
  'what',
  'should',
  'can',
  'with',
  'does',
  'from',
  'your',
  'about',
  'train',
  'training',
])
const tokens = (text: string) =>
  text
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((t) => t.length > 2 && !ignored.has(t)) ?? []
const specialPopulation =
  /\b(pregnan\w*|postpartum|breastfeed\w*|child\w*|teen\w*|adolescen\w*|elderly|senior\w*|older adult\w*|injur\w*|rehab\w*|disab\w*|surgery|surgical|disease|diabet\w*|cardiac|heart|chest pain|faint\w*|dizz\w*|symptom\w*|pain|cancer)\b/i
const unrelated =
  /\b(dog\w*|pupp\w*|cat\w*|pet\w*|file\w*|computer\w*|software|password\w*|airplane\w*|aircraft|plane\w*|crash\w*)\b/i

export function retrieveKnowledge(
  query: string,
  policy: KnowledgePolicy = releasePolicy
): CoachToolResults['readCoachKnowledge'] {
  const empty = { kind: 'success' as const, data: { cards: [], sources: [] } }
  if (specialPopulation.test(query))
    return {
      kind: 'success',
      data: { cards: [], sources: [], routing: 'special_population_or_symptoms' },
    }
  if (policy !== 'development_model_reviewed' || unrelated.test(query)) return empty
  const queryTokens = new Set(tokens(query))
  const ranked = knowledgePack.cards
    .filter((card) => isDevelopmentReviewed('card', card.id, card))
    .map((card) => {
      const alias = new Set(tokens(card.aliases.join(' ')))
      let score = 0
      for (const token of queryTokens) if (alias.has(token)) score++
      return { card, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id))
    .slice(0, 5)
  const selected = ranked.map(({ card }) => ({
    id: card.id,
    claim: card.claim,
    applicability: card.applicability,
    sourceIds: card.sourceIds,
    reviewStatus: 'model_reviewed' as const,
    limitations: developmentLimitations,
  }))
  const ids = new Set(selected.flatMap((card) => card.sourceIds))
  return {
    kind: 'success',
    data: {
      cards: selected,
      sources: knowledgePack.sources
        .filter((source) => ids.has(source.id))
        .map(({ reviewer: _reviewer, ...source }) => ({
          ...source,
          redistributionPermission: 'unverified',
          trainingPermission: 'unverified',
          role: 'authorship_terms' as const,
        })),
    },
  }
}
