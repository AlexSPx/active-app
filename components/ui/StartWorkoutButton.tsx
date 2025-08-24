import { Button, Text } from 'tamagui'
import { Play } from '@tamagui/lucide-icons'

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
  return (
    <Button
      size={size}
      bg="$secondary"
      disabled={disabled || isWorkoutRunning}
      onPress={onPress}
      icon={Play}
      opacity={disabled || isWorkoutRunning ? 0.5 : 1}
    >
      <Text>{isWorkoutRunning ? 'Workout in Progress' : 'Start Workout'}</Text>
    </Button>
  )
}
