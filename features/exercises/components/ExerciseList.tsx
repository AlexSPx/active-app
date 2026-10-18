import { memo, useCallback } from 'react'
import { FlashList } from '@shopify/flash-list'
import { Pressable, View } from 'react-native'
import { UiText } from '../../../components/ui/Controls'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'
import type { Exercise } from '../../../types/workout'

interface ExerciseListProps {
  exercises: Exercise[]
  loading: boolean
  error: string | null
  onExerciseSelect: (exercise: Exercise) => void
  onRetry?: () => void
  emptyMessage?: string
  selectedExerciseIds?: Set<string>
}

const EMPTY_SELECTION: Set<string> = new Set()

export const ExerciseList = memo(function ExerciseList({
  exercises,
  loading,
  error,
  onExerciseSelect,
  onRetry,
  emptyMessage = 'No exercises found',
  selectedExerciseIds = EMPTY_SELECTION,
}: ExerciseListProps) {
  const renderExercise = useCallback(
    ({ item: exercise }: { item: Exercise }) => (
      <ExerciseRow
        exercise={exercise}
        onSelect={onExerciseSelect}
        isSelected={selectedExerciseIds.has(exercise.id)}
      />
    ),
    [onExerciseSelect, selectedExerciseIds]
  )
  const keyExtractor = useCallback((item: Exercise) => item.id, [])

  if (loading) return <LoadingSpinner text="Loading exercises…" />
  if (error) return <ErrorDisplay message={error} onRetry={onRetry} />
  if (exercises.length === 0) {
    return (
      <View className="gap-compact p-field" accessibilityLiveRegion="polite">
        <UiText textRole="bodyMuted">{emptyMessage}</UiText>
      </View>
    )
  }

  return (
    <View className="flex-1">
      <FlashList
        style={{ flex: 1 }}
        data={exercises}
        renderItem={renderExercise}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={false}
        getItemType={() => 'exercise'}
        extraData={selectedExerciseIds}
      />
    </View>
  )
})

interface ExerciseRowProps {
  exercise: Exercise
  onSelect: (exercise: Exercise) => void
  isSelected: boolean
}

const ExerciseRow = memo(function ExerciseRow({
  exercise,
  onSelect,
  isSelected,
}: ExerciseRowProps) {
  const muscle = exercise.primaryMuscles[0] || 'Other'
  return (
    <Pressable
      className={`mb-compact min-h-touch flex-row items-center justify-between gap-field rounded-control border p-field active:bg-raised ${isSelected ? 'border-accent bg-raised' : 'border-divider bg-background'}`}
      onPress={() => onSelect(exercise)}
      accessibilityRole="checkbox"
      accessibilityLabel={`${exercise.name}, ${muscle}${exercise.equipment ? `, equipment: ${exercise.equipment}` : ''}`}
      accessibilityState={{ checked: isSelected }}
    >
      <View className="min-w-0 flex-1 gap-compact">
        <UiText textRole="bodyEmphasis">{exercise.name}</UiText>
        <UiText textRole={isSelected ? 'captionEmphasis' : 'caption'}>
          {muscle}
          {exercise.equipment ? ` · ${exercise.equipment}` : ''}
        </UiText>
      </View>
      <View
        className={`h-8 w-8 items-center justify-center rounded-control border ${isSelected ? 'border-accent bg-accent' : 'border-divider bg-surface'}`}
        accessible={false}
        importantForAccessibility="no"
      >
        <UiText textRole={isSelected ? 'bodyOnAccent' : 'bodyMuted'}>
          {isSelected ? '✓' : '+'}
        </UiText>
      </View>
    </Pressable>
  )
})
