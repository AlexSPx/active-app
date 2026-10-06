import { Text, Input, XStack } from 'tamagui'
import { useEffect, useState } from 'react'
import { SwipeDeleteSetRow } from './SwipeDeleteSetRow'

type SetRowProps = {
  index: number
  weight: number | null | undefined
  reps: number | null | undefined
  onChange: (key: 'weight' | 'reps', value: number | null) => void
  onDelete: () => void
}

export function ExerciseSetRow({ index, weight, reps, onChange, onDelete }: SetRowProps) {
  return (
    <SwipeDeleteSetRow onDelete={onDelete}>
      <XStack items="center" gap="$compact" bg="$surface">
        <Text
          width="$icon"
          text="center"
          fontSize="$caption"
          color="$colorSubtle"
          accessibilityLabel={`Set ${index + 1}`}
          accessibilityHint="Swipe left or use the Delete action to remove this set."
          accessibilityActions={[{ name: 'delete', label: 'Delete set' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'delete') onDelete()
          }}
        >
          {index + 1}
        </Text>
        {(['weight', 'reps'] as const).map((field) => {
          const value = field === 'weight' ? weight : reps
          return (
            <TargetInput
              key={field}
              value={value}
              field={field}
              index={index}
              onChange={onChange}
            />
          )
        })}
      </XStack>
    </SwipeDeleteSetRow>
  )
}

function TargetInput({
  value,
  field,
  index,
  onChange,
}: {
  value: number | null | undefined
  field: 'weight' | 'reps'
  index: number
  onChange: SetRowProps['onChange']
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => {
    setText((current) =>
      (current.trim() ? Number(current.replace(',', '.')) : null) === value
        ? current
        : value == null
          ? ''
          : String(value)
    )
  }, [value, index])
  return (
    <Input
      flex={1}
      height="$setRow"
      minH="$setRow"
      rounded="$day"
      py="$0"
      px="$compact"
      text="center"
      fontSize="$body"
      bg="$backgroundStrong"
      borderColor="$borderColor"
      accessibilityLabel={`Set ${index + 1} ${field === 'weight' ? 'weight in kilograms' : 'reps'}`}
      keyboardType={field === 'weight' ? 'decimal-pad' : 'number-pad'}
      placeholder={field === 'weight' ? 'kg' : 'reps'}
      value={text}
      onChangeText={(next) => {
        setText(next)
        const number = Number(next.replace(',', '.'))
        onChange(field, next.trim() && Number.isFinite(number) ? number : null)
      }}
    />
  )
}
