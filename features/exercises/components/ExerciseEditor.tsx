import { Text, YStack, XStack, Button } from 'tamagui'
import { ActionMenu } from '../../../components/ui/ActionMenu'
import { useState } from 'react'
import { ExerciseSetRow } from './ExerciseSetRow'
import CardioEditorSetRow from './CardioEditorSetRow'
import type { WorkoutExercise, WorkoutSet } from '../../../types/workout'

interface ExerciseEditorProps {
  exercise: WorkoutExercise
  index?: number
  onUpdateSets: (exerciseId: string, sets: WorkoutSet[]) => void
  onAddSet: (exerciseId: string) => void
  onRemoveSet: (exerciseId: string, setIndex: number) => void
  onMove?: (direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  onRemove?: () => void
}

export default function ExerciseEditor({
  exercise,
  index = 0,
  onUpdateSets,
  onAddSet,
  onRemoveSet,
  onMove,
  canMoveUp,
  canMoveDown,
  onRemove,
}: ExerciseEditorProps) {
  const [expanded, setExpanded] = useState(true)
  const cardio = exercise.category === 'CARDIO'
  return (
    <YStack
      p="$card"
      gap="$field"
      bg="$surface"
      rounded="$card"
      borderColor="$borderColor"
      borderWidth="$0.5"
    >
      <XStack items="flex-start" gap="$compact">
        <YStack
          flex={1}
          minH="$touch"
          onPress={() => setExpanded(!expanded)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${exercise.name}, ${expanded ? 'hide' : 'edit'} sets`}
        >
          <Text fontSize="$header" lineHeight="$header" fontWeight="$screenTitle" color="$color">
            {index + 1}. {exercise.name}
          </Text>
          <Text fontSize="$caption" lineHeight="$caption" color="$colorSubtle">
            {exercise.primaryMuscles[0] || (cardio ? 'Cardio' : 'Other')} · {exercise.sets.length}{' '}
            {cardio ? 'intervals' : 'sets'}
            <Text color="$primary"> · {expanded ? 'Hide sets' : 'Edit sets'}</Text>
          </Text>
        </YStack>
        {onRemove && (
          <ActionMenu
            label={`More actions for ${exercise.name}`}
            actions={[
              { label: 'Move up', disabled: !canMoveUp, onPress: () => onMove?.(-1) },
              { label: 'Move down', disabled: !canMoveDown, onPress: () => onMove?.(1) },
              { label: 'Remove exercise', destructive: true, onPress: onRemove },
            ]}
          />
        )}
      </XStack>
      {expanded && (
        <YStack gap="$compact">
          <XStack gap="$compact" mb="$compact">
            <Text width="$setRow" text="center" fontSize="$caption" color="$colorSubtle">
              {cardio ? '#' : 'Set'}
            </Text>
            <Text flex={1} text="center" fontSize="$caption" color="$colorSubtle">
              {cardio ? 'Duration (min:sec)' : 'Weight (kg)'}
            </Text>
            {!cardio && (
              <Text flex={1} text="center" fontSize="$caption" color="$colorSubtle">
                Reps
              </Text>
            )}
          </XStack>
          {exercise.sets.map((set, setIndex) => {
            const onChange = (
              field: 'weight' | 'reps' | 'durationSeconds',
              value: number | null
            ) => {
              onUpdateSets(
                exercise.id,
                exercise.sets.map((item, i) =>
                  i === setIndex ? { ...item, [field]: value } : item
                )
              )
            }
            const onDelete = () => onRemoveSet(exercise.id, setIndex)
            return cardio ? (
              <CardioEditorSetRow
                key={setIndex}
                index={setIndex}
                durationSeconds={set.durationSeconds}
                onChange={(seconds) => onChange('durationSeconds', seconds)}
                onDelete={onDelete}
              />
            ) : (
              <ExerciseSetRow
                key={setIndex}
                index={setIndex}
                weight={set.weight}
                reps={set.reps}
                onChange={onChange}
                onDelete={onDelete}
              />
            )
          })}
          <Button
            height="$touch"
            mt="$compact"
            rounded="$day"
            bg="$backgroundStrong"
            onPress={() => onAddSet(exercise.id)}
          >
            <Text color="$primary" fontSize="$caption">
              + Add {cardio ? 'interval' : 'set'}
            </Text>
          </Button>
        </YStack>
      )}
    </YStack>
  )
}
