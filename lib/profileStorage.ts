import AsyncStorage from '@react-native-async-storage/async-storage'
import { createJSONStorage } from 'zustand/middleware'
import { useSettingsStore } from '../features/settings/stores/settingsStore'
import { useRunningWorkoutStore } from '../features/workout-session/stores/runningWorkoutStore'
import { useWidgetStore } from '../stores/widgetStore'

const LEGACY_OWNER_KEY = 'profile-storage-owner-v1'
const legacyKeys = ['settings-storage', 'running-workout-storage', 'widget-storage'] as const
let transition = Promise.resolve()
let loadedOwner: string | null = null
const pausedStorage = createJSONStorage(() => ({
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
}))
const profileStorage = createJSONStorage(() => AsyncStorage)

function storageKey(key: string, ownerId: string): string {
  return `${key}:${encodeURIComponent(ownerId)}`
}

async function migrateLegacyStorage(ownerId: string, legacyOwnerId: string | null): Promise<void> {
  let legacyOwner = await AsyncStorage.getItem(LEGACY_OWNER_KEY)

  if (legacyOwner == null) {
    const legacyValues = await AsyncStorage.multiGet([...legacyKeys])
    if (!legacyValues.some(([, value]) => value != null)) return

    legacyOwner = legacyOwnerId ?? 'unknown'
    await AsyncStorage.setItem(LEGACY_OWNER_KEY, legacyOwner)
  }

  if (legacyOwner !== ownerId) return

  const values = await AsyncStorage.multiGet([...legacyKeys])
  await Promise.all(
    values.map(async ([key, legacyValue]) => {
      if (legacyValue == null) return
      const profileKey = storageKey(key, ownerId)
      if ((await AsyncStorage.getItem(profileKey)) == null) {
        await AsyncStorage.setItem(profileKey, legacyValue)
      }
    })
  )
}

async function hydrate(ownerId: string, legacyOwnerId: string | null): Promise<void> {
  await migrateLegacyStorage(ownerId, legacyOwnerId)

  if (loadedOwner != null) {
    // Clear the prior profile's in-memory values without persisting them into the next profile.
    useSettingsStore.persist.setOptions({ storage: pausedStorage })
    useRunningWorkoutStore.persist.setOptions({ storage: pausedStorage })
    useWidgetStore.persist.setOptions({ storage: pausedStorage })
    useSettingsStore.getState().reset()
    useRunningWorkoutStore.getState().reset()
    useWidgetStore.getState().reset()
  }

  useSettingsStore.persist.setOptions({
    name: storageKey('settings-storage', ownerId),
    storage: profileStorage,
  })
  useRunningWorkoutStore.persist.setOptions({
    name: storageKey('running-workout-storage', ownerId),
    storage: profileStorage,
  })
  useWidgetStore.persist.setOptions({
    name: storageKey('widget-storage', ownerId),
    storage: profileStorage,
  })

  await Promise.all([
    useSettingsStore.persist.rehydrate(),
    useRunningWorkoutStore.persist.rehydrate(),
    useWidgetStore.persist.rehydrate(),
  ])
  if (
    !useSettingsStore.persist.hasHydrated() ||
    !useRunningWorkoutStore.persist.hasHydrated() ||
    !useWidgetStore.persist.hasHydrated()
  ) {
    throw new Error(`Could not restore stored data for ${ownerId}`)
  }
  loadedOwner = ownerId
}

export function hydrateProfileStores(ownerId: string, legacyOwnerId: string | null): Promise<void> {
  const next = transition.then(async () => {
    if (loadedOwner === ownerId) return
    await hydrate(ownerId, legacyOwnerId)
  })
  transition = next.catch(() => {})
  return next
}
