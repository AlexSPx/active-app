import { Pressable, ScrollView, View } from 'react-native'
import { ActionMenu } from '../../../components/ui/ActionMenu'
import { Badge } from '../../../components/ui/Badge'
import { Button, UiText } from '../../../components/ui/Controls'
import { Dumbbell } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'
import type { Routine } from '../../../types/routine'
import { haptics } from '../../../utils/haptics'

export interface RoutineCardProps {
  routine: Routine
  isActive?: boolean
  workoutTitleById?: Record<string, string>
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
  workoutTitleById,
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
        <UiText textRole="caption">{weekly ? 'Flexible week' : 'Repeating cycle'}</UiText>
        {isActive && <Badge variant="secondary">Active</Badge>}
      </View>
      {!!routine.description?.trim() && (
        <UiText textRole="caption" numberOfLines={2}>
          {routine.description.trim()}
        </UiText>
      )}
      {weekly ? (
        <View className="gap-compact">
          <UiText textRole="caption">
            {training.length} {training.length === 1 ? 'workout' : 'workouts'} / Any order
          </UiText>
          {training.map((day, index) => (
            <View
              key={`${day.dayIndex}-${index}`}
              className="min-h-touch flex-row items-center gap-field border-t border-divider py-compact"
              accessible
              accessibilityLabel={`Workout ${index + 1} · ${day.workoutId ? workoutTitleById?.[day.workoutId] || 'Training' : 'Training'}`}
            >
              <UiText textRole="caption">{index + 1}</UiText>
              <UiText className="flex-1" textRole="caption">
                {day.workoutId
                  ? workoutTitleById?.[day.workoutId] || 'Saved workout'
                  : 'Saved workout'}
              </UiText>
              <Dumbbell size={16} color={colors.muted} aria-hidden />
            </View>
          ))}
        </View>
      ) : (
        <View className="gap-field">
          <View className="flex-row flex-wrap gap-field">
            <UiText textRole="caption">
              {training.length} {training.length === 1 ? 'training day' : 'training days'}
            </UiText>
            <UiText textRole="caption">
              {days.length - training.length}{' '}
              {days.length - training.length === 1 ? 'rest day' : 'rest days'}
            </UiText>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <View className="flex-1 flex-row gap-compact">
              {days.map((day) => (
                <View
                  key={day.dayIndex}
                  className={`min-h-touch min-w-8 flex-1 items-center justify-center rounded-control px-compact py-compact ${day.dayType === 'WORKOUT' ? 'bg-accent' : 'bg-raised'}`}
                  accessible
                  accessibilityLabel={`Day ${day.dayIndex} · ${day.dayType === 'WORKOUT' ? 'Training' : 'Rest'}`}
                >
                  <UiText textRole={day.dayType === 'WORKOUT' ? 'bodyOnAccent' : 'caption'}>
                    {day.dayIndex}
                  </UiText>
                  {day.dayType === 'WORKOUT' ? (
                    <Dumbbell size={12} color={colors.onAccent} aria-hidden />
                  ) : (
                    <UiText textRole="caption">—</UiText>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
      {onActivate && !isActive && (
        <Button variant="secondary" disabled={disabled} onPress={activate}>
          Set active routine
        </Button>
      )}
    </View>
  )
}
