import { YStack, XStack, Text, Card } from 'tamagui'
import { View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useCallback, memo } from 'react'
import { StartWorkoutButton } from '../ui/StartWorkoutButton'
import { ApiWorkout } from 'types/api'

export interface WorkoutCardProps {
  workout: ApiWorkout
  onStartWorkout: (workout: ApiWorkout) => void
  isWorkoutRunning: boolean
  onEdit?: (workout: ApiWorkout) => void
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
      ({ item: exercise }: { item: { exerciseId: string; reps: number[]; weight: number[] } }) => (
        <Text fontSize="$4" color="$colorSubtle">
          - {exercise.exerciseId.replace(/_/g, ' ')} ({exercise.reps.length} sets)
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
              {workout.title}
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
            🏷️ Workout
          </Text>

          <Text fontSize="$4" color="$colorSubtle">
            🏋️ {workout.workoutTemplate.exercises.length} exercises
          </Text>

          <YStack gap="$1">
            <Text fontWeight="500" color="$color">
              Exercises:
            </Text>
            <View style={{ height: Math.min(workout.workoutTemplate.exercises.length, 3) * 24 }}>
              <FlashList
                data={workout.workoutTemplate.exercises.slice(0, 3)}
                renderItem={renderExercisePreview}
                keyExtractor={(item, index) => `${item.exerciseId}-${index}`}
                showsVerticalScrollIndicator={false}
                scrollEnabled={false}
              />
            </View>
            {workout.workoutTemplate.exercises.length > 3 && (
              <Text fontSize="$4" color="$colorSubtle">
                ... and {workout.workoutTemplate.exercises.length - 3} more
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
      prevProps.workout.title === nextProps.workout.title &&
      prevProps.workout.workoutTemplate.exercises.length === nextProps.workout.workoutTemplate.exercises.length &&
      prevProps.isWorkoutRunning === nextProps.isWorkoutRunning
    )
  }
)
