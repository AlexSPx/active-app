import { YStack, XStack, Text, Checkbox } from 'tamagui'
import { memo } from 'react'
import { Check } from '../../../components/ui/icons'
import { StrengthTargetInput, SwipeToDeleteRow } from '../../../components/ui'
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
            </Text>
          </YStack>
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
              accessibilityLabel={`Set ${index + 1} completed`}
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
