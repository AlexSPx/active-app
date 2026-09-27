import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { YStack, Text, Input, Button, Separator, View, TextArea } from 'tamagui'
import { FlashList } from '@shopify/flash-list'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToastController } from '@tamagui/toast'
import { useEditWorkoutStore, useWorkout, useWorkoutMutations } from '../../features/workouts'
import { apiWorkoutToEditableExercises, buildUpdateWorkoutRequest } from '../../utils/workoutUtils'
import { ExerciseEditor } from '../../features/exercises'
import { LoadingSpinner } from '../../components/ui'
import { createWorkoutSchema, type CreateWorkoutFormData } from '../../lib/schemas/forms'
import { useWorkoutIdRemap } from '../../features/workouts/hooks/useWorkoutIdRemap'
import { syncEngine } from '../../lib/sync'

export default function EditWorkoutScreen() {
  const router = useRouter()
  const toast = useToastController()
  const params = useLocalSearchParams<{ id?: string }>()
  const workoutId = params.id as string | undefined
  useWorkoutIdRemap(workoutId)

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

  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initializedWorkoutIdRef = useRef<string | null>(null)

  // Keep original values to decide partial updates
  const [initialName, setInitialName] = useState('')
  const [initialNotes, setInitialNotes] = useState('')
  const [initialSig, setInitialSig] = useState('')

  const { workout, loading, error: workoutError } = useWorkout(workoutId)
  const { updateWorkout: updateWorkoutMutation } = useWorkoutMutations()

  const {
    selectedExercises,
    setExercises,
    updateExerciseSets,
    addSetToExercise,
    removeSetFromExercise,
    clearExercises,
  } = useEditWorkoutStore()

  // Sync store exercises to form for Zod validation (silent sync)
  useEffect(() => {
    setValue('exercises', selectedExercises as any, { shouldValidate: false })
  }, [selectedExercises, setValue])

  useEffect(() => {
    if (!workoutId) {
      initializedWorkoutIdRef.current = null
      setError('Missing workout id')
      return
    }

    if (loading) {
      return
    }

    if (workoutError) {
      initializedWorkoutIdRef.current = null
      setError(workoutError)
      return
    }

    if (!workout) {
      initializedWorkoutIdRef.current = null
      setError('Workout not found')
      return
    }

    if (initializedWorkoutIdRef.current === workout.id) {
      if (error) {
        setError(null)
      }
      return
    }

    if (
      initializedWorkoutIdRef.current &&
      syncEngine.resolveId('workouts', initializedWorkoutIdRef.current) === workout.id
    ) {
      initializedWorkoutIdRef.current = workout.id
      setError(null)
      return
    }

    reset({
      name: workout.title,
      notes: workout.notes || '',
      exercises: [],
    })
    setInitialName(workout.title)
    setInitialNotes(workout.notes || '')
    const editable = apiWorkoutToEditableExercises(workout)
    setExercises(editable)
    setInitialSig(signature(editable))
    initializedWorkoutIdRef.current = workout.id
    setError(null)
  }, [workoutId, workout, loading, workoutError, reset, setExercises, error])

  // Show validation toast and return true if there are issues
  const showValidationToast = useCallback(async () => {
    const isFormValid = await trigger()
    if (!isFormValid) {
      const currentIssues: string[] = []
      const currentErrors = control._formState.errors as typeof errors
      if (currentErrors.name?.message) currentIssues.push(currentErrors.name.message)
      if (currentErrors.notes?.message) currentIssues.push(currentErrors.notes.message)
      if (currentErrors.exercises?.message) currentIssues.push(currentErrors.exercises.message)
      if ((currentErrors.exercises as any)?.root?.message)
        currentIssues.push((currentErrors.exercises as any).root.message)

      // Check individual exercise errors
      const exercisesErrors = currentErrors.exercises as any
      if (Array.isArray(exercisesErrors)) {
        exercisesErrors.forEach((exError: any) => {
          if (exError?.message) currentIssues.push(exError.message)
          if (exError?.root?.message) currentIssues.push(exError.root.message)
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

  const onSubmit = async (data: CreateWorkoutFormData) => {
    if (!workoutId) return

    const changedTemplate = signature(selectedExercises) !== initialSig
    const notes = data.notes || ''

    setIsSaving(true)
    setError(null)
    try {
      const payload = buildUpdateWorkoutRequest({
        title: data.name !== initialName ? data.name : undefined,
        notes: notes !== initialNotes ? notes : undefined,
        exercises: changedTemplate ? selectedExercises : undefined,
      })
      if (Object.keys(payload).length === 0) {
        router.replace('/(tabs)/(workouts)')
        return
      }
      const success = await updateWorkoutMutation(workoutId, payload, selectedExercises)
      if (success) {
        clearExercises()
        router.replace('/(tabs)/(workouts)')
      } else {
        setError('Failed to update workout')
      }
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

  // Shared form fields component
  const FormFields = useCallback(
    () => (
      <YStack gap="$3">
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <Input placeholder="Title" value={value} onChangeText={onChange} size="$4" />
          )}
        />
        <Controller
          control={control}
          name="notes"
          render={({ field: { onChange, value } }) => (
            <TextArea
              placeholder="Notes"
              value={value || ''}
              onChangeText={onChange}
              size="$4"
              height={80}
            />
          )}
        />
      </YStack>
    ),
    [control]
  )

  const Header = useMemo(
    () => (
      <YStack gap="$4">
        <Text fontSize="$7" fontWeight="800" color="$color">
          ✏️ Edit Workout
        </Text>

        <FormFields />

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
    [FormFields, error, selectedExercises.length, router]
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
            <Button
              bg="$primary"
              size="$5"
              disabled={isSaving}
              onPress={async () => {
                if (await showValidationToast()) return
                handleSubmit(onSubmit)()
              }}
            >
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
