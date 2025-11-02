import AsyncStorage from '@react-native-async-storage/async-storage'
import { config, getApiUrl } from '../config/api'
import type {
  ApiError,
  LoginRequest,
  LoginResponse,
  User,
  ApiExercise,
  ApiWorkout,
  CreateWorkoutRequest,
  WorkoutRecordRequest,
  WorkoutRecord,
  RegisterRequest,
  ExerciseLogResponse,
} from '../types/api'
import type { WorkoutRecordResponse } from '../types/api'
import type { Routine, CreateRoutineRequest, UpdateRoutineRequest } from '../types/routine'

// Re-export types for backward compatibility
export type {
  ApiError,
  LoginRequest,
  LoginResponse,
  User,
  ApiExercise,
  ApiWorkout,
  CreateWorkoutRequest,
  WorkoutRecordRequest,
  WorkoutRecord,
} from '../types/api'

class ApiService {
  private unauthorizedHandler?: () => void

  setUnauthorizedHandler(handler: () => void) {
    this.unauthorizedHandler = handler
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const token = await AsyncStorage.getItem(config.STORAGE_KEYS.TOKEN)
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    return headers
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    // Log response
    console.log(`API Response: ${response.status} ${response.url}`)

    if (!response.ok) {
      // On unauthorized globally signal handler
      if (response.status === 401 && this.unauthorizedHandler) {
        try {
          this.unauthorizedHandler()
        } catch (e) {
          console.error('Unauthorized handler error:', e)
        }
      }

      const error: ApiError = new Error(`API Error: ${response.status}`)
      error.status = response.status

      try {
        const errorData = await response.json()
        error.message = errorData.message || error.message
        error.code = errorData.code
        console.error(`API Error Details:`, errorData)
      } catch {
        // If response is not JSON, use default error message
        console.error(`API Error: ${response.status} - ${response.statusText}`)
      }

      throw error
    }

    try {
      const data = await response.json()
      console.log(`API Success:`, { url: response.url, data })
      return data
    } catch {
      // If response is not JSON, return empty object
      console.log(`API Success (no JSON):`, response.url)
      return {} as T
    }
  }

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const url = getApiUrl(config.API_ENDPOINTS.AUTH.LOGIN)
    console.log(`API Request: POST ${url}`, { email: credentials.email })

