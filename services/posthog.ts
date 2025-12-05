import PostHog from 'posthog-react-native'
import * as FileSystem from 'expo-file-system'

const CONFIG = {
  apiKey: process.env.POSTHOG_API_KEY || 'phc_eu_test_key',
  host: 'https://eu.i.posthog.com',
}

export const posthog = new PostHog(CONFIG.apiKey, {
  host: CONFIG.host,
  persistence: {
    type: 'file',
    storage: FileSystem,
  } as any,
  flushAt: 1,
})