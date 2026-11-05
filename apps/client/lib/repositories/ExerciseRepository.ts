import { z } from 'zod'
import { launchFacade } from '../../features/launch/launchFacade'
import exerciseCatalogArtifact from '../data/exercise-catalog.json'
import { apiService } from '../../services/apiService'
import { getDatabase } from '../db/connection'
import {
  exerciseCategorySchema,
  exerciseLogsArraySchema,
  exercisesArraySchema,
  exerciseSchema,
} from '../schemas/api'
import type { ApiExercise, ExerciseLogResponse } from '../../types/api'

const LOCAL_EXERCISE_ID_PREFIX = 'local:exercise:'

const localExerciseSchema = exerciseSchema.extend({ sourceKey: z.string() })
const cachedWorkoutExerciseSchema = z.object({
  exerciseId: z.string(),
  exerciseTitle: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  primaryMuscles: z.array(z.string()).nullable().optional(),
  secondaryMuscles: z.array(z.string()).nullable().optional(),
})
const cachedWorkoutTemplateSchema = z.object({
  exercises: z.array(cachedWorkoutExerciseSchema).optional().default([]),
})

type CachedWorkoutExercise = z.infer<typeof cachedWorkoutExerciseSchema> & { name: string }
interface WorkoutTemplateRow {
  workout_template: string | null
}

const localExercises: ApiExercise[] = z
  .array(localExerciseSchema)
  .parse(exerciseCatalogArtifact)
  .map(({ sourceKey, ...exercise }) => {
    if (exercise.id !== `${LOCAL_EXERCISE_ID_PREFIX}${sourceKey}`) {
      throw new Error(`Exercise catalog ID does not match its source key: ${sourceKey}`)
    }
    return exercise
  })

const localExercisesByName = new Map(
  localExercises.map((exercise) => [normalizeName(exercise.name), exercise])
)

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

async function loadCachedWorkoutExercises(): Promise<Map<string, CachedWorkoutExercise>> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<WorkoutTemplateRow>(`
    SELECT workout_template
    FROM workouts
    WHERE is_deleted = 0 AND workout_template IS NOT NULL
    ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC, id DESC
  `)
  const exercisesByName = new Map<string, CachedWorkoutExercise>()
  const seenExerciseIds = new Set<string>()

  for (const row of rows) {
    if (!row.workout_template) continue

    let templateJson: unknown
    try {
      templateJson = JSON.parse(row.workout_template)
    } catch {
      continue
    }

    const template = cachedWorkoutTemplateSchema.safeParse(templateJson)
    if (!template.success) continue

    for (const exercise of template.data.exercises) {
      if (!z.string().uuid().safeParse(exercise.exerciseId).success) continue
      if (seenExerciseIds.has(exercise.exerciseId)) continue

      const name = exercise.exerciseTitle?.trim()
      if (!name) continue
      const key = normalizeName(name)
      if (!key) continue

      seenExerciseIds.add(exercise.exerciseId)
      if (exercisesByName.has(key)) continue
      exercisesByName.set(key, { ...exercise, name })
    }
  }

  return exercisesByName
}

function overlayCachedExercise(
  exercise: ApiExercise | undefined,
  cached: CachedWorkoutExercise
): ApiExercise {
  const parsedCategory = exerciseCategorySchema.safeParse(cached.category)
  const category = parsedCategory.success ? parsedCategory.data : (exercise?.category ?? 'STRENGTH')

  if (exercise) {
    return {
      ...exercise,
      id: cached.exerciseId,
      name: cached.name,
      category,
      primaryMuscles: cached.primaryMuscles ?? exercise.primaryMuscles,
      secondaryMuscles: cached.secondaryMuscles ?? exercise.secondaryMuscles,
    }
  }

  return {
    id: cached.exerciseId,
    name: cached.name,
    level: 'BEGINNER',
    primaryMuscles: cached.primaryMuscles ?? [],
    secondaryMuscles: cached.secondaryMuscles ?? [],
    instructions: [],
    category,
  }
}

export class ExerciseRepository {
  get searchNetworkMode(): 'online' | 'always' {
    return launchFacade.api.backendMode() === 'remote' ? 'online' : 'always'
  }

  async search(query: string): Promise<ApiExercise[]> {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return []

    if (launchFacade.api.backendMode() === 'remote') {
      const response = await apiService.searchExercises(query)
      return exercisesArraySchema.parse(response)
    }

    const cachedExercises = await loadCachedWorkoutExercises()
    const results: ApiExercise[] = []
    const matchedNames = new Set<string>()

    for (const exercise of localExercises) {
      if (!exercise.name.toLowerCase().includes(normalizedQuery)) continue

      const name = normalizeName(exercise.name)
      const cached = cachedExercises.get(name)
      results.push(cached ? overlayCachedExercise(exercise, cached) : exercise)
      matchedNames.add(name)
    }

    for (const [name, cached] of cachedExercises) {
      if (matchedNames.has(name) || !cached.name.toLowerCase().includes(normalizedQuery)) continue

      results.push(overlayCachedExercise(localExercisesByName.get(name), cached))
      matchedNames.add(name)
    }

    return results
  }

  async getLogs(exerciseId: string): Promise<ExerciseLogResponse[]> {
    if (exerciseId.startsWith(LOCAL_EXERCISE_ID_PREFIX)) return []

    const response = await apiService.getExerciseLogs(exerciseId)
    return exerciseLogsArraySchema.parse(response)
  }
}
