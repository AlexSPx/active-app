import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useWorkoutStore, useWorkout, useWorkoutMutations } from '../../features/workouts'
import {
  apiWorkoutToEditableExercises,
  convertToCreateWorkoutRequest,
} from '../../utils/workoutUtils'
import { WorkoutDraftEditor } from '../../features/workouts/components/WorkoutDraftEditor'
import { LoadingSpinner, ErrorDisplay, UiText, Button } from '../../components/ui'
import { useWorkoutIdRemap } from '../../features/workouts/hooks/useWorkoutIdRemap'
import { syncEngine } from '../../lib/sync'

export default function NewWorkoutScreen() {
  const router = useRouter()
  const { returnTo, duplicateId } = useLocalSearchParams<{
    returnTo?: string
    duplicateId?: string
  }>()
  useWorkoutIdRemap(duplicateId, 'duplicateId')
  const store = useWorkoutStore()
  const {
    workout: sourceWorkout,
    loading: sourceLoading,
    error: sourceError,
  } = useWorkout(duplicateId)
  const { createWorkout } = useWorkoutMutations()
  const initializedSourceId = useRef<string | null>(null)
  const [initial, setInitial] = useState({ name: '', notes: '', signature: '[]' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasHydratedSource = Boolean(
    duplicateId &&
    initializedSourceId.current &&
    syncEngine.resolveId('workouts', initializedSourceId.current) ===
      syncEngine.resolveId('workouts', duplicateId)
  )

  useEffect(() => {
    if (!duplicateId) store.clearExercises()
  }, [duplicateId, store.clearExercises])

  useEffect(() => {
    if (!sourceWorkout || sourceLoading || sourceError) return
    if (initializedSourceId.current === sourceWorkout.id) return
    if (
      initializedSourceId.current &&
      syncEngine.resolveId('workouts', initializedSourceId.current) === sourceWorkout.id
    ) {
      initializedSourceId.current = sourceWorkout.id
      return
    }

    const exercises = apiWorkoutToEditableExercises(sourceWorkout)
    const sourceName = sourceWorkout.title.trim() || 'Workout'
    setInitial({
      name: `${sourceName.slice(0, 95).trimEnd()} copy`,
      notes: sourceWorkout.notes || '',
      signature: JSON.stringify(exercises),
    })
    store.setExercises(exercises)
    initializedSourceId.current = sourceWorkout.id
  }, [sourceWorkout, sourceLoading, sourceError, store.setExercises])

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

  if (duplicateId && !hasHydratedSource && (sourceLoading || (sourceWorkout && !sourceError))) {
    return (
      <View className="flex-1 items-center justify-center gap-field bg-background">
        <LoadingSpinner />
        <UiText textRole="bodyMuted">Loading workout to copy…</UiText>
      </View>
    )
  }
  if (duplicateId && !hasHydratedSource && (sourceError || !sourceWorkout)) {
    return (
      <View className="flex-1 items-center justify-center gap-field bg-background p-page">
        <ErrorDisplay message={sourceError || 'Workout not found'} />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </View>
    )
  }

  return (
    <WorkoutDraftEditor
      {...store}
      backLabel={returnTo === 'routine' ? 'Routines' : 'Workouts'}
      backFallback={returnTo === 'routine' ? '/(tabs)/(workouts)/routines' : '/(tabs)/(workouts)'}
      initialName={initial.name}
      initialNotes={initial.notes}
      initialSignature={initial.signature}
      exercises={store.selectedExercises}
      saving={saving}
      error={
        error ??
        (hasHydratedSource && sourceError
          ? `Unable to refresh the source workout: ${sourceError}. Your copy is still available to edit and save.`
          : null)
      }
      onSave={save}
    />
  )
}
