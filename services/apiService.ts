import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
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

const isWeb = Platform.OS === 'web'
const shouldLogApi = process.env.NODE_ENV === 'development'

interface RequestLogContext {
  method: string
  url: string
}

class ApiService {
  private unauthorizedHandler?: () => void
  private isRefreshing = false
  private refreshSubscribers: ((token: string | null, error?: any) => void)[] = []
  private credentialGeneration = 0
  private credentialWrites: Promise<void> = Promise.resolve()
  private credentialTransition = false
  private activeFetches = new Map<AbortController, Promise<void>>()

  private serializeCredentialWrite<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.credentialWrites.then(operation)
    this.credentialWrites = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async persistRefreshedCredentials(
    token: string,
    refreshToken: string,
    generation: number
  ): Promise<boolean> {
    return this.serializeCredentialWrite(async () => {
      if (generation !== this.credentialGeneration) return false
      await AsyncStorage.setItem(config.STORAGE_KEYS.TOKEN, token)
      if (generation !== this.credentialGeneration) return false
      await AsyncStorage.setItem(config.STORAGE_KEYS.REFRESH_TOKEN, refreshToken)
      return generation === this.credentialGeneration
    })
  }

  private authSessionChangedError(): Error {
    return Object.assign(new Error('Authentication changed before the request could be retried'), {
      code: 'AUTH_SESSION_CHANGED',
    })
  }

  setUnauthorizedHandler(handler: () => void) {
    this.unauthorizedHandler = handler
  }

  async invalidatePendingRequests(): Promise<void> {
    this.credentialGeneration += 1
    this.credentialTransition = true
    const activeFetches = [...this.activeFetches.entries()]
    for (const [controller] of activeFetches) controller.abort()
    await Promise.all(activeFetches.map(([, settled]) => settled))
    await this.credentialWrites
  }

  resumePendingRequests(): void {
    this.credentialTransition = false
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      // Standard header to indicate platform - server can use this to decide
      // whether to return tokens in body (native) or set httpOnly cookies (web)
      'X-Platform': isWeb ? 'web' : 'native',
      ...(process.env.NODE_ENV === 'development' && { 'ngrok-skip-browser-warning': 'true' }),
    }

    // On web, authentication is handled via httpOnly cookies
    // On native, we need to include the Bearer token
    if (!isWeb) {
      const token = await AsyncStorage.getItem(config.STORAGE_KEYS.TOKEN)
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
    }

