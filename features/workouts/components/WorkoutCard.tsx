import { Pressable, View } from 'react-native'
import { Button, UiText } from '../../../components/ui/Controls'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { Play } from '../../../components/ui/icons'
import { ActionMenu } from '../../../components/ui/ActionMenu'
import { useCallback, memo, useMemo } from 'react'
import type { ApiWorkout } from '../../../types/api'
import { haptics } from '../../../utils/haptics'

export interface WorkoutCardProps {
  workout: ApiWorkout
  onStartWorkout: (workout: ApiWorkout) => void
  isWorkoutRunning: boolean
  routineName?: string
  onEdit?: (workout: ApiWorkout) => void
  onDelete?: (workoutId: string) => void
  onPress?: (workout: ApiWorkout) => void
}

export const WorkoutCard = memo(function WorkoutCard({
  workout,
  onStartWorkout,
  isWorkoutRunning,
  routineName,
  onEdit,
  onDelete,
  onPress,
}: WorkoutCardProps) {
  const handleStartWorkout = useCallback(() => {
    if (isWorkoutRunning) return
    haptics.medium()
    onStartWorkout(workout)
  }, [isWorkoutRunning, onStartWorkout, workout])

  const normalizedRoutineName = routineName?.trim() || ''
  const isInRoutine = normalizedRoutineName.length > 0

  const summary = useMemo(() => {
    let totalSets = 0
    let estimatedDurationSeconds = 0

    for (const exercise of workout.workoutTemplate.exercises) {
      if (exercise.category === 'CARDIO') {
        const durations = Array.isArray(exercise.durationSeconds) ? exercise.durationSeconds : []
        totalSets += durations.length
        estimatedDurationSeconds += durations.reduce((sum, duration) => sum + duration, 0)
        continue
      }

      const sets = exercise.reps?.length || 0
      totalSets += sets
      estimatedDurationSeconds += sets * 150
    }

    const exerciseNames = workout.workoutTemplate.exercises.map(
      (exercise) => exercise.exerciseTitle?.trim() || exercise.exerciseId.replace(/_/g, ' ')
    )
    const visibleExercises = exerciseNames.slice(0, 4)
    const hiddenCount = Math.max(0, exerciseNames.length - visibleExercises.length)

    return {
      totalSets,
      approxMinutes: Math.max(5, Math.round(estimatedDurationSeconds / 60)),
      visibleExercises,
      hiddenCount,
    }
  }, [workout.workoutTemplate.exercises])

  const colors = useCadenceColors()
  return (
    <View className="gap-field rounded-card bg-surface p-card">
      <View className="flex-row items-start gap-field">
        <Pressable
          className="min-h-touch min-w-0 flex-1 gap-compact active:opacity-75"
          onPress={onPress ? () => onPress(workout) : undefined}
          disabled={!onPress}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={onPress ? `View workout ${workout.title}` : undefined}
        >
          <UiText textRole="cardTitle">{workout.title}</UiText>
          {isInRoutine && <UiText textRole="caption">{normalizedRoutineName}</UiText>}
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
      <View className="flex-row flex-wrap gap-field">
        <UiText textRole="caption">
          {workout.workoutTemplate.exercises.length}{' '}
          {workout.workoutTemplate.exercises.length === 1 ? 'exercise' : 'exercises'}
        </UiText>
        <UiText textRole="caption">
          {summary.totalSets} {summary.totalSets === 1 ? 'set' : 'sets'}
        </UiText>
        <UiText textRole="caption">~{summary.approxMinutes} min</UiText>
      </View>
      <UiText textRole="caption">
        {summary.visibleExercises.join(' · ')}
        {summary.hiddenCount > 0 ? ` · +${summary.hiddenCount} more` : ''}
      </UiText>
      <Button
        disabled={isWorkoutRunning}
        onPress={handleStartWorkout}
        className="flex-row gap-compact py-field"
      >
        <Play size={18} color={colors.onAccent} aria-hidden />
        <UiText textRole="bodyOnAccent" className="shrink">
          {isWorkoutRunning ? 'Workout in Progress' : 'Start workout'}
        </UiText>
      </Button>
    </View>
  )
})
