import React, { useCallback, useState } from 'react'
import { YStack, Text, Input, Button, Separator, View, TextArea } from 'tamagui'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useWorkoutStore } from 'stores/createWorkoutStore'
import { apiService } from 'services/apiService'
import { convertToCreateWorkoutRequest, validateWorkoutData } from 'utils/workoutUtils'
import ExerciseEditor from 'components/ExerciseEditor'
import { LoadingSpinner } from 'components/ui'
import { createWorkoutSchema, type CreateWorkoutFormData } from '../../lib/schemas/forms'
import { queryClient } from '../../lib/queryClient'
import { queryKeys } from '../../lib/queryKeys'

export default function NewWorkoutScreen() {
  const router = useRouter()

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateWorkoutFormData>({
    resolver: zodResolver(createWorkoutSchema),
    defaultValues: {
      name: '',
      notes: '',
    },
    mode: 'onChange',
  })

  const name = watch('name')

  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    selectedExercises,
    clearExercises,
    updateExerciseSets,
    addSetToExercise,
    removeSetFromExercise,
  } = useWorkoutStore()

  const handleCancel = () => {
    clearExercises()
    reset()
    router.back()
  }

  const onSubmit = async (data: CreateWorkoutFormData) => {
    const validationError = validateWorkoutData(data.name, selectedExercises)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const createWorkoutRequest = convertToCreateWorkoutRequest(data.name, selectedExercises, data.notes)
      const result = await apiService.createWorkout(createWorkoutRequest)
      console.log('Workout created successfully:', result.id)

      queryClient.invalidateQueries({ queryKey: queryKeys.workouts.all })

      clearExercises()
      reset()
      router.replace('/(tabs)/(workouts)')
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

  // Shared form fields component
  const FormFields = useCallback(() => (
    <YStack gap="$3">
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, value } }) => (
          <Input placeholder="Workout name" value={value} onChangeText={onChange} size="$4" />
        )}
      />
      {errors.name && <Text color="$red10" fontSize="$2">{errors.name.message}</Text>}
      <Controller
        control={control}
        name="notes"
        render={({ field: { onChange, value } }) => (
          <TextArea
            placeholder="Notes (optional)"
            value={value || ''}
            onChangeText={onChange}
            size="$4"
            height={80}
          />
        )}
      />
    </YStack>
  ), [control, errors.name])

  const hasNulls = selectedExercises.some((ex) =>
    ex.sets.some((s) =>
      ex.category === 'CARDIO' ? s.durationSeconds == null : s.reps == null || s.weight == null
    )
  )

  const canSave = name && selectedExercises.length > 0 && !hasNulls && !isCreating

  const ListHeaderComponent = useCallback(
    () => (
      <YStack gap="$4">
        <Text fontSize="$7" fontWeight="800" color="$color">
          📝 Create Workout
        </Text>

        <FormFields />

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
    [FormFields, error, selectedExercises.length, router]
  )

  const ListFooterComponent = useCallback(
    () => (
      <YStack gap="$4" pt="$4">
        <Separator />
        <Button
          disabled={!canSave}
          bg="$primary"
          size="$5"
          onPress={handleSubmit(onSubmit)}
        >
          {isCreating ? (
            <LoadingSpinner size="small" color="$onPrimary" />
          ) : (
            <Text fontSize="$5" fontWeight="700" color="$onPrimary">
              Save Workout
            </Text>
          )}
        </Button>
        <Button variant="outlined" size="$4" onPress={handleCancel}>
          <Text>Cancel</Text>
        </Button>
      </YStack>
    ),
    [canSave, isCreating, handleSubmit, onSubmit, handleCancel]
  )

  return (
    <View flex={1} bg="$background" p="$4">
      {selectedExercises.length > 0 ? (
        <FlashList
          data={selectedExercises}
          renderItem={renderExerciseEditor}
          keyExtractor={(item) => item.id}
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

          <FormFields />

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
            disabled={!canSave}
            bg="$primary"
            size="$5"
            onPress={handleSubmit(onSubmit)}
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
