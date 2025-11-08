import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface SettingsState {
  // Rest timer settings
  restTimerEnabled: boolean
  restTimerDefaultSeconds: number

  // Time zone
  timeZone: string

  // Actions
  setRestTimerEnabled: (enabled: boolean) => void
  setRestTimerDefaultSeconds: (seconds: number) => void
  setTimeZone: (tz: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      restTimerEnabled: true,
      restTimerDefaultSeconds: 90,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',

      setRestTimerEnabled: (enabled) => set({ restTimerEnabled: enabled }),
      setRestTimerDefaultSeconds: (seconds) =>
        set({ restTimerDefaultSeconds: Math.max(0, Math.floor(seconds || 0)) }),
      setTimeZone: (tz) => set({ timeZone: tz || 'UTC' }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        restTimerEnabled: state.restTimerEnabled,
        restTimerDefaultSeconds: state.restTimerDefaultSeconds,
        timeZone: state.timeZone,
      }),
    }
  )
)
