import React, { useCallback } from 'react'
import { YStack, XStack, Text, Circle, Button } from 'tamagui'
import type { RoutinePatternItem } from 'types/routine'
import { useWorkouts } from 'hooks/useWorkouts'
import { useActiveRoutine } from 'hooks/useActiveRoutine'
import { router } from 'expo-router'
import { routinePatternIndex } from '../utils/date'

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
}) => {
  return (
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
}

export const WeeklyView: React.FC = () => {
  const { workouts } = useWorkouts()
  const { activeRoutine, loading, error } = useActiveRoutine()

  // Get current date
  const today = new Date()
  const currentDate = today.getDate()

  // Calculate the start of the current week (Monday)
  const startOfWeek = new Date(today)
  const dayOfWeek = today.getDay()
  // If today is Sunday (0), subtract 6 days. Otherwise subtract dayOfWeek - 1
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  startOfWeek.setDate(today.getDate() - diff)

  // Calculate end of week for display
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)

  // Format week range
  const formatWeekRange = () => {
    const startMonth = startOfWeek.toLocaleDateString('en-US', { month: 'short' })
    const endMonth = endOfWeek.toLocaleDateString('en-US', { month: 'short' })
    const startDay = startOfWeek.getDate()
    const endDay = endOfWeek.getDate()

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}`
    } else {
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}`
    }
  }

  // Helper: map a date (within the displayed week) to a routine pattern item, cycling through the pattern.
  const mapDateToPattern = useCallback(
    (date: Date): RoutinePatternItem | null => {
      if (!activeRoutine || !activeRoutine.pattern || activeRoutine.pattern.length === 0)
        return null
      const len = activeRoutine.pattern.length

      const idx = routinePatternIndex(activeRoutine.createdAt, len, date)
      return activeRoutine.pattern[idx]
    },
    [activeRoutine]
  )

  // Generate week days
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
      label: activeRoutine ? workoutTitle : undefined,
    }
  })

  const isInactive = !activeRoutine && !loading && !error

  if (loading && !activeRoutine) {
    return (
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
  }

  return (
    <YStack gap="$3">
      <XStack justify="space-between" items="center">
        <Text fontSize="$5" fontWeight="700" color="$color">
          This Week
        </Text>
        <Text fontSize="$3" color="$colorSubtle" fontWeight="500">
          {formatWeekRange()}
        </Text>
      </XStack>

      <XStack
        bg="$surface"
        borderColor="$borderColor"
        borderWidth={1}
        rounded="$4"
        p="$4"
        gap="$1"
        elevation={2}
        opacity={isInactive ? 0.45 : 1}
        pointerEvents={isInactive ? 'none' : 'auto'}
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
      {isInactive && (
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
      )}
      {error && (
        <Text color="$red10" fontSize="$3">
          {error}
        </Text>
      )}
    </YStack>
  )
}
