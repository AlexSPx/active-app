import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface SettingsState {
  // Rest timer settings
  restTimerEnabled: boolean
  restTimerDefaultSeconds: number

  // Actions
  setRestTimerEnabled: (enabled: boolean) => void
  setRestTimerDefaultSeconds: (seconds: number) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      restTimerEnabled: true,
      restTimerDefaultSeconds: 90,

      setRestTimerEnabled: (enabled) => set({ restTimerEnabled: enabled }),
      setRestTimerDefaultSeconds: (seconds) =>
        set({ restTimerDefaultSeconds: Math.max(0, Math.floor(seconds || 0)) }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        restTimerEnabled: state.restTimerEnabled,
        restTimerDefaultSeconds: state.restTimerDefaultSeconds,
      }),
    }
  )
)
