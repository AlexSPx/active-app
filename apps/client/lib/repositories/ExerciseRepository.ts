import { z } from 'zod'
import { launchFacade } from '../../features/launch/launchFacade'
import { exerciseCatalog as localExercises } from '../data/exercises'
import { resolveExerciseIdentities } from '../data/catalogIdentity'
import { apiService } from '../../services/apiService'
import { getDatabase } from '../db/connection'
import {
  exerciseCategorySchema,
  exerciseLogsArraySchema,
  exercisesArraySchema,
} from '../schemas/api'
import type { ApiExercise, ExerciseLogResponse } from '../../types/api'

const LOCAL_EXERCISE_ID_PREFIX = 'local:exercise:'

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

async function loadCachedWorkoutExercises(): Promise<CachedWorkoutExercise[]> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<WorkoutTemplateRow>(`
    SELECT workout_template
    FROM workouts
    WHERE is_deleted = 0 AND workout_template IS NOT NULL
    ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC, id DESC
  `)
  const exercises: CachedWorkoutExercise[] = []
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

      seenExerciseIds.add(exercise.exerciseId)
      exercises.push({ ...exercise, name })
    }
  }

  return exercises
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
    const results = localExercises.filter((exercise) =>
      exercise.name.toLowerCase().includes(normalizedQuery)
    )

    for (const cached of cachedExercises) {
      if (cached.name.toLowerCase().includes(normalizedQuery)) {
        results.push(overlayCachedExercise(undefined, cached))
      }
    }

    return results
  }

  async resolveIdentities(ids: string[]) {
    const snapshot = await apiService.getExerciseCatalog()
    return resolveExerciseIdentities(snapshot, ids)
  }

  async getLogs(exerciseId: string): Promise<ExerciseLogResponse[]> {
    if (exerciseId.startsWith(LOCAL_EXERCISE_ID_PREFIX)) return []

    const response = await apiService.getExerciseLogs(exerciseId)
    return exerciseLogsArraySchema.parse(response)
  }
}
