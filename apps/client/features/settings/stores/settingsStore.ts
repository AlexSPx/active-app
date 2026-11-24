import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { isCurrentProfile, type ProfileScope } from '../../../lib/profileScope'

export interface WeightEntry {
  id: string
  weightKg: number
  recordedAt: string
  initial?: boolean
}

interface SettingsState {
  // Rest timer settings
  restTimerEnabled: boolean
  restTimerDefaultSeconds: number

  // Time zone
  timeZone: string

  // Theme
  theme: 'light' | 'dark' | 'system'

  // Body measurements
  bodyWeight: number | null // stored in kg
  weightHistory: WeightEntry[]
  weightReminderEnabled: boolean
  weightReminderHour: number
  height: number | null // stored in cm
  bodyWeightUnit: 'kg' | 'lb'
  heightUnit: 'cm' | 'in'

  // Actions
  setRestTimerEnabled: (enabled: boolean) => void
  setRestTimerDefaultSeconds: (seconds: number) => void
  setTimeZone: (tz: string) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setBodyWeight: (weight: number | null) => void
  setHeight: (height: number | null) => void
  setBodyWeightUnit: (unit: 'kg' | 'lb') => void
  setHeightUnit: (unit: 'cm' | 'in') => void
  reset: () => void
}

export type SettingsProfileChanges = Partial<
  Pick<
    SettingsState,
    | 'timeZone'
    | 'bodyWeight'
    | 'height'
    | 'bodyWeightUnit'
    | 'heightUnit'
    | 'weightHistory'
    | 'weightReminderEnabled'
    | 'weightReminderHour'
  >
>

const pausedStorage = createJSONStorage(() => ({
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
}))

let persistenceOperations: Promise<unknown> = Promise.resolve()
let persistencePaused = false

function enqueuePersistence<T>(operation: () => Promise<T>): Promise<T> {
  const next = persistenceOperations.then(operation, operation)
  persistenceOperations = next.catch(() => {})
  return next
}

export async function flushSettingsPersistence(): Promise<void> {
  await persistenceOperations
}

export async function pauseSettingsProfilePersistence(): Promise<void> {
  persistencePaused = true
  await persistenceOperations
}

export function resumeSettingsProfilePersistence(): void {
  persistencePaused = false
}

export const settingsProfileStorage = createJSONStorage(() => ({
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, serializedValue) => {
    if (persistencePaused) return Promise.resolve()
    return enqueuePersistence(async () => {
      if (persistencePaused) return
      const options = useSettingsStore.persist.getOptions()
      if (options.name !== name) {
        await AsyncStorage.setItem(name, serializedValue)
        return
      }

      const currentState = useSettingsStore.getState()
      const state = options.partialize ? options.partialize(currentState) : currentState
      await AsyncStorage.setItem(name, JSON.stringify({ state, version: options.version }))
    })
  },
  removeItem: (name) => {
    if (persistencePaused) return Promise.resolve()
    return enqueuePersistence(() =>
      persistencePaused ? Promise.resolve() : AsyncStorage.removeItem(name)
    )
  },
}))

