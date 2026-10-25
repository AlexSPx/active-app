import { useEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { usePreventRemove, useHeaderHeight } from 'expo-router/react-navigation'
import { Stack, useRouter, type Href } from 'expo-router'
import { Button, TextField, UiText } from '../../../components/ui/Controls'
import { ExerciseEditor } from '../../exercises'
import { validateWorkoutData } from '../../../utils/workoutUtils'
import type { WorkoutExercise, WorkoutSet } from '../../../types/workout'
import { BackHeaderButton } from '../../../navigation/BackHeaderButton'
import { moveWorkoutExercise } from '../workoutDraftUtils'

interface Props {
  editing?: boolean
  backLabel?: string
  backFallback?: Href
  initialName?: string
  initialNotes?: string
  initialSignature?: string
  exercises: WorkoutExercise[]
  setExercises: (exercises: WorkoutExercise[]) => void
  updateExerciseSets: (id: string, sets: WorkoutSet[]) => void
  addSetToExercise: (id: string) => void
  removeSetFromExercise: (id: string, index: number) => void
  clearExercises: () => void
  saving: boolean
  error: string | null
  onSave: (name: string, notes: string) => Promise<void>
}

export function WorkoutDraftEditor({
  editing,
  backLabel = 'Workouts',
  backFallback = '/(tabs)/(workouts)',
  initialName = '',
  initialNotes = '',
  initialSignature = '[]',
  exercises,
  setExercises,
  updateExerciseSets,
  addSetToExercise,
  removeSetFromExercise,
  clearExercises,
  saving,
  error,
  onSave,
}: Props) {
  const router = useRouter()
  const headerHeight = useHeaderHeight()
  const [name, setName] = useState(initialName)
  const [notes, setNotes] = useState(initialNotes)
  const [discarded, setDiscarded] = useState(false)

  useEffect(() => {
    setName(initialName)
    setNotes(initialNotes)
  }, [initialName, initialNotes])

  const dirty =
    name !== initialName || notes !== initialNotes || JSON.stringify(exercises) !== initialSignature
  usePreventRemove(dirty && !saving && !discarded, ({ repeat }) => {
    Alert.alert('Discard workout?', 'Your changes will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard workout',
        style: 'destructive',
        onPress: () => {
          clearExercises()
          setDiscarded(true)
          repeat()
        },
      },
    ])
  })

  const validation = validateWorkoutData(name, exercises, notes)
  const canSave = !validation && !saving
  const addExercises = () =>
    router.push({
      pathname: '/exercises/search',
      params: { ctx: editing ? 'edit' : 'create', workoutName: name.trim() },
    })

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: '',
          headerBackTitle: backLabel,
          headerBackVisible: false,
          headerLeft: () => <BackHeaderButton label={backLabel} fallback={backFallback} />,
          headerRight: () => (
            <Button
              variant="ghost"
              density="compact"
              onPress={() => router.back()}
              disabled={saving}
            >
              <UiText textRole="captionEmphasis">Cancel</UiText>
            </Button>
          ),
        }}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-3xl self-center gap-section p-page">
            <View className="gap-compact">
              <UiText textRole="screenTitle" accessibilityRole="header">
                {editing ? 'Edit workout.' : 'Create workout.'}
              </UiText>
              <UiText textRole="bodyMuted">Choose your exercises, then set your targets.</UiText>
            </View>

            <View className="gap-field">
              <View className="gap-compact">
                <UiText textRole="bodyEmphasis">Workout name</UiText>
                <TextField
                  accessibilityLabel="Workout name, required"
                  placeholder="e.g. Lower body foundations"
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                  returnKeyType="next"
                />
              </View>
              <View className="gap-compact">
                <View className="flex-row items-center justify-between">
                  <UiText textRole="bodyEmphasis">Notes</UiText>
                  <UiText textRole="caption">Optional</UiText>
                </View>
                <TextField
                  className="h-32 min-h-32 py-field"
                  accessibilityLabel="Notes, optional"
                  placeholder="Anything to remember for this session"
                  value={notes}
                  onChangeText={setNotes}
                  maxLength={1000}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </View>

            <View className="gap-field">
              <View className="gap-compact">
                <View className="flex-row items-center justify-between gap-field">
                  <UiText textRole="cardTitle" accessibilityRole="header">
                    Exercises
                  </UiText>
                  <Button
                    variant="ghost"
                    density="compact"
                    accessibilityLabel="Add exercises"
                    onPress={addExercises}
                  >
                    <UiText textRole="captionEmphasis">+ Add</UiText>
                  </Button>
                </View>
                <UiText textRole="caption">
                  {exercises.length} exercises ·{' '}
                  {exercises.reduce((total, exercise) => total + exercise.sets.length, 0)} sets
                </UiText>
              </View>
              {exercises.length === 0 ? (
                <View className="gap-field border-t border-divider pt-section">
                  <UiText textRole="cardTitle">Start with an exercise.</UiText>
                  <UiText textRole="bodyMuted">
                    Add the lifts or cardio you want in this workout.
                  </UiText>
                </View>
              ) : (
                exercises.map((exercise, index) => (
                  <ExerciseEditor
                    key={exercise.id}
                    exercise={exercise}
                    index={index}
                    onUpdateSets={updateExerciseSets}
                    onAddSet={addSetToExercise}
                    onRemoveSet={removeSetFromExercise}
                    onMove={(direction) =>
                      setExercises(moveWorkoutExercise(exercises, index, direction))
                    }
                    canMoveUp={index > 0}
                    canMoveDown={index < exercises.length - 1}
                    onRemove={() =>
                      setExercises(exercises.filter((item) => item.id !== exercise.id))
                    }
                  />
                ))
              )}
              <Button
                variant="ghost"
                className="h-action flex-row gap-compact border border-dashed border-divider"
                onPress={addExercises}
              >
                <UiText textRole="captionEmphasis">+ Add exercises</UiText>
              </Button>
              {error && (
                <UiText textRole="bodyDestructive" accessibilityRole="alert">
                  {error}
                </UiText>
              )}
            </View>
          </View>
        </ScrollView>

        <View className="border-t border-divider bg-background px-page py-field">
          <View className="w-full max-w-3xl self-center gap-compact">
            <UiText
              textRole={validation ? 'captionDestructive' : 'caption'}
              accessibilityLiveRegion="polite"
            >
              {validation ?? 'Ready to save your workout.'}
            </UiText>
            <Button
              disabled={!canSave}
              loading={saving}
              accessibilityHint={validation ?? undefined}
              onPress={() => void onSave(name.trim(), notes)}
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save workout'}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}
