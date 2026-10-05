import { useEffect } from 'react'
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
import { ChevronRight } from '@tamagui/lucide-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRoutines, useActiveRoutine } from '../../features/routines'
import { useWorkouts, MuscleHeatMap } from '../../features/workouts'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../components/ui/ErrorDisplay'
import { useSettingsStore } from '../../features/settings'
import { syncEngine } from '../../lib/sync'
import { summarizeWorkoutExercises } from '../../utils/workoutUtils'

export default function RoutineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { routines, loading, error } = useRoutines()
  const { activeRoutine } = useActiveRoutine()
  const { workouts, loading: workoutsLoading, error: workoutsError, refetch } = useWorkouts()
  const { restTimerEnabled, restTimerDefaultSeconds } = useSettingsStore()
  const resolvedId = syncEngine.resolveId('routines', id)
  const routine = routines.find((item) => syncEngine.resolveId('routines', item.id) === resolvedId)
  const active =
    !!activeRoutine && syncEngine.resolveId('routines', activeRoutine.id) === resolvedId
  useEffect(() => {
    const resolved = id && syncEngine.resolveId('routines', id)
    if (resolved && resolved !== id) router.setParams({ id: resolved })
    return syncEngine.onIdRemap((table, oldId, newId) => {
      if (table === 'routines' && id === oldId) router.setParams({ id: newId })
    })
  }, [id, router])
  const weekly = routine?.routineType === 'WEEKLY_COMPLETION'
  const pattern = [...(routine?.pattern ?? [])]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .filter((day) => !weekly || day.dayType === 'WORKOUT')
  const days = pattern.map((day) => ({
    ...day,
    workout:
      day.dayType === 'WORKOUT' && day.workoutId
        ? workouts.find(
            (workout) =>
              syncEngine.resolveId('workouts', workout.id) ===
              syncEngine.resolveId('workouts', day.workoutId!)
          )
        : undefined,
  }))
  const training = days.filter((day) => day.dayType === 'WORKOUT')
  const incomplete = training.some((day) => !day.workout)
  const exercises = training.flatMap((day) => day.workout?.workoutTemplate.exercises ?? [])
  const restSeconds = restTimerEnabled ? restTimerDefaultSeconds : 0
  const summary = summarizeWorkoutExercises(exercises, restSeconds)
  const edit = () => router.push({ pathname: '/routines/edit', params: { id: resolvedId } })

  return (
    <YStack flex={1} bg="$background">
      <Stack.Screen
        options={{
          title: 'Routine',
          headerBackTitle: 'Routines',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.background.val },
          headerTintColor: theme.primary.val,
          headerTitleStyle: {
            color: theme.color.val,
            fontSize: getVariableValue(getConfig().fonts.body.size.header),
            fontWeight: '700',
          },
        }}
      />
      {loading && !routine ? (
        <YStack flex={1} items="center" justify="center" gap="$field">
          <LoadingSpinner />
          <Text fontSize="$body" color="$colorSubtle">
            Loading routine…
          </Text>
        </YStack>
      ) : !routine ? (
        <YStack flex={1} p="$page" items="center" justify="center" gap="$field">
          <ErrorDisplay message={error || 'Routine not found'} />
          <Button
            minH="$action"
            bg="$backgroundHover"
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
                <XStack items="flex-start" gap="$field">
                  <Text
                    flex={1}
                    accessibilityRole="header"
                    fontSize="$screenTitle"
                    lineHeight="$screenTitle"
                    fontWeight="600"
                  >
                    {routine.name}
                  </Text>
                  {active && (
                    <Text
                      fontSize="$caption"
                      lineHeight="$caption"
                      color="$primary"
                      bg="$backgroundAccent"
                      rounded="$badge"
                      px="$field"
                      py="$compact"
                    >
                      Active
                    </Text>
                  )}
                </XStack>
                <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                  {weekly
                    ? `Flexible week · ${training.length} ${training.length === 1 ? 'workout' : 'workouts'} · Any order`
                    : `${days.length}-day cycle · ${training.length} training · ${days.length - training.length} rest`}
                </Text>
                {!!routine.description?.trim() && (
                  <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
                    {routine.description.trim()}
                  </Text>
                )}
                {!incomplete && summary.strengthSets + summary.intervals > 0 && (
                  <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                    {summary.strengthSets > 0
                      ? `${summary.strengthSets} ${summary.strengthSets === 1 ? 'set' : 'sets'}`
                      : ''}
                    {summary.strengthSets > 0 && summary.intervals > 0 ? ' · ' : ''}
                    {summary.intervals > 0
                      ? `${summary.intervals} ${summary.intervals === 1 ? 'interval' : 'intervals'}`
                      : ''}
                    {summary.estimatedMinutes
                      ? ` · ~${summary.estimatedMinutes} min per ${weekly ? 'week' : 'cycle'}`
                      : ''}
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
                {incomplete && (
                  <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                    {workoutsLoading
                      ? 'Waiting for the remaining workouts. Coverage includes available workouts.'
                      : 'Coverage includes available workouts only. Check the unassigned or unavailable sessions below.'}
                  </Text>
                )}
                {workoutsLoading && !exercises.length ? (
                  <Text fontSize="$body" color="$colorSubtle">
                    Loading muscle groups…
                  </Text>
                ) : (
                  <MuscleHeatMap
                    primaryMuscles={exercises.flatMap((exercise) => exercise.primaryMuscles ?? [])}
                    secondaryMuscles={exercises.flatMap(
                      (exercise) => exercise.secondaryMuscles ?? []
                    )}
                  />
                )}
              </YStack>
              <YStack gap="$field">
                <Text
                  accessibilityRole="header"
                  fontSize="$sectionTitle"
                  lineHeight="$sectionTitle"
                  fontWeight="600"
                >
                  {weekly ? 'Workouts this week' : 'Repeating cycle'}
                </Text>
                <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                  {weekly
                    ? 'Complete these workouts Monday–Sunday in any order.'
                    : 'Follow these days in order, then repeat the sequence.'}
                </Text>
                {!!workoutsError && (
                  <YStack gap="$field">
                    <ErrorDisplay message={workoutsError} />
                    <Button
                      bg="$backgroundHover"
                      minH="$touch"
                      rounded="$control"
                      onPress={() => {
                        void refetch()
                      }}
                    >
                      Retry workouts
                    </Button>
                  </YStack>
                )}
                {days.map((day, index) => {
                  const rest = day.dayType === 'REST'
                  const targets = summarizeWorkoutExercises(
                    day.workout?.workoutTemplate.exercises ?? [],
                    restSeconds
                  )
                  const details = day.workout
                    ? [
                        weekly ? 'Any order' : 'Training',
                        `${day.workout.workoutTemplate.exercises.length} ${day.workout.workoutTemplate.exercises.length === 1 ? 'exercise' : 'exercises'}`,
                        targets.estimatedMinutes ? `~${targets.estimatedMinutes} min` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : rest
                      ? 'No workout scheduled.'
                      : !day.workoutId
                        ? 'Edit this routine to choose a workout.'
                        : workoutsLoading
                          ? 'Loading saved workout…'
                          : workoutsError
                            ? 'Retry loading your workouts.'
                            : 'This saved workout is unavailable. Edit the routine to replace it.'
                  const title = rest
                    ? 'Rest day'
                    : day.workout?.title ||
                      (!day.workoutId
                        ? 'No workout assigned'
                        : workoutsLoading
                          ? 'Loading workout…'
                          : 'Workout unavailable')
                  return (
                    <YStack
                      key={`${day.dayIndex}-${index}`}
                      gap="$compact"
                      py="$field"
                      borderBottomWidth={1}
                      borderColor="$borderColor"
                      minH="$touch"
                      onPress={
                        day.workout
                          ? () =>
                              router.push({
                                pathname: '/workouts/[id]',
                                params: { id: syncEngine.resolveId('workouts', day.workout!.id) },
                              })
                          : undefined
                      }
                      accessibilityRole={day.workout ? 'button' : undefined}
                      accessibilityLabel={
                        day.workout
                          ? `View ${day.workout.title}${weekly ? '' : `, day ${day.dayIndex}`}`
                          : undefined
                      }
                      pressStyle={day.workout ? { bg: '$backgroundHover' } : undefined}
                    >
                      {!weekly && (
                        <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                          Day {day.dayIndex}
                        </Text>
                      )}
                      <XStack gap="$field" items="center">
                        <Text
                          flex={1}
                          fontSize="$exerciseTitle"
                          lineHeight="$exerciseTitle"
                          fontWeight="600"
                          color={rest ? '$colorSubtle' : '$color'}
                        >
                          {title}
                        </Text>
                        {!!day.workout && (
                          <ChevronRight size="$iconSmall" color="$colorSubtle" aria-hidden />
                        )}
                      </XStack>
                      <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
                        {details}
                      </Text>
                    </YStack>
                  )
                })}
                {!days.length && (
                  <Text fontSize="$body" lineHeight="$body" color="$colorSubtle">
                    No {weekly ? 'workouts' : 'days'} in this routine yet. Edit it to add your
                    training sessions.
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
            <YStack width="100%" maxW="$content" self="center">
              <Button
                height="$action"
                rounded="$button"
                bg="$primary"
                color="$onPrimary"
                fontSize="$caption"
                fontWeight="600"
                onPress={edit}
              >
                Edit routine
              </Button>
            </YStack>
          </YStack>
        </>
      )}
    </YStack>
  )
}
