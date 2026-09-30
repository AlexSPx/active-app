import { YStack, XStack, Text, Card, Button, Portal } from 'tamagui'
import { MoreHorizontal, Edit3, Trash2, Play } from '@tamagui/lucide-icons'
import { Popover } from '@tamagui/popover'
import { useCallback, memo, useState, useMemo } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { ApiWorkout } from '../../../types/api'
import { haptics } from '../../../utils/haptics'

export interface WorkoutCardProps {
  workout: ApiWorkout
  onStartWorkout: (workout: ApiWorkout) => void
  isWorkoutRunning: boolean
  routineName?: string
  onEdit?: (workout: ApiWorkout) => void
  onDelete?: (workoutId: string) => void
  onPress?: (workout: ApiWorkout) => void
}

export const WorkoutCard = memo(function WorkoutCard({
  workout,
  onStartWorkout,
  isWorkoutRunning,
  routineName,
  onEdit,
  onDelete,
  onPress,
}: WorkoutCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const handleStartWorkout = useCallback(() => {
    if (isWorkoutRunning) return
    haptics.medium()
    onStartWorkout(workout)
  }, [isWorkoutRunning, onStartWorkout, workout])

  const normalizedRoutineName = routineName?.trim() || ''
  const isInRoutine = normalizedRoutineName.length > 0

  const summary = useMemo(() => {
    let totalSets = 0
    let estimatedDurationSeconds = 0

    for (const exercise of workout.workoutTemplate.exercises) {
      if (exercise.category === 'CARDIO') {
        const durations = Array.isArray(exercise.durationSeconds) ? exercise.durationSeconds : []
        totalSets += durations.length
        estimatedDurationSeconds += durations.reduce((sum, duration) => sum + duration, 0)
        continue
      }

      const sets = exercise.reps?.length || 0
      totalSets += sets
      estimatedDurationSeconds += sets * 150
    }

    const exerciseNames = workout.workoutTemplate.exercises.map((exercise) =>
      exercise.exerciseTitle.trim()
    )
    const visibleExercises = exerciseNames.slice(0, 4)
    const hiddenCount = Math.max(0, exerciseNames.length - visibleExercises.length)

    const firstCategory = workout.workoutTemplate.exercises[0]?.category
    const categoryLabel = firstCategory
      ? firstCategory
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (char) => char.toUpperCase())
      : 'Workout'

    return {
      totalSets,
      approxMinutes: Math.max(5, Math.round(estimatedDurationSeconds / 60)),
      visibleExercises,
      hiddenCount,
      topLabel: isInRoutine ? normalizedRoutineName : categoryLabel,
    }
  }, [isInRoutine, normalizedRoutineName, workout.workoutTemplate.exercises])

  return (
    <Card
      key={workout.id}
      bg="$surface"
      borderColor="$borderColor"
      borderWidth={1}
      borderRadius="$card"
      p={0}
      overflow="hidden"
    >
      <YStack>
        <YStack p="$card" gap="$card">
          <XStack justify="space-between" items="flex-start" gap="$3">
            <YStack
              flex={1}
              minH="$touch"
              gap="$1"
              onPress={onPress ? () => onPress(workout) : undefined}
              accessibilityRole={onPress ? 'button' : undefined}
              accessibilityLabel={onPress ? `View workout ${workout.title}` : undefined}
              pressStyle={onPress ? { opacity: 0.75 } : undefined}
            >
              <Text fontSize="$cardTitle" lineHeight="$cardTitle" fontWeight="600" color="$color">
                {workout.title}
              </Text>
              <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                {summary.topLabel}
              </Text>
            </YStack>

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
                    <Button
                      unstyled
                      width="$touch"
                      height="$touch"
                      accessibilityLabel={`More actions for ${workout.title}`}
                      bg="$backgroundTransparent"
                      justify="center"
                      items="center"
                      pressStyle={{ opacity: 0.85 }}
                      rounded="$control"
                    >
                      <MoreHorizontal size="$iconSmall" color="$colorSubtle" />
                    </Button>
                  </Popover.Trigger>
                  <Popover.Content
                    p="$2"
                    bg="$surface"
                    borderColor="$borderColor"
                    borderWidth={1}
                    rounded="$menu"
                  >
                    <YStack minW="$12" gap="$1">
                      {onEdit && (
                        <Popover.Close asChild>
                          <Button minH="$touch" chromeless onPress={() => onEdit?.(workout)}>
                            <XStack items="center" gap="$2" justify="flex-start" width="100%">
                              <Edit3 size="$iconSmall" color="$color" />
                              <Text color="$color" fontSize="$caption">
                                Edit
                              </Text>
                            </XStack>
                          </Button>
                        </Popover.Close>
                      )}
                      {onDelete && (
                        <Popover.Close asChild>
                          <Button minH="$touch" chromeless onPress={() => onDelete?.(workout.id)}>
                            <XStack items="center" gap="$2" justify="flex-start" width="100%">
                              <Trash2 size="$iconSmall" color="$destructive" />
                              <Text color="$destructive" fontSize="$caption">
                                Delete
                              </Text>
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

          <XStack gap="$3" items="center" flexWrap="wrap">
            <XStack items="center" gap="$1.5">
              <Text fontSize="$caption" color="$colorSubtle">
                {workout.workoutTemplate.exercises.length}{' '}
                {workout.workoutTemplate.exercises.length === 1 ? 'exercise' : 'exercises'}
              </Text>
            </XStack>
            <XStack items="center" gap="$1.5">
              <Text fontSize="$caption" color="$colorSubtle">
                {summary.totalSets} {summary.totalSets === 1 ? 'set' : 'sets'}
              </Text>
            </XStack>
            <XStack items="center" gap="$1.5">
              <Text fontSize="$caption" color="$colorSubtle">
                ~{summary.approxMinutes} min
              </Text>
            </XStack>
          </XStack>
          <Text fontSize="$caption" color="$colorSubtle" lineHeight="$caption">
            {summary.visibleExercises.join(' · ')}
            {summary.hiddenCount > 0 ? ` · +${summary.hiddenCount} more` : ''}
          </Text>

          <Button
            width="100%"
            minH="$action"
            height="auto"
            py="$3"
            rounded="$button"
            opacity={isWorkoutRunning ? 0.5 : 1}
            disabled={isWorkoutRunning}
            onPress={handleStartWorkout}
            pressStyle={{ opacity: 0.85 }}
            bg={isWorkoutRunning ? '$backgroundHover' : '$primary'}
          >
            <Play
              size="$icon"
              color={isWorkoutRunning ? '$colorSubtle' : '$onPrimary'}
              aria-hidden
            />
            <Text
              fontSize="$caption"
              fontWeight="700"
              color={isWorkoutRunning ? '$colorSubtle' : '$onPrimary'}
              shrink={1}
            >
              {isWorkoutRunning ? 'Workout in Progress' : 'Start workout'}
            </Text>
          </Button>
        </YStack>
      </YStack>
    </Card>
  )
})
