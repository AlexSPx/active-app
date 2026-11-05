import { useTabContentInset } from '../../navigation/TabContentInset'
import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { UiText } from '../ui/Controls'

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
  const bottomInset = useTabContentInset()
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
        contentContainerStyle={{ paddingBottom: footer ? 0 : bottomInset }}
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
      {footer && (
        <View
          className="gap-field border-t border-divider p-page"
          style={{ marginBottom: bottomInset }}
        >
          {footer}
        </View>
      )}
    </KeyboardAvoidingView>
  )
}
