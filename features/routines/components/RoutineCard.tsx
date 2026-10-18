import { Pressable, View } from 'react-native'
import { ActionMenu } from '../../../components/ui/ActionMenu'
import { Badge } from '../../../components/ui/Badge'
import { UiText } from '../../../components/ui/Controls'
import { Check, Dumbbell } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import type { Routine } from '../../../types/routine'
import { haptics } from '../../../utils/haptics'

export interface RoutineCardProps {
  routine: Routine
  isActive?: boolean
  onActivate?: (routineId: string) => void
  onEdit?: (routine: Routine) => void
  onDelete?: (routineId: string) => void
  onStartFromToday?: (routineId: string) => void
  onPress?: (routine: Routine) => void
  disabled?: boolean
}

export function RoutineCard({
  routine,
  isActive = false,
  onActivate,
  onEdit,
  onDelete,
  onStartFromToday,
  onPress,
  disabled = false,
}: RoutineCardProps) {
  const colors = useCadenceColors()
  const weekly = routine.routineType === 'WEEKLY_COMPLETION'
  const days = [...routine.pattern].sort((a, b) => a.dayIndex - b.dayIndex)
  const training = days.filter((day) => day.dayType === 'WORKOUT')
  const activate = () => {
    if (!disabled && !isActive) {
      haptics.medium()
      onActivate?.(routine.id)
    }
  }
  return (
    <View
      className={`gap-field rounded-card border p-card bg-surface ${isActive ? 'border-accent' : 'border-transparent'} ${disabled ? 'opacity-70' : ''}`}
    >
      <View className="flex-row items-start gap-field">
        <Pressable
          className="min-h-touch flex-1 justify-center active:opacity-75"
          disabled={disabled || !onPress}
          onPress={() => onPress?.(routine)}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={onPress ? `View routine ${routine.name}` : undefined}
          accessibilityState={{ disabled }}
        >
          <UiText textRole="cardTitle">{routine.name}</UiText>
        </Pressable>
        {(onEdit || onDelete || onStartFromToday || (onActivate && !isActive)) && (
          <ActionMenu
            label={`More actions for ${routine.name}`}
            disabled={disabled}
            onOpen={() => haptics.light()}
            actions={[
              ...(onEdit ? [{ label: 'Edit', onPress: () => onEdit(routine), disabled }] : []),
              ...(onStartFromToday
                ? [{ label: 'Start today', onPress: () => onStartFromToday(routine.id), disabled }]
                : []),
              ...(onActivate && !isActive
                ? [{ label: 'Set active', onPress: activate, disabled }]
                : []),
              ...(onDelete
                ? [
                    {
                      label: 'Delete',
                      onPress: () => onDelete(routine.id),
                      destructive: true,
                      disabled,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </View>
      <View className="flex-row items-center justify-between gap-field">
        <UiText textRole="meta" className="flex-1">
          {weekly ? 'Flexible week' : 'Repeating cycle'}
        </UiText>
        {isActive && (
          <Badge variant="pill" icon={<Check size={11} color={colors.accent} aria-hidden />}>
            Active
          </Badge>
        )}
      </View>
      {!!routine.description?.trim() && (
        <UiText textRole="meta" numberOfLines={2}>
          {routine.description.trim()}
        </UiText>
      )}
      {weekly ? (
        <UiText textRole="meta">
          {training.length} {training.length === 1 ? 'workout' : 'workouts'} / Any order
        </UiText>
      ) : (
        <View className="flex-row flex-wrap gap-compact">
          {days.map((day) => {
            const trainingDay = day.dayType === 'WORKOUT'
            return (
              <View
                key={day.dayIndex}
                className={`h-10 min-w-8 flex-1 items-center justify-center gap-1 rounded-button ${trainingDay ? 'bg-accent' : 'bg-raised'}`}
                accessible
                accessibilityLabel={`Day ${day.dayIndex} · ${trainingDay ? 'Training' : 'Rest'}`}
              >
                <UiText textRole={trainingDay ? 'bodyOnAccent' : 'caption'}>{day.dayIndex}</UiText>
                {trainingDay ? (
                  <Dumbbell size={14} color={colors.onAccent} aria-hidden />
                ) : (
                  <UiText textRole="caption">–</UiText>
                )}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}
