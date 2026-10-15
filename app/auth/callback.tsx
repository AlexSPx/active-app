import { Redirect } from 'expo-router'

export default function AuthCallbackFallback() {
  return <Redirect href="/welcome" />
}
