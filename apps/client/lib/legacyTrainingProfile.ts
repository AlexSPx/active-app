import AsyncStorage from '@react-native-async-storage/async-storage'
import { z } from 'zod'

const legacyTrainingProfileSchema = z.object({
  firstName: z.string().default(''),
  lastName: z.string().default(''),
  onboardingCompleted: z.boolean().default(false),
  notificationFrequency: z.number().finite().default(1),
})

const persistedProfileSchema = z.object({ state: z.unknown() })

export type LegacyTrainingProfile = z.infer<typeof legacyTrainingProfileSchema>

export async function readLegacyTrainingProfile(
  ownerId: string
): Promise<LegacyTrainingProfile | null> {
  const key = `training-profile-storage:${encodeURIComponent(ownerId)}`
  const raw = await AsyncStorage.getItem(key)
  if (raw == null) return null

  const envelope: unknown = JSON.parse(raw)
  const { state } = persistedProfileSchema.parse(envelope)
  return legacyTrainingProfileSchema.parse(state)
}
