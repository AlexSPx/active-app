import { type ReactNode } from 'react'
import { View } from 'react-native'
import { UiText } from './Controls'

interface StatItemProps {
  icon?: ReactNode
  value: string | number
  label: string
  layout?: 'vertical' | 'horizontal'
}

export function StatItem({ icon, value, label, layout = 'horizontal' }: StatItemProps) {
  if (layout === 'vertical') {
    return (
      <View className="flex-1 items-center">
        <UiText textRole="cardTitle">{value}</UiText>
        <UiText textRole="bodyMuted">{label}</UiText>
      </View>
    )
  }

  return (
    <View className="flex-1 flex-row items-center gap-compact">
      {icon}
      <UiText textRole="bodyMuted">
        {value} {label}
      </UiText>
    </View>
  )
}
