import { useEffect, useMemo, useState, useCallback } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { YStack, Text, Input, Button, Separator, View, TextArea } from 'tamagui'
import { FlashList } from '@shopify/flash-list'
import { useEditWorkoutStore } from 'stores/editWorkoutStore'
import { apiService } from 'services/apiService'
import {
  apiWorkoutToEditableExercises,
  buildUpdateWorkoutRequest,
  validateWorkoutData,
} from 'utils/workoutUtils'
import ExerciseEditor from 'components/ExerciseEditor'
import { LoadingSpinner } from 'components/ui'
// no extra types

export default function EditWorkoutScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ id?: string }>()
  const workoutId = params.id as string | undefined

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Keep original values to decide partial updates
  const [initialTitle, setInitialTitle] = useState('')
  const [initialNotes, setInitialNotes] = useState('')
  const [initialSig, setInitialSig] = useState('')

  const {
    selectedExercises,
    setExercises,
    updateExerciseSets,
    addSetToExercise,
    removeSetFromExercise,
    clearExercises,
  } = useEditWorkoutStore()

  // Load current workout details from the list endpoint and find by id
  useEffect(() => {
    let active = true
    const load = async () => {
      if (!workoutId) {
        setError('Missing workout id')
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        setError(null)
        const workouts = await apiService.getWorkouts()
        const found = workouts.find((w) => w.id === workoutId)
        if (!found) throw new Error('Workout not found')

        if (!active) return
        setTitle(found.title)
        setNotes(found.notes || '')
        setInitialTitle(found.title)
        setInitialNotes(found.notes || '')
        const editable = apiWorkoutToEditableExercises(found)
        setExercises(editable)
        setInitialSig(signature(editable))
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load workout')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [workoutId, setExercises])

  const handleSave = async () => {
    if (!workoutId) return
    // Only validate template when exercises are being updated
    const changedTemplate = signature(selectedExercises) !== initialSig
    const vErr = changedTemplate ? validateWorkoutData(title || 'x', selectedExercises) : null
    if (changedTemplate && vErr) {
      setError(vErr)
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const payload = buildUpdateWorkoutRequest({
        title: title !== initialTitle ? title : undefined,
        // For notes: allow clearing to empty when changed
        notes: notes !== initialNotes ? notes : undefined,
        exercises: changedTemplate ? selectedExercises : undefined,
      })
      if (Object.keys(payload).length === 0) {
        router.replace('/(tabs)/workouts')
        return
      }
      await apiService.updateWorkout(workoutId, payload)

      // Clear editor state and go back to workouts list
      clearExercises()
      router.replace('/(tabs)/workouts')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update workout')
    } finally {
      setIsSaving(false)
    }
  }

  const renderExerciseEditor = useCallback(
    ({ item }: { item: any }) => (
      <ExerciseEditor
        exercise={item}
        onUpdateSets={updateExerciseSets}
        onAddSet={addSetToExercise}
        onRemoveSet={removeSetFromExercise}
      />
    ),
    [updateExerciseSets, addSetToExercise, removeSetFromExercise]
  )

  const Header = useMemo(
    () => (
      <YStack gap="$4">
        <Text fontSize="$7" fontWeight="800" color="$color">
          ✏️ Edit Workout
        </Text>

        <YStack gap="$3">
          <Input placeholder="Title" value={title} onChangeText={setTitle} size="$4" />
          <TextArea
            placeholder="Notes"
            value={notes}
            onChangeText={setNotes}
            size="$4"
            height={80}
          />
        </YStack>

        {error && (
          <YStack bg="$red3" borderColor="$red7" borderWidth="$0.5" rounded="$4" p="$3">
            <Text fontSize="$3" color="$red11">
              {error}
            </Text>
          </YStack>
        )}

        <Button bg="$primary" size="$4" onPress={() => router.push('/exercises/search?ctx=edit')}>
          <Text fontSize="$4" fontWeight="600" color="$onPrimary">
            + Edit Exercises ({selectedExercises.length})
          </Text>
        </Button>

        {selectedExercises.length > 0 && (
          <Text fontWeight="700" fontSize="$6" color="$color">
            Exercises:
          </Text>
        )}
      </YStack>
    ),
    [title, notes, error, selectedExercises.length, router]
  )

  if (loading) {
    return (
      <YStack flex={1} justify="center" items="center" bg="$background">
        <LoadingSpinner />
        <Text mt="$4" color="$color11">
          Loading workout...
        </Text>
      </YStack>
    )
  }

  return (
    <View flex={1} bg="$background" p="$4">
      {selectedExercises.length > 0 ? (
        <FlashList
          data={selectedExercises}
          renderItem={renderExerciseEditor}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View height="$4" />}
          ListHeaderComponent={Header}
          ListHeaderComponentStyle={{ marginBottom: 16 }}
          ListFooterComponent={() => (
            <YStack gap="$4" pt="$4">
              <Separator />
              <Button bg="$primary" size="$5" onPress={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <LoadingSpinner size="small" color="$onPrimary" />
                ) : (
                  <Text fontSize="$5" fontWeight="700" color="$onPrimary">
                    Save Changes
                  </Text>
                )}
              </Button>
            </YStack>
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <YStack gap="$4">
          {Header}
          <Separator />
          <Button bg="$primary" size="$5" onPress={handleSave} disabled={isSaving}>
            {isSaving ? (
              <LoadingSpinner size="small" color="$onPrimary" />
            ) : (
              <Text fontSize="$5" fontWeight="700" color="$onPrimary">
                Save Changes
              </Text>
            )}
          </Button>
        </YStack>
      )}
    </View>
  )
}

// Build a simple signature of exercises to detect changes
function signature(exercises: any[]): string {
  try {
    return JSON.stringify(
      exercises.map((e) => ({ id: e.id, sets: e.sets?.map((s: any) => [s.reps, s.weight]) }))
    )
  } catch {
    return ''
  }
}
