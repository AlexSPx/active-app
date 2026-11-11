import { z } from 'zod'
import { exerciseCatalog } from '../../../lib/exercises/catalog'
import metadata from '../../../lib/data/coach/exercise-planning-metadata.json'
import { isDevelopmentReviewed, releasePolicy, type KnowledgePolicy } from '../knowledge/policy'
import type { CoachToolArguments, CoachToolResults } from './contracts'

const annotationSchema = z.strictObject({
  sourceKey: z.string().min(1),
  sourceId: z.literal('free-exercise-db-f00c92c'),
  equipment: z.array(z.string().min(1)),
  movementPatterns: z.array(z.string().min(1)).min(1),
  aliases: z.array(z.string().min(1)).min(1),
  note: z.string().min(1),
  reviewStatus: z.literal('pending_review'),
})
const annotations = z.array(annotationSchema).parse(metadata)
const catalogKeys = new Set(exerciseCatalog.map((exercise) => exercise.sourceKey))
if (
  new Set(annotations.map((entry) => entry.sourceKey)).size !== annotations.length ||
  annotations.some((entry) => !catalogKeys.has(entry.sourceKey))
)
  throw new Error('Invalid exercise planning identities')
const byKey = new Map(annotations.map((entry) => [entry.sourceKey, entry]))
const normalize = (value: string) => value.toLowerCase().trim()

export function readCatalog(
  args: CoachToolArguments['readExercises'],
  policy: KnowledgePolicy = releasePolicy
): CoachToolResults['readExercises'] {
  const query = args.query && normalize(args.query)
  const muscles = args.muscles?.map(normalize)
  const available = args.equipment && new Set(args.equipment.map(normalize))
  const matches = exerciseCatalog.filter((exercise) => {
    const raw = byKey.get(exercise.sourceKey)
    const annotation =
      policy === 'development_model_reviewed' &&
      raw &&
      isDevelopmentReviewed('annotation', exercise.sourceKey, raw)
        ? raw
        : undefined
    if (
      query &&
      !normalize(exercise.name).includes(query) &&
      !annotation?.aliases.some((alias) => normalize(alias).includes(query))
    )
      return false
    if (args.ids && !args.ids.includes(exercise.id)) return false
    if (args.exclusions?.includes(exercise.id)) return false
    if (
      muscles?.length &&
      ![...exercise.primaryMuscles, ...exercise.secondaryMuscles].some((m) =>
        muscles.includes(normalize(m))
      )
    )
      return false
    if (
      args.movementPatterns?.length &&
      !annotation?.movementPatterns.some((pattern) =>
        args.movementPatterns?.map(normalize).includes(normalize(pattern))
      )
    )
      return false
    if (
      available &&
      annotation &&
      annotation.equipment.some((item) => !available.has(normalize(item)))
    )
      return false
    return true
  })
  const start = args.cursor ? matches.findIndex((exercise) => exercise.id === args.cursor) + 1 : 0
  if (args.cursor && start === 0)
    return { kind: 'error', code: 'invalid_arguments', message: 'Unknown catalog cursor.' }
  const items = matches.slice(start, start + args.limit).map((exercise) => {
    const raw = byKey.get(exercise.sourceKey)
    const annotation =
      policy === 'development_model_reviewed' &&
      raw &&
      isDevelopmentReviewed('annotation', exercise.sourceKey, raw)
        ? raw
        : undefined
    return {
      id: exercise.id,
      sourceKey: exercise.sourceKey,
      name: exercise.name,
      equipment: annotation?.equipment ?? (exercise.equipment ? [exercise.equipment] : []),
      equipmentCompatibility: 'unknown' as const,
      muscles: [...exercise.primaryMuscles, ...exercise.secondaryMuscles],
      movementPatterns: annotation?.movementPatterns ?? [],
      metadataReviewStatus: annotation ? ('model_reviewed' as const) : ('unreviewed' as const),
      ...(annotation
        ? {
            limitations: [
              'Development only; model review is not human review. Equipment quantities, capabilities and suitability are not established; rights remain unresolved.',
            ],
          }
        : {}),
    }
  })
  return {
    kind: 'success',
    data: {
      items,
      nextCursor: start + items.length < matches.length ? items[items.length - 1].id : null,
    },
  }
}
