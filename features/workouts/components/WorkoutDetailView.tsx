import { useState } from 'react'
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, UiText } from '../../../components/ui/Controls'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import { StartWorkoutButton } from '../../../components/ui/StartWorkoutButton'
import { ChevronDown, ChevronRight } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { MuscleHeatMap } from './MuscleHeatMap'
import { formatSeconds } from '../../../utils/workoutUtils'
import type { useWorkoutDetail } from '../hooks/useWorkoutDetail'

type WorkoutDetailExercise = ReturnType<typeof useWorkoutDetail>['exercises'][number]

function WorkoutExerciseRow({
  exercise,
  index,
}: {
  exercise: WorkoutDetailExercise
  index: number
}) {
  const [expanded, setExpanded] = useState(false)
  const colors = useCadenceColors()
  const exerciseName = exercise.exerciseTitle?.trim() || exercise.exerciseId.replace(/_/g, ' ')
  const durations = exercise.durationSeconds ?? []
  const timed = exercise.category === 'CARDIO'
  const setCount = timed
    ? durations.length
    : Math.max(exercise.reps?.length ?? 0, exercise.weight?.length ?? 0)
  const setLabel = `${setCount} ${timed ? (setCount === 1 ? 'interval' : 'intervals') : setCount === 1 ? 'set' : 'sets'}`
  const muscles = [...new Set(exercise.primaryMuscles ?? [])]
    .map((muscle) =>
      muscle
        .replace(/[_-]/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    )
    .join(' / ')
  const accessibilityLabel = `${exerciseName}, ${setLabel}${muscles ? `, ${muscles}` : ''}`

  return (
    <View className="border-b border-divider">
      <Pressable
        className="min-h-[60px] flex-row items-center gap-field py-compact active:bg-raised"
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? 'Hides saved targets' : 'Shows saved targets'}
      >
        <UiText textRole="meta" className="w-6">
          {index + 1}
        </UiText>
        <View className="min-w-0 flex-1 gap-compact">
          <UiText textRole="bodyEmphasis" selectable>
            {exerciseName}
          </UiText>
          <UiText textRole="meta">
            {setLabel}
            {muscles ? ` / ${muscles}` : ''}
          </UiText>
        </View>
        {expanded ? (
          <ChevronDown size={17} color={colors.muted} aria-hidden />
        ) : (
          <ChevronRight size={17} color={colors.muted} aria-hidden />
        )}
      </Pressable>
      {expanded && (
        <View className="ml-10">
          <View className="flex-row gap-field border-b border-divider py-compact">
            <UiText textRole="meta" className="w-8">
              Set
            </UiText>
            <UiText textRole="meta" className="flex-1">
              {timed ? 'Duration' : 'Weight (kg)'}
            </UiText>
            {!timed && (
              <UiText textRole="meta" className="flex-1">
                Reps
              </UiText>
            )}
          </View>
          {Array.from({ length: setCount }, (_, setIndex) => (
            <View
              key={`${exercise.exerciseId}-${index}-${setIndex}`}
              className="flex-row gap-field border-b border-divider py-compact"
            >
              <UiText textRole="meta" className="w-8">
                {setIndex + 1}
              </UiText>
              <UiText textRole="body" className="flex-1">
                {timed ? formatSeconds(durations[setIndex]) : (exercise.weight?.[setIndex] ?? '—')}
              </UiText>
              {!timed && (
                <UiText textRole="body" className="flex-1">
                  {exercise.reps?.[setIndex] ?? '—'}
                </UiText>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

export function WorkoutDetailView({
  workout,
  exercises,
  loading,
  error,
  running,
  setsLabel,
  goBack,
  startWorkout,
}: ReturnType<typeof useWorkoutDetail>) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
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
                <UiText
                  textRole={width <= 350 ? 'compactScreenTitle' : 'screenTitle'}
                  accessibilityRole="header"
                  selectable
                >
                  {workout.title}
                </UiText>
                <View className="flex-row flex-wrap gap-field">
                  <UiText textRole="meta">
                    {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'}
                  </UiText>
                  {!!setsLabel && <UiText textRole="meta">{setsLabel}</UiText>}
                </View>
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
                <View className="flex-row items-center justify-between gap-field">
                  <UiText textRole="bodyEmphasis" accessibilityRole="header">
                    Exercises
                  </UiText>
                  <UiText textRole="meta" className="flex-1 text-right">
                    In workout order
                  </UiText>
                </View>
                {exercises.map((exercise, index) => (
                  <WorkoutExerciseRow
                    key={`${exercise.exerciseId}-${index}`}
                    exercise={exercise}
                    index={index}
                  />
                ))}
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
