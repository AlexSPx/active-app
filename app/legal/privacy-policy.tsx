import { Button, Paragraph, ScrollView, Spinner, Text, YStack } from 'tamagui'
import { useLegal } from '../../features/legal'
import { MarkdownDisplay } from '../../components/ui/MarkdownDisplay'

export default function LegalScreen() {
  const { content, loading, error, refetch } = useLegal('privacy')
  return (
    <YStack flex={1} bg="$background">
      <ScrollView showsVerticalScrollIndicator={false}>
        <YStack p="$page" gap="$section" width="100%" maxW="$content" self="center">
          <Text fontSize="$screenTitle" lineHeight="$screenTitle" fontWeight="600">
            Privacy policy
          </Text>
          {loading ? (
            <YStack p="$section" items="center">
              <Spinner size="large" color="$primary" accessibilityLabel="Loading privacy policy" />
            </YStack>
          ) : error ? (
            <YStack gap="$field">
              <Paragraph fontSize="$body" lineHeight="$body" color="$destructive">
                {error}
              </Paragraph>
              <Button
                height="$action"
                rounded="$button"
                bg="$backgroundStrong"
                onPress={() => refetch()}
              >
                Try again
              </Button>
            </YStack>
          ) : (
            <MarkdownDisplay content={content} />
          )}
        </YStack>
      </ScrollView>
    </YStack>
  )
}
