import { memo } from 'react'
import { View } from 'react-native'
import { Check } from '../../../components/ui/icons'
import {
  Button,
  StrengthTargetInput,
  SwipeToDeleteRow,
  UiText,
  useCadenceColors,
} from '../../../components/ui'
import type { Set } from '../../../types/workout-session'

interface WorkoutSessionSetRowProps {
  set: Set
  index: number
  canDelete: boolean
  onUpdateSet: (field: 'reps' | 'weight', value: number | null) => void
  onToggleComplete: () => void
  onDelete: () => void
}

export const WorkoutSessionSetRow = memo(
  function WorkoutSessionSetRow({
    set,
    index,
    canDelete,
    onUpdateSet,
    onToggleComplete,
    onDelete,
  }: WorkoutSessionSetRowProps) {
    const colors = useCadenceColors()

    return (
      <SwipeToDeleteRow onDelete={onDelete} canDelete={canDelete}>
        <View
          className={`w-full min-w-0 flex-row items-center gap-compact ${set.completed ? 'bg-accent' : 'bg-surface'}`}
        >
          <View className="w-8 items-center">
            <UiText
              textRole="caption"
              className={set.completed ? 'text-on-accent' : ''}
              accessibilityLabel={`Set ${index + 1}`}
              accessibilityHint={
                canDelete
                  ? 'Swipe left or use the Delete action to remove this set.'
                  : 'At least one set is required.'
              }
              accessibilityActions={canDelete ? [{ name: 'delete', label: 'Delete set' }] : []}
              onAccessibilityAction={(event) => {
                if (canDelete && event.nativeEvent.actionName === 'delete') onDelete()
              }}
            >
              {index + 1}
            </UiText>
          </View>
          <StrengthTargetInput
            mode="session"
            field="weight"
            index={index}
            value={set.weight}
            completed={set.completed}
            onChange={(value) => onUpdateSet('weight', value)}
          />
          <StrengthTargetInput
            mode="session"
            field="reps"
            index={index}
            value={set.reps}
            completed={set.completed}
            onChange={(value) => onUpdateSet('reps', value)}
          />
          <View className="w-touch items-center">
            <Button
              variant={set.completed ? 'primary' : 'secondary'}
              shape="control"
              density="compact"
              className={`h-touch w-touch min-w-touch border p-0 ${set.completed ? 'border-accent' : 'border-divider'}`}
              hitSlop={6}
              onPress={onToggleComplete}
              accessibilityRole="checkbox"
              accessibilityLabel={`Set ${index + 1} completed`}
              accessibilityState={{ checked: set.completed }}
            >
              {set.completed && (
                <Check size={18} color={colors.onAccent} strokeWidth={2} aria-hidden />
              )}
            </Button>
          </View>
        </View>
      </SwipeToDeleteRow>
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if set data has changed
    return (
      prevProps.set.id === nextProps.set.id &&
      prevProps.set.weight === nextProps.set.weight &&
      prevProps.set.reps === nextProps.set.reps &&
      prevProps.set.completed === nextProps.set.completed &&
      prevProps.index === nextProps.index &&
      prevProps.canDelete === nextProps.canDelete
    )
  }
)
