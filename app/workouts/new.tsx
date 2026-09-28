import React, { useCallback, useState, useEffect } from 'react'
import { YStack, Text, Input, Button, Separator, View, TextArea, ScrollView } from 'tamagui'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToastController } from '@tamagui/toast'
import { useWorkoutStore, useWorkoutMutations } from '../../features/workouts'
import { convertToCreateWorkoutRequest, validateWorkoutData } from '../../utils/workoutUtils'
import { ExerciseEditor } from '../../features/exercises'
import { createWorkoutSchema, type CreateWorkoutFormData } from '../../lib/schemas/forms'
import { LoadingSpinner } from '../../components/ui'

export default function NewWorkoutScreen() {
  const router = useRouter()
  const toast = useToastController()

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<CreateWorkoutFormData>({
    resolver: zodResolver(createWorkoutSchema),
    defaultValues: {
      name: '',
      notes: '',
      exercises: [],
    },
    mode: 'onChange',
  })

  const name = watch('name') ?? ''

  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    selectedExercises,
    clearExercises,
    updateExerciseSets,
    addSetToExercise,
    removeSetFromExercise,
  } = useWorkoutStore()

  const { createWorkout } = useWorkoutMutations()

  const handleCancel = () => {
    clearExercises()
    reset()
    router.back()
  }

  // Sync store exercises to form for Zod validation (silent sync, validation on submit)
  useEffect(() => {
    setValue('exercises', selectedExercises as any, { shouldValidate: false })
  }, [selectedExercises, setValue])

  const onSubmit = async (data: CreateWorkoutFormData) => {
    const validationError = validateWorkoutData(data.name, selectedExercises)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const createWorkoutRequest = convertToCreateWorkoutRequest(
        data.name,
        selectedExercises,
        data.notes
      )
      const result = await createWorkout(createWorkoutRequest, selectedExercises)

      if (result) {
        console.log('Workout created successfully:', result.id)
        clearExercises()
        reset()
        router.replace('/(tabs)/(workouts)')
      } else {
        setError('Failed to create workout: Unknown error occurred.')
      }
    } catch (err: any) {
      setError(`Failed to create workout: ${err?.message || err}`)
    }

    setIsCreating(false)
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
  const FormFields = useCallback(
    () => (
      <YStack gap="$3">
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="600" color="$color">
            Workout name <Text color="$red10">(required)</Text>
          </Text>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, value } }) => (
              <Input
                accessibilityLabel="Workout name, required"
                placeholder="Enter a name"
                value={value}
                onChangeText={onChange}
                size="$4"
              />
            )}
          />
          {errors.name && (
            <Text color="$red10" fontSize="$2">
              {errors.name.message}
            </Text>
          )}
        </YStack>
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="600" color="$color">
            Notes <Text color="$colorSubtle">(optional)</Text>
          </Text>
          <Controller
            control={control}
            name="notes"
            render={({ field: { onChange, value } }) => (
              <TextArea
                accessibilityLabel="Notes, optional"
                placeholder="Add notes"
                value={value || ''}
                onChangeText={onChange}
                size="$4"
                height={80}
              />
            )}
          />
          {errors.notes && (
            <Text color="$red10" fontSize="$2">
              {errors.notes.message}
            </Text>
          )}
        </YStack>
      </YStack>
    ),
    [control, errors.name, errors.notes]
  )

  const validationError =
    errors.name?.message ?? errors.notes?.message ?? validateWorkoutData(name, selectedExercises)
  const saveHint =
    !name.trim() && selectedExercises.length === 0
      ? 'Enter a name and add at least one exercise to enable saving.'
      : validationError
  const canSave = !validationError && !isCreating

  // Show validation toast and return true if there are issues
  const showValidationToast = useCallback(async () => {
    // Trigger validation for all fields
    const isFormValid = await trigger()
    if (!isFormValid) {
      // Re-compute issues from current errors after validation
      const currentIssues: string[] = []
      const currentErrors = control._formState.errors as typeof errors
      if (currentErrors.name?.message) currentIssues.push(currentErrors.name.message)
      if (currentErrors.notes?.message) currentIssues.push(currentErrors.notes.message)
      if (currentErrors.exercises?.message) currentIssues.push(currentErrors.exercises.message)
      if ((currentErrors.exercises as any)?.root?.message)
        currentIssues.push((currentErrors.exercises as any).root.message)

      // Check individual exercise errors (array items)
      const exercisesErrors = currentErrors.exercises as any
      if (Array.isArray(exercisesErrors)) {
        exercisesErrors.forEach((exError: any, idx: number) => {
          if (exError?.message) currentIssues.push(exError.message)
          if (exError?.root?.message) currentIssues.push(exError.root.message)
          if (exError?.sets?.message) currentIssues.push(exError.sets.message)
        })
      }

      if (currentIssues.length > 0) {
        toast.show('Please fix the following:', {
          message: currentIssues.join('\n'),
          duration: 4000,
        })
        return true
      }
    }
    return false
  }, [trigger, toast, control])

  const ListHeaderComponent = useCallback(
    () => (
      <YStack gap="$4">
        <FormFields />

        {error && (
          <YStack bg="$red3" borderColor="$red7" borderWidth="$0.5" rounded="$4" p="$3">
            <Text fontSize="$3" color="$red11">
              {error}
            </Text>
          </YStack>
        )}

        <Button
          bg={selectedExercises.length ? '$surface' : '$primary'}
          borderColor={selectedExercises.length ? '$primary' : undefined}
          variant={selectedExercises.length ? 'outlined' : undefined}
          size="$4"
          onPress={() => router.push('/exercises/search')}
        >
          <Text
            fontSize="$4"
            fontWeight="600"
            color={selectedExercises.length ? '$primary' : '$onPrimary'}
          >
            + Add Exercises ({selectedExercises.length})
          </Text>
        </Button>

        {selectedExercises.length > 0 && (
          <Text fontWeight="700" fontSize="$5" color="$color">
            Selected Exercises:
          </Text>
        )}
      </YStack>
    ),
    [FormFields, error, selectedExercises.length, router]
  )

  const ListFooterComponent = useCallback(
    () => (
      <YStack gap="$3" pt="$4">
        <Separator />
        {saveHint && (
          <Text fontSize="$3" color="$colorSubtle">
            {saveHint}
          </Text>
        )}
        <Button
          disabled={!canSave}
          bg={canSave ? '$primary' : '$backgroundStrong'}
          size="$5"
          onPress={async () => {
            if (!canSave) return
            if (await showValidationToast()) return
            handleSubmit(onSubmit)()
          }}
        >
          {isCreating ? (
            <LoadingSpinner size="small" color={canSave ? '$onPrimary' : '$colorSubtle'} />
          ) : (
            <Text fontSize="$5" fontWeight="700" color={canSave ? '$onPrimary' : '$colorSubtle'}>
              Save Workout
            </Text>
          )}
        </Button>
        <Button variant="outlined" size="$4" onPress={handleCancel} disabled={isCreating}>
          <Text>Cancel</Text>
        </Button>
      </YStack>
    ),
    [saveHint, canSave, isCreating, handleSubmit, onSubmit, handleCancel, showValidationToast]
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
        <ScrollView
          flex={1}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <YStack gap="$4">
            <ListHeaderComponent />
            <ListFooterComponent />
          </YStack>
        </ScrollView>
      )}
    </View>
  )
}
