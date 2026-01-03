import React, { useMemo } from 'react'
import { YStack, XStack, Text, Card, Circle } from 'tamagui'
import { Calendar, Clock, Zap, Check, Circle as CircleIcon } from '@tamagui/lucide-icons'
import { useActiveRoutine } from 'hooks/useActiveRoutine'
import { useWorkouts } from 'hooks/useWorkouts'
import { useAuth } from 'contexts/AuthContext'
import type { Routine, RoutinePatternItem } from 'types/routine'
import type { ApiWorkout } from 'types/api'
import { router } from 'expo-router'
import { routinePatternIndex } from 'utils/date'

// ============================================================================
// Shared Components
// ============================================================================

interface TodayHeaderProps {
  todayFormatted: string
}

const TodayHeader: React.FC<TodayHeaderProps> = ({ todayFormatted }) => (
  <XStack justify="space-between" items="center">
    <Text fontSize="$5" fontWeight="700" color="$color">
      Today
    </Text>
    <XStack items="center" gap="$2">
      <Calendar size={16} color="$colorSubtle" />
      <Text fontSize="$3" color="$colorSubtle" fontWeight="500">
        {todayFormatted}
      </Text>
    </XStack>
  </XStack>
)

const RestDayView: React.FC = () => (
  <YStack gap="$3">
    <XStack items="center" gap="$3">
      <XStack width={36} height={36} bg="$green8" rounded="$3" items="center" justify="center">
        <Zap size={18} color="white" />
      </XStack>
      <YStack flex={1}>
        <Text fontSize="$4" fontWeight="600" color="$color">
          Take a well-deserved break
        </Text>
        <Text fontSize="$2" color="$colorSubtle">
          Recovery is just as important as training
        </Text>
      </YStack>
    </XStack>
  </YStack>
)

const NoActiveRoutineView: React.FC = () => (
  <YStack gap="$3">
    <Text fontSize="$5" fontWeight="700" color="$color">
      No active routine
    </Text>
    <Text fontSize="$3" color="$color10">
      Create or select a routine to see your plan for today.
    </Text>
  </YStack>
)

// ============================================================================
// Sequential Today View
// ============================================================================

interface WorkoutCardProps {
  workout: ApiWorkout
  onPress: () => void
}

const WorkoutCard: React.FC<WorkoutCardProps> = ({ workout, onPress }) => {
  const exercises = workout.workoutTemplate.exercises.length

  return (
    <XStack borderWidth="$1" rounded="$5" borderColor="$primary">
      <XStack
        m="$3"
        items="center"
        gap="$3"
        flex={1}
        pressStyle={{ scale: 0.96, opacity: 0.8 }}
        animation="quick"
        cursor="pointer"
        onPress={onPress}
      >
        <XStack
          width={36}
          height={36}
          bg="$primary"
          rounded="$3"
          items="center"
          justify="center"
          animation="quick"
          pressStyle={{ scale: 0.9 }}
        >
          <Clock size={18} color="white" />
        </XStack>
        <YStack flex={1}>
          <Text fontSize="$5" fontWeight="700" color="$color">
            {workout.title}
          </Text>
          <Text fontSize="$2" color="$colorSubtle" fontWeight="500">
            {exercises} exercises
          </Text>
        </YStack>
      </XStack>
    </XStack>
  )
}

interface SequentialTodayViewProps {
  routine: Routine
  workouts: ApiWorkout[]
  todayFormatted: string
}

