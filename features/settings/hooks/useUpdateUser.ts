import { useState, useCallback } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import type { UpdateUserRequest, User, ApiError } from '../../../types/api'
import { timeZonesNames } from '@vvo/tzdb'
import { useQueryClient } from '@tanstack/react-query'
import { useProfileQueryKeys } from '../../../lib/hooks/useProfileQueryKeys'
import { Platform } from 'react-native'
import { saveSettingsProfile, type SettingsProfileChanges } from '../stores/settingsStore'
import { useTrainingProfileStore } from '../../training-profile/stores/trainingProfileStore'
import { getProfileScope, isCurrentProfile } from '../../../lib/profileScope'

// Simple email regex (client-side validation aid; server performs authoritative validation)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface UseUpdateUserResult {
  updateUserProfile: (
    updates: UpdateUserRequest,
    localPreferences?: { bodyWeightUnit?: 'kg' | 'lb'; heightUnit?: 'cm' | 'in' }
  ) => Promise<User | null | true>
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
    if (updates.timezone !== undefined) {
      if (updates.timezone.trim() !== '' && !timeZonesNames.includes(updates.timezone)) {
        return 'Invalid timezone.'
      }
    }
    return null
  }, [])

  const updateUserProfile = useCallback(
    async (
      updates: UpdateUserRequest,
      localPreferences?: { bodyWeightUnit?: 'kg' | 'lb'; heightUnit?: 'cm' | 'in' }
    ): Promise<User | null | true> => {
      setError(null)
      const validationError = validate(updates)
      if (validationError) {
        setError(validationError)
        return null
      }
      setIsUpdating(true)
      try {
        if (Platform.OS !== 'web') {
          if (
            updates.username !== undefined ||
            updates.email !== undefined ||
            updates.registrationCompleted !== undefined ||
            updates.baseVersion !== undefined
          ) {
            throw new Error('Account details can only be changed for a signed-in account.')
          }

          const scope = getProfileScope()
          const profileUpdates: {
            firstName?: string
            lastName?: string
            notificationFrequency?: number
          } = {}
          if (updates.firstName !== undefined) profileUpdates.firstName = updates.firstName
          if (updates.lastName !== undefined) profileUpdates.lastName = updates.lastName
          if (updates.notificationFrequency !== undefined) {
            profileUpdates.notificationFrequency = updates.notificationFrequency
          }
          if (Object.keys(profileUpdates).length > 0) {
            await useTrainingProfileStore.getState().updateProfile(profileUpdates)
          }
          if (!isCurrentProfile(scope)) throw new Error('Profile changed while saving settings.')

          const settingsChanges: SettingsProfileChanges = {}
          if (updates.timezone !== undefined) settingsChanges.timeZone = updates.timezone || 'UTC'
          if (updates.measurements !== undefined) {
            const { weightKg, heightCm } = updates.measurements
            settingsChanges.bodyWeight =
              weightKg == null || Number.isNaN(weightKg) ? null : Math.max(0, weightKg)
            settingsChanges.height =
              heightCm == null || Number.isNaN(heightCm) ? null : Math.max(0, heightCm)
          }
          if (localPreferences?.bodyWeightUnit !== undefined) {
            settingsChanges.bodyWeightUnit = localPreferences.bodyWeightUnit
          }
          if (localPreferences?.heightUnit !== undefined) {
            settingsChanges.heightUnit = localPreferences.heightUnit
          }
          if (Object.keys(settingsChanges).length > 0) {
            await saveSettingsProfile(scope, settingsChanges)
          }

          setIsUpdating(false)
          return true
        }

        const scope = getProfileScope()
        const user = await updateUser(updates)
        if (user && localPreferences) {
          if (!isCurrentProfile(scope)) throw new Error('Profile changed while saving settings.')
          await saveSettingsProfile(scope, localPreferences)
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
