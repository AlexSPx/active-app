import { YStack, XStack, Text, Checkbox } from 'tamagui'
import { memo } from 'react'
import { Check } from '../../../components/ui/icons'
import { DurationTargetInput, SwipeToDeleteRow } from '../../../components/ui'
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
    return (
      <SwipeToDeleteRow onDelete={onDelete} canDelete={canDelete}>
        <XStack
          width="100%"
          minW={0}
          items="center"
          gap="$compact"
          bg={set.completed ? '$primary' : '$surface'}
        >
          <YStack width="$setRow" items="center">
            <Text
              fontSize="$caption"
              color={set.completed ? '$onPrimary' : '$colorSubtle'}
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
            </Text>
          </YStack>
          <DurationTargetInput
            mode="session"
            index={index}
            seconds={set.durationSeconds ?? 0}
            completed={set.completed}
            onChange={onUpdateDuration}
          />
          <YStack width="$setRow" items="center">
            <Checkbox
              unstyled
              width="$setRow"
              height="$setRow"
              rounded="$block"
              items="center"
              justify="center"
              borderWidth="$0.5"
              hitSlop={6}
              checked={set.completed}
              onCheckedChange={onToggleComplete}
              accessibilityLabel={`Interval ${index + 1} completed`}
              bg={set.completed ? '$primary' : '$backgroundStrong'}
              borderColor={set.completed ? '$primary' : '$borderColor'}
            >
              <Checkbox.Indicator>
                <Check size="$iconSmall" color="$onPrimary" strokeWidth={2} />
              </Checkbox.Indicator>
            </Checkbox>
          </YStack>
        </XStack>
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
