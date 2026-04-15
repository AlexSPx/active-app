import React, { useCallback, useMemo } from 'react'
import { YStack, XStack, Text, Circle, Button } from 'tamagui'
import { Check, Circle as CircleIcon } from '@tamagui/lucide-icons'
import type { Routine, RoutinePatternItem } from 'types/routine'
import type { ApiWorkout } from 'types/api'
import { useWorkouts } from '../features/workouts'
import { useActiveRoutine } from '../features/routines'
import { router } from 'expo-router'
import { routinePatternIndex } from '../utils/date'
import { useAuth } from 'contexts/AuthContext'

// ============================================================================
// Shared Components
// ============================================================================

interface WeekHeaderProps {
  weekRange: string
}

const WeekHeader: React.FC<WeekHeaderProps> = ({ weekRange }) => (
  <XStack justify="space-between" items="center">
    <Text fontSize="$5" fontWeight="700" color="$color">
      This Week
    </Text>
    <Text fontSize="$3" color="$colorSubtle" fontWeight="500">
      {weekRange}
    </Text>
  </XStack>
)

// ============================================================================
// Sequential Week View (Calendar-based)
// ============================================================================

interface DayViewProps {
  day: string
  date: number
  isToday?: boolean
  hasWorkout?: boolean
  label?: string
}

const DayView: React.FC<DayViewProps> = ({
  day,
  date,
  isToday = false,
  hasWorkout = false,
  label,
}) => (
  <YStack items="center" gap="$2" flex={1}>
    <Text
      fontSize="$2"
      color={isToday ? '$primary' : '$colorSubtle'}
      fontWeight={isToday ? 900 : 400}
      textTransform="uppercase"
      letterSpacing={0.5}
    >
      {day}
    </Text>
    <YStack items="center" gap="$1">
      <Circle
        size={42}
        bg={isToday ? '$primary' : hasWorkout ? '$success' : 'transparent'}
        borderColor={isToday ? '$primary' : hasWorkout ? '$success' : '$borderColor'}
        borderWidth={isToday || hasWorkout ? 2 : 1}
        items="center"
        justify="center"
        pressStyle={{ scale: 0.96 }}
        hoverStyle={{ opacity: 0.8 }}
      >
        <Text
          fontSize="$4"
          fontWeight="600"
          color={isToday || hasWorkout ? '$onPrimary' : '$color'}
        >
          {date}
        </Text>
      </Circle>
    </YStack>
    {label ? (
      <Text fontSize="$2" color="$color10" numberOfLines={1}>
        {label}
      </Text>
    ) : null}
  </YStack>
)

interface SequentialWeekViewProps {
  routine: Routine
  workouts: ApiWorkout[]
  weekRange: string
}

const SequentialWeekView: React.FC<SequentialWeekViewProps> = ({
  routine,
  workouts,
  weekRange,
}) => {
  const today = new Date()
  const currentDate = today.getDate()

  // Calculate the start of the current week (Monday)
  const startOfWeek = useMemo(() => {
    const start = new Date(today)
    const dayOfWeek = today.getDay()
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    start.setDate(today.getDate() - diff)
    return start
  }, [])

  const mapDateToPattern = useCallback(
    (date: Date): RoutinePatternItem | null => {
      if (!routine.pattern || routine.pattern.length === 0) return null
      const len = routine.pattern.length
      const idx = routinePatternIndex(routine.startDate, len, date)
      return routine.pattern[idx]
    },
    [routine]
  )

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const weekData = weekDays.map((day, index) => {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + index)

    const pat = mapDateToPattern(date)
    const isWorkout = pat?.dayType === 'WORKOUT'
    const workoutTitle = isWorkout
      ? (workouts.find((w) => w.id === pat?.workoutId)?.title ?? 'Workout')
      : 'Rest'

    return {
      day,
      date: date.getDate(),
      isToday: date.getDate() === currentDate && date.getMonth() === today.getMonth(),
      hasWorkout: isWorkout,
      label: workoutTitle,
    }
  })

  return (
    <YStack gap="$3">
      <WeekHeader weekRange={weekRange} />
      <XStack
        bg="$surface"
        borderColor="$borderColor"
        borderWidth={1}
        rounded="$4"
        p="$4"
        gap="$1"
        elevation={2}
      >
        {weekData.map((dayData, index) => (
          <DayView
            key={index}
            day={dayData.day}
            date={dayData.date}
            isToday={dayData.isToday}
            hasWorkout={dayData.hasWorkout}
            label={dayData.label}
          />
        ))}
      </XStack>
    </YStack>
  )
}

// ============================================================================
// Weekly Completion View (Checklist-based)
// ============================================================================

interface WorkoutChecklistItemProps {
  workoutId: string
  workoutTitle: string
  isCompleted: boolean
  onPress?: () => void
}

const WorkoutChecklistItem: React.FC<WorkoutChecklistItemProps> = ({
  workoutId,
  workoutTitle,
  isCompleted,
  onPress,
}) => (
  <XStack
    bg={isCompleted ? '$green3' : '$surface'}
    borderColor={isCompleted ? '$green8' : '$borderColor'}
    borderWidth={1}
    rounded="$4"
    p="$3"
    gap="$3"
    items="center"
    pressStyle={{ scale: 0.98, opacity: 0.8 }}
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
    <Text
      flex={1}
      fontSize="$4"
      fontWeight="500"
      color={isCompleted ? '$green11' : '$color'}
      textDecorationLine={isCompleted ? 'line-through' : 'none'}
    >
      {workoutTitle}
    </Text>
  </XStack>
)

interface WeeklyCompletionViewProps {
  routine: Routine
  workouts: ApiWorkout[]
  weekRange: string
}