    return headers
  }

  /**
   * Get fetch options with appropriate credentials for the platform.
   * Web requests include credentials to send/receive httpOnly cookies.
   */
  private getFetchOptions(options: RequestInit = {}): RequestInit {
    if (isWeb) {
      return {
        ...options,
        credentials: 'include', // Required for httpOnly cookies
      }
    }
    return options
  }

  private logRequest({ method, url }: RequestLogContext) {
    if (!shouldLogApi) return
    console.log(`[API] ${method} ${url}`)
  }

  private logResponse({ method, url }: RequestLogContext, response: Response) {
    if (!shouldLogApi) return
    console.log(`[API] ${method} ${url} -> ${response.status}`)
  }

  private logFailure(
    { method, url }: RequestLogContext,
    details: { status?: number; message?: string; code?: string }
  ) {
    if (!shouldLogApi) return
    console.error(`[API] ${method} ${url} failed`, details)
  }

  private createTimeoutError(url: string): ApiError {
    const error: ApiError = new Error(`Request timed out after ${config.REQUEST_TIMEOUT}ms: ${url}`)
    error.status = 408
    error.code = 'REQUEST_TIMEOUT'
    return error
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    credentialGeneration = this.credentialGeneration
  ): Promise<Response> {
    const controller = new AbortController()
    let finishRequest!: () => void
    const settled = new Promise<void>((resolve) => {
      finishRequest = resolve
    })
    this.activeFetches.set(controller, settled)
    const abortHandler = () => controller.abort()
    options.signal?.addEventListener('abort', abortHandler)
    const timeoutId = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT)

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      })
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        if (credentialGeneration !== this.credentialGeneration) {
          throw this.authSessionChangedError()
        }
        throw this.createTimeoutError(url)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
      options.signal?.removeEventListener('abort', abortHandler)
      this.activeFetches.delete(controller)
      finishRequest()
    }
  }

  private async handleResponse<T>(
    response: Response,
    context: RequestLogContext,
    credentialGeneration: number,
    skipUnauthorizedHandler = false
  ): Promise<T> {
    this.logResponse(context, response)

    if (!response.ok) {
      const error: ApiError = new Error(`API Error: ${response.status}`)
      error.status = response.status

      try {
        const errorData = await response.json()
        error.message = errorData.message || error.message
        error.code = errorData.code
      } catch {
        error.message = response.statusText || error.message
      }

      if (credentialGeneration !== this.credentialGeneration) {
        throw this.authSessionChangedError()
      }

      // On unauthorized globally signal handler after parsing the response.
      // Skip when the caller will handle 401 with token refresh.
      if (response.status === 401 && this.unauthorizedHandler && !skipUnauthorizedHandler) {
        try {
          this.unauthorizedHandler()
        } catch (e) {
          console.error('Unauthorized handler error:', e)
        }
      }

      this.logFailure(context, {
        status: error.status,
        message: error.message,
        code: error.code,
      })

      throw error
    }

    let data: T
    try {
      data = await response.json()
    } catch {
      if (credentialGeneration !== this.credentialGeneration) {
        throw this.authSessionChangedError()
      }
      // If response is not JSON, return empty object
      return {} as T
    }
    if (credentialGeneration !== this.credentialGeneration) {
      throw this.authSessionChangedError()
    }
    return data
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const credentialGeneration = this.credentialGeneration
    const method = options.method || 'GET'
    const context: RequestLogContext = { method, url }
    const headers = (await this.getAuthHeaders()) as Record<string, string>
    if (options.headers) {
      Object.assign(headers, options.headers)
    }
    if (credentialGeneration !== this.credentialGeneration) throw this.authSessionChangedError()

    const fetchOptions = this.getFetchOptions({ ...options, headers })
    this.logRequest(context)
    const response = await this.fetchWithTimeout(url, fetchOptions, credentialGeneration)
    if (credentialGeneration !== this.credentialGeneration) throw this.authSessionChangedError()

    if (response.status === 401) {
      if (credentialGeneration !== this.credentialGeneration) throw this.authSessionChangedError()
      if (this.credentialTransition) throw this.authSessionChangedError()
      if (!this.isRefreshing) {
        this.isRefreshing = true
        try {
          const { token, refreshToken } = await this.refreshToken(credentialGeneration)
          if (credentialGeneration !== this.credentialGeneration) {
            throw this.authSessionChangedError()
          }
          const persisted = await this.persistRefreshedCredentials(
            token,
            refreshToken,
            credentialGeneration
          )
          if (!persisted || credentialGeneration !== this.credentialGeneration) {
            throw this.authSessionChangedError()
          }
          this.onRefreshed(token)

          // Retry the original request immediately
          headers.Authorization = `Bearer ${token}`
          if (credentialGeneration !== this.credentialGeneration) {
            throw this.authSessionChangedError()
          }
          const retryFetchOptions = this.getFetchOptions({ ...options, headers })
          this.logRequest(context)
          const retryResponse = await this.fetchWithTimeout(
            url,
            retryFetchOptions,
            credentialGeneration
          )
          if (credentialGeneration !== this.credentialGeneration) {
            throw this.authSessionChangedError()
          }
          return this.handleResponse<T>(retryResponse, context, credentialGeneration)
        } catch (error) {
          this.onRefreshFailed(error)
          if (credentialGeneration === this.credentialGeneration && this.unauthorizedHandler) {
            this.unauthorizedHandler()
          }
          throw error
        } finally {
          this.isRefreshing = false
        }
      }

      return new Promise((resolve, reject) => {
        this.addRefreshSubscriber(async (token, error) => {
          if (error) {
            reject(error)
            return
          }
          if (credentialGeneration !== this.credentialGeneration) {
            reject(this.authSessionChangedError())
            return
          }
          if (!token) {
            reject(new Error('Token refresh failed'))
            return
          }
          try {
            headers.Authorization = `Bearer ${token}`
            const retryFetchOptions = this.getFetchOptions({ ...options, headers })
            this.logRequest(context)
            const retryResponse = await this.fetchWithTimeout(
              url,
              retryFetchOptions,
              credentialGeneration
            )
            if (credentialGeneration !== this.credentialGeneration) {
              reject(this.authSessionChangedError())
              return
            }
            resolve(this.handleResponse<T>(retryResponse, context, credentialGeneration))
          } catch (error) {
            reject(error)
          }
        })
      })
    }

    return this.handleResponse<T>(response, context, credentialGeneration)
  }

  private async requestWithoutRefresh<T>(
    url: string,
    options: RequestInit = {},
    skipUnauthorizedHandler = false
  ): Promise<T> {
    const credentialGeneration = this.credentialGeneration
    const method = options.method || 'GET'
    const context: RequestLogContext = { method, url }
    const headers = (await this.getAuthHeaders()) as Record<string, string>
    if (options.headers) {
      Object.assign(headers, options.headers)
    }
    if (credentialGeneration !== this.credentialGeneration) throw this.authSessionChangedError()

    this.logRequest(context)
    const response = await this.fetchWithTimeout(
      url,
      this.getFetchOptions({ ...options, headers }),
      credentialGeneration
    )
    if (credentialGeneration !== this.credentialGeneration) throw this.authSessionChangedError()
    return this.handleResponse<T>(response, context, credentialGeneration, skipUnauthorizedHandler)
  }

  private async requestText(url: string, options: RequestInit = {}): Promise<string> {
    const credentialGeneration = this.credentialGeneration
    const method = options.method || 'GET'
    const context: RequestLogContext = { method, url }
    const headers = (await this.getAuthHeaders()) as Record<string, string>
    if (options.headers) {
      Object.assign(headers, options.headers)
    }
    if (credentialGeneration !== this.credentialGeneration) throw this.authSessionChangedError()

    this.logRequest(context)
    const response = await this.fetchWithTimeout(
      url,
      this.getFetchOptions({ ...options, headers }),
      credentialGeneration
    )
    if (credentialGeneration !== this.credentialGeneration) throw this.authSessionChangedError()
    this.logResponse(context, response)

    if (!response.ok) {
      const error: ApiError = new Error(`API Error: ${response.status}`)
      error.status = response.status
      error.message = response.statusText || error.message
      this.logFailure(context, { status: error.status, message: error.message })
      throw error
    }

    const text = await response.text()
    if (credentialGeneration !== this.credentialGeneration) throw this.authSessionChangedError()
    return text
  }

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const url = getApiUrl(config.API_ENDPOINTS.AUTH.LOGIN)
    return this.requestWithoutRefresh<LoginResponse>(url, {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
  }

  async getUser(): Promise<User> {
    const url = getApiUrl(config.API_ENDPOINTS.USER.ME)

    return this.request<User>(url, {
      method: 'GET',
    })
  }

  async deleteAccount(): Promise<void> {
    const url = getApiUrl(config.API_ENDPOINTS.USER.ME)

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
    return this.request<User>(url, {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  }

  async setToken(token: string): Promise<void> {
    this.credentialGeneration += 1
    await this.serializeCredentialWrite(() =>
      AsyncStorage.setItem(config.STORAGE_KEYS.TOKEN, token)
    )
  }

  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(config.STORAGE_KEYS.TOKEN)
  }

  async removeToken(): Promise<void> {
    this.credentialGeneration += 1
    await this.serializeCredentialWrite(() => AsyncStorage.removeItem(config.STORAGE_KEYS.TOKEN))
  }

  async setRefreshToken(token: string): Promise<void> {
    this.credentialGeneration += 1
    await this.serializeCredentialWrite(() =>
      AsyncStorage.setItem(config.STORAGE_KEYS.REFRESH_TOKEN, token)
    )
  }

  async getRefreshToken(): Promise<string | null> {
    return AsyncStorage.getItem(config.STORAGE_KEYS.REFRESH_TOKEN)
  }

  async removeRefreshToken(): Promise<void> {
    this.credentialGeneration += 1
    await this.serializeCredentialWrite(() =>
      AsyncStorage.removeItem(config.STORAGE_KEYS.REFRESH_TOKEN)
    )
  }

  private onRefreshed(token: string) {
    this.refreshSubscribers.forEach((callback) => callback(token))
    this.refreshSubscribers = []
  }

  private onRefreshFailed(error: any) {
    this.refreshSubscribers.forEach((callback) => callback(null, error))
    this.refreshSubscribers = []
  }

  private addRefreshSubscriber(callback: (token: string | null, error?: any) => void) {
    this.refreshSubscribers.push(callback)
  }

  async refreshToken(credentialGeneration = this.credentialGeneration): Promise<LoginResponse> {
    if (this.credentialTransition) throw this.authSessionChangedError()
    const url = getApiUrl(config.API_ENDPOINTS.AUTH.REFRESH)

    // On web, refresh token is sent via httpOnly cookie automatically
    // On native, we need to send it in the request body
    let body: string | undefined
    if (!isWeb) {
      const refreshToken = await this.getRefreshToken()
      if (credentialGeneration !== this.credentialGeneration) {
        throw this.authSessionChangedError()
      }
      if (!refreshToken) {
        throw new Error('No refresh token available')
      }
      body = JSON.stringify({ refreshToken })
    }
    if (credentialGeneration !== this.credentialGeneration) {
      throw this.authSessionChangedError()
    }

    return this.requestWithoutRefresh<LoginResponse>(
      url,
      {
        method: 'POST',
        body,
      },
      true
    )
  }

  async searchExercises(query: string): Promise<ApiExercise[]> {
    const url = new URL(getApiUrl(config.API_ENDPOINTS.EXERCISES.SEARCH))
    url.searchParams.append('name', query)

    return this.request<ApiExercise[]>(url.toString(), {
      method: 'GET',
    })
  }

  async createWorkout(workoutData: CreateWorkoutRequest): Promise<{ id: string }> {
    const url = getApiUrl(config.API_ENDPOINTS.WORKOUTS.CREATE)

    return this.request<{ id: string }>(url, {
      method: 'POST',
      body: JSON.stringify(workoutData),
    })
  }

  async getWorkouts(): Promise<ApiWorkout[]> {
    const url = getApiUrl(config.API_ENDPOINTS.WORKOUTS.LIST)

    return this.request<ApiWorkout[]>(url, {
      method: 'GET',
    })
  }

  async recordWorkout(workoutRecord: WorkoutRecordRequest): Promise<WorkoutRecordResponse> {
    const url = getApiUrl(config.API_ENDPOINTS.WORKOUTS.RECORD)

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

    return this.request<void>(url, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async getWorkoutRecords(): Promise<WorkoutRecord[]> {
    const url = getApiUrl(config.API_ENDPOINTS.WORKOUTS.RECORD)

    return this.request<WorkoutRecord[]>(url, {
      method: 'GET',
    })
  }

  async deleteWorkoutRecord(recordId: string): Promise<void> {
    const base = config.API_ENDPOINTS.WORKOUTS.RECORD
    const url = getApiUrl(`${base}/${encodeURIComponent(recordId)}`)

    return this.request<void>(url, {
      method: 'DELETE',
    })
  }

  async deleteWorkout(workoutId: string): Promise<void> {
    const base = config.API_ENDPOINTS.WORKOUTS.DELETE
    const url = getApiUrl(`${base}/${encodeURIComponent(workoutId)}`)

    return this.request<void>(url, {
      method: 'DELETE',
    })
  }

  async signup(payload: RegisterRequest): Promise<LoginResponse> {
    const url = getApiUrl(config.API_ENDPOINTS.AUTH.SIGNUP)
    return this.requestWithoutRefresh<LoginResponse>(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async googleLogin(idToken: string): Promise<LoginResponse> {
    const url = getApiUrl(`${config.API_ENDPOINTS.AUTH.BASE}/google`)
    return this.requestWithoutRefresh<LoginResponse>(url, {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    })
  }

  async workosLogin(code: string): Promise<LoginResponse> {
    const url = new URL(getApiUrl(config.API_ENDPOINTS.AUTH.WORKOS))
    url.searchParams.append('code', code)
    return this.requestWithoutRefresh<LoginResponse>(url.toString(), {
      method: 'POST',
    })
  }

  async linkGoogleAccount(idToken: string): Promise<void> {
    const url = getApiUrl(`${config.API_ENDPOINTS.USER.ME}/link-google`)

    return this.request<void>(url, {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    })
  }

  async getExerciseLogs(exerciseId: string): Promise<ExerciseLogResponse[]> {
    const url = getApiUrl(
      `${config.API_ENDPOINTS.EXERCISES.LOGS}/${encodeURIComponent(exerciseId)}/logs`
    )

    return this.request<ExerciseLogResponse[]>(url, {
      method: 'GET',
    })
  }

  async getRoutines(): Promise<Routine[]> {
    const url = getApiUrl(config.API_ENDPOINTS.ROUTINES.LIST)

    return this.request<Routine[]>(url, {
      method: 'GET',
    })
  }

  async getRoutine(routineId: string): Promise<Routine> {
    const base = config.API_ENDPOINTS.ROUTINES.UPDATE
    const url = getApiUrl(`${base}/${encodeURIComponent(routineId)}`)

    return this.request<Routine>(url, {
      method: 'GET',
    })
  }

  async getActiveRoutine(): Promise<Routine> {
    const url = getApiUrl(config.API_ENDPOINTS.ROUTINES.ACTIVE)

    return this.request<Routine>(url, {
      method: 'GET',
    })
  }

  async createRoutine(payload: CreateRoutineRequest): Promise<Routine> {
    const url = getApiUrl(config.API_ENDPOINTS.ROUTINES.CREATE)

    return this.request<Routine>(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async updateRoutine(routineId: string, payload: UpdateRoutineRequest): Promise<Routine> {
    const base = config.API_ENDPOINTS.ROUTINES.UPDATE
    const url = getApiUrl(`${base}/${encodeURIComponent(routineId)}`)

    return this.request<Routine>(url, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async deleteRoutine(routineId: string): Promise<void> {
    const base = config.API_ENDPOINTS.ROUTINES.DELETE
    const url = getApiUrl(`${base}/${encodeURIComponent(routineId)}`)

    return this.request<void>(url, {
      method: 'DELETE',
    })
  }
  async getTermsOfService(): Promise<string> {
    const url = getApiUrl(config.API_ENDPOINTS.LEGAL.TERMS)
    return this.requestText(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/markdown',
        'X-Platform': isWeb ? 'web' : 'native',
      },
    })
  }

  async getPrivacyPolicy(): Promise<string> {
    const url = getApiUrl(config.API_ENDPOINTS.LEGAL.PRIVACY)
    return this.requestText(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/markdown',
        'X-Platform': isWeb ? 'web' : 'native',
      },
    })
  }
}

export const apiService = new ApiService()
