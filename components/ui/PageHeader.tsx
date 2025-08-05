import { YStack, XStack, Text, Button } from 'tamagui'
import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: {
    label: string
    onPress: () => void
    variant?: 'primary' | 'secondary'
  }
  icon?: ReactNode
}

export function PageHeader({ title, subtitle, action, icon }: PageHeaderProps) {
  return (
    <XStack justify="space-between" items="center">
      <YStack>
        <XStack items="center" gap="$2">
          {icon}
          <Text fontSize="$6" fontWeight="700" color="$color">
            {title}
          </Text>
        </XStack>
        {subtitle && (
          <Text fontSize="$4" color="$colorSubtle">
            {subtitle}
          </Text>
        )}
      </YStack>
      {action && (
        <Button
          size="$3"
          bg={action.variant === 'secondary' ? '$secondary' : '$primary'}
          onPress={action.onPress}
        >
          <Text color={action.variant === 'secondary' ? '$onSecondary' : '$onPrimary'}>
            {action.label}
          </Text>
        </Button>
      )}
    </XStack>
  )
}
