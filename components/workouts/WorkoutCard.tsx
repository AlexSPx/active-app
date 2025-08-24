import { YStack, XStack, Text, Card, Separator } from 'tamagui'
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
        bg="$surface"
        borderColor="$borderColor"
        borderWidth="$0.5"
        p="$4"
        rounded="$6"
        elevate
        pressStyle={{ scale: 0.98, opacity: 0.9 }}
      >
        <YStack gap="$3">
          <XStack justify="space-between" items="center">
            <Text fontSize="$6" fontWeight="700" color="$color">
              {workout.title}
            </Text>
            <XStack gap="$2">
              {onEdit && (
                <Text color="$colorSubtle" fontSize="$3" onPress={() => onEdit(workout)}>
                  Edit
                </Text>
              )}
              {onDelete && (
                <Text color="$primary" fontSize="$3" onPress={() => onDelete(workout.id)}>
                  Delete
                </Text>
              )}
            </XStack>
          </XStack>

          {/* Description preview */}
          <Text fontSize="$3" color="$colorSubtle" numberOfLines={2}>
            {workout.workoutTemplate.exercises
              .map((e) => e.exerciseId.replace(/_/g, ' '))
              .slice(0, 5)
              .join(', ')}
          </Text>

          {/* Stats row */}
          <XStack gap="$6" items="center">
            <Text fontSize="$3" color="$colorSubtle">
              {workout.workoutTemplate.exercises.reduce((s, e) => s + (e.reps?.length || 0), 0)}{' '}
              Sets Logged
            </Text>
            <Text fontSize="$3" color="$colorSubtle">
              {/* Estimated duration placeholder */}
              1:04:43 Duration
            </Text>
            <Text fontSize="$3" color="$colorSubtle">
              356 Est Calories
            </Text>
          </XStack>

          <Separator my="$2" />

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
      prevProps.workout.workoutTemplate.exercises.length ===
        nextProps.workout.workoutTemplate.exercises.length &&
      prevProps.isWorkoutRunning === nextProps.isWorkoutRunning
    )
  }
)
