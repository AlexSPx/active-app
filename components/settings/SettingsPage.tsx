import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { useHeaderHeight } from '@react-navigation/elements'
import { Surface, UiText } from '../ui/Controls'

export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Surface className={className}>{children}</Surface>
}

export function SettingsPage({
  title,
  description,
  children,
  footer,
  className = '',
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const headerHeight = useHeaderHeight()
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className={`w-full max-w-[720px] self-center gap-section p-page ${className}`}>
          <View className="gap-field">
            <UiText accessibilityRole="header" textRole="screenTitle">
              {title}
            </UiText>
            {description && <UiText textRole="bodyMuted">{description}</UiText>}
          </View>
          {children}
        </View>
      </ScrollView>
      {footer && <View className="gap-field border-t border-divider p-page">{footer}</View>}
    </KeyboardAvoidingView>
  )
}
