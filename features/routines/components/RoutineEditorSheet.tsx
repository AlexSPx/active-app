import { useState } from 'react'
import { Sheet, YStack, XStack, Text, Input, Button, ScrollView } from 'tamagui'
import { router } from 'expo-router'
import type { ApiWorkout } from '../../../types/api'
import { toggleWorkoutSelection, workoutMetadata } from '../routineDraft'
import { syncEngine } from '../../../lib/sync'

export interface RoutineEditorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workouts: ApiWorkout[]
  selected: string[]
  single: boolean
  context: string
  onApply: (selection: string[]) => void
}

export function RoutineEditorSheet(props: RoutineEditorSheetProps) {
  // Remount the picker when opened: pending choices are discarded on Cancel.
  return props.open ? <WorkoutPicker {...props} /> : null
}

function WorkoutPicker({
  open,
  onOpenChange,
  workouts,
  selected,
  single,
  context,
  onApply,
}: RoutineEditorSheetProps) {
  const [pending, setPending] = useState(selected)
  const [query, setQuery] = useState('')
  const selection = pending.map((id) => syncEngine.resolveId('workouts', id))
  const results = workouts.filter((workout) =>
    workout.title.toLowerCase().includes(query.trim().toLowerCase())
  )
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      modal
      snapPointsMode="percent"
      snapPoints={[100]}
      dismissOnSnapToBottom
    >
      <Sheet.Overlay bg="$backgroundTransparent" />
      <Sheet.Handle bg="$colorMuted" />
      <Sheet.Frame
        bg="$background"
        borderTopLeftRadius="$sheet"
        borderTopRightRadius="$sheet"
        p="$page"
        gap="$field"
      >
        <XStack items="center" justify="space-between">
          <Text fontSize="$screenTitle" lineHeight="$screenTitle" fontWeight="600">
            {single ? 'Choose a workout' : 'Add workouts'}
          </Text>
          <Button chromeless minH="$touch" color="$primary" onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
        </XStack>
        <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
          For {context}
        </Text>
        <Text fontSize="$caption" fontWeight="600">
          Search saved workouts
        </Text>
        <Input
          accessibilityLabel="Search saved workouts"
          value={query}
          onChangeText={setQuery}
          placeholder="Search by workout name"
          rounded="$control"
          minH="$action"
          bg="$surface"
          fontSize="$body"
        />
        <Text fontSize="$caption" color="$colorSubtle">
          {results.length} {results.length === 1 ? 'workout' : 'workouts'}
          {query ? ' found' : ' saved'}
        </Text>
        <ScrollView flex={1} keyboardShouldPersistTaps="handled">
          <YStack gap="$compact">
            {results.map((workout) => {
              const checked = selection.includes(workout.id)
              return (
                <Button
                  key={workout.id}
                  height="auto"
                  minH="$action"
                  p="$field"
                  rounded="$control"
                  bg={checked ? '$backgroundAccent' : '$background'}
                  borderWidth={1}
                  borderColor={checked ? '$primary' : '$borderColor'}
                  accessibilityRole={single ? 'radio' : 'checkbox'}
                  accessibilityState={{ checked }}
                  onPress={() => setPending(toggleWorkoutSelection(selection, workout.id, single))}
                >
                  <XStack width="100%" items="center" gap="$field">
                    <YStack flex={1} gap="$compact">
                      <Text fontSize="$exerciseTitle" lineHeight="$exerciseTitle" fontWeight="600">
                        {workout.title}
                      </Text>
                      <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                        {workoutMetadata(workout)}
                      </Text>
                      <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                        {workout.workoutTemplate.exercises
                          .map((exercise) => exercise.exerciseTitle)
                          .join(' · ')}
                      </Text>
                    </YStack>
                    <Text color={checked ? '$primary' : '$colorMuted'} fontSize="$header">
                      {checked ? '✓' : '○'}
                    </Text>
                  </XStack>
                </Button>
              )
            })}
            {!results.length && (
              <YStack py="$section" gap="$field">
                <Text fontSize="$header" fontWeight="600">
                  {workouts.length ? 'No matching workouts' : 'No saved workouts yet'}
                </Text>
                <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
                  {workouts.length
                    ? 'Try a different workout name.'
                    : 'Create a workout before adding it to your routine.'}
                </Text>
              </YStack>
            )}
            <Button
              bg="$backgroundHover"
              rounded="$button"
              minH="$action"
              color="$primary"
              onPress={() => {
                onOpenChange(false)
                router.push('/workouts/new?returnTo=routine')
              }}
            >
              Create workout ↗
            </Button>
          </YStack>
        </ScrollView>
        <YStack borderTopWidth={1} borderColor="$borderColor" pt="$field" gap="$field">
          <Text fontSize="$caption" color="$colorSubtle">
            {single
              ? 'Choose one workout for this training day.'
              : `${pending.length} selected across all searches.`}
          </Text>
          <Button
            bg={single && !pending.length ? '$backgroundHover' : '$primary'}
            color={single && !pending.length ? '$colorMuted' : '$onPrimary'}
            rounded="$button"
            minH="$action"
            disabled={single && !pending.length}
            onPress={() => {
              onApply(selection)
              onOpenChange(false)
            }}
          >
            {single ? 'Done' : `Done · ${pending.length} selected`}
          </Button>
        </YStack>
      </Sheet.Frame>
    </Sheet>
  )
}
