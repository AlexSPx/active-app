import React, { useCallback, useState, useMemo, useEffect } from 'react'
import { YStack, Text, Input, Button, Separator, View, TextArea, XStack } from 'tamagui'
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
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <Input placeholder="Workout name" value={value} onChangeText={onChange} size="$4" />
          )}
        />
        {errors.name && (
          <Text color="$red10" fontSize="$2">
            {errors.name.message}
          </Text>
        )}
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
    ),
    [control, errors.name]
  )

  const hasNulls = selectedExercises.some((ex) =>
    ex.sets.some((s) =>
      ex.category === 'CARDIO' ? s.durationSeconds == null : s.reps == null || s.weight == null
    )
  )

  const canSave = name && selectedExercises.length > 0 && !hasNulls && !isCreating

  // Get validation issues from Zod schema errors
  const validationIssues = useMemo(() => {
    const issues: string[] = []
    // Add errors from Zod schema validation
    if (errors.name?.message) issues.push(errors.name.message)
    if (errors.notes?.message) issues.push(errors.notes.message)
    if (errors.exercises?.message) issues.push(errors.exercises.message)
    if (errors.exercises?.root?.message) issues.push(errors.exercises.root.message)
    if (Array.isArray(errors.exercises)) {
      errors.exercises.forEach((exError, idx) => {
        if (exError?.message) issues.push(`Exercise ${idx + 1}: ${exError.message}`)
        if (exError?.sets?.message) issues.push(`Exercise ${idx + 1}: ${exError.sets.message}`)
      })
    }
    return issues
  }, [errors])

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
          disabled={isCreating}
          bg="$primary"
          size="$5"
          onPress={async () => {
            if (await showValidationToast()) return
            handleSubmit(onSubmit)()
          }}
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
    [isCreating, handleSubmit, onSubmit, handleCancel, showValidationToast]
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
            disabled={isCreating}
            bg="$primary"
            size="$5"
            onPress={async () => {
              if (await showValidationToast()) return
              handleSubmit(onSubmit)()
            }}
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
