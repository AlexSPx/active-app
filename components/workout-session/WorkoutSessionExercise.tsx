import { YStack, XStack, Text, Button, Card, H3, Separator } from 'tamagui'
import { Plus, MoreHorizontal, Timer, Target } from '@tamagui/lucide-icons'
import { View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useCallback, memo } from 'react'
import type { Exercise } from '../../types/workout-session'
import { WorkoutSessionSetRow } from './WorkoutSessionSetRow'

interface WorkoutSessionExerciseProps {
  exercise: Exercise
  onUpdateSet: (exerciseId: string, setId: string, field: 'reps' | 'weight', value: number) => void
  onToggleSetComplete: (exerciseId: string, setId: string) => void
  onAddSet: (exerciseId: string) => void
  onRemoveSet: (exerciseId: string, setIndex: number) => void
  onStartRestTimer: (setId: string) => void
}

export const WorkoutSessionExercise = memo(
  function WorkoutSessionExercise({
    exercise,
    onUpdateSet,
    onToggleSetComplete,
    onAddSet,
    onRemoveSet,
    onStartRestTimer,
  }: WorkoutSessionExerciseProps) {
    const renderSetRow = useCallback(
      ({ item: set, index }: { item: any; index: number }) => (
        <WorkoutSessionSetRow
          set={set}
          index={index}
          previousSet={exercise.lastWorkout?.sets[index]}
          onUpdateSet={(field, value) => onUpdateSet(exercise.id, set.id, field, value)}
          onToggleComplete={() => {
            onToggleSetComplete(exercise.id, set.id)
            if (!set.completed && set.reps && set.weight) {
              onStartRestTimer(set.id)
            }
          }}
          onDelete={() => onRemoveSet(exercise.id, index)}
        />
      ),
      [
        exercise.id,
        exercise.lastWorkout?.sets,
        onUpdateSet,
        onToggleSetComplete,
        onStartRestTimer,
        onRemoveSet,
      ]
    )

    return (
      <Card elevate size="$4" mb="$3" p="$3" bg="$surface" borderColor="$borderColor">
        <YStack gap="$2">
          {/* Exercise Header */}
          <XStack justify="space-between" items="center">
            <YStack>
              <H3 color="$color">{exercise.name}</H3>
              <Text fontSize="$3" color="$colorSubtle">
                {exercise.primaryMuscles[0] || 'Other'}
              </Text>
            </YStack>
            <Button size="$3" circular icon={MoreHorizontal} />
          </XStack>

          {/* Previous Best */}
          {exercise.previousBest && (
            <XStack gap="$3" items="center" p="$2" bg="$backgroundHover" r="$3">
              <Target size={16} color="$colorSubtle" />
              <Text fontSize="$3" color="$colorSubtle">
                PR: {exercise.previousBest.weight}kg × {exercise.previousBest.reps}
              </Text>
            </XStack>
          )}

          {/* Sets Header */}
          <XStack justify="space-between" px="$1">
            <YStack flex={1} items="center">
              <Text fontSize="$3" fontWeight="600" color="$color">
                SET
              </Text>
            </YStack>
            <YStack flex={1} items="center">
              <Text fontSize="$3" fontWeight="600" color="$color">
                PREVIOUS
              </Text>
            </YStack>
            <YStack flex={1} items="center">
              <Text fontSize="$3" fontWeight="600" color="$color">
                WEIGHT
              </Text>
            </YStack>
            <YStack flex={1} items="center">
              <Text fontSize="$3" fontWeight="600" color="$color">
                REPS
              </Text>
            </YStack>
            <YStack width={40} items="center">
              <Text fontSize="$3" fontWeight="600" color="$color">
                ✓
              </Text>
            </YStack>
          </XStack>

          <Separator />

          {/* Sets */}
          <View>
            <FlashList
              data={exercise.sets}
              renderItem={renderSetRow}
              keyExtractor={(item) => item.id}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
            />
          </View>

          {/* Add Set Button */}
          <Button
            size="$3"
            variant="outlined"
            icon={Plus}
            onPress={() => onAddSet(exercise.id)}
            borderColor="$primary"
            color="$primary"
          >
            <Text color="$primary">Add Set</Text>
          </Button>
        </YStack>
      </Card>
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if exercise data has changed
    return (
      prevProps.exercise.id === nextProps.exercise.id &&
      prevProps.exercise.sets.length === nextProps.exercise.sets.length &&
      prevProps.exercise.sets.every((set, index) => {
        const nextSet = nextProps.exercise.sets[index]
        return (
          set.id === nextSet.id &&
          set.weight === nextSet.weight &&
          set.reps === nextSet.reps &&
          set.completed === nextSet.completed
        )
      })
    )
  }
)
