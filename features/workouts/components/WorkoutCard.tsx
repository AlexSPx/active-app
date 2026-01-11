import { YStack, XStack, Text, Card, Separator, Button, Portal } from 'tamagui'
import { MoreHorizontal, Edit3, Trash2 } from '@tamagui/lucide-icons'
import { Popover } from '@tamagui/popover'
import { useCallback, memo, useState, useMemo } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { StartWorkoutButton } from '../../../components/ui/StartWorkoutButton'
import { ApiWorkout } from '../../../types/api'
import { haptics } from '../../../utils/haptics'

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
    const [menuOpen, setMenuOpen] = useState(false)
    const renderExercisePreview = useCallback(
      ({ item: exercise }: { item: { exerciseId: string; reps: number[]; weight: number[] } }) => (
        <Text fontSize="$4" color="$colorSubtle">
          - {exercise.exerciseId.replace(/_/g, ' ')} ({exercise.reps.length} sets)
        </Text>
      ),
      []
    )

    const handleStartWorkout = useCallback(() => {
      haptics.medium()
      onStartWorkout(workout)
    }, [onStartWorkout, workout])

    const handleEdit = useCallback(() => {
      onEdit?.(workout)
    }, [onEdit, workout])

    const handleDelete = useCallback(() => {
      onDelete?.(workout.id)
    }, [onDelete, workout.id])

    const totalSets = useMemo(() => {
      return workout.workoutTemplate.exercises.reduce((sum, e) => {
        if (e.category === 'CARDIO') return sum + e.durationSeconds!.length
        return sum + (e.reps?.length || 0)
      }, 0)
    }, [workout.workoutTemplate.exercises])

    return (
      <Card
        key={workout.id}
        bg="$surface"
        borderColor="$borderColor"
        borderWidth="$0.5"
        p="$4"
        rounded="$6"
        pressStyle={{ scale: 0.98, opacity: 0.9 }}
      >
        <YStack gap="$3">
          <XStack justify="space-between" items="center">
            <Text fontSize="$6" fontWeight="700" color="$color">
              {workout.title}
            </Text>
            {(onEdit || onDelete) && (
              <>
                {menuOpen && (
                  <Portal>
                    <Pressable
                      style={[StyleSheet.absoluteFillObject, { zIndex: 1 }]}
                      onPress={() => setMenuOpen(false)}
                    />
                  </Portal>
                )}
                <Popover
                  open={menuOpen}
                  onOpenChange={(open) => {
                    if (open) haptics.light()
                    setMenuOpen(open)
                  }}
                  size="$2"
                  placement="bottom-end"
                >
                  <Popover.Trigger asChild>
                    <Button size="$3" circular icon={MoreHorizontal} />
                  </Popover.Trigger>
                  <Popover.Content
                    p="$2"
                    bg="$surface"
                    borderColor="$borderColor"
                    borderWidth="$0.5"
                    elevate
                  >
                    <YStack width={150} gap="$1">
                      {onEdit && (
                        <Popover.Close asChild>
                          <Button size="$3" chromeless onPress={() => onEdit?.(workout)}>
                            <XStack items="center" gap="$2">
                              <Edit3 size={14} />
                              <Text>Edit</Text>
                            </XStack>
                          </Button>
                        </Popover.Close>
                      )}
                      {onDelete && (
                        <Popover.Close asChild>
                          <Button size="$3" chromeless onPress={() => onDelete?.(workout.id)}>
                            <XStack items="center" gap="$2">
                              <Trash2 size={14} color="red" />
                              <Text color="$red10">Delete</Text>
                            </XStack>
                          </Button>
                        </Popover.Close>
                      )}
                    </YStack>
                  </Popover.Content>
                </Popover>
              </>
            )}
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
              {totalSets} Sets Logged
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
