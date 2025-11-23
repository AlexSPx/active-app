import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

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

}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      restTimerEnabled: true,
      restTimerDefaultSeconds: 90,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      theme: 'system',
      bodyWeight: null,
      height: null,
      bodyWeightUnit: 'kg',
      heightUnit: 'cm',


      setRestTimerEnabled: (enabled) => set({ restTimerEnabled: enabled }),
      setRestTimerDefaultSeconds: (seconds) =>
        set({ restTimerDefaultSeconds: Math.max(0, Math.floor(seconds || 0)) }),
      setTimeZone: (tz) => set({ timeZone: tz || 'UTC' }),
      setTheme: (theme) => set({ theme }),
      setBodyWeight: (weight) =>
        set({ bodyWeight: weight == null || isNaN(weight as any) ? null : Math.max(0, weight) }),
      setHeight: (height) =>
        set({ height: height == null || isNaN(height as any) ? null : Math.max(0, height) }),
      setBodyWeightUnit: (unit) => set({ bodyWeightUnit: unit }),
      setHeightUnit: (unit) => set({ heightUnit: unit }),

    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        restTimerEnabled: state.restTimerEnabled,
        restTimerDefaultSeconds: state.restTimerDefaultSeconds,
        timeZone: state.timeZone,
        theme: state.theme,
        bodyWeight: state.bodyWeight,
        height: state.height,
        bodyWeightUnit: state.bodyWeightUnit,
        heightUnit: state.heightUnit,

      }),
    }
  )
)
