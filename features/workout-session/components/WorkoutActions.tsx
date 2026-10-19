import { useRef, useState } from 'react'
import { View } from 'react-native'
import { Button, UiText } from '../../../components/ui/Controls'
import { Plus } from '../../../components/ui/icons'
import { useCadenceColors } from '../../../components/ui/useCadenceColors'

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
  const colors = useCadenceColors()
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
    <View className="gap-field py-section">
      {onAddExercise && (
        <Button
          variant="secondary"
          className="h-action flex-row gap-compact"
          accessibilityLabel="Add exercise"
          onPress={onAddExercise}
        >
          <Plus size={18} color={colors.accent} aria-hidden />
          <UiText textRole="captionEmphasis">Add exercise</UiText>
        </Button>
      )}

      <Button
        variant="primary"
        className="h-action"
        onPress={handleFinishWorkout}
        loading={isFinishing}
        accessibilityLabel="Finish workout"
      >
        <UiText textRole="buttonOnAccent">{isFinishing ? 'Saving…' : 'Finish workout'}</UiText>
      </Button>

      {onCancelWorkout && (
        <Button
          variant="ghost"
          disabled={isFinishing}
          onPress={() => {
            onCancelWorkout()
            onGoBack()
          }}
        >
          <UiText textRole="captionDestructive">Cancel workout</UiText>
        </Button>
      )}
    </View>
  )
}
