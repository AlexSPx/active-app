import { z } from 'zod'

export const SOURCE_DATASET_VERSION = 'free-exercise-db:f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5'
const LOCAL_PREFIX = 'local:exercise:'

const catalogSchema = z.object({
  catalogVersion: z.number().int().positive(),
  sourceDatasetVersion: z.string().min(1),
  mappingComplete: z.boolean(),
  unresolvedSourceKeys: z.array(z.string()),
  unresolvedLegacyIds: z.array(z.string()),
  sourceMappings: z.array(
    z.object({
      datasetVersion: z.string().min(1),
      sourceKey: z.string().min(1),
      exerciseId: z.string().min(1),
    })
  ),
  items: z.array(
    z.object({ id: z.string().min(1), sourceKey: z.string().min(1), retired: z.boolean() })
  ),
})

export type ExerciseResolution =
  | { kind: 'resolved'; id: string; retired: boolean }
  | { kind: 'unresolved'; originalId: string }

export function resolveExerciseIdentities(snapshot: unknown, ids: string[]): ExerciseResolution[] {
  const catalog = catalogSchema.parse(snapshot)
  const byId = new Map(catalog.items.map(({ id, retired }) => [id, { id, retired }]))
  const byKey = new Map<string, string>()
  for (const mapping of catalog.sourceMappings) {
    if (mapping.datasetVersion !== SOURCE_DATASET_VERSION) continue
    if (byKey.has(mapping.sourceKey)) throw new Error('Duplicate catalog source mapping')
    byKey.set(mapping.sourceKey, mapping.exerciseId)
  }
  return ids.map((originalId) => {
    const exact = byId.get(originalId)
    if (exact) return { kind: 'resolved', ...exact }
    if (catalog.mappingComplete && originalId.startsWith(LOCAL_PREFIX)) {
      const key = originalId.slice(LOCAL_PREFIX.length)
      const id = catalog.unresolvedSourceKeys.includes(key) ? undefined : byKey.get(key)
      const item = id ? byId.get(id) : undefined
      if (item) return { kind: 'resolved', ...item }
    }
    return { kind: 'unresolved', originalId }
  })
}
