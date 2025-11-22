import { YStack, Text, Card, XStack, View } from 'tamagui'
import { FlashList } from '@shopify/flash-list'
import { memo, useCallback } from 'react'
import type { Exercise } from '../../types/workout'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { ErrorDisplay } from '../ui/ErrorDisplay'

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
      <ExerciseCard
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
      <YStack p="$4">
        <Text fontSize="$4" color="$colorSubtle">
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

interface ExerciseCardProps {
  exercise: Exercise
  onSelect: (exercise: Exercise) => void
  isSelected: boolean
}

const ExerciseCard = memo(function ExerciseCard({
  exercise,
  onSelect,
  isSelected,
}: ExerciseCardProps) {
  const handlePress = useCallback(() => {
    onSelect(exercise)
  }, [onSelect, exercise])

  return (
    <Card
      p="$3"
      mb="$2"
      bg={isSelected ? '$backgroundAccent' : '$surface'}
      borderColor={isSelected ? '$primary' : '$borderColor'}
      borderWidth={isSelected ? 2 : 1}
      pressStyle={{
        scale: 0.98,
        backgroundColor: isSelected ? '$backgroundAccentHover' : '$surfaceHover',
      }}
      onPress={handlePress}
    >
      <XStack justify="space-between" verticalAlign="center" gap="$3">
        <YStack flex={1} gap="$1">
          <Text fontSize="$5" fontWeight="700" color="$color">
            {exercise.name}
          </Text>
          <Text fontSize="$3" color={isSelected ? '$colorMuted' : '$colorSubtle'}>
            {exercise.primaryMuscles[0] || 'Other'}
          </Text>
          {exercise.equipment && (
            <Text fontSize="$2" color={isSelected ? '$colorMuted' : '$colorSubtle'}>
              Equipment: {exercise.equipment}
            </Text>
          )}
        </YStack>
        {isSelected && (
          <Text fontSize="$5" color="$primary" fontWeight="bold">
            ✓
          </Text>
        )}
      </XStack>
    </Card>
  )
})
