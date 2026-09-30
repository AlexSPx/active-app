import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform } from 'react-native'
import { useHeaderHeight } from '@react-navigation/elements'
import { Paragraph, ScrollView, Text, YStack } from 'tamagui'

export function SettingsPage({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const headerHeight = useHeaderHeight()
  return (
    <YStack flex={1} bg="$background" asChild>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          flex={1}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <YStack p="$page" gap="$section" width="100%" maxW="$content" self="center">
            <YStack gap="$field">
              <Text
                accessibilityRole="header"
                fontSize="$screenTitle"
                lineHeight="$screenTitle"
                fontWeight="600"
              >
                {title}
              </Text>
              {description && (
                <Paragraph fontSize="$body" lineHeight="$body" color="$colorSubtle">
                  {description}
                </Paragraph>
              )}
            </YStack>
            {children}
          </YStack>
        </ScrollView>
        {footer && (
          <YStack p="$page" gap="$field" borderTopWidth={1} borderColor="$borderColor">
            <YStack width="100%" maxW="$content" self="center" gap="$field">
              {footer}
            </YStack>
          </YStack>
        )}
      </KeyboardAvoidingView>
    </YStack>
  )
}
