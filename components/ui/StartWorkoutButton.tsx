import { Button, UiText } from './Controls'
import { Play } from './icons'
import { useCadenceColors } from './useCadenceColors'

export interface StartWorkoutButtonProps {
  onPress: () => void
  disabled?: boolean
  isWorkoutRunning?: boolean
}

export function StartWorkoutButton({
  onPress,
  disabled = false,
  isWorkoutRunning = false,
}: StartWorkoutButtonProps) {
  const colors = useCadenceColors()
  return (
    <Button
      className="flex-row gap-field"
      disabled={disabled || isWorkoutRunning}
      onPress={onPress}
    >
      <Play size={20} color={colors.onAccent} aria-hidden />
      <UiText textRole="bodyOnAccent" className="shrink">
        {isWorkoutRunning ? 'Workout in Progress' : 'Start Workout'}
      </UiText>
    </Button>
  )
}
