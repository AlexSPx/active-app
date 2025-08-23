import { Text, YStack, XStack, Card, Button, H3, Separator } from 'tamagui'
import { Plus, MoreHorizontal } from '@tamagui/lucide-icons'
import { View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useCallback } from 'react'
import { ExerciseSetRow } from './ExerciseSetRow'
import type { WorkoutExercise, WorkoutSet } from '../types/workout'

interface ExerciseEditorProps {
  exercise: WorkoutExercise
  onUpdateSets: (exerciseId: string, sets: WorkoutSet[]) => void
  onAddSet: (exerciseId: string) => void
  onRemoveSet: (exerciseId: string, setIndex: number) => void
}

export default function ExerciseEditor({
  exercise,
  onUpdateSets,
  onAddSet,
  onRemoveSet,
}: ExerciseEditorProps) {
  const updateSet = (setIndex: number, key: 'weight' | 'reps', value: number | null) => {
    const newSets = [...exercise.sets]
    newSets[setIndex] = { ...newSets[setIndex], [key]: value }
    onUpdateSets(exercise.id, newSets)
  }

  const renderSetRow = useCallback(
    ({ item: set, index: setIndex }: { item: WorkoutSet; index: number }) => (
      <ExerciseSetRow
        index={setIndex}
        weight={set.weight}
        reps={set.reps}
        onChange={(key, value) => updateSet(setIndex, key, value)}
        onDelete={() => onRemoveSet(exercise.id, setIndex)}
      />
    ),
    [exercise.id, onRemoveSet, updateSet]
  )

  return (
    <Card key={exercise.id} size="$4" mb="$3" p="$3" bg="$surface">
      <YStack gap="$2">
        {/* Exercise Header */}
        <XStack justify="space-between" items="center">
          <YStack>
            <H3 color="$color">{exercise.name}</H3>
            <Text fontSize="$3" color="$colorSubtle">
              {exercise.primaryMuscles[0] || 'Other'}
            </Text>
          </YStack>
          <Button size="$3" circular icon={MoreHorizontal} />
        </XStack>
        {/* Sets Header */}
        <XStack justify="space-between" px="$1">
          <YStack flex={1} items="center">
            <Text fontSize="$3" fontWeight="600" color="$color">
              SET
            </Text>
          </YStack>
          <YStack flex={1} items="center">
            <Text fontSize="$3" fontWeight="600" color="$color">
              WEIGHT
            </Text>
          </YStack>
          <YStack flex={1} items="center">
            <Text fontSize="$3" fontWeight="600" color="$color">
              REPS
            </Text>
          </YStack>
        </XStack>
        <Separator />
        {/* Sets */}
        <FlashList
          data={exercise.sets}
          renderItem={renderSetRow}
          keyExtractor={(_, index) => index.toString()}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        />

        {/* Add Set Button */}
        <Button
          size="$3"
          variant="outlined"
          icon={Plus}
          onPress={() => onAddSet(exercise.id)}
          borderColor="$primary"
          color="$primary"
        >
          <Text color="$primary">Add Set</Text>
        </Button>
      </YStack>
    </Card>
  )
}
