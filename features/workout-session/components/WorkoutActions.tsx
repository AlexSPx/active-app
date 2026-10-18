import { useRef, useState } from 'react'
import { YStack, Button, Text } from 'tamagui'
import { Plus } from '../../../components/ui/icons'

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
    <YStack gap="$field" pt="$section" pb="$section">
      {onAddExercise && (
        <Button
          height="$action"
          rounded="$button"
          bg="$backgroundStrong"
          icon={<Plus size="$iconSmall" color="$primary" />}
          onPress={onAddExercise}
        >
          <Text color="$primary" fontSize="$caption">
            Add exercise
          </Text>
        </Button>
      )}

      <Button
        height="$action"
        rounded="$button"
        bg="$primary"
        onPress={handleFinishWorkout}
        disabled={isFinishing}
      >
        <Text color="$onPrimary" fontSize="$caption" fontWeight="$screenTitle">
          {isFinishing ? 'Saving…' : 'Finish workout'}
        </Text>
      </Button>

      {onCancelWorkout && (
        <Button
          chromeless
          height="$touch"
          rounded="$button"
          onPress={() => {
            onCancelWorkout()
            onGoBack()
          }}
        >
          <Text color="$destructive" fontSize="$caption" fontWeight="$screenTitle">
            Cancel workout
          </Text>
        </Button>
      )}
    </YStack>
  )
}
