import { Text, YStack } from 'tamagui'
import { ActivityIndicator } from 'react-native'

interface LoadingSpinnerProps {
  size?: 'small' | 'large'
  color?: string
  text?: string
}

export function LoadingSpinner({ size = 'large', color, text }: LoadingSpinnerProps) {
  return (
    <YStack gap="$2">
      <ActivityIndicator size={size} color={color} />
      {text && (
        <Text fontSize="$4" color="$colorSubtle">
          {text}
        </Text>
      )}
    </YStack>
  )
}
