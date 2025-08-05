import { YStack, XStack, Text } from 'tamagui'
import { ReactNode } from 'react'

interface StatItemProps {
  icon?: ReactNode
  value: string | number
  label: string
  layout?: 'vertical' | 'horizontal'
}

export function StatItem({ icon, value, label, layout = 'horizontal' }: StatItemProps) {
  if (layout === 'vertical') {
    return (
      <YStack items="center" flex={1}>
        <Text fontSize="$6" fontWeight="bold" color="$color">
          {value}
        </Text>
        <Text fontSize="$3" color="$colorSubtle">
          {label}
        </Text>
      </YStack>
    )
  }

  return (
    <XStack items="center" gap="$2" flex={1}>
      {icon}
      <Text fontSize="$3" color="$colorSubtle">
        {value} {label}
      </Text>
    </XStack>
  )
}
