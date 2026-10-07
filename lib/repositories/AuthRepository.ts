import { apiService } from '../../services/apiService'
import type { LoginRequest, LoginResponse, RegisterRequest } from '../../types/api'

export class AuthRepository {
  login(credentials: LoginRequest): Promise<LoginResponse> {
    return apiService.login(credentials)
  }

  loginWithGoogle(idToken: string): Promise<LoginResponse> {
    return apiService.googleLogin(idToken)
  }

  loginWithWorkOS(code: string): Promise<LoginResponse> {
    return apiService.workosLogin(code)
  }

  register(payload: RegisterRequest): Promise<LoginResponse> {
    return apiService.signup(payload)
  }

  setUnauthorizedHandler(handler: () => void): void {
    apiService.setUnauthorizedHandler(handler)
  }

  invalidatePendingRequests(): Promise<void> {
    return apiService.invalidatePendingRequests()
  }

  resumePendingRequests(): void {
    apiService.resumePendingRequests()
  }

  setToken(token: string): Promise<void> {
    return apiService.setToken(token)
  }

  getToken(): Promise<string | null> {
    return apiService.getToken()
  }

  removeToken(): Promise<void> {
    return apiService.removeToken()
  }

  setRefreshToken(token: string): Promise<void> {
    return apiService.setRefreshToken(token)
  }

  getRefreshToken(): Promise<string | null> {
    return apiService.getRefreshToken()
  }

  removeRefreshToken(): Promise<void> {
    return apiService.removeRefreshToken()
  }
}
