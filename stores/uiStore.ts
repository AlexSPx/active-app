import { create } from 'zustand'
import type { WorkoutRecord, StreakUpdateResponse } from '../types/api'

interface UiState {
  finishedCongrats: {
    visible: boolean
    payload?: {
      record: WorkoutRecord
      streak: StreakUpdateResponse
    }
  }
  showFinishedCongrats: (record: WorkoutRecord, streak: StreakUpdateResponse) => void
  hideFinishedCongrats: () => void
  reset: () => void
}

export const useUiStore = create<UiState>((set) => ({
  finishedCongrats: { visible: false, payload: undefined },
  showFinishedCongrats: (record, streak) =>
    set({ finishedCongrats: { visible: true, payload: { record, streak } } }),
  hideFinishedCongrats: () => set({ finishedCongrats: { visible: false, payload: undefined } }),
  reset: () => set({ finishedCongrats: { visible: false, payload: undefined } }),
}))
