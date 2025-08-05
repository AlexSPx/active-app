import { YStack, Button, Text } from 'tamagui'
import { Plus } from '@tamagui/lucide-icons'

export interface WorkoutActionsProps {
  onAddExercise?: () => void
  onFinishWorkout: (notes?: string) => Promise<void>
  onGoBack: () => void
}

export function WorkoutActions({ onAddExercise, onFinishWorkout, onGoBack }: WorkoutActionsProps) {
  const handleFinishWorkout = async () => {
    await onFinishWorkout()
    onGoBack()
  }

  return (
    <YStack gap="$3" px="$4" pb="$6">
      {onAddExercise && (
        <Button size="$4" bg="$primary" icon={Plus} mt="$2" onPress={onAddExercise}>
          <Text color="$onPrimary">Add Exercise</Text>
        </Button>
      )}

      <Button size="$5" bg="$secondary" mt="$4" onPress={handleFinishWorkout}>
        <Text color="$onSecondary" fontSize="$5" fontWeight="600">
          Finish Workout
        </Text>
      </Button>
    </YStack>
  )
}
