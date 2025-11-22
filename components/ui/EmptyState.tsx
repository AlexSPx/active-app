import { YStack, Text, Button, Theme } from 'tamagui'
import { ComponentType } from 'react'

interface EmptyStateProps {
  title: string
  description: string
  icon?: ComponentType<any>
  actionLabel?: string
  onAction?: () => void
  iconColor?: string
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  iconColor = '$color11',
}: EmptyStateProps) {
  return (
    <YStack flex={1} items="center" justify="center" py="$10" px="$4" gap="$3">
      {Icon && (
        <YStack
          bg="$backgroundStrong"
          p="$4"
          r={1000}
          mb="$2"
          animation="bouncy"
          enterStyle={{ scale: 0.5, opacity: 0 }}
        >
          <Icon size={48} color={iconColor} strokeWidth={1.5} />
        </YStack>
      )}
      
      <Text fontSize="$7" fontWeight="800" color="$color" text="center">
        {title}
      </Text>
      
      <Text fontSize="$4" color="$colorSubtle" text="center" maxW={300} lineHeight={24}>
        {description}
      </Text>

      {actionLabel && onAction && (
        <Theme name="blue">
          <Button
            mt="$4"
            size="$4"
            onPress={onAction}
            icon={Icon ? <Icon size={18} /> : undefined}
            scaleIcon={1.2}
            animation="bouncy"
            pressStyle={{ scale: 0.85, opacity: 0.7 }}
          >
            {actionLabel}
          </Button>
        </Theme>
      )}
    </YStack>
  )
}
