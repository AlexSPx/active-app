import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { YStack, Text, ScrollView, XStack, Button, Separator, Card, View } from 'tamagui'
import {
  Play,
  Edit3,
  ArrowLeft,
  Clock,
  Dumbbell,
  Target,
  ChevronRight,
} from '@tamagui/lucide-icons'
import { useWorkouts, useWorkoutManagement, MuscleHeatMap } from '../../features/workouts'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { useMemo } from 'react'
import { useSettingsStore } from '../../features/settings'
import { useWorkoutIdRemap } from '../../features/workouts/hooks/useWorkoutIdRemap'

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { workouts, loading, error } = useWorkouts()
  const { startWorkout } = useWorkoutManagement()
  useWorkoutIdRemap(id)

  const {
    restTimerEnabled,
    restTimerDefaultSeconds,
    setRestTimerEnabled,
    setRestTimerDefaultSeconds,
  } = useSettingsStore()

  const workout = useMemo(() => workouts.find((w) => w.id === id), [workouts, id])

  // TODO: Use workout records to calculate stats
  const workoutStats = useMemo(() => {
    if (!workout) return { exercises: 0, sets: 0, estimatedTime: 0 }

    const exercises = workout.workoutTemplate.exercises.length
    const sets = workout.workoutTemplate.exercises.reduce((sum, e) => {
      if (e.category === 'CARDIO') return sum + (e.durationSeconds?.length || 0)
      return sum + (e.reps?.length || 0)
    }, 0)
    const restTime = restTimerEnabled ? restTimerDefaultSeconds / 60 : 0
    const estimatedSetTime = 1.5 + restTime
    const estimatedTime = sets * estimatedSetTime

    return { exercises, sets, estimatedTime }
  }, [workout])

  // Aggregate muscles from all exercises
  const muscleGroups = useMemo(() => {
    if (!workout) return { primary: [], secondary: [] }

    const primary = new Set<string>()
    const secondary = new Set<string>()

    workout.workoutTemplate.exercises.forEach((exercise) => {
      exercise.primaryMuscles?.forEach((m) => primary.add(m))
      exercise.secondaryMuscles?.forEach((m) => secondary.add(m))
    })

    return {
      primary: Array.from(primary) as any[],
      secondary: Array.from(secondary) as any[],
    }
  }, [workout])

  if (loading && !workout) {
    return (
      <YStack flex={1} justify="center" items="center" bg="$background">
        <LoadingSpinner />
        <Text mt="$3" color="$colorSubtle" fontSize="$3">
          Loading workout...
        </Text>
      </YStack>
    )
  }

  if (error || !workout) {
    return (
      <YStack flex={1} justify="center" items="center" bg="$background" p="$4">
        <ErrorDisplay message={error || 'Workout not found'} />
        <Button mt="$4" onPress={() => router.back()}>
          Go Back
        </Button>
      </YStack>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: workout.title,
          headerBackTitle: 'Back',
          headerTransparent: false,
        }}
      />

      <ScrollView flex={1} bg="$background" showsVerticalScrollIndicator={false}>
        <YStack p="$4" gap="$5">
          {/* Stats Cards */}
          <XStack gap="$3" flexWrap="wrap">
            <Card
              flex={1}
              minWidth={100}
              p="$3"
              bg="$surface"
              bordered
              animation="bouncy"
              enterStyle={{ scale: 0.9, opacity: 0 }}
            >
              <XStack items="center" gap="$2">
                <Dumbbell size={18} color="$primary" />
                <YStack>
                  <Text fontSize="$6" fontWeight="bold" color="$color">
                    {workoutStats.exercises}
                  </Text>
                  <Text fontSize="$2" color="$colorSubtle">
                    Exercises
                  </Text>
                </YStack>
              </XStack>
            </Card>
            <Card
              flex={1}
              minWidth={100}
              p="$3"
              bg="$surface"
              bordered
              animation="bouncy"
              enterStyle={{ scale: 0.9, opacity: 0 }}
            >
              <XStack items="center" gap="$2">
                <Target size={18} color="$secondary" />
                <YStack>
                  <Text fontSize="$6" fontWeight="bold" color="$color">
                    {workoutStats.sets}
                  </Text>
                  <Text fontSize="$2" color="$colorSubtle">
                    Total Sets
                  </Text>
                </YStack>
              </XStack>
            </Card>
            <Card
              flex={1}
              minWidth={100}
              p="$3"
              bg="$surface"
              bordered
              animation="bouncy"
              enterStyle={{ scale: 0.9, opacity: 0 }}
            >
              <XStack items="center" gap="$2">
                <Clock size={18} color="$green10" />
                <YStack>
                  <Text fontSize="$6" fontWeight="bold" color="$color">
                    ~{workoutStats.estimatedTime}
                  </Text>
                  <Text fontSize="$2" color="$colorSubtle">
                    Minutes
                  </Text>
                </YStack>
              </XStack>
            </Card>
          </XStack>

          {/* Notes Section */}
          {workout.notes && (
            <Card p="$3" bg="$surface" bordered>
              <Text fontSize="$3" color="$colorSubtle" fontStyle="italic">
                "{workout.notes}"
              </Text>
            </Card>
          )}

          {/* Muscle Heat Map Section */}
          <YStack gap="$3">
            <XStack items="center" gap="$2">
              <Target size={20} color="$primary" />
              <Text fontSize="$5" fontWeight="600" color="$color">
                Targeted Muscles
              </Text>
            </XStack>
            <Separator />
            <YStack items="center" py="$2">
              <MuscleHeatMap
                primaryMuscles={muscleGroups.primary}
                secondaryMuscles={muscleGroups.secondary}
                scale={1}
              />
            </YStack>
          </YStack>

          {/* Exercises List */}
          <YStack gap="$3">
            <XStack items="center" gap="$2">
              <Dumbbell size={20} color="$primary" />
              <Text fontSize="$5" fontWeight="600" color="$color">
                Exercises
              </Text>
            </XStack>
            <Separator />

            {workout.workoutTemplate.exercises.map((exercise, index) => (
              <Card
                key={`${exercise.exerciseId}-${index}`}
                p="$3"
                bg="$surface"
                bordered
                pressStyle={{ scale: 0.98, opacity: 0.9 }}
                animation="quick"
              >
                <XStack justify="space-between" items="center">
                  <XStack items="center" gap="$3" flex={1}>
                    {/* Exercise Number Badge */}
                    <YStack
                      width={32}
                      height={32}
                      bg="$primary"
                      rounded="$10"
                      justify="center"
                      items="center"
                    >
                      <Text fontSize="$3" fontWeight="bold" color="white">
                        {index + 1}
                      </Text>
                    </YStack>

                    <YStack flex={1}>
                      <Text fontSize="$4" fontWeight="600" color="$color" numberOfLines={1}>
                        {exercise.exerciseTitle?.trim() || exercise.exerciseId.replace(/_/g, ' ')}
                      </Text>
                      <XStack gap="$2" mt="$1" flexWrap="wrap">
                        <Text
                          fontSize="$2"
                          color="$colorSubtle"
                          bg="$backgroundFocus"
                          px="$2"
                          py="$1"
                          rounded="$2"
                        >
                          {exercise.reps?.length || exercise.durationSeconds?.length || 0} sets
                        </Text>
                        <Text
                          fontSize="$2"
                          color="$colorSubtle"
                          bg="$backgroundFocus"
                          px="$2"
                          py="$1"
                          rounded="$2"
                        >
                          {exercise.category}
                        </Text>
                      </XStack>
                    </YStack>
                  </XStack>
                  <ChevronRight size={20} color="$colorSubtle" />
                </XStack>
              </Card>
            ))}
          </YStack>

          {/* Spacer for button */}
          <View height={80} />
        </YStack>
      </ScrollView>

      {/* Floating Action Button */}
      <YStack
        position="absolute"
        b={0}
        l={0}
        r={0}
        p="$4"
        bg="$background"
        borderTopWidth={1}
        borderTopColor="$borderColor"
      >
        <Button
          size="$5"
          bg="$primary"
          color="white"
          icon={Play}
          onPress={() => startWorkout(workout)}
          animation="bouncy"
          pressStyle={{ scale: 0.95 }}
          elevation="$2"
        >
          Start Workout
        </Button>
      </YStack>
    </>
  )
}
