import AsyncStorage from '@react-native-async-storage/async-storage'
import { useUserStore } from '../stores/userStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useRunningWorkoutStore } from '../stores/runningWorkoutStore'
import { useWorkoutStore } from '../stores/createWorkoutStore'
import { useEditWorkoutStore } from '../stores/editWorkoutStore'
import { useWidgetStore } from '../stores/widgetStore'
import { useUiStore } from '../stores/uiStore'
import { queryClient } from '../lib/queryClient'

/**
 * Resets all application stores and clears AsyncStorage.
 * This should be called when a user signs out or when a 401 error occurs.
 */
export async function resetAllStores(): Promise<void> {
  try {
    // Clear AsyncStorage completely
    await AsyncStorage.clear()

    // Clear TanStack Query cache
    queryClient.clear()

    // Reset all Zustand stores to their initial state
    useUserStore.getState().reset()
    useSettingsStore.getState().reset()
    useRunningWorkoutStore.getState().reset()
    useWorkoutStore.getState().reset()
    useEditWorkoutStore.getState().reset()
    useWidgetStore.getState().reset()
    useUiStore.getState().reset()

    console.log('All stores and caches have been reset')
  } catch (error) {
    console.error('Error resetting stores:', error)
    throw error
  }
}
