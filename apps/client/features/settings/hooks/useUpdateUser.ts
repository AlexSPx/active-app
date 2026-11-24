import { useState, useCallback } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import type { UpdateUserRequest, User, ApiError } from '../../../types/api'
import { useQueryClient } from '@tanstack/react-query'
import { useProfileQueryKeys } from '../../../lib/hooks/useProfileQueryKeys'
import { saveSettingsProfile, useSettingsStore } from '../stores/settingsStore'
import { getProfileScope, isCurrentProfile } from '../../../lib/profileScope'

// Simple email regex (client-side validation aid; server performs authoritative validation)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface UseUpdateUserResult {
  updateUserProfile: (
    updates: UpdateUserRequest,
    localPreferences?: {
      bodyWeightUnit?: 'kg' | 'lb'
      heightUnit?: 'cm' | 'in'
      recordWeight?: boolean
    }
  ) => Promise<User | null>
  isUpdating: boolean
  error: string | null
  validate: (updates: UpdateUserRequest) => string | null
}

export function useUpdateUser(): UseUpdateUserResult {
  const { updateUser } = useAuth()
  const queryClient = useQueryClient()
  const ownerKeys = useProfileQueryKeys()
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
    if (updates.timezone !== undefined && updates.timezone.trim() !== '') {
      try {
        new Intl.DateTimeFormat('en', { timeZone: updates.timezone })
      } catch {
        return 'Invalid timezone.'
      }
    }
    return null
  }, [])

  const updateUserProfile = useCallback(
    async (
      updates: UpdateUserRequest,
      localPreferences?: {
        bodyWeightUnit?: 'kg' | 'lb'
        heightUnit?: 'cm' | 'in'
        recordWeight?: boolean
      }
    ): Promise<User | null> => {
      setError(null)
      const validationError = validate(updates)
      if (validationError) {
        setError(validationError)
        return null
      }
      setIsUpdating(true)
      try {
        const scope = getProfileScope()
        const previousWeight =
          updates.measurements?.weightKg != null ? useSettingsStore.getState().bodyWeight : null
        const user = await updateUser(updates)
        const newWeight = updates.measurements?.weightKg
        const appendWeight =
          typeof newWeight === 'number' &&
          newWeight > 0 &&
          (newWeight !== previousWeight || localPreferences?.recordWeight)
        if (user && (localPreferences || appendWeight)) {
          if (!isCurrentProfile(scope)) throw new Error('Profile changed while saving settings.')
          const currentHistory = useSettingsStore.getState().weightHistory
          const existingHistory =
            previousWeight == null
              ? currentHistory.filter((entry) => !entry.initial)
              : currentHistory
          const history =
            existingHistory.length || previousWeight == null
              ? existingHistory
              : [
                  {
                    id: 'initial',
                    weightKg: previousWeight,
                    recordedAt: new Date().toISOString(),
                    initial: true,
                  },
                ]
          const { recordWeight: _recordWeight, ...preferences } = localPreferences ?? {}
          await saveSettingsProfile(scope, {
            ...preferences,
            ...(appendWeight
              ? {
                  weightHistory: [
                    ...history,
                    {
                      id: `${Date.now()}-${Math.random()}`,
                      weightKg: newWeight,
                      recordedAt: new Date().toISOString(),
                    },
                  ],
                }
              : {}),
          })
        }
        setIsUpdating(false)
        // Invalidate user query
        queryClient.invalidateQueries({ queryKey: ownerKeys.user.me })
        // Also invalidate records if timezone changed (affects date display)
        if (typeof updates.timezone === 'string' && updates.timezone.trim() !== '') {
          queryClient.invalidateQueries({ queryKey: ownerKeys.records.all })
        }
        return user
      } catch (e) {
        const message = e instanceof Error ? e.message : (e as ApiError).message
        setError(message || 'Failed to update profile')
        setIsUpdating(false)
        return null
      }
    },
    [ownerKeys, queryClient, updateUser, validate]
  )

  return { updateUserProfile, isUpdating, error, validate }
}

export default useUpdateUser
