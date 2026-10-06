import { YStack, Text, XStack, View } from 'tamagui'
import { FlashList } from '@shopify/flash-list'
import { memo, useCallback } from 'react'
import type { Exercise } from '../../../types/workout'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay'

interface ExerciseListProps {
  exercises: Exercise[]
  loading: boolean
  error: string | null
  onExerciseSelect: (exercise: Exercise) => void
  onRetry?: () => void
  emptyMessage?: string
  selectedExerciseIds?: Set<string>
}

export const ExerciseList = memo(function ExerciseList({
  exercises,
  loading,
  error,
  onExerciseSelect,
  onRetry,
  emptyMessage = 'No exercises found',
  selectedExerciseIds = new Set<string>(),
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

  if (loading) {
    return <LoadingSpinner text="Loading exercises..." />
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={onRetry} />
  }

  if (exercises.length === 0) {
    return (
      <YStack p="$field">
        <Text fontSize="$exerciseTitle" color="$colorSubtle">
          {emptyMessage}
        </Text>
      </YStack>
    )
  }

  return (
    <View flex={1}>
      <FlashList
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
  const handlePress = useCallback(() => {
    onSelect(exercise)
  }, [onSelect, exercise])

  const muscle = exercise.primaryMuscles[0] || 'Other'

  return (
    <XStack
      p="$field"
      bg={isSelected ? '$backgroundAccent' : '$background'}
      borderBottomWidth="$0.5"
      borderWidth={isSelected ? '$0.5' : '$0'}
      rounded={isSelected ? '$control' : '$0'}
      mb="$compact"
      minH="$6"
      borderColor={isSelected ? '$primary' : '$borderColor'}
      pressStyle={{
        background: isSelected ? '$backgroundAccentHover' : '$surfaceHover',
      }}
      cursor="pointer"
      accessibilityRole="checkbox"
      accessibilityLabel={`${exercise.name}, ${muscle}${exercise.equipment ? `, Equipment: ${exercise.equipment}` : ''}`}
      accessibilityState={{ checked: isSelected }}
      onPress={handlePress}
    >
      <XStack flex={1} justify="space-between" items="center" gap="$field">
        <YStack flex={1} gap="$compact">
          <Text fontSize="$exerciseTitle" fontWeight="$exerciseTitle" color="$color">
            {exercise.name}
          </Text>
          <Text fontSize="$caption" color={isSelected ? '$colorMuted' : '$colorSubtle'}>
            {muscle}
            {exercise.equipment ? ` · ${exercise.equipment}` : ''}
          </Text>
        </YStack>
        <YStack
          width="$2"
          height="$2"
          rounded="$button"
          bg={isSelected ? '$primary' : '$surface'}
          borderColor="$borderColor"
          borderWidth="$0.5"
          justify="center"
          items="center"
        >
          <Text
            fontSize="$body"
            color={isSelected ? '$onPrimary' : '$colorSubtle'}
            fontWeight="$header"
          >
            {isSelected ? '✓' : '+'}
          </Text>
        </YStack>
      </XStack>
    </XStack>
  )
})
