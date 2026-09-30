import { useEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useNavigation, usePreventRemove } from '@react-navigation/native'
import { useHeaderHeight } from '@react-navigation/elements'
import { Stack, useRouter } from 'expo-router'
import { Button, Input, ScrollView, Text, TextArea, XStack, YStack } from 'tamagui'
import { ExerciseEditor } from '../../exercises'
import { validateWorkoutData } from '../../../utils/workoutUtils'
import type { WorkoutExercise, WorkoutSet } from '../../../types/workout'

interface Props {
  editing?: boolean
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
  const navigation = useNavigation()
  const headerHeight = useHeaderHeight()
  const [name, setName] = useState(initialName)
  const [notes, setNotes] = useState(initialNotes)
  useEffect(() => {
    setName(initialName)
    setNotes(initialNotes)
  }, [initialName, initialNotes])
  const dirty =
    name !== initialName || notes !== initialNotes || JSON.stringify(exercises) !== initialSignature
  usePreventRemove(dirty && !saving, ({ data }) => {
    Alert.alert('Discard workout?', 'Your changes will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard workout',
        style: 'destructive',
        onPress: () => {
          clearExercises()
          navigation.dispatch(data.action)
        },
      },
    ])
  })
  const validation = validateWorkoutData(name, exercises, notes)
  const canSave = !validation && !saving
  const moveExercise = (index: number, direction: -1 | 1) => {
    const moved = [...exercises]
    const target = index + direction
    if (target < 0 || target >= moved.length) return
    ;[moved[index], moved[target]] = [moved[target], moved[index]]
    setExercises(moved)
  }
  const addExercises = () =>
    router.push({
      pathname: '/exercises/search',
      params: { ctx: editing ? 'edit' : 'create', workoutName: name.trim() },
    })
  return (
    <YStack flex={1} bg="$background">
      <Stack.Screen
        options={{
          title: 'Workouts',
          headerRight: () => (
            <Button chromeless height="$touch" onPress={() => router.back()} disabled={saving}>
              <Text color="$primary" fontSize="$caption">
                Cancel
              </Text>
            </Button>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          flex={1}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <YStack width="100%" maxW="$content" self="center" p="$page" gap="$section">
            <YStack gap="$compact">
              <Text
                fontSize="$screenTitle"
                lineHeight="$screenTitle"
                fontWeight="$screenTitle"
                color="$color"
              >
                {editing ? 'Edit workout' : 'Create workout'}
              </Text>
              <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                Choose your exercises, then set your targets.
              </Text>
            </YStack>
            <YStack gap="$field">
              <YStack gap="$compact">
                <Text fontSize="$caption" fontWeight="$screenTitle" color="$color">
                  Workout name
                </Text>
                <Input
                  height="$action"
                  rounded="$control"
                  bg="$surface"
                  borderColor="$borderColor"
                  fontSize="$body"
                  accessibilityLabel="Workout name, required"
                  placeholder="e.g. Lower body foundations"
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                />
              </YStack>
              <YStack gap="$compact">
                <Text fontSize="$caption" fontWeight="$screenTitle" color="$color">
                  Notes{' '}
                  <Text color="$colorSubtle" fontWeight="$body">
                    (optional)
                  </Text>
                </Text>
                <TextArea
                  minH="$6"
                  rounded="$control"
                  bg="$surface"
                  borderColor="$borderColor"
                  fontSize="$body"
                  accessibilityLabel="Notes, optional"
                  placeholder="Anything to remember for this session"
                  value={notes}
                  onChangeText={setNotes}
                  maxLength={1000}
                />
              </YStack>
            </YStack>
            <YStack gap="$field">
              <YStack gap="$compact">
                <XStack justify="space-between" items="center">
                  <Text
                    fontSize="$cardTitle"
                    lineHeight="$cardTitle"
                    fontWeight="$cardTitle"
                    color="$color"
                  >
                    Exercises
                  </Text>
                  <Button chromeless height="$touch" onPress={addExercises}>
                    <Text color="$primary" fontSize="$caption">
                      + Add
                    </Text>
                  </Button>
                </XStack>
                <Text fontSize="$caption" color="$colorSubtle">
                  {exercises.length} exercises ·{' '}
                  {exercises.reduce((total, exercise) => total + exercise.sets.length, 0)} sets
                </Text>
              </YStack>
              {exercises.length === 0 ? (
                <YStack gap="$field" py="$field">
                  <Text fontSize="$header" fontWeight="$screenTitle" color="$color">
                    No exercises yet
                  </Text>
                  <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                    Add exercises, then choose the weight and reps or duration for each set.
                  </Text>
                  <Button
                    height="$action"
                    rounded="$button"
                    bg="$backgroundStrong"
                    onPress={addExercises}
                  >
                    <Text color="$primary" fontSize="$caption">
                      + Add exercises
                    </Text>
                  </Button>
                </YStack>
              ) : (
                exercises.map((exercise, index) => (
                  <ExerciseEditor
                    key={exercise.id}
                    exercise={exercise}
                    index={index}
                    onUpdateSets={updateExerciseSets}
                    onAddSet={addSetToExercise}
                    onRemoveSet={removeSetFromExercise}
                    onMove={(direction) => moveExercise(index, direction)}
                    canMoveUp={index > 0}
                    canMoveDown={index < exercises.length - 1}
                    onRemove={() =>
                      setExercises(exercises.filter((item) => item.id !== exercise.id))
                    }
                  />
                ))
              )}
              {error && (
                <Text color="$destructive" fontSize="$caption" accessibilityRole="alert">
                  {error}
                </Text>
              )}
            </YStack>
          </YStack>
        </ScrollView>
        <YStack
          borderTopColor="$borderColor"
          borderTopWidth="$0.5"
          bg="$background"
          px="$page"
          py="$field"
        >
          <YStack width="100%" maxW="$content" self="center" gap="$compact">
            <Text
              fontSize="$caption"
              lineHeight="$caption"
              color="$colorSubtle"
              accessibilityLiveRegion="polite"
            >
              {validation ?? 'Ready to save your workout.'}
            </Text>
            <Button
              height="$action"
              rounded="$button"
              bg={canSave ? '$primary' : '$backgroundAccent'}
              disabled={!canSave}
              accessibilityHint={validation ?? undefined}
              onPress={() => onSave(name.trim(), notes)}
            >
              <Text
                fontSize="$caption"
                fontWeight="$screenTitle"
                color={canSave ? '$onPrimary' : '$colorSubtle'}
              >
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Save workout'}
              </Text>
            </Button>
          </YStack>
        </YStack>
      </KeyboardAvoidingView>
    </YStack>
  )
}
