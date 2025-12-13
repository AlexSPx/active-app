import React, { useMemo } from 'react'
import { YStack, XStack, Text, Card } from 'tamagui'
import { Calendar, Clock, Zap } from '@tamagui/lucide-icons'
import { useActiveRoutine } from 'hooks/useActiveRoutine'
import { useWorkouts } from 'hooks/useWorkouts'
import type { RoutinePatternItem } from 'types/routine'
import type { ApiWorkout } from 'types/api'
import { router } from 'expo-router'
import { routinePatternIndex } from 'utils/date'

export const TodayView: React.FC = () => {
  const currentDate = new Date()
  const todayFormatted = currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const { activeRoutine } = useActiveRoutine()
  const { workouts } = useWorkouts()

  const todayInfo = useMemo(() => {
    if (!activeRoutine || !activeRoutine.pattern || activeRoutine.pattern.length === 0) {
      return { isWorkoutDay: false, workout: null as ApiWorkout | null }
    }
    const len = activeRoutine.pattern.length

    const idx = routinePatternIndex(activeRoutine.startDate, len, currentDate)
    const pat: RoutinePatternItem | undefined = activeRoutine.pattern[idx]
    
    if (!pat || pat.dayType !== 'WORKOUT' || !pat.workoutId) {
      return { isWorkoutDay: false, workout: null }
    }
    const workout = workouts.find((w) => w.id === pat.workoutId) || null
    return { isWorkoutDay: !!workout, workout }
  }, [activeRoutine, currentDate, workouts])

  return (
    <YStack gap="$3">
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
        {activeRoutine ? (
          <YStack gap="$4">
            {/* Today's Activity Type */}
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

              {todayInfo.isWorkoutDay ? (
                <TodayStat
                  workout={todayInfo.workout}
                  onOpenWorkouts={() =>
                    todayInfo.workout &&
                    router.push({
                      pathname: '/(tabs)/(workouts)',
                      params: { focusId: todayInfo.workout.id },
                    })
                  }
                />
              ) : (
                <RestDayView />
              )}
            </YStack>
          </YStack>
        ) : (
          <YStack gap="$3">
            <Text fontSize="$5" fontWeight="700" color="$color">
              No active routine
            </Text>
            <Text fontSize="$3" color="$color10">
              Create or select a routine to see your plan for today.
            </Text>
          </YStack>
        )}
      </Card>
    </YStack>
  )
}

const RestDayView = () => {
  return (
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
}

interface TodayStatsProps {
  workout: ApiWorkout | null
  onOpenWorkouts: () => void
}

const TodayStat: React.FC<TodayStatsProps> = ({ workout, onOpenWorkouts }) => {
  if (!workout) return null
  const exercises = workout.workoutTemplate.exercises.length
  // Duration is not present on ApiWorkout; keep it as count-based summary for now
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
        onPress={onOpenWorkouts}
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
