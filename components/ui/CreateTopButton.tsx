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
      width="100%"
      py={15}
      bg="transparent"
      onPress={onPress}
      pressStyle={{ opacity: 0.86 }}
      rounded="$4"
    >
      <XStack items="center" justify="center" gap="$2.5">
        <XStack
          width={22}
          height={22}
          borderWidth={1.5}
          borderColor="$colorSubtle"
          items="center"
          justify="center"
          style={{ borderRadius: 999 }}
        >
          <Text fontSize={17} color="$colorSubtle" lineHeight={17} mt={-2}>
            +
          </Text>
        </XStack>
        <Text fontSize="$4" fontWeight="600" color="$color">
          {label}
        </Text>
      </XStack>
    </Button>
  )
}
