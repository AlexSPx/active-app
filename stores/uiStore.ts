import { create } from 'zustand'
import type { WorkoutRecord } from '../types/api'

interface UiState {
  finishedCongrats: {
    visible: boolean
    payload?: WorkoutRecord
  }
  showFinishedCongrats: (payload: WorkoutRecord) => void
  hideFinishedCongrats: () => void
}

export const useUiStore = create<UiState>((set) => ({
  finishedCongrats: { visible: false, payload: undefined },
  showFinishedCongrats: (payload) => set({ finishedCongrats: { visible: true, payload } }),
  hideFinishedCongrats: () => set({ finishedCongrats: { visible: false, payload: undefined } }),
}))
