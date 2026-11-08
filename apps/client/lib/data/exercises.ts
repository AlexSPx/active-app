import { z } from 'zod'
import artifact from './exercise-catalog.json'
import { exerciseSchema } from '../schemas/api'
import type { ApiExercise } from '../../types/api'

export const exerciseCatalog: ApiExercise[] = z
  .array(exerciseSchema.extend({ sourceKey: z.string() }))
  .parse(artifact)
  .map(({ sourceKey, ...exercise }) => {
    if (exercise.id !== `local:exercise:${sourceKey}`) {
      throw new Error(`Exercise catalog ID does not match its source key: ${sourceKey}`)
    }
    return exercise
  })
