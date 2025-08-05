import { Text, Button, YStack } from 'tamagui'

interface ErrorDisplayProps {
  title?: string
  message: string
  onRetry?: () => void
  retryText?: string
}

export function ErrorDisplay({
  title = 'Something went wrong',
  message,
  onRetry,
  retryText = 'Try Again',
}: ErrorDisplayProps) {
  return (
    <YStack gap="$3" p="$4">
      <Text fontSize="$5" fontWeight="600" color="$primary">
        {title}
      </Text>
      <Text fontSize="$4" color="$colorSubtle">
        {message}
      </Text>
      {onRetry && (
        <Button bg="$primary" onPress={onRetry}>
          <Text color="$onPrimary">{retryText}</Text>
        </Button>
      )}
    </YStack>
  )
}
