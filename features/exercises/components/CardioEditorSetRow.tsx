import { Input, Text, XStack } from 'tamagui'
import { useEffect, useState } from 'react'
import { SwipeDeleteSetRow } from './SwipeDeleteSetRow'
import { parseWorkoutDuration } from '../../../utils/workoutUtils'

interface CardioEditorSetRowProps {
  index: number
  durationSeconds: number | null | undefined
  onChange: (seconds: number | null) => void
  onDelete: () => void
}
const formatDuration = (seconds?: number | null) =>
  seconds == null ? '' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export function CardioEditorSetRow({
  index,
  durationSeconds,
  onChange,
  onDelete,
}: CardioEditorSetRowProps) {
  const [duration, setDuration] = useState(formatDuration(durationSeconds))
  useEffect(() => {
    setDuration((current) =>
      parseWorkoutDuration(current) === durationSeconds ? current : formatDuration(durationSeconds)
    )
  }, [durationSeconds, index])
  return (
    <SwipeDeleteSetRow onDelete={onDelete}>
      <XStack items="center" gap="$compact" bg="$surface">
        <Text
          width="$icon"
          text="center"
          fontSize="$caption"
          color="$colorSubtle"
          accessibilityLabel={`Interval ${index + 1}`}
          accessibilityHint="Swipe left or use the Delete action to remove this interval."
          accessibilityActions={[{ name: 'delete', label: 'Delete interval' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'delete') onDelete()
          }}
        >
          {index + 1}
        </Text>
        <Input
          flex={1}
          value={duration}
          onChangeText={(text) => {
            setDuration(text)
            onChange(parseWorkoutDuration(text))
          }}
          height="$touch"
          rounded="$day"
          px="$compact"
          fontSize="$body"
          text="center"
          placeholder="0:00"
          bg="$backgroundStrong"
          borderColor="$borderColor"
          accessibilityLabel={`Interval ${index + 1} duration in minutes and seconds`}
        />
      </XStack>
    </SwipeDeleteSetRow>
  )
}
export default CardioEditorSetRow
