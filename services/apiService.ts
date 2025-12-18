import AsyncStorage from '@react-native-async-storage/async-storage'
import { config, getApiUrl } from '../config/api'
import type {
  ApiError,
  LoginRequest,
  LoginResponse,
  User,
  UpdateUserRequest,
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
  UpdateUserRequest,
  ApiExercise,
  ApiWorkout,
  CreateWorkoutRequest,
  WorkoutRecordRequest,
  WorkoutRecord,
} from '../types/api'

class ApiService {
  private unauthorizedHandler?: () => void
  private isRefreshing = false
  private refreshSubscribers: ((token: string) => void)[] = []

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

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const headers = (await this.getAuthHeaders()) as Record<string, string>
    if (options.headers) {
      Object.assign(headers, options.headers)
    }

    const response = await fetch(url, { ...options, headers })

    if (response.status === 401) {
      if (!this.isRefreshing) {
        this.isRefreshing = true
        try {
          const { token, refreshToken } = await this.refreshToken()
          await this.setToken(token)
          await this.setRefreshToken(refreshToken)
          this.onRefreshed(token)
        } catch (error) {
          this.isRefreshing = false
          if (this.unauthorizedHandler) {
            this.unauthorizedHandler()
          }
          throw error
        } finally {
          this.isRefreshing = false
        }
      }

      return new Promise((resolve, reject) => {
        this.addRefreshSubscriber(async (token) => {
          try {
            headers.Authorization = `Bearer ${token}`
            const retryResponse = await fetch(url, { ...options, headers })
            resolve(this.handleResponse<T>(retryResponse))
          } catch (error) {
            reject(error)
          }
        })
      })
    }

    return this.handleResponse<T>(response)
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

