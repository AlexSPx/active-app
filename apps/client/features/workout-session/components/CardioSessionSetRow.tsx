import { memo } from 'react'
import { View } from 'react-native'
import { Check } from '../../../components/ui/icons'
import {
  Button,
  DurationTargetInput,
  SwipeToDeleteRow,
  UiText,
  useCadenceColors,
} from '../../../components/ui'
import type { Set } from '../../../types/workout-session'

interface CardioSessionSetRowProps {
  set: Set
  index: number
  canDelete: boolean
  onUpdateDuration: (seconds: number) => void
  onToggleComplete: () => void
  onDelete: () => void
}

export const CardioSessionSetRow = memo(
  function CardioSessionSetRow({
    set,
    index,
    canDelete,
    onUpdateDuration,
    onToggleComplete,
    onDelete,
  }: CardioSessionSetRowProps) {
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
              accessibilityLabel={`Interval ${index + 1}`}
              accessibilityHint={
                canDelete
                  ? 'Swipe left or use the Delete action to remove this interval.'
                  : 'At least one interval is required.'
              }
              accessibilityActions={canDelete ? [{ name: 'delete', label: 'Delete interval' }] : []}
              onAccessibilityAction={(event) => {
                if (canDelete && event.nativeEvent.actionName === 'delete') onDelete()
              }}
            >
              {index + 1}
            </UiText>
          </View>
          <DurationTargetInput
            mode="session"
            index={index}
            seconds={set.durationSeconds ?? 0}
            completed={set.completed}
            onChange={onUpdateDuration}
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
              accessibilityLabel={`Interval ${index + 1} completed`}
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
  (prev, next) => {
    return (
      prev.set.id === next.set.id &&
      prev.set.durationSeconds === next.set.durationSeconds &&
      prev.set.completed === next.set.completed &&
      prev.index === next.index &&
      prev.canDelete === next.canDelete
    )
  }
)

export default CardioSessionSetRow
