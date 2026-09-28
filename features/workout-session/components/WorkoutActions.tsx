import { useRef, useState } from 'react'
import { YStack, Button, Text } from 'tamagui'
import { Plus } from '@tamagui/lucide-icons'

export interface WorkoutActionsProps {
  onAddExercise?: () => void
  onFinishWorkout: (notes?: string) => Promise<boolean>
  onCancelWorkout?: () => void
  onGoBack: () => void
}

export function WorkoutActions({
  onAddExercise,
  onFinishWorkout,
  onCancelWorkout,
  onGoBack,
}: WorkoutActionsProps) {
  const finishingRef = useRef(false)
  const [isFinishing, setIsFinishing] = useState(false)

  const handleFinishWorkout = async () => {
    if (finishingRef.current) return
    finishingRef.current = true
    setIsFinishing(true)

    try {
      if (await onFinishWorkout()) {
        onGoBack()
        return
      }
    } catch (error) {
      finishingRef.current = false
      setIsFinishing(false)
      throw error
    }

    finishingRef.current = false
    setIsFinishing(false)
  }

  return (
    <YStack gap="$3" px="$4" pb="$6">
      {onAddExercise && (
        <Button size="$4" bg="$primary" icon={Plus} mt="$2" onPress={onAddExercise}>
          <Text color="$onPrimary">Add Exercise</Text>
        </Button>
      )}

      <Button
        size="$5"
        bg="$secondary"
        mt="$4"
        onPress={handleFinishWorkout}
        disabled={isFinishing}
      >
        <Text color="$onSecondary" fontSize="$5" fontWeight="600">
          {isFinishing ? 'Saving Workout…' : 'Finish Workout'}
        </Text>
      </Button>

      {onCancelWorkout && (
        <Button
          size="$4"
          bg="$red9"
          mt="$2"
          onPress={() => {
            onCancelWorkout()
            onGoBack()
          }}
        >
          <Text color="$onPrimary" fontSize="$4" fontWeight="600">
            Cancel Workout
          </Text>
        </Button>
      )}
    </YStack>
  )
}
