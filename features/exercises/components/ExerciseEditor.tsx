import { Text, YStack, XStack, Button } from 'tamagui'
import { MoreHorizontal } from '@tamagui/lucide-icons'
import { Popover } from '@tamagui/popover'
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
  const [menuOpen, setMenuOpen] = useState(false)
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
          <Popover open={menuOpen} onOpenChange={setMenuOpen} placement="bottom-end">
            <Popover.Trigger asChild>
              <Button
                unstyled
                width="$touch"
                height="$touch"
                justify="center"
                items="center"
                rounded="$control"
                accessibilityLabel={`More actions for ${exercise.name}`}
              >
                <MoreHorizontal size="$iconSmall" color="$colorSubtle" />
              </Button>
            </Popover.Trigger>
            <Popover.Content
              bg="$surface"
              p="$compact"
              rounded="$menu"
              borderColor="$borderColor"
              borderWidth="$0.5"
            >
              <YStack>
                {([-1, 1] as const).map((direction) => (
                  <Popover.Close asChild key={direction}>
                    <Button
                      chromeless
                      height="$touch"
                      justify="flex-start"
                      disabled={direction === -1 ? !canMoveUp : !canMoveDown}
                      onPress={() => onMove?.(direction)}
                    >
                      <Text fontSize="$caption" color="$color">
                        Move {direction === -1 ? 'up' : 'down'}
                      </Text>
                    </Button>
                  </Popover.Close>
                ))}
                <Popover.Close asChild>
                  <Button chromeless height="$touch" justify="flex-start" onPress={onRemove}>
                    <Text fontSize="$caption" color="$destructive">
                      Remove exercise
                    </Text>
                  </Button>
                </Popover.Close>
              </YStack>
            </Popover.Content>
          </Popover>
        )}
      </XStack>
      {expanded && (
        <YStack gap="$compact">
          <XStack gap="$compact" mb="$compact">
            <Text width="$icon" text="center" fontSize="$caption" color="$colorSubtle">
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
