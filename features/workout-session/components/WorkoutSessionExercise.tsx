import { YStack, XStack, Text, Button } from 'tamagui'
import { View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useCallback, memo } from 'react'
import type { Exercise, Set } from '../../../types/workout-session'
import { WorkoutSessionSetRow } from './WorkoutSessionSetRow'
import { CardioSessionSetRow } from './CardioSessionSetRow'

interface WorkoutSessionExerciseProps {
  exercise: Exercise
  index: number
  onUpdateSet: (
    exerciseId: string,
    setId: string,
    field: 'reps' | 'weight' | 'duration',
    value: number
  ) => void
  onToggleSetComplete: (exerciseId: string, setId: string) => void
  onAddSet: (exerciseId: string) => void
  onRemoveSet: (exerciseId: string, setIndex: number) => void
  onStartRestTimer: (setId: string) => void
}

export const WorkoutSessionExercise = memo(
  function WorkoutSessionExercise({
    exercise,
    index,
    onUpdateSet,
    onToggleSetComplete,
    onAddSet,
    onRemoveSet,
    onStartRestTimer,
  }: WorkoutSessionExerciseProps) {
    const isCardio = exercise.category === 'CARDIO'
    const renderSetRow = useCallback(
      ({ item: set, index }: { item: Set; index: number }) => {
        if (isCardio) {
          return (
            <CardioSessionSetRow
              set={set}
              index={index}
              onUpdateDuration={(secs) => onUpdateSet(exercise.sessionId, set.id, 'duration', secs)}
              onToggleComplete={() => onToggleSetComplete(exercise.sessionId, set.id)}
              onDelete={() => onRemoveSet(exercise.sessionId, index)}
            />
          )
        }
        return (
          <WorkoutSessionSetRow
            set={set}
            index={index}
            onUpdateSet={(field, value) => onUpdateSet(exercise.sessionId, set.id, field, value)}
            onToggleComplete={() => {
              onToggleSetComplete(exercise.sessionId, set.id)
              if (!set.completed && set.reps && set.weight) {
                onStartRestTimer(set.id)
              }
            }}
            onDelete={() => onRemoveSet(exercise.sessionId, index)}
          />
        )
      },
      [
        isCardio,
        exercise.sessionId,
        onUpdateSet,
        onToggleSetComplete,
        onStartRestTimer,
        onRemoveSet,
      ]
    )

    return (
      <YStack
        p="$card"
        gap="$field"
        bg="$surface"
        rounded="$card"
        borderColor="$borderColor"
        borderWidth="$0.5"
      >
        <YStack minH="$touch">
          <Text fontSize="$header" lineHeight="$header" fontWeight="$screenTitle" color="$color">
            {index + 1}. {exercise.name}
          </Text>
          <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
            {exercise.primaryMuscles[0] || (isCardio ? 'Cardio' : 'Other')} · {exercise.sets.length}{' '}
            {isCardio ? 'intervals' : 'sets'}
          </Text>
        </YStack>
        <YStack gap="$compact">
          <XStack gap="$compact" mb="$compact" items="center">
            <Text width="$setRow" text="center" fontSize="$caption" color="$colorSubtle">
              {isCardio ? '#' : 'Set'}
            </Text>
            <Text flex={1} text="center" fontSize="$caption" color="$colorSubtle">
              {isCardio ? 'Duration (min:sec)' : 'Weight (kg)'}
            </Text>
            {!isCardio && (
              <Text flex={1} text="center" fontSize="$caption" color="$colorSubtle">
                Reps
              </Text>
            )}
            <Text width="$touch" text="center" fontSize="$caption" color="$colorSubtle">
              ✓
            </Text>
          </XStack>

          {/* Sets */}
          <View>
            <FlashList
              data={exercise.sets}
              renderItem={renderSetRow}
              keyExtractor={(item) => item.id}
              ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
            />
          </View>

          {/* Add Set Button */}
          <Button
            height="$touch"
            mt="$compact"
            rounded="$day"
            bg="$backgroundStrong"
            onPress={() => onAddSet(exercise.sessionId)}
          >
            <Text color="$primary" fontSize="$caption">
              + Add {isCardio ? 'interval' : 'set'}
            </Text>
          </Button>
        </YStack>
      </YStack>
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if exercise data has changed
    return (
      prevProps.index === nextProps.index &&
      prevProps.exercise.sessionId === nextProps.exercise.sessionId &&
      prevProps.exercise.sets.length === nextProps.exercise.sets.length &&
      prevProps.exercise.sets.every((set, index) => {
        const nextSet = nextProps.exercise.sets[index]
        return (
          set.id === nextSet.id &&
          set.weight === nextSet.weight &&
          set.reps === nextSet.reps &&
          set.durationSeconds === nextSet.durationSeconds &&
          set.completed === nextSet.completed
        )
      })
    )
  }
)
