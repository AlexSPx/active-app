import React from 'react'
import { YStack, XStack, Text, Button } from 'tamagui'
import { Check, ArrowRight } from '@tamagui/lucide-icons'
import { useWorkouts } from '../features/workouts'
import { useActiveRoutine } from '../features/routines'
import { router } from 'expo-router'
import { routinePatternIndex, sameDay, startOfWeek, formatWeekRange } from '../utils/date'
import { useAuth } from '../contexts/AuthContext'

interface WeeklyViewProps {
  selectedDate: Date
  onSelectDate: (date: Date) => void
  inactive?: boolean
}

export const WeeklyView: React.FC<WeeklyViewProps> = ({
  selectedDate,
  onSelectDate,
  inactive = false,
}) => {
  const { workouts } = useWorkouts()
  const { activeRoutine, loading, error } = useActiveRoutine()
  const { user } = useAuth()
  const today = new Date()
  const monday = startOfWeek(today)
  const routine = inactive ? null : activeRoutine
  const flexible = routine?.routineType === 'WEEKLY_COMPLETION'
  const workoutIds = [
    ...new Set(
      routine?.pattern
        .filter((day) => day.dayType === 'WORKOUT' && day.workoutId)
        .map((day) => day.workoutId!) ?? []
    ),
  ]
  const completed = user?.streak?.weeklyCompletedWorkoutIds ?? []

  return (
    <YStack gap="$field">
      <Text fontSize="$screenTitle" lineHeight="$screenTitle" fontWeight="600">
        Your training week
      </Text>
      <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
        {routine?.name ?? 'No routine'} · {formatWeekRange(today)}
      </Text>
      {loading && !activeRoutine ? (
        <Text color="$colorSubtle">Loading schedule...</Text>
      ) : flexible ? (
        <YStack gap="$field">
          <XStack justify="space-between" items="center">
            <Text fontSize="$caption" color="$colorSubtle">
              Any order · Monday–Sunday
            </Text>
            <Text fontSize="$caption" color="$primary">
              {workoutIds.filter((id) => completed.includes(id)).length}/{workoutIds.length} done
            </Text>
          </XStack>
          {workoutIds.map((id) => {
            const workout = workouts.find((item) => item.id === id)
            const done = completed.includes(id)
            return (
              <Button
                key={id}
                unstyled
                minH="$action"
                py="$field"
                flexDirection="row"
                items="center"
                gap="$field"
                borderBottomWidth={1}
                borderColor="$borderColor"
                accessibilityRole="button"
                accessibilityLabel={`View workout ${workout?.title ?? 'Unavailable workout'}${done ? ', completed' : ''}`}
                disabled={!workout}
                onPress={() =>
                  router.push({ pathname: '/(tabs)/(workouts)', params: { focusId: id } })
                }
              >
                {done && <Check size="$iconSmall" color="$primary" aria-hidden />}
                <Text flex={1} fontSize="$exerciseTitle" fontWeight="600">
                  {workout?.title ?? 'Unavailable workout'}
                </Text>
                <Text color="$colorSubtle" fontSize="$caption">
                  {done ? 'Completed' : 'Remaining'}
                </Text>
                <ArrowRight size="$iconSmall" color="$primary" aria-hidden />
              </Button>
            )
          })}
          {workoutIds.length > 0 && workoutIds.every((id) => completed.includes(id)) && (
            <Text color="$colorSubtle" fontSize="$caption">
              All scheduled workouts are complete.
            </Text>
          )}
        </YStack>
      ) : (
        <XStack width="100%" gap="$compact" items="stretch">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
            const date = new Date(monday)
            date.setDate(monday.getDate() + index)
            const pattern =
              routine?.pattern[routinePatternIndex(routine.startDate, routine.pattern.length, date)]
            const training = pattern?.dayType === 'WORKOUT'
            const workout = workouts.find((item) => item.id === pattern?.workoutId)
            const selected = !!routine && sameDay(date, selectedDate)
            return (
              <YStack
                key={day}
                flex={1}
                minW={0}
                bg={selected ? '$backgroundAccent' : '$backgroundHover'}
                rounded="$day"
                overflow="hidden"
                borderWidth={1}
                borderColor={selected ? '$primary' : '$backgroundTransparent'}
                accessibilityRole={routine ? 'button' : undefined}
                accessibilityLabel={`${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${routine ? `, ${training ? `scheduled workout: ${workout?.title ?? 'Unavailable workout'}` : 'rest day'}` : ''}`}
                accessibilityState={{ selected, disabled: !routine }}
                onPress={routine ? () => onSelectDate(date) : undefined}
              >
                <YStack items="center" py="$compact" borderBottomWidth={1} borderColor="$surface">
                  <Text fontSize="$1" color={sameDay(date, today) ? '$primary' : '$colorSubtle'}>
                    {day}
                  </Text>
                  <Text fontSize="$caption" lineHeight="$caption">
                    {date.getDate()}
                  </Text>
                </YStack>
                <YStack height="$day" py="$field" px="$compact" items="stretch" justify="center">
                  {training ? (
                    <YStack
                      flex={1}
                      bg={selected ? '$primary' : '$trainingMuted'}
                      rounded="$block"
                      justify="center"
                      items="center"
                      overflow="hidden"
                    >
                      <Text
                        position="absolute"
                        width="$6"
                        rotate="-90deg"
                        fontSize="$boardLabel"
                        lineHeight="$boardLabel"
                        color={selected ? '$onPrimary' : '$onTrainingMuted'}
                        text="center"
                        numberOfLines={2}
                      >
                        {workout?.title ?? 'Workout'}
                      </Text>
                    </YStack>
                  ) : (
                    <Text color="$colorMuted" text="center">
                      —
                    </Text>
                  )}
                </YStack>
              </YStack>
            )
          })}
        </XStack>
      )}
      {error && (
        <Text color="$destructive" fontSize="$caption">
          {error}
        </Text>
      )}
    </YStack>
  )
}
