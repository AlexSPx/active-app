import { Button, Text, XStack } from 'tamagui'

export interface CreateTopButtonProps {
  label: string
  onPress: () => void
}

export function CreateTopButton({ label, onPress }: CreateTopButtonProps) {
  return (
    <Button
      unstyled
      borderWidth={1.5}
      borderColor="$borderColor"
      borderStyle="dashed"
      py={15}
      bg="transparent"
      onPress={onPress}
      pressStyle={{ opacity: 0.86 }}
      style={{ borderRadius: 14 }}
    >
      <XStack items="center" justify="center" gap="$2.5">
        <XStack
          width={22}
          height={22}
          borderWidth={1.5}
          borderColor="$colorMuted"
          items="center"
          justify="center"
          style={{ borderRadius: 999 }}
        >
          <Text fontSize={17} color="$colorMuted" lineHeight={17} mt={-2}>
            +
          </Text>
        </XStack>
        <Text fontSize="$4" fontWeight="500" color="$colorMuted">
          {label}
        </Text>
      </XStack>
    </Button>
  )
}