    return this.request<User>(url, {
      method: 'GET',
    })
  }

  async deleteAccount(): Promise<void> {
    const url = getApiUrl(config.API_ENDPOINTS.USER.ME)
    console.log(`API Request: DELETE ${url}`)

    return this.request<void>(url, {
      method: 'DELETE',
    })
  }

  async updateCurrentUser(payload: UpdateUserRequest): Promise<User> {
    const url = getApiUrl(config.API_ENDPOINTS.USER.ME)

    // Build body: include only defined and non-null fields; ignore blank timezone
    const bodyEntries = Object.entries(payload).filter(([key, value]) => {
      if (value === undefined || value === null) return false
      if (key === 'timezone' && typeof value === 'string' && value.trim() === '') return false
      return true
    })

    const body = Object.fromEntries(bodyEntries)

    console.log(`API Request: PATCH ${url}`, body)

    return this.request<User>(url, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  }

  async registerPushToken(token: string): Promise<User> {
    if (!token || token.trim() === '') {
      const err: ApiError = new Error('Token is required')
      err.status = 400
      throw err
    }
    const url = getApiUrl(config.API_ENDPOINTS.USER.PUSH_TOKEN)
    console.log(`API Request: POST ${url}`, { hasToken: !!token })
    return this.request<User>(url, {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
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

  async setRefreshToken(token: string): Promise<void> {
    await AsyncStorage.setItem(config.STORAGE_KEYS.REFRESH_TOKEN, token)
  }

  async getRefreshToken(): Promise<string | null> {
    return AsyncStorage.getItem(config.STORAGE_KEYS.REFRESH_TOKEN)
  }

  async removeRefreshToken(): Promise<void> {
    await AsyncStorage.removeItem(config.STORAGE_KEYS.REFRESH_TOKEN)
  }

  private onRefreshed(token: string) {
    this.refreshSubscribers.forEach((callback) => callback(token))
    this.refreshSubscribers = []
  }

  private addRefreshSubscriber(callback: (token: string) => void) {
    this.refreshSubscribers.push(callback)
  }

  async refreshToken(): Promise<LoginResponse> {
    const refreshToken = await this.getRefreshToken()
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    const url = getApiUrl(config.API_ENDPOINTS.AUTH.REFRESH)
    console.log(`API Request: POST ${url}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      throw new Error('Failed to refresh token')
    }

    return response.json()
  }

  async searchExercises(query: string): Promise<ApiExercise[]> {
    const url = new URL(getApiUrl(config.API_ENDPOINTS.EXERCISES.SEARCH))
    url.searchParams.append('name', query)
    console.log(`API Request: GET ${url.toString()}`)

    return this.request<ApiExercise[]>(url.toString(), {
      method: 'GET',
    })
  }

  async createWorkout(workoutData: CreateWorkoutRequest): Promise<{ id: string }> {
    const url = getApiUrl(config.API_ENDPOINTS.WORKOUTS.CREATE)
    console.log(`API Request: POST ${url}`, workoutData)

    return this.request<{ id: string }>(url, {
      method: 'POST',
      body: JSON.stringify(workoutData),
    })
  }

  async getWorkouts(): Promise<ApiWorkout[]> {
    const url = getApiUrl(config.API_ENDPOINTS.WORKOUTS.LIST)
    console.log(`API Request: GET ${url}`)

    return this.request<ApiWorkout[]>(url, {
      method: 'GET',
    })
  }

  async recordWorkout(workoutRecord: WorkoutRecordRequest): Promise<WorkoutRecordResponse> {
    const url = getApiUrl(config.API_ENDPOINTS.WORKOUTS.RECORD)
    console.log(`API Request: POST ${url}`, workoutRecord)

    return this.request<WorkoutRecordResponse>(url, {
      method: 'POST',
      body: JSON.stringify(workoutRecord),
    })
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

    return this.request<void>(url, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async getWorkoutRecords(): Promise<WorkoutRecord[]> {
    const url = getApiUrl(config.API_ENDPOINTS.WORKOUTS.RECORD)
    console.log(`API Request: GET ${url}`)

    return this.request<WorkoutRecord[]>(url, {
      method: 'GET',
    })
  }

  async deleteWorkout(workoutId: string): Promise<void> {
    const base = config.API_ENDPOINTS.WORKOUTS.DELETE
    const url = getApiUrl(`${base}/${encodeURIComponent(workoutId)}`)
    console.log(`API Request: DELETE ${url}`)

    return this.request<void>(url, {
      method: 'DELETE',
    })
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

  async googleLogin(idToken: string): Promise<LoginResponse> {
    const url = getApiUrl(`${config.API_ENDPOINTS.AUTH.BASE}/google`)
    console.log(`API Request: POST ${url}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken }),
    })

    return this.handleResponse<LoginResponse>(response)
  }

  async linkGoogleAccount(idToken: string): Promise<void> {
    const url = getApiUrl(`${config.API_ENDPOINTS.USER.ME}/link-google`)
    console.log(`API Request: POST ${url}`)

    return this.request<void>(url, {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    })
  }

  async getExerciseLogs(exerciseId: string): Promise<ExerciseLogResponse[]> {
    const url = getApiUrl(
      `${config.API_ENDPOINTS.EXERCISES.LOGS}/${encodeURIComponent(exerciseId)}/logs`
    )
    console.log(`API Request: GET ${url}`)

    return this.request<ExerciseLogResponse[]>(url, {
      method: 'GET',
    })
  }

  async getRoutines(): Promise<Routine[]> {
    const url = getApiUrl(config.API_ENDPOINTS.ROUTINES.LIST)
    console.log(`API Request: GET ${url}`)

    return this.request<Routine[]>(url, {
      method: 'GET',
    })
  }

  async getRoutine(routineId: string): Promise<Routine> {
    const base = config.API_ENDPOINTS.ROUTINES.UPDATE
    const url = getApiUrl(`${base}/${encodeURIComponent(routineId)}`)
    console.log(`API Request: GET ${url}`)

    return this.request<Routine>(url, {
      method: 'GET',
    })
  }

  async getActiveRoutine(): Promise<Routine> {
    const url = getApiUrl(config.API_ENDPOINTS.ROUTINES.ACTIVE)
    console.log(`API Request: GET ${url}`)

    return this.request<Routine>(url, {
      method: 'GET',
    })
  }

  async createRoutine(payload: CreateRoutineRequest): Promise<Routine> {
    const url = getApiUrl(config.API_ENDPOINTS.ROUTINES.CREATE)
    console.log(`API Request: POST ${url}`, payload)

    return this.request<Routine>(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async updateRoutine(routineId: string, payload: UpdateRoutineRequest): Promise<Routine> {
    const base = config.API_ENDPOINTS.ROUTINES.UPDATE
    const url = getApiUrl(`${base}/${encodeURIComponent(routineId)}`)
    console.log(`API Request: PUT ${url}`, payload)

    return this.request<Routine>(url, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async deleteRoutine(routineId: string): Promise<void> {
    const base = config.API_ENDPOINTS.ROUTINES.DELETE
    const url = getApiUrl(`${base}/${encodeURIComponent(routineId)}`)
    console.log(`API Request: DELETE ${url}`)

    return this.request<void>(url, {
      method: 'DELETE',
    })
  }
  async getTermsOfService(): Promise<string> {
    const url = getApiUrl(config.API_ENDPOINTS.LEGAL.TERMS)
    console.log(`API Request: GET ${url}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/markdown',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch terms of service: ${response.status}`)
    }

    return response.text()
  }

  async getPrivacyPolicy(): Promise<string> {
    const url = getApiUrl(config.API_ENDPOINTS.LEGAL.PRIVACY)
    console.log(`API Request: GET ${url}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/markdown',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch privacy policy: ${response.status}`)
    }

    return response.text()
  }
}

export const apiService = new ApiService()
