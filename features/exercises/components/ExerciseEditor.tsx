import { Text, YStack, XStack, Card, Button, Separator } from 'tamagui'
import { Plus } from '@tamagui/lucide-icons'
import { FlashList } from '@shopify/flash-list'
import { useCallback } from 'react'
import { ExerciseSetRow } from './ExerciseSetRow'
import CardioEditorSetRow from './CardioEditorSetRow'
import type { WorkoutExercise, WorkoutSet } from '../../../types/workout'

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
  const renderSetRow = useCallback(
    ({ item: set, index: setIndex }: { item: WorkoutSet; index: number }) => {
      const handleChange = (key: 'weight' | 'reps' | 'durationSeconds', value: number | null) => {
        const newSets = [...exercise.sets]
        newSets[setIndex] = { ...newSets[setIndex], [key]: value }
        onUpdateSets(exercise.id, newSets)
      }

      const handleDelete = () => {
        onRemoveSet(exercise.id, setIndex)
      }

      if (exercise.category === 'CARDIO') {
        return (
          <CardioEditorSetRow
            index={setIndex}
            durationSeconds={set.durationSeconds}
            onChange={(secs) => handleChange('durationSeconds', secs)}
            onDelete={handleDelete}
          />
        )
      }
      return (
        <ExerciseSetRow
          index={setIndex}
          weight={set.weight}
          reps={set.reps}
          onChange={(key, value) => handleChange(key, value)}
          onDelete={handleDelete}
        />
      )
    },
    [exercise.sets, exercise.id, exercise.category, onUpdateSets, onRemoveSet]
  )

  return (
    <Card key={exercise.id} size="$4" mb="$3" p="$3" bg="$surface">
      <YStack gap="$2">
        {/* Exercise Header */}
        <XStack items="center" gap="$2">
          <YStack flex={1} style={{ minWidth: 0 }}>
            <Text fontSize="$6" fontWeight="600" color="$color">
              {exercise.name}
            </Text>
            <Text fontSize="$3" color="$colorSubtle">
              {exercise.primaryMuscles[0] || 'Other'}
            </Text>
          </YStack>
        </XStack>
        {/* Sets Header */}
        {exercise.category === 'CARDIO' ? (
          <XStack gap="$2" px="$1">
            <YStack flex={1} items="center">
              <Text fontSize="$3" fontWeight="600" color="$color">
                SET
              </Text>
            </YStack>
            <YStack flex={2} items="center">
              <Text fontSize="$3" fontWeight="600" color="$color">
                DURATION
              </Text>
            </YStack>
          </XStack>
        ) : (
          <XStack gap="$2" px="$1">
            <YStack flex={0.6} items="center">
              <Text fontSize="$2" fontWeight="600" color="$color">
                SET
              </Text>
            </YStack>
            <YStack flex={1.2} items="center">
              <Text fontSize="$2" fontWeight="600" color="$color">
                WEIGHT (kg)
              </Text>
            </YStack>
            <YStack flex={1.2} items="center">
              <Text fontSize="$2" fontWeight="600" color="$color">
                REPS
              </Text>
            </YStack>
          </XStack>
        )}
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
          <Text color="$primary">Add {exercise.category === 'CARDIO' ? 'Interval' : 'Set'}</Text>
        </Button>
      </YStack>
    </Card>
  )
}
