import { useState, useCallback } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import type { UpdateUserRequest, User, ApiError } from '../../../types/api'
import { timeZonesNames } from '@vvo/tzdb'
import { queryClient } from '../../../lib/queryClient'
import { queryKeys } from '../../../lib/queryKeys'

// Simple email regex (client-side validation aid; server performs authoritative validation)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface UseUpdateUserResult {
  updateUserProfile: (updates: UpdateUserRequest) => Promise<User | null>
  isUpdating: boolean
  error: string | null
  validate: (updates: UpdateUserRequest) => string | null
}

export function useUpdateUser(): UseUpdateUserResult {
  const { updateUser } = useAuth()
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validate = useCallback((updates: UpdateUserRequest): string | null => {
    if (updates.username !== undefined) {
      const len = updates.username.trim().length
      if (len < 1 || len > 50) return 'Username must be 1-50 characters.'
    }
    if (updates.email !== undefined) {
      if (!EMAIL_REGEX.test(updates.email)) return 'Invalid email format.'
    }
    if (updates.timezone !== undefined) {
      if (updates.timezone.trim() !== '' && !timeZonesNames.includes(updates.timezone)) {
        return 'Invalid timezone.'
      }
    }
    return null
  }, [])

  const updateUserProfile = useCallback(
    async (updates: UpdateUserRequest): Promise<User | null> => {
      setError(null)
      const validationError = validate(updates)
      if (validationError) {
        setError(validationError)
        return null
      }
      setIsUpdating(true)
      try {
        const user = await updateUser(updates)
        setIsUpdating(false)
        // Invalidate user query
        queryClient.invalidateQueries({ queryKey: queryKeys.user.me })
        // Also invalidate records if timezone changed (affects date display)
        if (typeof updates.timezone === 'string' && updates.timezone.trim() !== '') {
          queryClient.invalidateQueries({ queryKey: queryKeys.records.all })
        }
        return user
      } catch (e) {
        const apiError = e as ApiError
        setError(apiError.message || 'Failed to update profile')
        setIsUpdating(false)
        return null
      }
    },
    [updateUser, validate]
  )

  return { updateUserProfile, isUpdating, error, validate }
}

export default useUpdateUser
