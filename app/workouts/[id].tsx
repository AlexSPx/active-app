import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import {
  YStack,
  Text,
  ScrollView,
  XStack,
  Button,
  getTokenValue,
  useTheme,
  getConfig,
  getVariableValue,
} from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useWorkouts, useWorkoutManagement, MuscleHeatMap } from '../../features/workouts'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { StartWorkoutButton } from '../../components/ui/StartWorkoutButton'
import { useSettingsStore } from '../../features/settings'
import { useWorkoutIdRemap } from '../../features/workouts/hooks/useWorkoutIdRemap'
import { formatSeconds, summarizeWorkoutExercises } from '../../utils/workoutUtils'

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { workouts, loading, error } = useWorkouts()
  const { startWorkout, isWorkoutRunning } = useWorkoutManagement()
  const running = isWorkoutRunning()
  useWorkoutIdRemap(id)
  const { restTimerEnabled, restTimerDefaultSeconds } = useSettingsStore()
  const workout = workouts.find((item) => item.id === id)
  const exercises = workout?.workoutTemplate.exercises ?? []
  const { strengthSets, intervals, estimatedMinutes } = summarizeWorkoutExercises(
    exercises,
    restTimerEnabled ? restTimerDefaultSeconds : 0
  )
  const setsLabel = [
    strengthSets && `${strengthSets} ${strengthSets === 1 ? 'set' : 'sets'}`,
    intervals && `${intervals} ${intervals === 1 ? 'interval' : 'intervals'}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <YStack flex={1} bg="$background">
      <Stack.Screen
        options={{
          title: 'Workout',
          headerBackTitle: 'Workouts',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.background.val },
          headerTintColor: theme.primary.val,
          headerTitleStyle: {
            color: theme.color.val,
            fontSize: getVariableValue(getConfig().fonts.body.size.header),
            fontWeight: '700',
          },
          headerRight: workout
            ? () => (
                <Button
                  chromeless
                  minH="$touch"
                  color="$primary"
                  fontSize="$caption"
                  onPress={() =>
                    router.push({ pathname: '/workouts/edit', params: { id: workout.id } })
                  }
                >
                  Edit
                </Button>
              )
            : undefined,
        }}
      />
      {loading && !workout ? (
        <YStack flex={1} items="center" justify="center" gap="$field">
          <LoadingSpinner />
          <Text fontSize="$body" color="$colorSubtle">
            Loading workout…
          </Text>
        </YStack>
      ) : !workout ? (
        <YStack flex={1} p="$page" items="center" justify="center" gap="$field">
          <ErrorDisplay message={error || 'Workout not found'} />
          <Button
            bg="$backgroundHover"
            minH="$action"
            rounded="$button"
            onPress={() => router.back()}
          >
            Go back
          </Button>
        </YStack>
      ) : (
        <>
          <ScrollView
            flex={1}
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="automatic"
          >
            <YStack p="$page" gap="$section" width="100%" maxW="$content" self="center">
              <YStack gap="$field">
                <Text
                  accessibilityRole="header"
                  fontSize="$screenTitle"
                  lineHeight="$screenTitle"
                  fontWeight="600"
                >
                  {workout.title}
                </Text>
                <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                  {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'}
                  {setsLabel ? ` · ${setsLabel}` : ''}
                  {estimatedMinutes ? ` · ~${estimatedMinutes} min` : ''}
                </Text>
                {!!workout.notes?.trim() && (
                  <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
                    {workout.notes.trim()}
                  </Text>
                )}
              </YStack>
              <YStack gap="$field">
                <Text
                  accessibilityRole="header"
                  fontSize="$sectionTitle"
                  lineHeight="$sectionTitle"
                  fontWeight="600"
                >
                  Muscle groups
                </Text>
                <MuscleHeatMap
                  primaryMuscles={exercises.flatMap((exercise) => exercise.primaryMuscles ?? [])}
                  secondaryMuscles={exercises.flatMap(
                    (exercise) => exercise.secondaryMuscles ?? []
                  )}
                />
              </YStack>
              <YStack gap="$field">
                <XStack justify="space-between" items="center">
                  <Text
                    accessibilityRole="header"
                    fontSize="$sectionTitle"
                    lineHeight="$sectionTitle"
                    fontWeight="600"
                  >
                    Exercises
                  </Text>
                  <Text fontSize="$caption" color="$colorSubtle">
                    In workout order
                  </Text>
                </XStack>
                {exercises.map((exercise, index) => {
                  const cardio = exercise.category === 'CARDIO'
                  const count = cardio
                    ? (exercise.durationSeconds?.length ?? 0)
                    : (exercise.reps?.length ?? 0)
                  const muscles = (exercise.primaryMuscles ?? [])
                    .map((muscle) => muscle.replace(/[_-]/g, ' ').toLowerCase())
                    .join(' · ')
                  return (
                    <YStack
                      key={`${exercise.exerciseId}-${index}`}
                      gap="$compact"
                      pb="$field"
                      borderBottomWidth={1}
                      borderColor="$borderColor"
                    >
                      <Text fontSize="$exerciseTitle" lineHeight="$exerciseTitle" fontWeight="600">
                        {index + 1}.{' '}
                        {exercise.exerciseTitle?.trim() || exercise.exerciseId.replace(/_/g, ' ')}
                      </Text>
                      <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                        {count}{' '}
                        {cardio
                          ? count === 1
                            ? 'interval'
                            : 'intervals'
                          : count === 1
                            ? 'set'
                            : 'sets'}
                        {cardio && count
                          ? ` · ${exercise.durationSeconds?.map((seconds) => formatSeconds(seconds)).join(' / ')}`
                          : ''}
                        {muscles ? ` · ${muscles}` : ''}
                      </Text>
                    </YStack>
                  )
                })}
                {!exercises.length && (
                  <Text fontSize="$body" color="$colorSubtle">
                    No exercises in this workout yet. Edit it to add exercises.
                  </Text>
                )}
              </YStack>
            </YStack>
          </ScrollView>
          <YStack
            px="$page"
            pt="$field"
            pb={Math.max(insets.bottom, getTokenValue('$page', 'space'))}
            borderTopWidth={1}
            borderColor="$borderColor"
          >
            <YStack width="100%" maxW="$content" self="center" gap="$compact">
              {running && (
                <Text fontSize="$caption" color="$colorSubtle">
                  Finish your current workout before starting another.
                </Text>
              )}
              <StartWorkoutButton
                isWorkoutRunning={running}
                disabled={!exercises.length}
                onPress={() => {
                  if (!running && exercises.length) startWorkout(workout)
                }}
              />
            </YStack>
          </YStack>
        </>
      )}
    </YStack>
  )
}
