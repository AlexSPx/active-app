import { YStack, ScrollView, Spinner, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { useLegal } from '../../features/legal'
import { MarkdownDisplay } from '../../components/ui/MarkdownDisplay'

export default function PrivacyPolicyScreen() {
  const { content, loading, error } = useLegal('privacy')

  return (
    <YStack flex={1} bg="$background">
      <Stack.Screen options={{ title: 'Privacy Policy' }} />
      <ScrollView>
        <YStack gap="$4" p="$4">
          {loading ? (
            <YStack p="$4" style={{ alignItems: 'center' }}>
              <Spinner size="large" color="$primary" />
            </YStack>
          ) : error ? (
            <Text color="$red10" style={{ textAlign: 'center' }}>{error}</Text>
          ) : (
            <MarkdownDisplay content={content} />
          )}
        </YStack>
      </ScrollView>
    </YStack>
  )
}
