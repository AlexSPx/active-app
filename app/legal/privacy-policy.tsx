import { useEffect, useState } from 'react'
import { YStack, ScrollView, Spinner, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { apiService } from '../../services/apiService'
import { MarkdownDisplay } from '../../components/ui/MarkdownDisplay'

export default function PrivacyPolicyScreen() {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadPrivacyPolicy()
  }, [])

  const loadPrivacyPolicy = async () => {
    try {
      setLoading(true)
      const data = await apiService.getPrivacyPolicy()
      setContent(data)
    } catch (err) {
      console.error('Failed to load privacy policy:', err)
      setError('Failed to load privacy policy. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

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