const defaultSettings = () => ({
  restTimerEnabled: true,
  restTimerDefaultSeconds: 90,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  theme: 'system' as const,
  bodyWeight: null,
  weightHistory: [] as WeightEntry[],
  weightReminderEnabled: false,
  weightReminderHour: 8,
  height: null,
  bodyWeightUnit: 'kg' as const,
  heightUnit: 'cm' as const,
})

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings(),

      setRestTimerEnabled: (enabled) => set({ restTimerEnabled: enabled }),
      setRestTimerDefaultSeconds: (seconds) =>
        set({ restTimerDefaultSeconds: Math.max(0, Math.floor(seconds || 0)) }),
      setTimeZone: (tz) => set({ timeZone: tz || 'UTC' }),
      setTheme: (theme) => set({ theme }),
      setBodyWeight: (weight) =>
        set((state) => ({
          bodyWeight: weight == null || isNaN(weight as any) ? null : Math.max(0, weight),
          weightHistory:
            state.weightHistory.length || weight == null || !Number.isFinite(weight) || weight <= 0
              ? state.weightHistory
              : [
                  {
                    id: 'initial',
                    weightKg: state.bodyWeight ?? weight,
                    recordedAt: new Date().toISOString(),
                    initial: true,
                  },
                ],
        })),
      setHeight: (height) =>
        set({ height: height == null || isNaN(height as any) ? null : Math.max(0, height) }),
      setBodyWeightUnit: (unit) => set({ bodyWeightUnit: unit }),
      setHeightUnit: (unit) => set({ heightUnit: unit }),
      reset: () =>
        set({
          restTimerEnabled: true,
          restTimerDefaultSeconds: 90,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          theme: 'system',
          bodyWeight: null,
          weightHistory: [],
          weightReminderEnabled: false,
          weightReminderHour: 8,
          height: null,
          bodyWeightUnit: 'kg',
          heightUnit: 'cm',
        }),
    }),
    {
      name: 'settings-storage',
      storage: settingsProfileStorage,
      skipHydration: true,
      merge: (persistedState, currentState) => {
        const saved = persistedState as Partial<SettingsState> | undefined
        return {
          ...currentState,
          ...defaultSettings(),
          ...saved,
          weightHistory:
            saved?.weightHistory ??
            (saved?.bodyWeight != null
              ? [
                  {
                    id: 'initial',
                    weightKg: saved.bodyWeight,
                    recordedAt: new Date().toISOString(),
                    initial: true,
                  },
                ]
              : []),
        }
      },
      partialize: (state) => ({
        restTimerEnabled: state.restTimerEnabled,
        restTimerDefaultSeconds: state.restTimerDefaultSeconds,
        timeZone: state.timeZone,
        theme: state.theme,
        bodyWeight: state.bodyWeight,
        weightHistory: state.weightHistory,
        weightReminderEnabled: state.weightReminderEnabled,
        weightReminderHour: state.weightReminderHour,
        height: state.height,
        bodyWeightUnit: state.bodyWeightUnit,
        heightUnit: state.heightUnit,
      }),
    }
  )
)

export async function saveSettingsProfile(
  scope: ProfileScope,
  changes: SettingsProfileChanges
): Promise<void> {
  if (persistencePaused) throw new Error('Settings are being cleared from this device.')
  return enqueuePersistence(async () => {
    if (persistencePaused) throw new Error('Settings are being cleared from this device.')
    const expectedName = `settings-storage:${encodeURIComponent(scope.ownerId)}`
    const options = useSettingsStore.persist.getOptions()
    if (options.name !== expectedName || !options.storage) {
      throw new Error('Settings are not ready for the current profile.')
    }
    if (!isCurrentProfile(scope)) throw new Error('Profile changed while saving settings.')

    const currentState = useSettingsStore.getState()
    const initialHistory =
      !currentState.weightHistory.length &&
      changes.weightHistory === undefined &&
      typeof changes.bodyWeight === 'number' &&
      changes.bodyWeight > 0
        ? [
            {
              id: 'initial',
              weightKg: currentState.bodyWeight ?? changes.bodyWeight,
              recordedAt: new Date().toISOString(),
              initial: true,
            },
          ]
        : currentState.weightHistory
    const effectiveChanges = { ...changes, weightHistory: changes.weightHistory ?? initialHistory }
    const nextState = { ...currentState, ...effectiveChanges }
    const state = options.partialize ? options.partialize(nextState) : nextState

    await AsyncStorage.setItem(expectedName, JSON.stringify({ state, version: options.version }))
    if (!isCurrentProfile(scope)) throw new Error('Profile changed while saving settings.')

    const currentOptions = useSettingsStore.persist.getOptions()
    if (currentOptions.name !== expectedName || currentOptions.storage !== options.storage) {
      throw new Error('Profile changed while saving settings.')
    }

    useSettingsStore.persist.setOptions({ storage: pausedStorage })
    try {
      useSettingsStore.setState(effectiveChanges)
    } finally {
      useSettingsStore.persist.setOptions({ storage: options.storage })
    }
  })
}
