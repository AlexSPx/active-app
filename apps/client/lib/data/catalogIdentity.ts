import { z } from 'zod'

export const SOURCE_DATASET_VERSION = 'free-exercise-db:f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5'
const LOCAL_PREFIX = 'local:exercise:'

const catalogSchema = z.object({
  catalogVersion: z.number().int().positive(),
  sourceDatasetVersion: z.string().min(1),
  mappingComplete: z.boolean(),
  unresolvedSourceKeys: z.array(z.string()),
  unresolvedLegacyIds: z.array(z.string()),
  items: z.array(
    z.object({ id: z.string().min(1), sourceKey: z.string().min(1), retired: z.boolean() })
  ),
})

export type ExerciseResolution =
  | { kind: 'resolved'; id: string; retired: boolean }
  | { kind: 'unresolved'; originalId: string }

export function resolveExerciseIdentities(snapshot: unknown, ids: string[]): ExerciseResolution[] {
  const catalog = catalogSchema.parse(snapshot)
  const byKey = new Map<string, { id: string; retired: boolean }>()
  for (const item of catalog.items) {
    if (byKey.has(item.sourceKey)) throw new Error('Duplicate catalog source key')
    byKey.set(item.sourceKey, { id: item.id, retired: item.retired })
  }
  return ids.map((originalId) => {
    if (
      catalog.mappingComplete &&
      catalog.sourceDatasetVersion === SOURCE_DATASET_VERSION &&
      originalId.startsWith(LOCAL_PREFIX)
    ) {
      const key = originalId.slice(LOCAL_PREFIX.length)
      const item = catalog.unresolvedSourceKeys.includes(key) ? undefined : byKey.get(key)
      if (item) return { kind: 'resolved', ...item }
    }
    return { kind: 'unresolved', originalId }
  })
}
