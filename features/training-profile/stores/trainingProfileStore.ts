import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { z } from 'zod'
import { getProfileScope, isCurrentProfile } from '../../../lib/profileScope'

const STORAGE_KEY = 'training-profile-storage'

export interface TrainingProfileData {
  firstName: string
  lastName: string
  onboardingCompleted: boolean
  notificationFrequency: number
}

export type TrainingProfileUpdate = Partial<TrainingProfileData>

interface TrainingProfileState extends TrainingProfileData {
  updateProfile: (updates: TrainingProfileUpdate) => Promise<void>
  completeOnboarding: () => Promise<void>
  seedProfileIfMissing: (seed: TrainingProfileUpdate) => Promise<boolean>
}

const trainingProfileDataSchema = z.object({
  firstName: z.string().default(''),
  lastName: z.string().default(''),
  onboardingCompleted: z.boolean().default(false),
  notificationFrequency: z.number().finite().default(1),
})

const defaults = (): TrainingProfileData => ({
  firstName: '',
  lastName: '',
  onboardingCompleted: false,
  notificationFrequency: 1,
})

function keyForOwner(ownerId: string) {
  return `${STORAGE_KEY}:${encodeURIComponent(ownerId)}`
}

function parseProfile(raw: string | null): TrainingProfileData {
  if (raw == null) return defaults()
  const parsed: unknown = JSON.parse(raw)
  const envelope = z.object({ state: z.unknown() }).parse(parsed)
  return trainingProfileDataSchema.parse(envelope.state)
}

function serializeProfile(state: TrainingProfileData) {
  return JSON.stringify({ state, version: 0 })
}

let hydratedOwnerId: string | null = null
let hasStoredProfile = false
let operations: Promise<unknown> = Promise.resolve()

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.then(operation, operation)
  operations = next.catch(() => {})
  return next
}

function currentData(state: TrainingProfileState): TrainingProfileData {
  return {
    firstName: state.firstName,
    lastName: state.lastName,
    onboardingCompleted: state.onboardingCompleted,
    notificationFrequency: state.notificationFrequency,
  }
}

function commitProfileData(
  set: (partial: Partial<TrainingProfileState>) => void,
  data: TrainingProfileData
) {
  set({
    ...data,
  })
}

export const useTrainingProfileStore = create<TrainingProfileState>((set, get) => ({
  ...defaults(),

  updateProfile: (updates) => {
    const scope = getProfileScope()
    return enqueue(async () => {
      if (!isCurrentProfile(scope) || hydratedOwnerId !== scope.ownerId) {
        throw new Error('Training profile is not ready for the current owner')
      }

      const next = trainingProfileDataSchema.parse({ ...currentData(get()), ...updates })
      await AsyncStorage.setItem(keyForOwner(scope.ownerId), serializeProfile(next))
      if (!isCurrentProfile(scope) || hydratedOwnerId !== scope.ownerId) {
        throw new Error('Profile changed while saving training profile')
      }
      hasStoredProfile = true
      commitProfileData(set, next)
    })
  },

  completeOnboarding: () => {
    const scope = getProfileScope()
    return enqueue(async () => {
      if (!isCurrentProfile(scope) || hydratedOwnerId !== scope.ownerId) {
        throw new Error('Training profile is not ready for the current owner')
      }

      const next = trainingProfileDataSchema.parse({
        ...currentData(get()),
        onboardingCompleted: true,
      })
      await AsyncStorage.setItem(keyForOwner(scope.ownerId), serializeProfile(next))
      if (!isCurrentProfile(scope) || hydratedOwnerId !== scope.ownerId) {
        throw new Error('Profile changed while completing onboarding')
      }
      hasStoredProfile = true
      commitProfileData(set, next)
    })
  },

  seedProfileIfMissing: (seed) => {
    const scope = getProfileScope()
    return enqueue(async () => {
      if (!isCurrentProfile(scope) || hydratedOwnerId !== scope.ownerId) {
        throw new Error('Training profile is not ready for the current owner')
      }
      if (hasStoredProfile) return false

      const next = trainingProfileDataSchema.parse({ ...currentData(get()), ...seed })
      await AsyncStorage.setItem(keyForOwner(scope.ownerId), serializeProfile(next))
      if (!isCurrentProfile(scope) || hydratedOwnerId !== scope.ownerId) {
        throw new Error('Profile changed while seeding training profile')
      }
      hasStoredProfile = true
      commitProfileData(set, next)
      return true
    })
  },
}))

export function hydrateTrainingProfileStore(ownerId: string): Promise<void> {
  const scope = getProfileScope()
  if (scope.ownerId !== ownerId) {
    return Promise.reject(new Error('Cannot restore training profile for an inactive owner'))
  }

  return enqueue(async () => {
    const raw = await AsyncStorage.getItem(keyForOwner(ownerId))
    const restored = parseProfile(raw)
    if (!isCurrentProfile(scope)) {
      throw new Error('Profile changed while restoring training profile')
    }

    hydratedOwnerId = ownerId
    hasStoredProfile = raw != null
    commitProfileData(useTrainingProfileStore.setState, restored)
  })
}
