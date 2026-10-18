import { useState } from 'react'
import { Keyboard, Pressable, View } from 'react-native'
import { Button, UiText } from '../../../components/ui/Controls'
import { CadenceOverlay } from '../../../components/ui/CadenceOverlay'
import { ArrowDown, ArrowUp, MoreHorizontal, Trash2 } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import { SwipeToDeleteRow } from '../../../components/ui/SwipeToDeleteRow'
import { DurationTargetInput, StrengthTargetInput } from '../../../components/ui/WorkoutSetFields'
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
  canMoveUp = false,
  canMoveDown = false,
  onRemove,
}: ExerciseEditorProps) {
  const [expanded, setExpanded] = useState(true)
  const [actionsOpen, setActionsOpen] = useState(false)
  const cardio = exercise.category === 'CARDIO'
  const colors = useCadenceColors()

  const updateSet = (setIndex: number, field: keyof WorkoutSet, value: number | null) => {
    onUpdateSets(
      exercise.id,
      exercise.sets.map((set, currentIndex) =>
        currentIndex === setIndex ? { ...set, [field]: value } : set
      )
    )
  }

  return (
    <View className="gap-field rounded-card border border-divider bg-surface p-card">
      <View className="flex-row items-start gap-compact">
        <Pressable
          className="min-h-touch flex-1 justify-center"
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${exercise.name}, ${expanded ? 'hide' : 'edit'} sets`}
        >
          <UiText textRole="cardTitle">
            {index + 1}. {exercise.name}
          </UiText>
          <UiText textRole="caption">
            {exercise.primaryMuscles[0] || (cardio ? 'Cardio' : 'Other')} · {exercise.sets.length}{' '}
            {cardio ? 'intervals' : 'sets'} · {expanded ? 'Hide sets' : 'Edit sets'}
          </UiText>
        </Pressable>
        <Button
          variant="ghost"
          density="compact"
          className="h-touch w-touch p-0"
          accessibilityLabel={`Actions for ${exercise.name}`}
          accessibilityState={{ expanded: actionsOpen }}
          onPress={() => {
            Keyboard.dismiss()
            setActionsOpen(true)
          }}
        >
          <MoreHorizontal size={20} color={colors.muted} aria-hidden />
        </Button>
      </View>

      {expanded && (
        <View className="gap-compact">
          <View className="flex-row items-center gap-compact">
            <UiText textRole="meta" className="w-8 text-center">
              {cardio ? '#' : 'Set'}
            </UiText>
            <UiText textRole="meta" className="flex-1 text-center">
              {cardio ? 'Duration (min:sec)' : 'Weight (kg)'}
            </UiText>
            {!cardio && (
              <UiText textRole="meta" className="flex-1 text-center">
                Reps
              </UiText>
            )}
            <View className="w-touch" />
          </View>

          {exercise.sets.map((set, setIndex) => {
            const canDelete = exercise.sets.length > 1
            const deleteSet = () => {
              if (canDelete) onRemoveSet(exercise.id, setIndex)
            }

            return (
              <SwipeToDeleteRow
                key={`${exercise.id}-${setIndex}`}
                canDelete={canDelete}
                onDelete={deleteSet}
              >
                <View className="flex-row items-center gap-compact bg-surface">
                  <UiText textRole="meta" className="w-8 text-center">
                    {setIndex + 1}
                  </UiText>
                  {cardio ? (
                    <DurationTargetInput
                      mode="editor"
                      index={setIndex}
                      seconds={set.durationSeconds}
                      onChange={(value) => updateSet(setIndex, 'durationSeconds', value)}
                    />
                  ) : (
                    <>
                      <StrengthTargetInput
                        mode="editor"
                        field="weight"
                        index={setIndex}
                        value={set.weight}
                        onChange={(value) => updateSet(setIndex, 'weight', value)}
                      />
                      <StrengthTargetInput
                        mode="editor"
                        field="reps"
                        index={setIndex}
                        value={set.reps}
                        onChange={(value) => updateSet(setIndex, 'reps', value)}
                      />
                    </>
                  )}
                  <Button
                    variant="ghost"
                    density="compact"
                    disabled={!canDelete}
                    accessibilityLabel={`Delete ${cardio ? 'interval' : 'set'} ${setIndex + 1} for ${exercise.name}`}
                    accessibilityHint={
                      canDelete ? undefined : 'An exercise must keep at least one set.'
                    }
                    onPress={deleteSet}
                  >
                    <UiText textRole="captionDestructive">Delete</UiText>
                  </Button>
                </View>
              </SwipeToDeleteRow>
            )
          })}

          <Button
            variant="secondary"
            onPress={() => onAddSet(exercise.id)}
            accessibilityLabel={`Add ${cardio ? 'interval' : 'set'} to ${exercise.name}`}
          >
            <UiText textRole="bodyEmphasis">+ Add {cardio ? 'interval' : 'set'}</UiText>
          </Button>
        </View>
      )}

      <CadenceOverlay
        open={actionsOpen}
        onOpenChange={setActionsOpen}
        title={`${exercise.name} actions`}
      >
        <View className="gap-field">
          {onMove && (
            <>
              <Button
                variant="ghost"
                className="flex-row justify-start gap-field"
                disabled={!canMoveUp}
                accessibilityLabel={`Move ${exercise.name} earlier`}
                onPress={() => {
                  onMove(-1)
                  setActionsOpen(false)
                }}
              >
                <ArrowUp size={20} color={colors.foreground} aria-hidden />
                <UiText>Move earlier</UiText>
              </Button>
              <Button
                variant="ghost"
                className="flex-row justify-start gap-field"
                disabled={!canMoveDown}
                accessibilityLabel={`Move ${exercise.name} later`}
                onPress={() => {
                  onMove(1)
                  setActionsOpen(false)
                }}
              >
                <ArrowDown size={20} color={colors.foreground} aria-hidden />
                <UiText>Move later</UiText>
              </Button>
            </>
          )}
          {onRemove && (
            <Button
              variant="ghost"
              className="flex-row justify-start gap-field"
              accessibilityLabel={`Remove ${exercise.name} from workout`}
              onPress={() => {
                onRemove()
                setActionsOpen(false)
              }}
            >
              <Trash2 size={20} color={colors.accent} aria-hidden />
              <UiText textRole="bodyDestructive">Remove exercise</UiText>
            </Button>
          )}
          <Button variant="secondary" onPress={() => setActionsOpen(false)}>
            Cancel
          </Button>
        </View>
      </CadenceOverlay>
    </View>
  )
}
