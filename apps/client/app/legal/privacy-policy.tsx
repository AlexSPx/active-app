import { ActivityIndicator, ScrollView, View } from 'react-native'
import { useLegal } from '../../features/legal'
import { MarkdownDisplay } from '../../components/ui/MarkdownDisplay'
import { Button, UiText } from '../../components/ui/Controls'
import { useCadenceColors } from '../../components/ui/useCadenceColors'

export default function LegalScreen() {
  const { content, loading, error, refetch } = useLegal('privacy')
  const colors = useCadenceColors()

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="w-full max-w-[720px] self-center gap-section p-page">
          {loading ? (
            <View className="items-center p-section">
              <ActivityIndicator
                size="large"
                color={colors.accent}
                accessibilityLabel="Loading privacy policy"
              />
            </View>
          ) : error ? (
            <View className="gap-field">
              <UiText textRole="bodyDestructive">{error}</UiText>
              <Button variant="surface" onPress={() => void refetch()}>
                Try again
              </Button>
            </View>
          ) : (
            <MarkdownDisplay content={content} />
          )}
        </View>
      </ScrollView>
    </View>
  )
}
