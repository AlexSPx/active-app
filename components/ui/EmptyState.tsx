import { type ComponentType } from 'react'
import { View } from 'react-native'
import { Button, UiText } from './Controls'
import { useCadenceColors } from './useCadenceColors'

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
  iconColor,
  alignTop = false,
}: EmptyStateProps) {
  const colors = useCadenceColors()

  return (
    <View
      className={`flex-1 items-center px-page gap-field ${alignTop ? 'justify-start py-card' : 'justify-center py-8'}`}
    >
      {Icon && (
        <View className="rounded-full bg-raised p-field">
          <Icon size={40} color={iconColor ?? colors.muted} strokeWidth={1.5} />
        </View>
      )}

      <UiText textRole="cardTitle" className="text-[20px] text-center">
        {title}
      </UiText>

      <UiText textRole="bodyMuted" className="max-w-[300px] text-center leading-[22px]">
        {description}
      </UiText>

      {actionLabel && onAction && (
        <Button className="mt-compact" onPress={onAction}>
          <UiText textRole="buttonOnAccent">{actionLabel}</UiText>
        </Button>
      )}
    </View>
  )
}
