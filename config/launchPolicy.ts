import { Platform } from 'react-native'

export const nativeLaunchPolicy = {
  accountsEnabled: false,
  backendEnabled: false,
  syncEnabled: false,
  telemetryEnabled: false,
  otaUpdatesEnabled: true,
} as const

export function isNativeOfflineLaunch(): boolean {
  return Platform.OS !== 'web'
}
