import { Button, Text } from 'tamagui'
import { Plus } from '@tamagui/lucide-icons'

export interface CreateTopButtonProps {
  label: string
  onPress: () => void
}

export function CreateTopButton({ label, onPress }: CreateTopButtonProps) {
  return (
    <Button
      width="100%"
      minH="$action"
      height="auto"
      py="$3"
      bg="$primary"
      rounded="$button"
      onPress={onPress}
      pressStyle={{ opacity: 0.85 }}
    >
      <Plus size="$icon" color="$onPrimary" aria-hidden />
      <Text fontSize="$3" fontWeight="700" color="$onPrimary" shrink={1}>
        {label}
      </Text>
    </Button>
  )
}
