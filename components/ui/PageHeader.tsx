import { type ReactNode } from 'react'
import { View } from 'react-native'
import { Button, UiText } from './Controls'

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
    <View className="flex-row items-center justify-between gap-field">
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-compact">
          {icon}
          <UiText textRole="screenTitle" accessibilityRole="header" className="shrink">
            {title}
          </UiText>
        </View>
        {subtitle && <UiText textRole="bodyMuted">{subtitle}</UiText>}
      </View>
      {action && (
        <Button
          variant={action.variant === 'secondary' ? 'secondary' : 'primary'}
          onPress={action.onPress}
        >
          {action.variant === 'secondary' ? (
            <UiText textRole="bodyEmphasis">{action.label}</UiText>
          ) : (
            <UiText textRole="buttonOnAccent">{action.label}</UiText>
          )}
        </Button>
      )}
    </View>
  )
}
