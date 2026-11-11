import { exerciseCatalog } from '../../../lib/exercises/catalog'
import type { CoachToolArguments, CoachToolResults } from './contracts'

const normalize = (value: string) => value.toLowerCase().trim()

export function readCatalog(
  args: CoachToolArguments['readExercises']
): CoachToolResults['readExercises'] {
  const query = args.query && normalize(args.query)
  const muscles = args.muscles?.map(normalize)
  const matches = exerciseCatalog.filter((exercise) => {
    if (query && !normalize(exercise.name).includes(query)) return false
    if (args.ids && !args.ids.includes(exercise.id)) return false
    if (args.exclusions?.includes(exercise.id)) return false
    if (
      muscles?.length &&
      ![...exercise.primaryMuscles, ...exercise.secondaryMuscles].some((m) =>
        muscles.includes(normalize(m))
      )
    )
      return false
    if (args.movementPatterns?.length) return false
    return true
  })
  const start = args.cursor ? matches.findIndex((exercise) => exercise.id === args.cursor) + 1 : 0
  if (args.cursor && start === 0)
    return { kind: 'error', code: 'invalid_arguments', message: 'Unknown catalog cursor.' }
  const items = matches.slice(start, start + args.limit).map((exercise) => {
    return {
      id: exercise.id,
      sourceKey: exercise.sourceKey,
      name: exercise.name,
      equipment: exercise.equipment ? [exercise.equipment] : [],
      equipmentCompatibility: 'unknown' as const,
      muscles: [...exercise.primaryMuscles, ...exercise.secondaryMuscles],
      movementPatterns: [],
      metadataReviewStatus: 'unreviewed' as const,
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
