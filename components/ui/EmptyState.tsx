import { YStack, Text, Button } from 'tamagui'
import { ComponentType } from 'react'

interface EmptyStateProps {
  title: string
  description: string
  icon?: ComponentType<any>
  actionLabel?: string
  onAction?: () => void
  iconColor?: string
  alignTop?: boolean
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  iconColor = '$color11',
  alignTop = false,
}: EmptyStateProps) {
  return (
    <YStack
      flex={1}
      items="center"
      justify={alignTop ? 'flex-start' : 'center'}
      py={alignTop ? '$4' : '$8'}
      px="$4"
      gap="$3"
    >
      {Icon && (
        <YStack
          bg="$backgroundStrong"
          p="$3"
          r={1000}
          animation="bouncy"
          enterStyle={{ scale: 0.5, opacity: 0 }}
        >
          <Icon size={40} color={iconColor} strokeWidth={1.5} />
        </YStack>
      )}

      <Text fontSize="$6" fontWeight="700" color="$color" text="center">
        {title}
      </Text>

      <Text fontSize="$3" color="$colorSubtle" text="center" maxW={300} lineHeight={22}>
        {description}
      </Text>

      {actionLabel && onAction && (
        <Button
          mt="$2"
          size="$4"
          bg="$primary"
          onPress={onAction}
          animation="quick"
          pressStyle={{ scale: 0.97, opacity: 0.85 }}
        >
          <Text color="$onPrimary" fontWeight="600">
            {actionLabel}
          </Text>
        </Button>
      )}
    </YStack>
  )
}
