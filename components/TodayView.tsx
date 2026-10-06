import React from 'react'
import { YStack, XStack, Text, Button } from 'tamagui'
import { ArrowRight } from '@tamagui/lucide-icons'
import { useActiveRoutine } from '../features/routines'
import { useWorkouts } from '../features/workouts'
import { router } from 'expo-router'
import { routinePatternIndex } from '../utils/date'

export const TodayView: React.FC<{ selectedDate: Date }> = ({ selectedDate }) => {
  const { activeRoutine } = useActiveRoutine()
  const { workouts } = useWorkouts()
  if (!activeRoutine || activeRoutine.routineType === 'WEEKLY_COMPLETION') return null
  const pattern =
    activeRoutine.pattern[
      routinePatternIndex(activeRoutine.startDate, activeRoutine.pattern.length, selectedDate)
    ]
  const workout =
    pattern?.dayType === 'WORKOUT' ? workouts.find((item) => item.id === pattern.workoutId) : null
  const exercises = workout?.workoutTemplate.exercises ?? []
  const sets = exercises.reduce(
    (total, exercise) =>
      total +
      (exercise.category === 'CARDIO'
        ? (exercise.durationSeconds?.length ?? 0)
        : exercise.reps.length),
    0
  )

  return (
    <XStack pt="$card" borderTopWidth={1} borderColor="$borderColor" items="center" gap="$field">
      <YStack flex={1} gap="$compact">
        <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
          {selectedDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </Text>
        <Text fontSize="$sectionTitle" lineHeight="$sectionTitle" fontWeight="600">
          {workout?.title ?? (pattern?.dayType === 'WORKOUT' ? 'Workout unavailable' : 'Rest day')}
        </Text>
        <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
          {workout
            ? `${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'} · ${sets} ${sets === 1 ? 'set' : 'sets'}`
            : pattern?.dayType === 'WORKOUT'
              ? 'Choose another session or update your routine.'
              : 'No workout scheduled for this date.'}
        </Text>
      </YStack>
      {workout && (
        <Button
          width="$touch"
          height="$action"
          p="$0"
          rounded="$button"
          bg="$primary"
          accessibilityLabel={`View workout ${workout.title}`}
          onPress={() =>
            router.push({ pathname: '/(tabs)/(workouts)', params: { focusId: workout.id } })
          }
        >
          <ArrowRight size="$icon" color="$onPrimary" aria-hidden />
        </Button>
      )}
    </XStack>
  )
}
