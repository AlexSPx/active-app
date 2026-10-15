import { create } from 'zustand'
import type { LocalWorkoutRecordingResult } from '../types/api'

interface UiState {
  finishedCongrats: {
    visible: boolean
    payload?: LocalWorkoutRecordingResult
  }
  showFinishedCongrats: (result: LocalWorkoutRecordingResult) => void
  hideFinishedCongrats: () => void
  reset: () => void
}

export const useUiStore = create<UiState>((set) => ({
  finishedCongrats: { visible: false, payload: undefined },
  showFinishedCongrats: (payload) => set({ finishedCongrats: { visible: true, payload } }),
  hideFinishedCongrats: () => set({ finishedCongrats: { visible: false, payload: undefined } }),
  reset: () => set({ finishedCongrats: { visible: false, payload: undefined } }),
}))
