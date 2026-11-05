import { Button, UiText } from '../../../components/ui/Controls'
import { Check } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui'
import { View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useCallback, memo } from 'react'
import type { Exercise, Set } from '../../../types/workout-session'
import { WorkoutSessionSetRow } from './WorkoutSessionSetRow'
import { CardioSessionSetRow } from './CardioSessionSetRow'

import { hasSetValues } from '../utils'

function SetRowSeparator() {
  return <View className="h-compact" />
}

interface WorkoutSessionExerciseProps {
  exercise: Exercise
  index: number
  onUpdateSet: (
    exerciseId: string,
    setId: string,
    field: 'reps' | 'weight' | 'duration',
    value: number | null
  ) => void
  onToggleSetComplete: (exerciseId: string, setId: string) => void
  onAddSet: (exerciseId: string) => void
  onRemoveSet: (exerciseId: string, setIndex: number) => void
  onStartRestTimer: (setId: string) => void
}

export const WorkoutSessionExercise = memo(
  function WorkoutSessionExercise({
    exercise,
    index,
    onUpdateSet,
    onToggleSetComplete,
    onAddSet,
    onRemoveSet,
    onStartRestTimer,
  }: WorkoutSessionExerciseProps) {
    const colors = useCadenceColors()
    const isCardio = exercise.category === 'CARDIO'
    const renderSetRow = useCallback(
      ({ item: set, index }: { item: Set; index: number }) => {
        if (isCardio) {
          return (
            <CardioSessionSetRow
              set={set}
              index={index}
              canDelete={exercise.sets.length > 1}
              onUpdateDuration={(secs) => onUpdateSet(exercise.sessionId, set.id, 'duration', secs)}
              onToggleComplete={() => onToggleSetComplete(exercise.sessionId, set.id)}
              onDelete={() => onRemoveSet(exercise.sessionId, index)}
            />
          )
        }
        return (
          <WorkoutSessionSetRow
            set={set}
            index={index}
            canDelete={exercise.sets.length > 1}
            onUpdateSet={(field, value) => onUpdateSet(exercise.sessionId, set.id, field, value)}
            onToggleComplete={() => {
              onToggleSetComplete(exercise.sessionId, set.id)
              if (!set.completed && hasSetValues(exercise.category, set)) {
                onStartRestTimer(set.id)
              }
            }}
            onDelete={() => onRemoveSet(exercise.sessionId, index)}
          />
        )
      },
      [
        isCardio,
        exercise.category,
        exercise.sessionId,
        exercise.sets.length,
        onUpdateSet,
        onToggleSetComplete,
        onStartRestTimer,
        onRemoveSet,
      ]
    )

    return (
      <View className="w-full gap-field rounded-card border border-divider bg-surface p-card">
        <View className="min-h-touch justify-center gap-compact">
          <UiText accessibilityRole="header" textRole="cardTitle">
            {index + 1}. {exercise.name}
          </UiText>
          <UiText textRole="caption">
            {exercise.primaryMuscles[0] || (isCardio ? 'Cardio' : 'Other')} · {exercise.sets.length}{' '}
            {isCardio ? 'intervals' : 'sets'}
          </UiText>
        </View>
        <View className="gap-compact">
          <View className="mb-compact w-full min-w-0 flex-row items-center gap-compact">
            <UiText textRole="meta" className="w-8 text-center">
              {isCardio ? '#' : 'Set'}
            </UiText>
            <UiText textRole="meta" className="flex-1 text-center">
              {isCardio ? 'Duration (min:sec)' : 'Weight (kg)'}
            </UiText>
            {!isCardio && (
              <UiText textRole="meta" className="flex-1 text-center">
                Reps
              </UiText>
            )}
            <View className="w-touch items-center" accessibilityLabel="Completion">
              <Check size={18} color={colors.muted} strokeWidth={2} aria-hidden />
            </View>
          </View>

          {/* Sets */}
          <View>
            <FlashList
              data={exercise.sets}
              renderItem={renderSetRow}
              keyExtractor={(item) => item.id}
              ItemSeparatorComponent={SetRowSeparator}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
            />
          </View>

          {/* Add Set Button */}
          <Button
            variant="secondary"
            className="mt-compact"
            accessibilityLabel={`Add ${isCardio ? 'interval' : 'set'} to ${exercise.name}`}
            onPress={() => onAddSet(exercise.sessionId)}
          >
            <UiText textRole="captionEmphasis">+ Add {isCardio ? 'interval' : 'set'}</UiText>
          </Button>
        </View>
      </View>
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if exercise data has changed
    return (
      prevProps.index === nextProps.index &&
      prevProps.exercise.sessionId === nextProps.exercise.sessionId &&
      prevProps.exercise.sets.length === nextProps.exercise.sets.length &&
      prevProps.exercise.sets.every((set, index) => {
        const nextSet = nextProps.exercise.sets[index]
        return (
          set.id === nextSet.id &&
          set.weight === nextSet.weight &&
          set.reps === nextSet.reps &&
          set.durationSeconds === nextSet.durationSeconds &&
          set.completed === nextSet.completed
        )
      })
    )
  }
)