const SequentialTodayView: React.FC<SequentialTodayViewProps> = ({
  routine,
  workouts,
  todayFormatted,
}) => {
  const currentDate = new Date()

  const todayInfo = useMemo(() => {
    if (!routine.pattern || routine.pattern.length === 0) {
      return { isWorkoutDay: false, workout: null as ApiWorkout | null }
    }

    const len = routine.pattern.length
    const idx = routinePatternIndex(routine.startDate, len, currentDate)
    const pat: RoutinePatternItem | undefined = routine.pattern[idx]

    if (!pat || pat.dayType !== 'WORKOUT' || !pat.workoutId) {
      return { isWorkoutDay: false, workout: null }
    }
    const workout = workouts.find((w) => w.id === pat.workoutId) || null
    return { isWorkoutDay: !!workout, workout }
  }, [routine, workouts])

  return (
    <YStack gap="$3">
      <TodayHeader todayFormatted={todayFormatted} />
      <Card
        bg="$surface"
        borderColor="$borderColor"
        borderWidth={1}
        rounded="$4"
        p="$4"
        elevation={2}
        animation="quick"
        pressStyle={{ scale: 0.995 }}
        hoverStyle={{ elevation: 4 }}
      >
        <YStack gap="$4">
          <YStack gap="$3">
            <XStack justify="space-between" items="center">
              <Text
                fontSize="$3"
                color="$colorSubtle"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                {todayInfo.isWorkoutDay ? "Today's Workout" : 'Rest Day'}
              </Text>
              <Text
                fontSize="$2"
                color={todayInfo.isWorkoutDay ? '$primary' : '$green8'}
                fontWeight="600"
                textTransform="uppercase"
              >
                {todayInfo.isWorkoutDay ? 'Active' : 'Recovery'}
              </Text>
            </XStack>

            {todayInfo.isWorkoutDay && todayInfo.workout ? (
              <WorkoutCard
                workout={todayInfo.workout}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/(workouts)',
                    params: { focusId: todayInfo.workout!.id },
                  })
                }
              />
            ) : (
              <RestDayView />
            )}
          </YStack>
        </YStack>
      </Card>
    </YStack>
  )
}

// ============================================================================
// Weekly Completion Today View
// ============================================================================

interface WorkoutChecklistItemProps {
  workout: ApiWorkout
  isCompleted: boolean
  onPress: () => void
}

const WorkoutChecklistItem: React.FC<WorkoutChecklistItemProps> = ({
  workout,
  isCompleted,
  onPress,
}) => (
  <XStack
    bg={isCompleted ? '$green3' : '$surface'}
    borderColor={isCompleted ? '$green8' : '$primary'}
    borderWidth={1}
    rounded="$4"
    p="$3"
    gap="$3"
    items="center"
    pressStyle={{ scale: 0.98, opacity: 0.8 }}
    animation="quick"
    cursor="pointer"
    onPress={onPress}
  >
    <Circle
      size={28}
      bg={isCompleted ? '$green9' : 'transparent'}
      borderColor={isCompleted ? '$green9' : '$color8'}
      borderWidth={2}
      items="center"
      justify="center"
    >
      {isCompleted ? (
        <Check size={16} color="white" />
      ) : (
        <CircleIcon size={16} color="$color8" />
      )}
    </Circle>
    <YStack flex={1}>
      <Text
        fontSize="$4"
        fontWeight="600"
        color={isCompleted ? '$green11' : '$color'}
        textDecorationLine={isCompleted ? 'line-through' : 'none'}
      >
        {workout.title}
      </Text>
      <Text fontSize="$2" color="$colorSubtle">
        {workout.workoutTemplate.exercises.length} exercises
      </Text>
    </YStack>
  </XStack>
)

interface WeeklyCompletionTodayViewProps {
  routine: Routine
  workouts: ApiWorkout[]
  todayFormatted: string
  completedWorkoutIds: string[]
}

