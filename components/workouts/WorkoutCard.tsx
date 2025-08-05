import { YStack, XStack, Text, Card } from 'tamagui'
import { View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useCallback, memo } from 'react'
import type { WorkoutTemplate } from '../../types/workout'
import { StartWorkoutButton } from '../ui/StartWorkoutButton'

export interface WorkoutCardProps {
  workout: WorkoutTemplate
  onStartWorkout: (workout: WorkoutTemplate) => void
  isWorkoutRunning: boolean
  onEdit?: (workout: WorkoutTemplate) => void
  onDelete?: (workoutId: string) => void
}

export const WorkoutCard = memo(
  function WorkoutCard({
    workout,
    onStartWorkout,
    isWorkoutRunning,
    onEdit,
    onDelete,
  }: WorkoutCardProps) {
    const renderExercisePreview = useCallback(
      ({ item: ex }: { item: any }) => (
        <Text fontSize="$4" color="$colorSubtle">
          - {ex.name} ({ex.sets}x{ex.reps})
        </Text>
      ),
      []
    )

    const handleStartWorkout = useCallback(() => {
      onStartWorkout(workout)
    }, [onStartWorkout, workout])

    const handleEdit = useCallback(() => {
      onEdit?.(workout)
    }, [onEdit, workout])

    const handleDelete = useCallback(() => {
      onDelete?.(workout.id)
    }, [onDelete, workout.id])

    return (
      <Card
        key={workout.id}
        bordered
        padded
        elevate
        size="$5"
        bg="$surface"
        borderColor="$borderColor"
        pressStyle={{ scale: 0.98, opacity: 0.8 }}
      >
        <YStack gap="$3">
          <XStack justify="space-between" verticalAlign="center">
            <Text fontSize="$6" fontWeight="600" color="$color">
              {workout.name}
            </Text>
            <XStack gap="$2">
              {onEdit && (
                <Text
                  color="$colorSubtle"
                  fontSize="$3"
                  onPress={() => onEdit(workout)}
                  pressStyle={{ opacity: 0.7 }}
                >
                  Edit
                </Text>
              )}
              {onDelete && (
                <Text
                  color="$primary"
                  fontSize="$3"
                  onPress={() => onDelete(workout.id)}
                  pressStyle={{ opacity: 0.7 }}
                >
                  Delete
                </Text>
              )}
            </XStack>
          </XStack>

          <Text fontSize="$4" color="$colorSubtle">
            🏷️ {workout.tag}
          </Text>

          <Text fontSize="$4" color="$colorSubtle">
            🏋️ {workout.exercises.length} exercises · ⏱️ {workout.duration}
          </Text>

          <YStack gap="$1">
            <Text fontWeight="500" color="$color">
              Exercises:
            </Text>
            <View style={{ height: Math.min(workout.exercises.length, 3) * 24 }}>
              <FlashList
                data={workout.exercises.slice(0, 3)}
                renderItem={renderExercisePreview}
                keyExtractor={(item, index) => `${item.name}-${index}`}
                estimatedItemSize={24}
                showsVerticalScrollIndicator={false}
                scrollEnabled={false}
              />
            </View>
            {workout.exercises.length > 3 && (
              <Text fontSize="$4" color="$colorSubtle">
                ... and {workout.exercises.length - 3} more
              </Text>
            )}
          </YStack>

          <StartWorkoutButton onPress={handleStartWorkout} isWorkoutRunning={isWorkoutRunning} />
        </YStack>
      </Card>
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if relevant props have changed
    return (
      prevProps.workout.id === nextProps.workout.id &&
      prevProps.workout.name === nextProps.workout.name &&
      prevProps.workout.exercises.length === nextProps.workout.exercises.length &&
      prevProps.isWorkoutRunning === nextProps.isWorkoutRunning
    )
  }
)
