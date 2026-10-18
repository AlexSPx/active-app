import { View } from 'react-native'
import { Button, UiText } from './Controls'

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
    <View className="gap-field p-card" accessibilityLiveRegion="polite">
      <UiText textRole="cardTitle" accessibilityRole="header">
        {title}
      </UiText>
      <UiText textRole="bodyMuted" selectable>
        {message}
      </UiText>
      {onRetry && <Button onPress={onRetry}>{retryText}</Button>}
    </View>
  )
}
