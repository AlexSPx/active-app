import { apiService } from '../../services/apiService'
import { exerciseLogsArraySchema, exercisesArraySchema } from '../schemas/api'
import type { ApiExercise, ExerciseLogResponse } from '../../types/api'

export class ExerciseRepository {
  async search(query: string): Promise<ApiExercise[]> {
    const response = await apiService.searchExercises(query)
    return exercisesArraySchema.parse(response)
  }

  async getLogs(exerciseId: string): Promise<ExerciseLogResponse[]> {
    const response = await apiService.getExerciseLogs(exerciseId)
    return exerciseLogsArraySchema.parse(response) as ExerciseLogResponse[]
  }
}
