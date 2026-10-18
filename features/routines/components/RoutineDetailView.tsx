import { Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, UiText } from '../../../components/ui/Controls'
import { Badge } from '../../../components/ui/Badge'
import { ChevronRight, Clock3 } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { MuscleHeatMap } from '../../workouts'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import { summarizeWorkoutExercises } from '../../../utils/workoutUtils'
import type { useRoutineDetail } from '../hooks/useRoutineDetail'

type Props = ReturnType<typeof useRoutineDetail>
export function RoutineDetailView({
  routine,
  active,
  weekly,
  days,
  incomplete,
  exercises,
  restSeconds,
  summary,
  loading,
  error,
  workoutsLoading,
  workoutsError,
  retryWorkouts,
  edit,
  openWorkout,
  back,
}: Props) {
  const colors = useCadenceColors()
  const insets = useSafeAreaInsets()
  if (loading && !routine)
    return (
      <View className="flex-1 items-center justify-center gap-field bg-background">
        <LoadingSpinner />
        <UiText textRole="bodyMuted">Loading routine…</UiText>
      </View>
    )
  if (!routine)
    return (
      <View className="flex-1 items-center justify-center gap-field bg-background p-page">
        <ErrorDisplay message={error || 'Routine not found'} />
        <Button variant="secondary" onPress={back}>
          Go back
        </Button>
      </View>
    )
  const training = days.filter((day) => day.dayType === 'WORKOUT')
  const totals = [
    summary.strengthSets
      ? `${summary.strengthSets} ${summary.strengthSets === 1 ? 'set' : 'sets'}`
      : '',
    summary.intervals
      ? `${summary.intervals} ${summary.intervals === 1 ? 'interval' : 'intervals'}`
      : '',
    summary.estimatedMinutes
      ? `~${summary.estimatedMinutes} min per ${weekly ? 'week' : 'cycle'}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="w-full max-w-3xl self-center gap-section p-page">
          <View className="gap-field">
            <View className="flex-row items-start gap-field">
              <UiText accessibilityRole="header" textRole="screenTitle" className="flex-1">
                {routine.name}
              </UiText>
              {active && <Badge variant="secondary">Active</Badge>}
            </View>
            <UiText textRole="caption">
              {weekly
                ? `Flexible week · ${training.length} ${training.length === 1 ? 'workout' : 'workouts'} · Any order`
                : `${days.length}-day cycle · ${training.length} training · ${days.length - training.length} rest`}
            </UiText>
            {!!routine.description?.trim() && (
              <UiText textRole="bodyMuted">{routine.description.trim()}</UiText>
            )}
            {!incomplete && summary.strengthSets + summary.intervals > 0 && (
              <UiText textRole="caption">{totals}</UiText>
            )}
          </View>
          <View className="gap-field">
            <UiText accessibilityRole="header" textRole="bodyEmphasis">
              Muscle groups
            </UiText>
            {incomplete && (
              <UiText textRole="caption">
                {workoutsLoading
                  ? 'Waiting for the remaining workouts. Coverage includes available workouts.'
                  : 'Coverage includes available workouts only. Check the unassigned or unavailable sessions below.'}
              </UiText>
            )}
            {workoutsLoading && !exercises.length ? (
              <UiText textRole="bodyMuted">Loading muscle groups…</UiText>
            ) : (
              <MuscleHeatMap
                primaryMuscles={exercises.flatMap((exercise) => exercise.primaryMuscles ?? [])}
                secondaryMuscles={exercises.flatMap((exercise) => exercise.secondaryMuscles ?? [])}
              />
            )}
          </View>
          <View className="gap-field">
            <UiText accessibilityRole="header" textRole="bodyEmphasis">
              {weekly ? 'Workouts this week' : 'Repeating cycle'}
            </UiText>
            <UiText textRole="caption">
              {weekly
                ? 'Complete these workouts Monday–Sunday in any order.'
                : 'Follow these days in order, then repeat the sequence.'}
            </UiText>
            {!!workoutsError && (
              <View className="gap-field">
                <ErrorDisplay message={workoutsError} />
                <Button variant="secondary" onPress={() => void retryWorkouts()}>
                  Retry workouts
                </Button>
              </View>
            )}
            {days.map((day, index) => {
              const rest = day.dayType === 'REST'
              const workout = day.workout
              const targets = summarizeWorkoutExercises(
                workout?.workoutTemplate.exercises ?? [],
                restSeconds
              )
              const details = workout
                ? [
                    weekly ? 'Any order' : 'Training',
                    `${workout.workoutTemplate.exercises.length} ${workout.workoutTemplate.exercises.length === 1 ? 'exercise' : 'exercises'}`,
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
                : workout?.title ||
                  (!day.workoutId
                    ? 'No workout assigned'
                    : workoutsLoading
                      ? 'Loading workout…'
                      : 'Workout unavailable')
              return (
                <Pressable
                  key={`${day.dayIndex}-${index}`}
                  className="min-h-touch gap-compact border-b border-divider py-field active:bg-raised"
                  disabled={!workout}
                  onPress={workout ? () => openWorkout(workout.id) : undefined}
                  accessibilityRole={workout ? 'button' : undefined}
                  accessibilityLabel={
                    workout
                      ? `View ${workout.title}${weekly ? '' : `, day ${day.dayIndex}`}`
                      : undefined
                  }
                >
                  {!weekly && <UiText textRole="caption">Day {day.dayIndex}</UiText>}
                  <View className="flex-row items-center gap-field">
                    <UiText textRole={rest ? 'bodyMuted' : 'bodyEmphasis'} className="flex-1">
                      {title}
                    </UiText>
                    {workout && <ChevronRight size={18} color={colors.muted} aria-hidden />}
                    {rest && <Clock3 size={18} color={colors.muted} aria-hidden />}
                  </View>
                  <UiText textRole="caption">{details}</UiText>
                </Pressable>
              )
            })}
            {!days.length && (
              <UiText textRole="bodyMuted">
                No {weekly ? 'workouts' : 'days'} in this routine yet. Edit it to add your training
                sessions.
              </UiText>
            )}
          </View>
        </View>
      </ScrollView>
      <View
        className="border-t border-divider px-page pt-field"
        style={{ paddingBottom: Math.max(20, insets.bottom) }}
        testID="routine-detail-actions"
      >
        <View className="w-full max-w-3xl self-center">
          <Button onPress={edit}>Edit routine</Button>
        </View>
      </View>
    </View>
  )
}
