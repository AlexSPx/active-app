import { useEffect, useState } from 'react'
import { YStack, ScrollView, Spinner, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { apiService } from '../../services/apiService'
import { MarkdownDisplay } from '../../components/ui/MarkdownDisplay'

export default function TermsOfServiceScreen() {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadTermsOfService()
  }, [])

  const loadTermsOfService = async () => {
    try {
      setLoading(true)
      const data = await apiService.getTermsOfService()
      const exportCompliance = `

## Export Compliance

You agree to comply with all applicable export and import laws and regulations, including those of the United States. You represent that you are not located in a country subject to a U.S. government embargo, or that has been designated by the U.S. government as a “terrorist supporting” country, and that you are not listed on any U.S. government list of prohibited or restricted parties.`
      setContent(data + exportCompliance)
    } catch (err) {
      console.error('Failed to load terms of service:', err)
      setError('Failed to load terms of service. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <YStack flex={1} bg="$background">
      <Stack.Screen options={{ title: 'Terms of Service' }} />
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