const WeeklyCompletionView: React.FC<WeeklyCompletionViewProps> = ({
  routine,
  workouts,
  weekRange,
}) => {

  const { user } = useAuth()

  // Get unique workouts from the pattern
  const weeklyWorkouts = useMemo(() => {
    const workoutIds = new Set<string>()
    routine.pattern.forEach((p) => {
      if (p.dayType === 'WORKOUT' && p.workoutId) {
        workoutIds.add(p.workoutId)
      }
    })

    return Array.from(workoutIds).map((id) => {
      const workout = workouts.find((w) => w.id === id)
      return {
        id,
        title: workout?.title ?? 'Unknown Workout',
        isCompleted: user?.streak?.weeklyCompletedWorkoutIds?.includes(id) ?? false,
      }
    })
  }, [routine.pattern, workouts])

  const completedCount = weeklyWorkouts.filter((w) => w.isCompleted).length

  return (
    <YStack gap="$3">
      <WeekHeader weekRange={weekRange} />
      <YStack
        bg="$surface"
        borderColor="$borderColor"
        borderWidth={1}
        rounded="$4"
        p="$4"
        gap="$3"
        elevation={2}
      >
        <XStack justify="space-between" items="center">
          <Text fontSize="$3" color="$colorSubtle" fontWeight="600" textTransform="uppercase">
            Complete any order
          </Text>
          <Text fontSize="$3" color="$primary" fontWeight="700">
            {completedCount}/{weeklyWorkouts.length}
          </Text>
        </XStack>
        <YStack gap="$2">
          {weeklyWorkouts.map((workout) => (
            <WorkoutChecklistItem
              key={workout?.id}
              workoutId={workout?.id}
              workoutTitle={workout?.title}
              isCompleted={workout?.isCompleted}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/(workouts)',
                  params: { focusId: workout?.id },
                })
              }
            />
          ))}
        </YStack>
      </YStack>
    </YStack>
  )
}

// ============================================================================
// No Active Routine View
// ============================================================================

const NoActiveRoutineView: React.FC<{ weekRange: string }> = ({ weekRange }) => (
  <YStack gap="$3">
    <WeekHeader weekRange={weekRange} />
    <XStack
      bg="$surface"
      borderColor="$borderColor"
      borderWidth={1}
      rounded="$4"
      p="$4"
      gap="$1"
      elevation={2}
      opacity={0.45}
      pointerEvents="none"
    >
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => (
        <DayView key={index} day={day} date={index + 1} />
      ))}
    </XStack>
    <YStack
      mt="$3"
      bg="$surface"
      borderColor="$borderColor"
      borderWidth={1}
      rounded="$6"
      p="$4"
      gap="$3"
    >
      <Text fontSize="$5" fontWeight="700" color="$color">
        No active routine
      </Text>
      <Text fontSize="$3" color="$color10">
        Create or select a routine to see your week at a glance.
      </Text>
      <XStack gap="$2" justify="center">
        <Button bg="$primary" onPress={() => router.push('/routines/new')}>
          <Text>Create Routine</Text>
        </Button>
        <Button variant="outlined" onPress={() => router.push('/(tabs)/(workouts)/routines')}>
          <Text>Manage Routines</Text>
        </Button>
      </XStack>
    </YStack>
  </YStack>
)

// ============================================================================
// Loading View
// ============================================================================

const LoadingWeekView: React.FC = () => (
  <YStack gap="$3" opacity={0.5}>
    <XStack justify="space-between" items="center">
      <Text fontSize="$5" fontWeight="700" color="$color">
        This Week
      </Text>
    </XStack>
    <XStack
      bg="$surface"
      borderColor="$borderColor"
      borderWidth={1}
      rounded="$4"
      p="$4"
      gap="$1"
      height={100}
      items="center"
      justify="center"
    >
      <Text color="$color11">Loading schedule...</Text>
    </XStack>
  </YStack>
)

// ============================================================================
// Main Wrapper Component
// ============================================================================

export const WeeklyView: React.FC = () => {
  const { workouts } = useWorkouts()
  const { activeRoutine, loading, error } = useActiveRoutine()

  // Calculate week range for display
  const weekRange = useMemo(() => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1

    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - diff)

    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)

    const startMonth = startOfWeek.toLocaleDateString('en-US', { month: 'short' })
    const endMonth = endOfWeek.toLocaleDateString('en-US', { month: 'short' })
    const startDay = startOfWeek.getDate()
    const endDay = endOfWeek.getDate()

    return startMonth === endMonth
      ? `${startMonth} ${startDay} - ${endDay}`
      : `${startMonth} ${startDay} - ${endMonth} ${endDay}`
  }, [])

  // Loading state
  if (loading && !activeRoutine) {
    return <LoadingWeekView />
  }

  // No active routine
  if (!activeRoutine) {
    return (
      <YStack gap="$3">
        <NoActiveRoutineView weekRange={weekRange} />
        {error && (
          <Text color="$red10" fontSize="$3">
            {error}
          </Text>
        )}
      </YStack>
    )
  }

  // Determine routine type and render appropriate view
  const routineType = activeRoutine.routineType ?? 'SEQUENTIAL'

  return (
    <YStack gap="$3">
      {routineType === 'WEEKLY_COMPLETION' ? (
        <WeeklyCompletionView
          routine={activeRoutine}
          workouts={workouts}
          weekRange={weekRange}
        />
      ) : (
        <SequentialWeekView
          routine={activeRoutine}
          workouts={workouts}
          weekRange={weekRange}
        />
      )}
      {error && (
        <Text color="$red10" fontSize="$3">
          {error}
        </Text>
      )}
    </YStack>
  )
}
