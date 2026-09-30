import { useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useWorkoutStore, useWorkoutMutations } from '../../features/workouts'
import { convertToCreateWorkoutRequest } from '../../utils/workoutUtils'
import { WorkoutDraftEditor } from '../../features/workouts/components/WorkoutDraftEditor'

export default function NewWorkoutScreen() {
  const router = useRouter()
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>()
  const store = useWorkoutStore()
  const { createWorkout } = useWorkoutMutations()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async (name: string, notes: string) => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await createWorkout(
        convertToCreateWorkoutRequest(name, store.selectedExercises, notes),
        store.selectedExercises
      )
      if (!result) throw new Error('Please try again.')
      store.clearExercises()
      if (returnTo === 'routine') router.back()
      else router.replace('/(tabs)/(workouts)')
    } catch (err) {
      setError(`Failed to create workout: ${err instanceof Error ? err.message : String(err)}`)
      setSaving(false)
    }
  }
  return (
    <WorkoutDraftEditor
      {...store}
      exercises={store.selectedExercises}
      saving={saving}
      error={error}
      onSave={save}
    />
  )
}
