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
  createWorkout(workoutData: CreateWorkoutRequest): Promise<{ id: string }>
  updateWorkout(workoutId: string, payload: UpdateWorkoutRequest): Promise<void>
  deleteWorkout(workoutId: string): Promise<void>
  recordWorkout(workoutRecord: WorkoutRecordRequest): Promise<WorkoutRecordResponse>
  deleteWorkoutRecord(recordId: string): Promise<void>
  createRoutine(payload: CreateRoutineRequest): Promise<Routine>
  updateRoutine(routineId: string, payload: UpdateRoutineRequest): Promise<Routine>
  deleteRoutine(routineId: string): Promise<void>
  getUser(): Promise<User>
  getWorkouts(): Promise<ApiWorkout[]>
  getWorkoutRecords(): Promise<WorkoutRecord[]>
  getRoutines(): Promise<Routine[]>
}

export const syncApi: SyncApi = {
  createWorkout: (workoutData) => apiService.createWorkout(workoutData),
  updateWorkout: (workoutId, payload) => apiService.updateWorkout(workoutId, payload),
  deleteWorkout: (workoutId) => apiService.deleteWorkout(workoutId),
  recordWorkout: (workoutRecord) => apiService.recordWorkout(workoutRecord),
  deleteWorkoutRecord: (recordId) => apiService.deleteWorkoutRecord(recordId),
  createRoutine: (payload) => apiService.createRoutine(payload),
  updateRoutine: (routineId, payload) => apiService.updateRoutine(routineId, payload),
  deleteRoutine: (routineId) => apiService.deleteRoutine(routineId),
  getUser: () => apiService.getUser(),
  getWorkouts: () => apiService.getWorkouts(),
  getWorkoutRecords: () => apiService.getWorkoutRecords(),
  getRoutines: () => apiService.getRoutines(),
}
