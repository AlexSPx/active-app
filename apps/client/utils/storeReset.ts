import { useUserStore } from '../features/settings'
import { useWorkoutStore, useEditWorkoutStore } from '../features/workouts'
import { useUiStore } from '../stores/uiStore'
import { queryClient } from '../lib/queryClient'

/**
 * Clears transient view state when changing profile. Owner-scoped settings,
 * widgets, running sessions, SQLite rows, and queued work remain on disk.
 */
export async function resetAllStores(): Promise<void> {
  try {
    await queryClient.cancelQueries()
    queryClient.clear()

    // These stores contain only in-memory editors or derived profile data.
    useUserStore.getState().reset()
    useWorkoutStore.getState().reset()
    useEditWorkoutStore.getState().reset()
    useUiStore.getState().reset()

    console.log('Transient profile state and query cache reset')
  } catch (error) {
    console.error('Error resetting stores:', error)
    throw error
  }
}
