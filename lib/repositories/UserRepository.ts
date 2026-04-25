import { apiService } from '../../services/apiService'
import type { UpdateUserRequest, User } from '../../types/api'

export class UserRepository {
  async getCurrentUser(): Promise<User> {
    return apiService.getUser()
  }

  async updateCurrentUser(payload: UpdateUserRequest): Promise<User> {
    return apiService.updateCurrentUser(payload)
  }

  async deleteCurrentUser(): Promise<void> {
    return apiService.deleteAccount()
  }
}
