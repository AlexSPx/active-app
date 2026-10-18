import { ActivityIndicator, View } from 'react-native'
import { UiText } from './Controls'
import { useCadenceColors } from './useCadenceColors'

interface LoadingSpinnerProps {
  size?: 'small' | 'large'
  color?: string
  text?: string
}

export function LoadingSpinner({ size = 'large', color, text }: LoadingSpinnerProps) {
  const colors = useCadenceColors()
  return (
    <View className="gap-compact">
      <ActivityIndicator size={size} color={color ?? colors.accent} />
      {text && <UiText textRole="bodyMuted">{text}</UiText>}
    </View>
  )
}
