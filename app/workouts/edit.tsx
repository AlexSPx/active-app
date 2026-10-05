import { useEffect, useRef, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Text, YStack } from 'tamagui'
import { useEditWorkoutStore, useWorkout, useWorkoutMutations } from '../../features/workouts'
import { apiWorkoutToEditableExercises, buildUpdateWorkoutRequest } from '../../utils/workoutUtils'
import { WorkoutDraftEditor } from '../../features/workouts/components/WorkoutDraftEditor'
import { LoadingSpinner } from '../../components/ui'
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
    if (!id || saving) return
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
    if (
      Object.keys(payload).length &&
      !(await updateWorkout(id, payload, store.selectedExercises))
    ) {
      setError('Failed to update workout. Please try again.')
      setSaving(false)
      return
    }
    store.clearExercises()
    router.replace('/(tabs)/(workouts)')
  }
  if (loading || (workout && initializedId.current === null))
    return (
      <YStack flex={1} items="center" justify="center" bg="$background">
        <LoadingSpinner />
      </YStack>
    )
  if (!id || workoutError || !workout)
    return (
      <YStack flex={1} bg="$background" p="$page">
        <Text color="$destructive">{workoutError || 'Workout not found'}</Text>
      </YStack>
    )
  return (
    <WorkoutDraftEditor
      {...store}
      editing
      initialName={initial.name}
      initialNotes={initial.notes}
      initialSignature={initial.signature}
      exercises={store.selectedExercises}
      saving={saving}
      error={error}
      onSave={save}
    />
  )
}
