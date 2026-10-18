import { Button, Text } from 'tamagui'
import { Play } from './icons'
import { useCadenceColors } from './useCadenceColors'

export interface StartWorkoutButtonProps {
  onPress: () => void
  disabled?: boolean
  isWorkoutRunning?: boolean
  size?: '$4' | '$5' | '$6'
}

export function StartWorkoutButton({
  onPress,
  disabled = false,
  isWorkoutRunning = false,
  size = '$4',
}: StartWorkoutButtonProps) {
  const colors = useCadenceColors()
  return (
    <Button
      size={size}
      bg={colors.accent}
      minH="$action"
      rounded="$button"
      pressStyle={{ opacity: 0.88 }}
      disabled={disabled || isWorkoutRunning}
      onPress={onPress}
      icon={<Play size="$icon" color={colors.onAccent} aria-hidden />}
      opacity={disabled || isWorkoutRunning ? 0.5 : 1}
    >
      <Text color={colors.onAccent}>
        {isWorkoutRunning ? 'Workout in Progress' : 'Start Workout'}
      </Text>
    </Button>
  )
}
