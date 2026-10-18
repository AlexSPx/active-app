import { Pressable, View } from 'react-native'
import { Button, UiText } from '../../../components/ui/Controls'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { Dumbbell, Play } from '../../../components/ui/icons'
import { ActionMenu } from '../../../components/ui/ActionMenu'
import { useCallback, memo, useMemo } from 'react'
import type { ApiWorkout } from '../../../types/api'
import { haptics } from '../../../utils/haptics'

const VISIBLE_EXERCISES = 4

export interface WorkoutCardProps {
  workout: ApiWorkout
  sessionLabel?: string
  onStartWorkout: (workout: ApiWorkout) => void
  isWorkoutRunning: boolean
  onEdit?: (workout: ApiWorkout) => void
  onDelete?: (workoutId: string) => void
  onPress?: (workout: ApiWorkout) => void
}

export const WorkoutCard = memo(function WorkoutCard({
  workout,
  sessionLabel,
  onStartWorkout,
  isWorkoutRunning,
  onEdit,
  onDelete,
  onPress,
}: WorkoutCardProps) {
  const handleStartWorkout = useCallback(() => {
    if (isWorkoutRunning) return
    haptics.medium()
    onStartWorkout(workout)
  }, [isWorkoutRunning, onStartWorkout, workout])

  const handleOpen = useCallback(() => {
    if (onPress) onPress(workout)
  }, [onPress, workout])

  const summary = useMemo(() => {
    let totalSets = 0

    for (const exercise of workout.workoutTemplate.exercises) {
      if (exercise.category === 'CARDIO') {
        totalSets += Array.isArray(exercise.durationSeconds) ? exercise.durationSeconds.length : 0
        continue
      }

      totalSets += exercise.reps?.length || 0
    }

    const exerciseNames = workout.workoutTemplate.exercises.map(
      (exercise) => exercise.exerciseTitle?.trim() || exercise.exerciseId.replace(/_/g, ' ')
    )

    return {
      totalSets,
      exerciseNames: exerciseNames.slice(0, VISIBLE_EXERCISES),
      hiddenCount: Math.max(0, exerciseNames.length - VISIBLE_EXERCISES),
    }
  }, [workout.workoutTemplate.exercises])

  const featured = sessionLabel !== undefined
  const colors = useCadenceColors()
  return (
    <View
      className={`gap-field p-card ${featured ? 'rounded-[22px] bg-featured' : 'rounded-card bg-surface'}`}
    >
      {featured && <UiText textRole="featuredMeta">{sessionLabel}</UiText>}
      <View className="flex-row items-start gap-field">
        <Pressable
          className="min-h-touch min-w-0 flex-1 justify-center active:opacity-75"
          onPress={onPress ? handleOpen : undefined}
          disabled={!onPress}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={onPress ? `View workout ${workout.title}` : undefined}
        >
          <UiText textRole={featured ? 'featuredTitle' : 'cardTitle'}>{workout.title}</UiText>
        </Pressable>
        {(onEdit || onDelete) && (
          <ActionMenu
            label={`More actions for ${workout.title}`}
            onOpen={() => haptics.light()}
            actions={[
              ...(onEdit ? [{ label: 'Edit', onPress: () => onEdit(workout) }] : []),
              ...(onDelete
                ? [{ label: 'Delete', destructive: true, onPress: () => onDelete(workout.id) }]
                : []),
            ]}
          />
        )}
      </View>
      {featured ? (
        <>
          <View className="flex-row flex-wrap items-center gap-field">
            <Dumbbell size={16} color="#76627e" aria-hidden />
            <UiText textRole="featuredMeta">
              {workout.workoutTemplate.exercises.length}{' '}
              {workout.workoutTemplate.exercises.length === 1 ? 'exercise' : 'exercises'}
            </UiText>
            <UiText textRole="featuredMeta">
              {summary.totalSets} {summary.totalSets === 1 ? 'set' : 'sets'}
            </UiText>
          </View>
          <View>
            {workout.workoutTemplate.exercises
              .slice(0, VISIBLE_EXERCISES)
              .map((exercise, index) => {
                const reps = exercise.reps ?? []
                const count =
                  exercise.category === 'CARDIO'
                    ? (exercise.durationSeconds?.length ?? 0)
                    : reps.length
                const target =
                  exercise.category === 'CARDIO'
                    ? `${count} ${count === 1 ? 'interval' : 'intervals'}`
                    : reps.length > 0 && reps.every((rep) => rep === reps[0])
                      ? `${count} × ${reps[0]}`
                      : `${count} sets`
                return (
                  <View
                    key={`${exercise.exerciseId}-${index}`}
                    className="flex-row flex-wrap items-center justify-between gap-compact border-t border-featured-divider py-field"
                  >
                    <UiText textRole="featuredBody" className="min-w-0 flex-1">
                      {summary.exerciseNames[index]}
                    </UiText>
                    <UiText textRole="featuredMeta">{target}</UiText>
                  </View>
                )
              })}
            {summary.hiddenCount > 0 && (
              <UiText textRole="featuredMeta">+{summary.hiddenCount} more</UiText>
            )}
          </View>
        </>
      ) : (
        <>
          <UiText textRole="meta">
            {workout.workoutTemplate.exercises.length}{' '}
            {workout.workoutTemplate.exercises.length === 1 ? 'exercise' : 'exercises'} /{' '}
            {summary.totalSets} {summary.totalSets === 1 ? 'set' : 'sets'}
          </UiText>
          {!!summary.exerciseNames.length && (
            <UiText textRole="meta">
              {summary.exerciseNames.join('\n')}
              {summary.hiddenCount > 0 ? `\n+${summary.hiddenCount} more` : ''}
            </UiText>
          )}
        </>
      )}
      <Button
        variant={featured ? 'featured' : 'primary'}
        disabled={isWorkoutRunning}
        onPress={handleStartWorkout}
        className="flex-row gap-compact py-field"
      >
        <Play size={18} color={featured ? '#faf5fc' : colors.onAccent} aria-hidden />
        <UiText textRole={featured ? 'featuredButton' : 'buttonOnAccent'} className="shrink">
          {isWorkoutRunning ? 'Workout in Progress' : 'Start workout'}
        </UiText>
      </Button>
    </View>
  )
})
