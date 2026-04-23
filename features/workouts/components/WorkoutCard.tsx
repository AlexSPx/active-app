import { YStack, XStack, Text, Card, Button, Portal } from 'tamagui'
import { MoreHorizontal, Edit3, Trash2, Clock, Dumbbell, Play } from '@tamagui/lucide-icons'
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

export const WorkoutCard = memo(
  function WorkoutCard({
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
      haptics.medium()
      onStartWorkout(workout)
    }, [onStartWorkout, workout])

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
        borderRadius={20}
        p={0}
        overflow="hidden"
        pressStyle={{ scale: 0.99, opacity: 0.96 }}
        onPress={onPress ? () => onPress(workout) : undefined}
      >
        <YStack>
          {isInRoutine && <YStack height={3} bg="$secondary" />}
          <YStack p={20} gap={16}>
            <XStack justify="space-between" items="flex-start" gap="$3">
              <YStack flex={1} gap="$1">
                <Text
                  fontSize={11}
                  fontWeight="600"
                  letterSpacing={isInRoutine ? 0.2 : 1}
                  textTransform={isInRoutine ? 'none' : 'uppercase'}
                  color={isInRoutine ? '$secondary' : '$colorMuted'}
                >
                  {summary.topLabel} · {workout.workoutTemplate.exercises.length} exercises
                </Text>
                <Text fontSize={21} lineHeight={25} fontWeight="700" color="$color">
                  {workout.title}
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
                        width={28}
                        height={28}
                        bg="$backgroundStrong"
                        justify="center"
                        items="center"
                        pressStyle={{ opacity: 0.85 }}
                        style={{ borderRadius: 8 }}
                      >
                        <MoreHorizontal size={14} color="$colorMuted" />
                      </Button>
                    </Popover.Trigger>
                    <Popover.Content
                      p="$2"
                      bg="$surface"
                      borderColor="$borderColor"
                      borderWidth={1}
                      elevate
                    >
                      <YStack width={160} gap="$1">
                        {onEdit && (
                          <Popover.Close asChild>
                            <Button size="$3" chromeless onPress={() => onEdit?.(workout)}>
                              <XStack items="center" gap="$2" justify="flex-start" width="100%">
                                <Edit3 size={14} color="$color" />
                                <Text color="$color">Edit</Text>
                              </XStack>
                            </Button>
                          </Popover.Close>
                        )}
                        {onDelete && (
                          <Popover.Close asChild>
                            <Button size="$3" chromeless onPress={() => onDelete?.(workout.id)}>
                              <XStack items="center" gap="$2" justify="flex-start" width="100%">
                                <Trash2 size={14} color="$red10" />
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

            <XStack gap={18} items="center">
              <XStack items="center" gap={5}>
                <Clock size={13} color="$colorMuted" />
                <Text fontSize={13} color="$colorMuted">
                  <Text color="$color" fontWeight="600">
                    ~{summary.approxMinutes} min
                  </Text>
                </Text>
              </XStack>
              <XStack items="center" gap={5}>
                <Dumbbell size={13} color="$colorMuted" />
                <Text fontSize={13} color="$colorMuted">
                  <Text color="$color" fontWeight="600">
                    {summary.totalSets}
                  </Text>{' '}
                  sets
                </Text>
              </XStack>
            </XStack>

            <XStack flexWrap="wrap" gap={6}>
              {summary.visibleExercises.map((exerciseName, index) => (
                <XStack
                  key={`${workout.id}-${exerciseName}-${index}`}
                  py={5}
                  px={11}
                  bg="$backgroundStrong"
                  borderColor="$borderColor"
                  borderWidth={1}
                  style={{ borderRadius: 8 }}
                >
                  <Text fontSize={12} color="$colorSubtle">
                    {exerciseName}
                  </Text>
                </XStack>
              ))}
              {summary.hiddenCount > 0 && (
                <XStack py={5} px={4}>
                  <Text fontSize={12} color="$colorMuted">
                    +{summary.hiddenCount}
                  </Text>
                </XStack>
              )}
            </XStack>

            <Button
              unstyled
              width="100%"
              py={14}
              justify="center"
              items="center"
              opacity={isWorkoutRunning ? 0.6 : 1}
              disabled={isWorkoutRunning}
              onPress={handleStartWorkout}
              pressStyle={{ opacity: 0.88 }}
              style={{
                borderRadius: 12,
              }}
              bg={isWorkoutRunning ? '$secondary' : '$primary'}
            >
              <XStack items="center" gap={8}>
                <XStack
                  width={30}
                  height={30}
                  justify="center"
                  items="center"
                  style={{ borderRadius: 999 }}
                >
                  <Play
                    size={20}
                    color={isWorkoutRunning ? '$color' : '$onSecondary'}
                    fill={isWorkoutRunning ? '$color' : '$onSecondary'}
                  />
                </XStack>
                <Text
                  fontSize={14}
                  fontWeight="600"
                  color={isWorkoutRunning ? '$color' : '$onSecondary'}
                >
                  {isWorkoutRunning ? 'Workout in Progress' : 'Start workout'}
                </Text>
              </XStack>
            </Button>
          </YStack>
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
      prevProps.workout.workoutTemplate.exercises.every(
        (exercise, index) =>
          exercise.exerciseTitle ===
          nextProps.workout.workoutTemplate.exercises[index]?.exerciseTitle
      ) &&
      prevProps.routineName === nextProps.routineName &&
      prevProps.isWorkoutRunning === nextProps.isWorkoutRunning
    )
  }
)
