import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Button, UiText } from '../../components/ui/Controls'
import { ErrorDisplay, LoadingSpinner } from '../../components/ui'
import { useEditWorkoutStore, useWorkout, useWorkoutMutations } from '../../features/workouts'
import { apiWorkoutToEditableExercises, buildUpdateWorkoutRequest } from '../../utils/workoutUtils'
import { WorkoutDraftEditor } from '../../features/workouts/components/WorkoutDraftEditor'
import { useWorkoutIdRemap } from '../../features/workouts/hooks/useWorkoutIdRemap'
import { syncEngine } from '../../lib/sync'

export default function EditWorkoutScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id?: string }>()
  useWorkoutIdRemap(id)
  const store = useEditWorkoutStore()
  const { workout, loading, error: workoutError } = useWorkout(id)
  const { updateWorkout } = useWorkoutMutations()
  const initializedId = useRef<string | null>(null)
  const [initial, setInitial] = useState({ name: '', notes: '', signature: '[]' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasHydratedWorkout = Boolean(
    id &&
    initializedId.current &&
    syncEngine.resolveId('workouts', initializedId.current) === syncEngine.resolveId('workouts', id)
  )

  useEffect(() => {
    if (!workout || loading || workoutError) return
    if (initializedId.current === workout.id) return
    if (
      initializedId.current &&
      syncEngine.resolveId('workouts', initializedId.current) === workout.id
    ) {
      initializedId.current = workout.id
      return
    }

    const exercises = apiWorkoutToEditableExercises(workout)
    store.setExercises(exercises)
    setInitial({
      name: workout.title,
      notes: workout.notes || '',
      signature: JSON.stringify(exercises),
    })
    initializedId.current = workout.id
  }, [workout, loading, workoutError, store.setExercises])

  const save = async (name: string, notes: string) => {
    if (saving) return
    const initializedWorkoutId = initializedId.current
    if (!initializedWorkoutId) {
      setError('Workout details are still loading. Please wait before saving.')
      return
    }
    setSaving(true)
    setError(null)
    const payload = buildUpdateWorkoutRequest({
      title: name !== initial.name ? name : undefined,
      notes: notes !== initial.notes ? notes : undefined,
      exercises:
        JSON.stringify(store.selectedExercises) !== initial.signature
          ? store.selectedExercises
          : undefined,
    })
    const workoutId = syncEngine.resolveId('workouts', initializedWorkoutId)
    if (
      Object.keys(payload).length &&
      !(await updateWorkout(workoutId, payload, store.selectedExercises))
    ) {
      setError('Failed to update workout. Please try again.')
      setSaving(false)
      return
    }
    store.clearExercises()
    router.replace('/(tabs)/(workouts)')
  }

  if (!hasHydratedWorkout && (loading || (workout && !workoutError))) {
    return (
      <View className="flex-1 items-center justify-center gap-field bg-background">
        <LoadingSpinner />
        <UiText textRole="bodyMuted">Loading workout…</UiText>
      </View>
    )
  }
  if (!id || (!hasHydratedWorkout && (workoutError || !workout))) {
    return (
      <View className="flex-1 items-center justify-center gap-field bg-background p-page">
        <ErrorDisplay message={workoutError || 'Workout not found'} />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </View>
    )
  }

  return (
    <WorkoutDraftEditor
      {...store}
      editing
      initialName={initial.name}
      initialNotes={initial.notes}
      initialSignature={initial.signature}
      exercises={store.selectedExercises}
      saving={saving}
      error={
        error ??
        (hasHydratedWorkout && workoutError
          ? `Unable to refresh the workout: ${workoutError}. Your draft is still available to save.`
          : hasHydratedWorkout && !loading && !workout
            ? 'Workout details are unavailable. Your existing draft is still available to save.'
            : null)
      }
      onSave={save}
    />
  )
}
