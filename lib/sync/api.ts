import { apiService } from '../../services/apiService'
import type {
  ApiWorkout,
  CreateWorkoutRequest,
  UpdateWorkoutRequest,
  User,
  WorkoutRecord,
  WorkoutRecordRequest,
  WorkoutRecordResponse,
} from '../../types/api'
import type { CreateRoutineRequest, Routine, UpdateRoutineRequest } from '../../types/routine'

export interface SyncApi {
  createWorkout(workoutData: CreateWorkoutRequest, idempotencyKey?: string): Promise<{ id: string }>
  updateWorkout(
    workoutId: string,
    payload: UpdateWorkoutRequest,
    idempotencyKey?: string
  ): Promise<void>
  deleteWorkout(workoutId: string, idempotencyKey?: string): Promise<void>
  recordWorkout(
    workoutRecord: WorkoutRecordRequest,
    idempotencyKey?: string
  ): Promise<WorkoutRecordResponse>
  deleteWorkoutRecord(recordId: string, idempotencyKey?: string): Promise<void>
  createRoutine(payload: CreateRoutineRequest, idempotencyKey?: string): Promise<Routine>
  updateRoutine(
    routineId: string,
    payload: UpdateRoutineRequest,
    idempotencyKey?: string
  ): Promise<Routine>
  deleteRoutine(routineId: string, idempotencyKey?: string): Promise<void>
  getUser(): Promise<User>
  getWorkouts(): Promise<ApiWorkout[]>
  getWorkoutRecords(): Promise<WorkoutRecord[]>
  getRoutines(): Promise<Routine[]>
}

export const syncApi: SyncApi = {
  createWorkout: (workoutData, key) => apiService.createWorkout(workoutData, key),
  updateWorkout: (workoutId, payload, key) => apiService.updateWorkout(workoutId, payload, key),
  deleteWorkout: (workoutId, key) => apiService.deleteWorkout(workoutId, key),
  recordWorkout: (workoutRecord, key) => apiService.recordWorkout(workoutRecord, key),
  deleteWorkoutRecord: (recordId, key) => apiService.deleteWorkoutRecord(recordId, key),
  createRoutine: (payload, key) => apiService.createRoutine(payload, key),
  updateRoutine: (routineId, payload, key) => apiService.updateRoutine(routineId, payload, key),
  deleteRoutine: (routineId, key) => apiService.deleteRoutine(routineId, key),
  getUser: () => apiService.getUser(),
  getWorkouts: () => apiService.getWorkouts(),
  getWorkoutRecords: () => apiService.getWorkoutRecords(),
  getRoutines: () => apiService.getRoutines(),
}
