import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, UiText } from '../../../components/ui/Controls'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import { StartWorkoutButton } from '../../../components/ui/StartWorkoutButton'
import { MuscleHeatMap } from './MuscleHeatMap'
import { formatSeconds } from '../../../utils/workoutUtils'
import type { useWorkoutDetail } from '../hooks/useWorkoutDetail'

export function WorkoutDetailView({
  workout,
  exercises,
  loading,
  error,
  running,
  setsLabel,
  estimatedMinutes,
  goBack,
  startWorkout,
}: ReturnType<typeof useWorkoutDetail>) {
  const insets = useSafeAreaInsets()
  return (
    <View className="flex-1 bg-background">
      {loading && !workout ? (
        <View className="flex-1 items-center justify-center gap-field p-page">
          <LoadingSpinner />
          <UiText textRole="bodyMuted">Loading workout…</UiText>
        </View>
      ) : !workout ? (
        <View className="flex-1 items-center justify-center gap-field p-page">
          <ErrorDisplay message={error || 'Workout not found'} />
          <Button variant="secondary" onPress={goBack}>
            Go back
          </Button>
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="automatic"
          >
            <View className="w-full max-w-3xl self-center gap-section p-page">
              <View className="gap-field">
                <UiText textRole="screenTitle" accessibilityRole="header" selectable>
                  {workout.title}
                </UiText>
                <UiText textRole="caption">
                  {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'}
                  {setsLabel ? ` · ${setsLabel}` : ''}
                  {estimatedMinutes ? ` · ~${estimatedMinutes} min` : ''}
                </UiText>
                {!!workout.notes?.trim() && (
                  <UiText textRole="bodyMuted" selectable>
                    {workout.notes.trim()}
                  </UiText>
                )}
              </View>
              <View className="gap-field">
                <UiText textRole="bodyEmphasis" accessibilityRole="header">
                  Muscle groups
                </UiText>
                <MuscleHeatMap
                  primaryMuscles={exercises.flatMap((exercise) => exercise.primaryMuscles ?? [])}
                  secondaryMuscles={exercises.flatMap(
                    (exercise) => exercise.secondaryMuscles ?? []
                  )}
                />
              </View>
              <View className="gap-field">
                <View className="flex-row flex-wrap items-center justify-between gap-field">
                  <UiText textRole="bodyEmphasis" accessibilityRole="header">
                    Exercises
                  </UiText>
                  <UiText textRole="caption">In workout order</UiText>
                </View>
                {exercises.map((exercise, index) => {
                  const cardio = exercise.category === 'CARDIO'
                  const count = cardio
                    ? (exercise.durationSeconds?.length ?? 0)
                    : (exercise.reps?.length ?? 0)
                  const muscles = (exercise.primaryMuscles ?? [])
                    .map((muscle) => muscle.replace(/[_-]/g, ' ').toLowerCase())
                    .join(' · ')
                  return (
                    <View
                      key={`${exercise.exerciseId}-${index}`}
                      className="flex-row items-start gap-field border-b border-divider py-field"
                    >
                      <UiText textRole="bodyMuted" className="w-6">
                        {index + 1}
                      </UiText>
                      <View className="min-w-0 flex-1 gap-compact">
                        <UiText textRole="bodyEmphasis" selectable>
                          {exercise.exerciseTitle?.trim() || exercise.exerciseId.replace(/_/g, ' ')}
                        </UiText>
                        <UiText textRole="caption">
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
                        </UiText>
                      </View>
                    </View>
                  )
                })}
                {!exercises.length && (
                  <UiText textRole="bodyMuted">
                    No exercises in this workout yet. Edit it to add exercises.
                  </UiText>
                )}
              </View>
            </View>
          </ScrollView>
          <View
            className="border-t border-divider px-page pt-field"
            style={{ paddingBottom: Math.max(20, insets.bottom) }}
          >
            <View className="w-full max-w-3xl self-center gap-compact">
              {running && (
                <UiText textRole="caption">
                  Finish your current workout before starting another.
                </UiText>
              )}
              <StartWorkoutButton
                isWorkoutRunning={running}
                disabled={!exercises.length}
                onPress={startWorkout}
              />
            </View>
          </View>
        </>
      )}
    </View>
  )
}