    const response = await fetch(url, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(credentials),
    })

    return this.handleResponse<LoginResponse>(response)
  }

  async getUser(): Promise<User> {
    const url = getApiUrl(config.API_ENDPOINTS.USER.ME)
    console.log(`API Request: GET ${url}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    })

    return this.handleResponse<User>(response)
  }

  async setToken(token: string): Promise<void> {
    await AsyncStorage.setItem(config.STORAGE_KEYS.TOKEN, token)
  }

  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(config.STORAGE_KEYS.TOKEN)
  }

  async removeToken(): Promise<void> {
    await AsyncStorage.removeItem(config.STORAGE_KEYS.TOKEN)
  }

  async searchExercises(query: string): Promise<ApiExercise[]> {
    const url = new URL(getApiUrl(config.API_ENDPOINTS.EXERCISES.SEARCH))
    url.searchParams.append('name', query)
    console.log(`API Request: GET ${url.toString()}`)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    })

    return this.handleResponse<ApiExercise[]>(response)
  }

  async createWorkout(workoutData: CreateWorkoutRequest): Promise<{ id: string }> {
    const url = getApiUrl(config.API_ENDPOINTS.WORKOUTS.CREATE)
    console.log(`API Request: POST ${url}`, workoutData)

    const response = await fetch(url, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(workoutData),
    })

    return this.handleResponse<{ id: string }>(response)
  }

  async getWorkouts(): Promise<ApiWorkout[]> {
    const url = getApiUrl(config.API_ENDPOINTS.WORKOUTS.LIST)
    console.log(`API Request: GET ${url}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    })

    return this.handleResponse<ApiWorkout[]>(response)
  }

  async recordWorkout(workoutRecord: WorkoutRecordRequest): Promise<WorkoutRecordResponse> {
    const url = getApiUrl(config.API_ENDPOINTS.WORKOUTS.RECORD)
    console.log(`API Request: POST ${url}`, workoutRecord)

    const response = await fetch(url, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(workoutRecord),
    })

    return this.handleResponse<WorkoutRecordResponse>(response)
  }

  async updateWorkout(
    workoutId: string,
    payload: Partial<CreateWorkoutRequest> & {
      title?: string
      notes?: string
      template?: CreateWorkoutRequest['template']
    }
  ): Promise<void> {
    const base = config.API_ENDPOINTS.WORKOUTS.UPDATE
    const url = getApiUrl(`${base}/${encodeURIComponent(workoutId)}`)
    console.log(`API Request: PUT ${url}`, payload)

    const response = await fetch(url, {
      method: 'PUT',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(payload),
    })

    // Many PUT endpoints return no body; handleResponse will return {} in that case
    await this.handleResponse<unknown>(response)
  }

  async getWorkoutRecords(): Promise<WorkoutRecord[]> {
    const url = getApiUrl(config.API_ENDPOINTS.WORKOUTS.RECORD)
    console.log(`API Request: GET ${url}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    })

    return this.handleResponse<WorkoutRecord[]>(response)
  }

  async deleteWorkout(workoutId: string): Promise<void> {
    const base = config.API_ENDPOINTS.WORKOUTS.DELETE
    const url = getApiUrl(`${base}/${encodeURIComponent(workoutId)}`)
    console.log(`API Request: DELETE ${url}`)

    const response = await fetch(url, {
      method: 'DELETE',
      headers: await this.getAuthHeaders(),
    })

    // Many DELETE endpoints return no body; handleResponse will return {}
    await this.handleResponse<unknown>(response)
  }

  async signup(payload: RegisterRequest): Promise<LoginResponse> {
    const url = getApiUrl(config.API_ENDPOINTS.AUTH.SIGNUP)
    console.log(`API Request: POST ${url}`, { email: payload.email })

    const response = await fetch(url, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(payload),
    })

    return this.handleResponse<LoginResponse>(response)
  }

  async getExerciseLogs(exerciseId: string): Promise<ExerciseLogResponse[]> {
    const url = getApiUrl(
      `${config.API_ENDPOINTS.EXERCISES.LOGS}/${encodeURIComponent(exerciseId)}/logs`
    )
    console.log(`API Request: GET ${url}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    })

    return this.handleResponse<ExerciseLogResponse[]>(response)
  }

  async getRoutines(): Promise<Routine[]> {
    const url = getApiUrl(config.API_ENDPOINTS.ROUTINES.LIST)
    console.log(`API Request: GET ${url}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    })

    return this.handleResponse<Routine[]>(response)
  }

  async getRoutine(routineId: string): Promise<Routine> {
    const base = config.API_ENDPOINTS.ROUTINES.UPDATE
    const url = getApiUrl(`${base}/${encodeURIComponent(routineId)}`)
    console.log(`API Request: GET ${url}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    })

    return this.handleResponse<Routine>(response)
  }

  async getActiveRoutine(): Promise<Routine> {
    const url = getApiUrl(config.API_ENDPOINTS.ROUTINES.ACTIVE)
    console.log(`API Request: GET ${url}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    })

    return this.handleResponse<Routine>(response)
  }

  async createRoutine(payload: CreateRoutineRequest): Promise<Routine> {
    const url = getApiUrl(config.API_ENDPOINTS.ROUTINES.CREATE)
    console.log(`API Request: POST ${url}`, payload)

    const response = await fetch(url, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(payload),
    })

    return this.handleResponse<Routine>(response)
  }

  async updateRoutine(routineId: string, payload: UpdateRoutineRequest): Promise<Routine> {
    const base = config.API_ENDPOINTS.ROUTINES.UPDATE
    const url = getApiUrl(`${base}/${encodeURIComponent(routineId)}`)
    console.log(`API Request: PUT ${url}`, payload)

    const response = await fetch(url, {
      method: 'PUT',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(payload),
    })

    return this.handleResponse<Routine>(response)
  }

  async deleteRoutine(routineId: string): Promise<void> {
    const base = config.API_ENDPOINTS.ROUTINES.DELETE
    const url = getApiUrl(`${base}/${encodeURIComponent(routineId)}`)
    console.log(`API Request: DELETE ${url}`)

    const response = await fetch(url, {
      method: 'DELETE',
      headers: await this.getAuthHeaders(),
    })

    await this.handleResponse<unknown>(response)
  }
}

export const apiService = new ApiService()
