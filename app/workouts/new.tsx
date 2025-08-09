import { useState, useCallback } from 'react'
import { YStack, Text, Input, Button, Separator, View, TextArea } from 'tamagui'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useWorkoutStore } from 'stores/createWorkoutStore'
import { apiService } from 'services/apiService'
import { convertToCreateWorkoutRequest, validateWorkoutData } from 'utils/workoutUtils'
import ExerciseEditor from 'components/ExerciseEditor'
import { LoadingSpinner } from 'components/ui'

export default function NewWorkoutScreen() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    selectedExercises,
    clearExercises,
    updateExerciseSets,
    addSetToExercise,
    removeSetFromExercise,
  } = useWorkoutStore()

  const handleSave = async () => {
    // Validate the workout data
    const validationError = validateWorkoutData(name, selectedExercises)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      // Convert to server format and create workout
      const createWorkoutRequest = convertToCreateWorkoutRequest(name, selectedExercises, notes)
      const result = await apiService.createWorkout(createWorkoutRequest)

      console.log('Workout created successfully:', result.id)

      // Clear the form and navigate back
      clearExercises()
      setName('')
      setNotes('')
      router.replace('/(tabs)/workouts')
    } catch (err) {
      console.error('Failed to create workout:', err)
      setError(err instanceof Error ? err.message : 'Failed to create workout')
    } finally {
      setIsCreating(false)
    }
  }

  const renderExerciseEditor = useCallback(
    ({ item: exercise }: { item: any }) => (
      <ExerciseEditor
        exercise={exercise}
        onUpdateSets={updateExerciseSets}
        onAddSet={addSetToExercise}
        onRemoveSet={removeSetFromExercise}
      />
    ),
    [updateExerciseSets, addSetToExercise, removeSetFromExercise]
  )

  const ListHeaderComponent = useCallback(
    () => (
      <YStack gap="$4">
        <Text fontSize="$7" fontWeight="800" color="$color">
          📝 Create Workout
        </Text>

        <YStack gap="$3">
          <Input placeholder="Workout name" value={name} onChangeText={setName} size="$4" />
          <TextArea
            placeholder="Notes (optional)"
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

        <Button bg="$primary" size="$4" onPress={() => router.push('/exercises/search')}>
          <Text fontSize="$4" fontWeight="600" color="$onPrimary">
            + Add Exercises ({selectedExercises.length})
          </Text>
        </Button>

        {selectedExercises.length > 0 && (
          <Text fontWeight="700" fontSize="$6" color="$color">
            Selected Exercises:
          </Text>
        )}
      </YStack>
    ),
    [name, notes, error, selectedExercises.length, router]
  )

  const ListFooterComponent = useCallback(
    () => (
      <YStack gap="$4" pt="$4">
        <Separator />
        <Button
          disabled={!name || selectedExercises.length === 0 || isCreating}
          bg="$primary"
          size="$5"
          onPress={handleSave}
        >
          {isCreating ? (
            <LoadingSpinner size="small" color="$onPrimary" />
          ) : (
            <Text fontSize="$5" fontWeight="700" color="$onPrimary">
              Save Workout
            </Text>
          )}
        </Button>
      </YStack>
    ),
    [name, selectedExercises.length, isCreating, handleSave]
  )

  return (
    <View flex={1} bg="$background" p="$4">
      {selectedExercises.length > 0 ? (
        <FlashList
          data={selectedExercises}
          renderItem={renderExerciseEditor}
          keyExtractor={(item) => item.id}
          estimatedItemSize={180}
          ItemSeparatorComponent={() => <View height="$4" />}
          ListHeaderComponent={ListHeaderComponent}
          ListHeaderComponentStyle={{ marginBottom: 16 }}
          ListFooterComponent={ListFooterComponent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <YStack p="$4" gap="$4">
          <Text fontSize="$7" fontWeight="800" color="$color">
            📝 Create Workout
          </Text>

          <YStack gap="$3">
            <Input placeholder="Workout name" value={name} onChangeText={setName} size="$4" />
            <TextArea
              placeholder="Notes (optional)"
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

          <Button bg="$primary" size="$4" onPress={() => router.push('/exercises/search')}>
            <Text fontSize="$4" fontWeight="600" color="$onPrimary">
              + Add Exercises ({selectedExercises.length})
            </Text>
          </Button>

          <Separator />

          <Button
            disabled={!name || selectedExercises.length === 0 || isCreating}
            bg="$primary"
            size="$5"
            onPress={handleSave}
          >
            {isCreating ? (
              <LoadingSpinner size="small" color="$onPrimary" />
            ) : (
              <Text fontSize="$5" fontWeight="700" color="$onPrimary">
                Save Workout
              </Text>
            )}
          </Button>
        </YStack>
      )}
    </View>
  )
}