const WeeklyCompletionTodayView: React.FC<WeeklyCompletionTodayViewProps> = ({
  routine,
  workouts,
  todayFormatted,
  completedWorkoutIds,
}) => {
  // Get unique workouts from the pattern, excluding completed ones
  const weeklyWorkouts = useMemo(() => {
    const workoutIds = new Set<string>()
    routine.pattern.forEach((p) => {
      if (p.dayType === 'WORKOUT' && p.workoutId) {
        workoutIds.add(p.workoutId)
      }
    })

    return Array.from(workoutIds)
      .filter((id) => !completedWorkoutIds.includes(id))
      .map((id) => workouts.find((w) => w.id === id))
      .filter((w): w is ApiWorkout => w !== null)
  }, [routine.pattern, workouts, completedWorkoutIds])

  const totalWorkouts = new Set(
    routine.pattern
      .filter((p) => p.dayType === 'WORKOUT' && p.workoutId)
      .map((p) => p.workoutId)
  ).size
  const completedCount = completedWorkoutIds.length
  const allComplete = weeklyWorkouts.length === 0

  return (
    <YStack gap="$3">
      <TodayHeader todayFormatted={todayFormatted} />
      <Card
        bg="$surface"
        borderColor="$borderColor"
        borderWidth={1}
        rounded="$4"
        p="$4"
        elevation={2}
        animation="quick"
        pressStyle={{ scale: 0.995 }}
        hoverStyle={{ elevation: 4 }}
      >
        <YStack gap="$4">
          <YStack gap="$3">
            <XStack justify="space-between" items="center">
              <Text
                fontSize="$3"
                color="$colorSubtle"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                {allComplete ? 'All Done!' : 'Choose Your Workout'}
              </Text>
              <Text fontSize="$2" color="$primary" fontWeight="600" textTransform="uppercase">
                {completedCount}/{totalWorkouts} done
              </Text>
            </XStack>

            {allComplete ? (
              <YStack gap="$2" items="center" py="$2">
                <Text fontSize="$4" fontWeight="600" color="$green10">
                  🎉 Week complete!
                </Text>
                <Text fontSize="$2" color="$color10">
                  Great job! You've finished all workouts for this week.
                </Text>
              </YStack>
            ) : (
              <YStack gap="$2">
                <Text fontSize="$2" color="$color10">
                  {weeklyWorkouts.length} remaining this week:
                </Text>
                {weeklyWorkouts.slice(0, 3).map((workout) => (
                  <WorkoutChecklistItem
                    key={workout.id}
                    workout={workout}
                    isCompleted={false}
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/(workouts)',
                        params: { focusId: workout.id },
                      })
                    }
                  />
                ))}
                {weeklyWorkouts.length > 3 && (
                  <Text fontSize="$2" color="$color10" style={{ textAlign: 'center' }}>
                    +{weeklyWorkouts.length - 3} more workouts
                  </Text>
                )}
              </YStack>
            )}
          </YStack>
        </YStack>
      </Card>
    </YStack>
  )
}

// ============================================================================
// Main Wrapper Component
// ============================================================================

export const TodayView: React.FC = () => {
  const { activeRoutine } = useActiveRoutine()
  const { workouts } = useWorkouts()
  const { user } = useAuth()

  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }, [])

  // Get completed workout IDs from user's streak data
  const completedWorkoutIds = user?.streak?.weeklyCompletedWorkoutIds ?? []

  // No active routine
  if (!activeRoutine) {
    return (
      <YStack gap="$3">
        <TodayHeader todayFormatted={todayFormatted} />
        <Card
          bg="$surface"
          borderColor="$borderColor"
          borderWidth={1}
          rounded="$4"
          p="$4"
          elevation={2}
          animation="quick"
          pressStyle={{ scale: 0.995 }}
          hoverStyle={{ elevation: 4 }}
        >
          <NoActiveRoutineView />
        </Card>
      </YStack>
    )
  }

  // Determine routine type and render appropriate view
  const routineType = activeRoutine.routineType ?? 'SEQUENTIAL'

  if (routineType === 'WEEKLY_COMPLETION') {
    return (
      <WeeklyCompletionTodayView
        routine={activeRoutine}
        workouts={workouts}
        todayFormatted={todayFormatted}
        completedWorkoutIds={completedWorkoutIds}
      />
    )
  }

  return (
    <SequentialTodayView
      routine={activeRoutine}
      workouts={workouts}
      todayFormatted={todayFormatted}
    />
  )
}
